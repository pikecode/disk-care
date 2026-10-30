use super::*;
use std::{collections::BTreeMap, ffi::CString, fs::File, os::fd::AsRawFd};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiRoot {
    pub tool: String,
    pub path: String,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiItem {
    pub group: String,
    pub category: String,
    pub policy: String,
    pub rule_id: String,
    pub rule_version: u32,
    pub evidence: String,
    pub impact: String,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub files: u64,
    pub modified_at: Option<u64>,
    pub cleanup_eligible: bool,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiReport {
    pub tool: String,
    pub root: String,
    pub source: String,
    pub measured_at: u64,
    pub coverage: Coverage,
    pub issues: u64,
    pub notes: Vec<String>,
    pub version: String,
    pub activity: String,
    pub logical_bytes: Option<u64>,
    pub allocated_bytes: Option<u64>,
    pub items: Vec<AiItem>,
}

// 路径仅作分类线索；没有验证版本时不把缓存／日志升级成可清理规则。
fn classify(parts: &[String]) -> (&'static str, &'static str, &'static str) {
    let first = parts.first().map(String::as_str).unwrap_or("");
    let name = parts.last().map(String::as_str).unwrap_or("");
    if parts.iter().any(|p| {
        matches!(
            p.as_str(),
            "memory"
                | "memories"
                | "agent-memory"
                | "skills"
                | "agents"
                | "rules"
                | "plugins"
                | "worktrees"
                | "file-history"
                | "checkpoints"
                | "plans"
                | "jobs"
                | "daemon"
        )
    }) || matches!(
        name,
        "auth.json"
            | ".claude.json"
            | ".credentials.json"
            | "config.toml"
            | "settings.json"
            | "settings.local.json"
            | ".mcp.json"
            | "CLAUDE.md"
            | "AGENTS.md"
    ) || name.contains(".sqlite")
        || name.ends_with(".db")
        || name.ends_with("-wal")
        || name.ends_with("-shm")
        || name.ends_with(".lock")
    {
        (
            "配置、记忆与恢复资料",
            "protected",
            "可能涉及登录、长期记忆、插件、代码或恢复能力，默认保护。",
        )
    } else if matches!(
        first,
        "sessions" | "archived_sessions" | "projects" | "uploads" | "paste-cache" | "tool-results"
    ) || name == "history.jsonl"
    {
        (
            "会话与工作记录",
            "review",
            "可能关联历史、附件或继续会话；目录分组不代表已确认的项目归属。",
        )
    } else if matches!(first, "log" | "logs" | "debug" | "cache" | "caches") {
        (
            "缓存与日志线索",
            "unknown",
            "仅按路径识别；版本、重建来源及写入状态未验证，不能据此删除。",
        )
    } else {
        (
            "未识别数据",
            "unknown",
            "用途与依赖尚未确认，保留并仅作占用分析。",
        )
    }
}

fn metadata_at(dir: &File, name: &str) -> std::io::Result<libc::stat> {
    let name = CString::new(name)?;
    let mut stat = std::mem::MaybeUninit::<libc::stat>::uninit();
    let result = unsafe {
        libc::fstatat(
            dir.as_raw_fd(),
            name.as_ptr(),
            stat.as_mut_ptr(),
            libc::AT_SYMLINK_NOFOLLOW,
        )
    };
    if result != 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(unsafe { stat.assume_init() })
    }
}
fn problem(report: &mut AiReport, status: &str, note: impl Into<String>) {
    report.issues += 1;
    if status == "denied" {
        report.coverage.permission_denied += 1;
    }
    if status == "skipped" {
        report.coverage.excluded += 1;
    }
    report.coverage.limited |= status == "limited";
    report.coverage.cancelled |= status == "cancelled";
    if report.coverage.status == "complete" || matches!(status, "cancelled" | "limited") {
        report.coverage.status = status.into();
    }
    let note = note.into();
    if report.notes.len() < 12 && !report.notes.contains(&note) {
        report.notes.push(note);
    }
}
fn io_problem(report: &mut AiReport, path: &Path, err: std::io::Error) {
    report.coverage.diagnose(
        path,
        if err.kind() == std::io::ErrorKind::PermissionDenied {
            "permissionDenied"
        } else {
            "ioError"
        },
        &err.to_string(),
    );
    problem(
        report,
        if err.kind() == std::io::ErrorKind::PermissionDenied {
            "denied"
        } else {
            "failed"
        },
        format!("部分元数据无法读取：{err}"),
    );
}
fn resolve(home: &Path, input: &AiRoot) -> Result<PathBuf, String> {
    if !matches!(input.tool.as_str(), "codex" | "claude") {
        return Err("不支持的 AI 工具".into());
    }
    let raw = if let Some(tail) = input.path.strip_prefix("~/") {
        home.join(tail)
    } else {
        PathBuf::from(&input.path)
    };
    if raw
        .components()
        .any(|p| matches!(p, Component::ParentDir | Component::CurDir))
    {
        return Err("路径含非法层级".into());
    }
    if !raw.is_absolute() || raw == home || !raw.starts_with(home) {
        return Err("请选择主目录内的工具数据子目录".into());
    }
    Ok(raw)
}

pub fn analyze(
    home: &Path,
    roots: Vec<AiRoot>,
    cancel: &AtomicBool,
) -> Result<Vec<AiReport>, String> {
    if roots.is_empty() || roots.len() > 4 {
        return Err("请选择 1～4 个工具数据根目录".into());
    }
    let paths: Vec<_> = roots
        .iter()
        .map(|r| resolve(home, r))
        .collect::<Result<_, _>>()?;
    for (i, a) in paths.iter().enumerate() {
        if paths[..i]
            .iter()
            .any(|b| a.starts_with(b) || b.starts_with(a))
        {
            return Err("根目录重复或互相包含，请保留一份".into());
        }
    }
    let deadline = Instant::now() + Duration::from_secs(60);
    Ok(roots
        .iter()
        .zip(paths)
        .map(|(input, path)| {
            scan_root(
                input,
                &path,
                cancel,
                deadline.min(Instant::now() + Duration::from_secs(30)),
                100_000,
                12,
            )
        })
        .collect())
}
fn scan_root(
    input: &AiRoot,
    path: &Path,
    cancel: &AtomicBool,
    deadline: Instant,
    budget: usize,
    max_depth: usize,
) -> AiReport {
    let mut report = AiReport {
        tool: input.tool.clone(),
        root: path.to_string_lossy().into_owned(),
        source: "用户确认的路径；未自动发现其他位置".into(),
        measured_at: now(),
        coverage: Coverage {
            status: "complete".into(),
            ..Default::default()
        },
        issues: 0,
        notes: vec![],
        version: "未验证；分类为路径线索".into(),
        activity: "未知；未检查后台会话或锁持有者".into(),
        logical_bytes: None,
        allocated_bytes: None,
        items: vec![],
    };
    if cancel.load(Ordering::SeqCst) {
        report
            .coverage
            .diagnose(path, "cancelled", "分析已停止，此根未读取");
        problem(&mut report, "cancelled", "分析已停止，此根未读取");
        return report;
    }
    if Instant::now() >= deadline {
        report
            .coverage
            .diagnose(path, "timeLimit", "时间预算已耗尽，此根未读取");
        problem(&mut report, "limited", "时间预算已耗尽，此根未读取");
        return report;
    }
    let root = match model_storage::open_directory(path) {
        Ok(dir) => dir,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                report.coverage.status = "absent".into();
                report.notes.push("目录不存在，未测量占用".into());
            } else {
                io_problem(&mut report, path, e);
            }
            return report;
        }
    };
    let initial = match root.metadata() {
        Ok(m) => m,
        Err(e) => {
            io_problem(&mut report, path, e);
            return report;
        }
    };
    let mut pending = vec![(Vec::<String>::new(), initial.dev(), initial.ino())];
    let mut seen = HashSet::new();
    let mut groups: BTreeMap<(String, String), AiItem> = BTreeMap::new();
    let mut visited = 0;
    while let Some((parts, dev, ino)) = pending.pop() {
        let current_path = path.join(parts.iter().collect::<PathBuf>());
        if cancel.load(Ordering::SeqCst) {
            report
                .coverage
                .diagnose(&current_path, "cancelled", "分析已停止，显示已观测部分");
            problem(&mut report, "cancelled", "分析已停止，显示已观测部分");
            break;
        }
        if Instant::now() >= deadline || visited >= budget {
            report.coverage.diagnose(
                &current_path,
                if visited >= budget {
                    "entryLimit"
                } else {
                    "timeLimit"
                },
                "已达分析预算，显示已观测部分",
            );
            problem(&mut report, "limited", "已达分析预算，显示已观测部分");
            break;
        }
        let dir = match model_storage::open_descendant_directory(&root, &parts) {
            Ok(d) => d,
            Err(e) => {
                io_problem(&mut report, &current_path, e);
                continue;
            }
        };
        let before = match dir.metadata() {
            Ok(m) => m,
            Err(e) => {
                io_problem(&mut report, &current_path, e);
                continue;
            }
        };
        if before.dev() != dev || before.ino() != ino {
            report
                .coverage
                .diagnose(&current_path, "changed", "遍历期间目录身份变化");
            problem(&mut report, "failed", "遍历期间目录身份变化，已跳过");
            continue;
        }
        let (mut names, enumerated) =
            match model_storage::directory_names_until(&dir, budget - visited, || {
                cancel.load(Ordering::SeqCst) || Instant::now() >= deadline
            }) {
                Ok(result) => result,
                Err(e) => {
                    io_problem(&mut report, &current_path, e);
                    continue;
                }
            };
        if !enumerated {
            report.coverage.diagnose(
                &current_path,
                if cancel.load(Ordering::SeqCst) {
                    "cancelled"
                } else if Instant::now() >= deadline {
                    "timeLimit"
                } else {
                    "entryLimit"
                },
                "目录枚举已停止或达到预算",
            );
            problem(
                &mut report,
                if cancel.load(Ordering::SeqCst) {
                    "cancelled"
                } else {
                    "limited"
                },
                "目录枚举已停止或达到预算，保留已观测部分",
            );
        }
        names.sort();
        for name in names {
            if cancel.load(Ordering::SeqCst) || Instant::now() >= deadline || visited >= budget {
                report.coverage.diagnose(
                    &current_path,
                    if cancel.load(Ordering::SeqCst) {
                        "cancelled"
                    } else if visited >= budget {
                        "entryLimit"
                    } else {
                        "timeLimit"
                    },
                    "分析已停止或达到预算",
                );
                problem(
                    &mut report,
                    if cancel.load(Ordering::SeqCst) {
                        "cancelled"
                    } else {
                        "limited"
                    },
                    "分析已停止或达到预算",
                );
                break;
            }
            visited += 1;
            let Some(name) = name.to_str() else {
                report.coverage.diagnose(
                    &current_path.join(&name),
                    "invalidName",
                    "非 UTF-8 名称未纳入分类",
                );
                problem(&mut report, "skipped", "非 UTF-8 名称未纳入分类");
                continue;
            };
            let child_path = current_path.join(name);
            let stat = match metadata_at(&dir, name) {
                Ok(m) => m,
                Err(e) => {
                    io_problem(&mut report, &child_path, e);
                    continue;
                }
            };
            if stat.st_dev as u64 != initial.dev() {
                report
                    .coverage
                    .diagnose(&child_path, "crossDevice", "已跳过其他文件系统");
                problem(&mut report, "skipped", "已跳过其他文件系统");
                continue;
            }
            let mut child = parts.clone();
            child.push(name.into());
            match stat.st_mode & libc::S_IFMT {
                libc::S_IFDIR => {
                    if child.len() > max_depth {
                        report
                            .coverage
                            .diagnose(&child_path, "depthLimit", "超过目录深度限制");
                        problem(&mut report, "limited", "超过目录深度限制");
                    } else {
                        pending.push((child, stat.st_dev as u64, stat.st_ino));
                    }
                }
                libc::S_IFREG => {
                    let (category, policy, impact) = classify(&child);
                    let group = child[..if child[0] == "projects" {
                        2.min(child.len())
                    } else {
                        1
                    }]
                        .join("/");
                    let item = groups
                        .entry((group.clone(), category.into()))
                        .or_insert_with(|| AiItem {
                            group,
                            category: category.into(),
                            policy: policy.into(),
                            rule_id: format!("ai.{}.{}", input.tool, policy),
                            rule_version: 1,
                            evidence: "仅按目录与文件名分类；没有读取正文，未确认项目／会话归属"
                                .into(),
                            impact: impact.into(),
                            logical_bytes: 0,
                            allocated_bytes: 0,
                            files: 0,
                            modified_at: None,
                            cleanup_eligible: false,
                        });
                    item.files += 1;
                    let modified = (stat.st_mtime >= 0).then_some(stat.st_mtime as u64 * 1000);
                    item.modified_at = item.modified_at.max(modified);
                    if seen.insert((stat.st_dev, stat.st_ino)) {
                        item.logical_bytes = item
                            .logical_bytes
                            .saturating_add(stat.st_size.max(0) as u64);
                        item.allocated_bytes = item
                            .allocated_bytes
                            .saturating_add((stat.st_blocks.max(0) as u64).saturating_mul(512));
                    }
                }
                _ => {
                    report.coverage.diagnose(
                        &child_path,
                        if stat.st_mode & libc::S_IFMT == libc::S_IFLNK {
                            "link"
                        } else {
                            "specialFile"
                        },
                        "不读取链接目标或特殊文件",
                    );
                    problem(
                        &mut report,
                        "skipped",
                        "符号链接或特殊文件已跳过；不读取其目标",
                    );
                }
            }
        }
        match dir.metadata() {
            Ok(after)
                if after.mtime() == before.mtime() && after.mtime_nsec() == before.mtime_nsec() => {
            }
            Ok(_) => {
                report
                    .coverage
                    .diagnose(&current_path, "changed", "遍历期间目录内容变化");
                problem(&mut report, "failed", "遍历期间目录内容变化，统计不完整");
            }
            Err(e) => io_problem(&mut report, &current_path, e),
        }
    }
    match model_storage::open_directory(path).and_then(|f| f.metadata()) {
        Ok(m) if m.dev() == initial.dev() && m.ino() == initial.ino() => (),
        _ => {
            report
                .coverage
                .diagnose(path, "changed", "分析期间根目录已变化");
            problem(&mut report, "failed", "分析期间根目录已变化");
        }
    }
    report.items = groups.into_values().collect();
    if report.coverage.status == "complete" || !report.items.is_empty() {
        report.logical_bytes = Some(report.items.iter().map(|r| r.logical_bytes).sum());
        report.allocated_bytes = Some(report.items.iter().map(|r| r.allocated_bytes).sum());
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::{symlink, PermissionsExt};
    static NEXT_FIXTURE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let p = std::env::temp_dir().canonicalize().unwrap().join(format!(
                "disk-care-ai-{}-{}",
                std::process::id(),
                NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir(&p).unwrap();
            Self(p)
        }
        fn root(&self) -> PathBuf {
            self.0.join(".claude")
        }
        fn write(&self, path: &str) {
            let p = self.root().join(path);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, b"PRIVATE CONTENT MUST NOT BE READ").unwrap();
        }
        fn input(&self) -> AiRoot {
            AiRoot {
                tool: "claude".into(),
                path: self.root().to_string_lossy().into(),
            }
        }
        fn scan(&self) -> AiReport {
            analyze(&self.0, vec![self.input()], &AtomicBool::new(false))
                .unwrap()
                .remove(0)
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn ai_data_protects_nested_memory_and_never_exposes_content() {
        let f = Fixture::new();
        for p in [
            "projects/demo/memory/MEMORY.md",
            "auth.json",
            "file-history/one/snapshot",
            "state.sqlite-wal",
            "projects/demo/one.jsonl",
            "debug/run.log",
        ] {
            f.write(p);
        }
        let r = f.scan();
        assert_eq!(r.coverage.status, "complete");
        assert_eq!(
            r.items
                .iter()
                .filter(|i| i.policy == "protected")
                .map(|i| i.files)
                .sum::<u64>(),
            4
        );
        assert!(r.items.iter().all(|i| !i.cleanup_eligible));
        let json = serde_json::to_string(&r).unwrap();
        assert!(!json.contains("PRIVATE CONTENT"));
        assert!(r
            .items
            .iter()
            .any(|i| i.category == "缓存与日志线索" && i.policy == "unknown"));
    }
    #[test]
    fn ai_data_reads_metadata_even_when_file_cannot_be_opened() {
        let f = Fixture::new();
        f.write("auth.json");
        fs::set_permissions(f.root().join("auth.json"), fs::Permissions::from_mode(0o0)).unwrap();
        let r = f.scan();
        assert_eq!(r.coverage.status, "complete");
        assert!(r.logical_bytes.unwrap() > 0);
    }
    #[test]
    fn ai_data_skips_links_and_deduplicates_hardlinks() {
        let f = Fixture::new();
        f.write("a");
        fs::hard_link(f.root().join("a"), f.root().join("b")).unwrap();
        symlink(&f.0, f.root().join("outside")).unwrap();
        let r = f.scan();
        assert_eq!(r.coverage.excluded, 1);
        assert_eq!(r.coverage.diagnostics[0].reason, "link");
        assert!(r.coverage.diagnostics[0].path.ends_with("outside"));
        assert_eq!(
            r.logical_bytes,
            Some(b"PRIVATE CONTENT MUST NOT BE READ".len() as u64)
        );
    }
    #[test]
    fn ai_data_rejects_bad_and_overlapping_roots() {
        let f = Fixture::new();
        f.write("a");
        assert!(analyze(&f.0, vec![f.input(), f.input()], &AtomicBool::new(false)).is_err());
        for p in [
            f.0.clone(),
            f.root().join("../other"),
            PathBuf::from("/etc"),
        ] {
            assert!(resolve(
                &f.0,
                &AiRoot {
                    tool: "codex".into(),
                    path: p.to_string_lossy().into()
                }
            )
            .is_err());
        }
        assert!(resolve(
            &f.0,
            &AiRoot {
                tool: "invalid".into(),
                path: "~/.codex".into()
            }
        )
        .is_err());
    }
    #[test]
    fn ai_data_reports_absent_and_cancelled_as_unknown_size() {
        let f = Fixture::new();
        let r = f.scan();
        assert_eq!(r.coverage.status, "absent");
        assert_eq!(r.logical_bytes, None);
        f.write("a");
        let r = analyze(&f.0, vec![f.input()], &AtomicBool::new(true))
            .unwrap()
            .remove(0);
        assert!(r.coverage.cancelled);
        assert_eq!(r.logical_bytes, None);
    }
    #[test]
    fn ai_data_budget_and_depth_are_partial() {
        let f = Fixture::new();
        f.write("nested/deep/file");
        for (budget, depth) in [(0, 12), (100, 0)] {
            let r = scan_root(
                &f.input(),
                &f.root(),
                &AtomicBool::new(false),
                Instant::now() + Duration::from_secs(1),
                budget,
                depth,
            );
            assert!(r.coverage.limited);
            assert_eq!(r.logical_bytes, None);
            assert!(r
                .coverage
                .diagnostics
                .iter()
                .any(|detail| matches!(detail.reason.as_str(), "entryLimit" | "depthLimit")));
        }
    }
    #[test]
    fn ai_data_root_symlink_is_not_followed() {
        let f = Fixture::new();
        fs::create_dir(f.0.join("target")).unwrap();
        symlink(f.0.join("target"), f.root()).unwrap();
        let r = f.scan();
        assert_ne!(r.coverage.status, "complete");
        assert_eq!(r.logical_bytes, None);
    }
    #[test]
    fn ai_data_io_failure_is_explicit() {
        let f = Fixture::new();
        let mut r = f.scan();
        r.coverage.status = "complete".into();
        io_problem(
            &mut r,
            &f.root(),
            std::io::Error::from(std::io::ErrorKind::PermissionDenied),
        );
        assert_eq!(r.coverage.status, "denied");
        assert_eq!(r.coverage.permission_denied, 1);
    }
    #[test]
    fn ai_data_wide_directory_keeps_observations_within_budget() {
        let f = Fixture::new();
        for i in 0..1025 {
            f.write(&format!("debug/{i}"));
        }
        let r = f.scan();
        assert_eq!(r.coverage.status, "complete");
        assert_eq!(r.items.iter().map(|item| item.files).sum::<u64>(), 1025);
        let limited = scan_root(
            &f.input(),
            &f.root(),
            &AtomicBool::new(false),
            Instant::now() + Duration::from_secs(5),
            100,
            12,
        );
        assert!(limited.coverage.limited);
        assert!(limited.logical_bytes.unwrap() > 0);
        assert_eq!(limited.items.iter().map(|item| item.files).sum::<u64>(), 99);
        let r = scan_root(
            &f.input(),
            &f.root(),
            &AtomicBool::new(false),
            Instant::now(),
            100_000,
            12,
        );
        assert!(r.coverage.limited);
        assert_eq!(r.logical_bytes, None);
    }
    #[test]
    fn ai_data_missing_file_metadata_is_an_error() {
        let f = Fixture::new();
        f.write("vanished");
        let dir = model_storage::open_directory(&f.root()).unwrap();
        fs::remove_file(f.root().join("vanished")).unwrap();
        assert_eq!(
            metadata_at(&dir, "vanished").unwrap_err().kind(),
            std::io::ErrorKind::NotFound
        );
    }

    #[test]
    fn ai_data_directory_enumeration_can_stop_and_preserves_model_limits() {
        let f = Fixture::new();
        for i in 0..30 {
            f.write(&format!("debug/{i}"));
        }
        let path = f.root().join("debug");
        let mut calls = 0;
        let (names, complete) = model_storage::directory_names_until(
            &model_storage::open_directory(&path).unwrap(),
            100,
            || {
                calls += 1;
                calls > 12
            },
        )
        .unwrap();
        assert!(!complete);
        assert!(!names.is_empty() && names.len() < 30);
        assert!(
            model_storage::directory_names(&model_storage::open_directory(&path).unwrap(), 29,)
                .is_err()
        );
        assert_eq!(
            model_storage::directory_names(&model_storage::open_directory(&path).unwrap(), 30,)
                .unwrap()
                .len(),
            30
        );
    }

    #[test]
    fn ai_data_repeated_notes_do_not_hide_other_causes() {
        let f = Fixture::new();
        let mut report = f.scan();
        report.notes.clear();
        for _ in 0..20 {
            problem(&mut report, "skipped", "符号链接已跳过");
        }
        problem(&mut report, "limited", "达到目录预算");
        assert_eq!(report.issues, 21);
        assert_eq!(report.coverage.excluded, 20);
        assert_eq!(report.notes.len(), 2);
        assert_eq!(report.coverage.status, "limited");
    }
    #[test]
    fn ai_data_does_not_overlap_cleaning_job() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let _guard = engine.job().unwrap();
        assert!(engine.ai_data(vec![f.input()]).is_err());
    }

    #[test]
    #[ignore = "仅显式运行：统计当前用户 .codex 和 .claude 元数据，不读取文件正文"]
    fn manual_default_ai_metadata_readonly() {
        let home = PathBuf::from(std::env::var_os("HOME").expect("需要用户主目录"));
        let roots = [("codex", ".codex"), ("claude", ".claude")]
            .into_iter()
            .map(|(tool, directory)| AiRoot {
                tool: tool.into(),
                path: home.join(directory).to_string_lossy().into_owned(),
            })
            .collect();
        for report in analyze(&home, roots, &AtomicBool::new(false)).unwrap() {
            assert!(report.items.iter().all(|item| !item.cleanup_eligible));
            println!(
                "工具={} 覆盖={} 逻辑字节={:?} 分配字节={:?} 分组={} 问题={}",
                report.tool,
                report.coverage.status,
                report.logical_bytes,
                report.allocated_bytes,
                report.items.len(),
                report.issues
            );
            println!(
                "原因={:?} 拒绝={} 跳过={} 超限={} 取消={}",
                report.notes,
                report.coverage.permission_denied,
                report.coverage.excluded,
                report.coverage.limited,
                report.coverage.cancelled
            );
        }
    }
}
