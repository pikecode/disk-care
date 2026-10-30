use super::*;
use std::sync::atomic::AtomicU64;

static NEXT_REPORT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResidueCandidate {
    pub id: usize,
    pub path: String,
    pub category: String,
    pub evidence: String,
    pub allocated_bytes: u64,
    pub logical_bytes: u64,
    pub cleanup_eligible: bool,
    #[serde(skip)]
    identity: (u64, u64, u32),
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResidueSource {
    pub name: String,
    pub path: String,
    pub coverage: Coverage,
    pub candidates: Vec<ResidueCandidate>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResidueReport {
    pub id: u64,
    pub measured_at: u64,
    pub sources: Vec<ResidueSource>,
}
fn safe_path(path: &Path) -> Result<(), String> {
    if !path.is_absolute()
        || path
            .components()
            .any(|p| matches!(p, Component::ParentDir | Component::CurDir))
    {
        return Err("路径无效".into());
    }
    let mut current = PathBuf::new();
    for part in path.components() {
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(m) if m.file_type().is_symlink() => return Err("路径含符号链接，已跳过".into()),
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(e.to_string()),
        }
    }
    Ok(())
}
fn matches_name(name: &str, source: usize) -> bool {
    let name = name.to_ascii_lowercase();
    if source == 2 {
        return name.starts_with("cc-switch_") && name.ends_with(".plist");
    }
    let Some(v) = name
        .strip_prefix("cc-switch-v")
        .and_then(|s| s.strip_suffix("-macos.dmg"))
    else {
        return false;
    };
    !v.is_empty()
        && v.split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|c| c.is_ascii_digit()))
}
fn issue(source: &mut ResidueSource, path: &Path, status: &str, message: &str) {
    // 后续成功不能覆盖已观察到的不完整状态。
    if source.coverage.status == "complete" {
        source.coverage.status = status.into();
    }
    source.coverage.permission_denied += u64::from(status == "denied");
    source.coverage.limited |= status == "limited";
    source.coverage.cancelled |= status == "cancelled";
    source.coverage.diagnose(path, status, message);
}
fn inspect(home: &Path, cancel: &AtomicBool, max_entries: usize, limit: Duration) -> ResidueReport {
    let started = Instant::now();
    let mut visited = 0usize;
    let mut count = 0usize;
    let mut seen = HashSet::new();
    let mut sources = Vec::new();
    for (index, (name, relative)) in [
        ("配置与可能的凭据", ".cc-switch"),
        ("下载安装包线索", "Downloads"),
        ("崩溃记录线索", "Library/Application Support/CrashReporter"),
    ]
    .into_iter()
    .enumerate()
    {
        let root = home.join(relative);
        let mut source = ResidueSource {
            name: name.into(),
            path: root.to_string_lossy().into(),
            coverage: Coverage {
                status: "complete".into(),
                ..Coverage::default()
            },
            candidates: vec![],
        };
        if cancel.load(Ordering::SeqCst)
            || started.elapsed() >= limit
            || visited >= max_entries
            || count >= 200
        {
            source.coverage.status = "pending".into();
            source
                .coverage
                .diagnose(&root, "pending", "因取消或共享预算未访问");
            sources.push(source);
            continue;
        }
        if let Err(e) = safe_path(&root) {
            issue(&mut source, &root, "failed", &e);
            sources.push(source);
            continue;
        }
        let metadata = match fs::symlink_metadata(&root) {
            Ok(m) => m,
            Err(e) => {
                source.coverage.status = if e.kind() == std::io::ErrorKind::NotFound {
                    "absent"
                } else if e.kind() == std::io::ErrorKind::PermissionDenied {
                    "denied"
                } else {
                    "failed"
                }
                .into();
                source.coverage.permission_denied =
                    u64::from(e.kind() == std::io::ErrorKind::PermissionDenied);
                source
                    .coverage
                    .diagnose(&root, &source.coverage.status.clone(), &e.to_string());
                sources.push(source);
                continue;
            }
        };
        if !metadata.is_dir() {
            issue(&mut source, &root, "failed", "预期目录，实际类型不符");
            sources.push(source);
            continue;
        }
        let device = metadata.dev();
        let mut stack = vec![(root.clone(), 0usize)];
        let mut total = (0u64, 0u64);
        while let Some((directory, depth)) = stack.pop() {
            if cancel.load(Ordering::SeqCst)
                || started.elapsed() >= limit
                || visited >= max_entries
                || count >= 200
            {
                let status = if cancel.load(Ordering::SeqCst) {
                    "cancelled"
                } else {
                    "limited"
                };
                issue(&mut source, &directory, status, "检查已停止或达到共享预算");
                break;
            }
            if let Err(e) = safe_path(&directory) {
                issue(&mut source, &directory, "failed", &e);
                continue;
            }
            let entries = match fs::read_dir(&directory) {
                Ok(e) => e,
                Err(e) => {
                    issue(
                        &mut source,
                        &directory,
                        if e.kind() == std::io::ErrorKind::PermissionDenied {
                            "denied"
                        } else {
                            "failed"
                        },
                        &e.to_string(),
                    );
                    continue;
                }
            };
            for entry in entries {
                if cancel.load(Ordering::SeqCst)
                    || started.elapsed() >= limit
                    || visited >= max_entries
                    || count >= 200
                {
                    issue(
                        &mut source,
                        &directory,
                        if cancel.load(Ordering::SeqCst) {
                            "cancelled"
                        } else {
                            "limited"
                        },
                        "检查已停止或达到共享预算",
                    );
                    break;
                }
                visited += 1;
                let entry = match entry {
                    Ok(e) => e,
                    Err(e) => {
                        issue(&mut source, &directory, "failed", &e.to_string());
                        continue;
                    }
                };
                let path = entry.path();
                let m = match fs::symlink_metadata(&path) {
                    Ok(m) => m,
                    Err(e) => {
                        issue(
                            &mut source,
                            &path,
                            if e.kind() == std::io::ErrorKind::PermissionDenied {
                                "denied"
                            } else {
                                "failed"
                            },
                            &e.to_string(),
                        );
                        continue;
                    }
                };
                if m.file_type().is_symlink() || m.dev() != device || (!m.is_file() && !m.is_dir())
                {
                    issue(
                        &mut source,
                        &path,
                        "skipped",
                        "链接、跨设备或特殊文件未读取",
                    );
                    continue;
                }
                if index == 0 {
                    if m.is_dir() {
                        if depth >= 12 {
                            issue(&mut source, &path, "limited", "达到十二层深度上限");
                        } else {
                            stack.push((path, depth + 1));
                        }
                    } else if seen.insert((m.dev(), m.ino())) {
                        total.0 += m.blocks() * 512;
                        total.1 += m.len();
                    }
                } else if m.is_file() && matches_name(&entry.file_name().to_string_lossy(), index) {
                    count += 1;
                    source.candidates.push(ResidueCandidate {
                        id: count,
                        path: path.to_string_lossy().into(),
                        category: name.into(),
                        evidence: "cc-switch.name v1；文件名弱线索，不证明归属或可删除".into(),
                        allocated_bytes: m.blocks() * 512,
                        logical_bytes: m.len(),
                        cleanup_eligible: false,
                        identity: (m.dev(), m.ino(), m.mode()),
                    });
                }
            }
        }
        if index == 0 {
            count += 1;
            source.candidates.push(ResidueCandidate { id: count, path: root.to_string_lossy().into(), category: name.into(), evidence: "cc-switch.config v1；本机4.0.21历史样例路径；可能包含凭据，不读正文，不证明独占".into(), allocated_bytes: total.0, logical_bytes: total.1, cleanup_eligible: false, identity: (metadata.dev(), metadata.ino(), metadata.mode()) });
        }
        sources.push(source);
    }
    ResidueReport {
        id: NEXT_REPORT_ID.fetch_add(1, Ordering::SeqCst),
        measured_at: now(),
        sources,
    }
}
impl Engine {
    pub fn inspect_residue(&self, preset: String) -> Result<ResidueReport, String> {
        if preset != "cc-switch" {
            return Err("暂无该应用的专属规则".into());
        }
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        *self.residue.lock().map_err(|_| "报告状态不可用")? = None;
        let report = inspect(&self.home, &self.cancel, 20_000, Duration::from_secs(30));
        *self.residue.lock().map_err(|_| "报告状态不可用")? = Some(report.clone());
        Ok(report)
    }
    pub fn residue_path(&self, report_id: u64, candidate_id: usize) -> Result<PathBuf, String> {
        let _job = self.job()?;
        let reports = self.residue.lock().map_err(|_| "报告状态不可用")?;
        let report = reports
            .as_ref()
            .filter(|r| r.id == report_id && now().saturating_sub(r.measured_at) < 300_000)
            .ok_or("报告已失效，请重新检查")?;
        let candidate = report
            .sources
            .iter()
            .flat_map(|s| &s.candidates)
            .find(|c| c.id == candidate_id)
            .ok_or("候选不存在")?;
        let path = PathBuf::from(&candidate.path);
        safe_path(&path)?;
        let m = fs::symlink_metadata(&path).map_err(|_| "候选已消失，请重新检查")?;
        if (m.dev(), m.ino(), m.mode()) != candidate.identity {
            return Err("候选身份已变化，请重新检查".into());
        }
        Ok(path)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn report_ids_expiry_replacement_and_symlinks_are_rejected() {
        let f = super::super::tests::Fixture::new();
        fs::create_dir_all(f.0.join(".cc-switch")).unwrap();
        let engine = Engine::new(f.0.clone());
        assert!(engine.inspect_residue("unknown".into()).is_err());
        let report = engine.inspect_residue("cc-switch".into()).unwrap();
        let id = report.sources[0].candidates[0].id;
        assert!(engine.residue_path(report.id, id).is_ok());
        assert!(engine.residue_path(report.id, 999).is_err());
        assert!(engine.residue_path(report.id + 1, id).is_err());
        engine.residue.lock().unwrap().as_mut().unwrap().measured_at = 0;
        assert!(engine.residue_path(report.id, id).is_err());
        let report = engine.inspect_residue("cc-switch".into()).unwrap();
        fs::rename(f.0.join(".cc-switch"), f.0.join("original")).unwrap();
        fs::create_dir(f.0.join(".cc-switch")).unwrap();
        assert!(engine.residue_path(report.id, id).is_err());
        fs::remove_dir(f.0.join(".cc-switch")).unwrap();
        std::os::unix::fs::symlink(f.0.join("original"), f.0.join(".cc-switch")).unwrap();
        let report = engine.inspect_residue("cc-switch".into()).unwrap();
        assert_eq!(report.sources[0].coverage.status, "failed");
        assert!(report.sources[0].candidates.is_empty());
    }
    #[test]
    fn shared_budget_depth_and_private_parent_remain_bounded() {
        let f = super::super::tests::Fixture::new();
        fs::create_dir_all(f.0.join(".cc-switch")).unwrap();
        fs::write(f.0.join(".cc-switch/a"), "a").unwrap();
        fs::write(f.0.join(".cc-switch/b"), "b").unwrap();
        let r = inspect(&f.0, &AtomicBool::new(false), 1, Duration::from_secs(30));
        assert_eq!(r.sources[0].coverage.status, "limited");
        assert_eq!(r.sources[1].coverage.status, "pending");
        let crash = f.0.join("Library/Application Support/CrashReporter");
        fs::create_dir_all(&crash).unwrap();
        fs::write(crash.join("cc-switch_example.plist"), "不解析正文").unwrap();
        assert!(checked_read_path(&crash).is_err());
        let r = inspect(
            &f.0,
            &AtomicBool::new(false),
            20_000,
            Duration::from_secs(30),
        );
        assert_eq!(r.sources[2].candidates.len(), 1);
        let deep = f.0.join(".cc-switch").join(vec!["nested"; 14].join("/"));
        fs::create_dir_all(deep).unwrap();
        let r = inspect(
            &f.0,
            &AtomicBool::new(false),
            20_000,
            Duration::from_secs(30),
        );
        assert_eq!(r.sources[0].coverage.status, "limited");
        let r = inspect(&f.0, &AtomicBool::new(false), 20_000, Duration::ZERO);
        assert!(r.sources.iter().all(|s| s.coverage.status == "pending"));
    }
    #[test]
    fn newer_report_invalidates_old_and_missing_files_cannot_be_revealed() {
        let f = super::super::tests::Fixture::new();
        fs::create_dir_all(f.0.join("Downloads")).unwrap();
        let path = f.0.join("Downloads/CC-Switch-v4.0.21-macOS.dmg");
        fs::write(&path, "合成安装包元数据样例").unwrap();
        let engine = Engine::new(f.0.clone());
        let first = engine.inspect_residue("cc-switch".into()).unwrap();
        let candidate = first.sources[1].candidates[0].id;
        assert_eq!(engine.residue_path(first.id, candidate).unwrap(), path);
        let current = engine.inspect_residue("cc-switch".into()).unwrap();
        assert_ne!(first.id, current.id);
        assert!(engine.residue_path(first.id, candidate).is_err());
        fs::remove_file(&path).unwrap();
        assert!(engine
            .residue_path(current.id, current.sources[1].candidates[0].id)
            .is_err());
        let _job = engine.job().unwrap();
        assert!(engine.inspect_residue("cc-switch".into()).is_err());
        assert!(engine.residue_path(current.id, candidate).is_err());
    }
    #[test]
    fn matching_files_below_downloads_and_crash_subdirectories_are_not_discovered() {
        let f = super::super::tests::Fixture::new();
        for (dir, name) in [
            ("Downloads/nested", "CC-Switch-v4-macOS.dmg"),
            (
                "Library/Application Support/CrashReporter/nested",
                "cc-switch_sample.plist",
            ),
        ] {
            let dir = f.0.join(dir);
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join(name), "不得递归发现").unwrap();
        }
        let report = inspect(
            &f.0,
            &AtomicBool::new(false),
            20_000,
            Duration::from_secs(30),
        );
        for source in &report.sources[1..] {
            assert_eq!(source.coverage.status, "complete");
            assert!(source.candidates.is_empty());
        }
    }
    #[test]
    fn exact_name_rules() {
        assert!(matches_name("CC-Switch-v4.0.21-macOS.dmg", 1));
        for name in [
            "CC-Switch-v-macOS.dmg",
            "CC-Switch-v4..1-macOS.dmg",
            "Other-CC-Switch-v4-macOS.dmg",
            "CC-Switch-v4-macOS.dmg.bak",
        ] {
            assert!(!matches_name(name, 1));
        }
        assert!(matches_name("cc-switch_example.plist", 2));
        assert!(!matches_name("other_cc-switch_example.plist", 2));
    }
    #[test]
    fn metadata_only_and_source_boundaries() {
        let f = super::super::tests::Fixture::new();
        fs::create_dir_all(f.0.join(".cc-switch")).unwrap();
        fs::write(f.0.join(".cc-switch/auth.json"), "凭据不能读取").unwrap();
        fs::create_dir_all(f.0.join("Downloads")).unwrap();
        fs::write(f.0.join("Downloads/CC-Switch-v4-macOS.dmg"), "假安装包").unwrap();
        let r = inspect(
            &f.0,
            &AtomicBool::new(false),
            20_000,
            Duration::from_secs(30),
        );
        assert_eq!(
            r.sources[0].candidates[0].logical_bytes,
            "凭据不能读取".len() as u64
        );
        assert_eq!(r.sources[1].candidates.len(), 1);
        assert_eq!(r.sources[2].coverage.status, "absent");
        assert!(r
            .sources
            .iter()
            .flat_map(|s| &s.candidates)
            .all(|c| !c.cleanup_eligible));
        let r = inspect(
            &f.0,
            &AtomicBool::new(true),
            20_000,
            Duration::from_secs(30),
        );
        assert!(r.sources.iter().all(|s| s.coverage.status == "pending"));
        let r = inspect(&f.0, &AtomicBool::new(false), 0, Duration::from_secs(30));
        assert!(r.sources.iter().all(|s| s.coverage.status == "pending"));
    }
}
