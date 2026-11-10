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
    pub impact: String,
    pub name: String,
    pub path: String,
    pub coverage: Coverage,
    pub candidates: Vec<ResidueCandidate>,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResidueReport {
    pub rule_version: u32,
    pub target_app_path: Option<String>,
    #[serde(skip)]
    target_app_identity: Option<(u64, u64, i64, i64)>,
    pub id: u64,
    pub measured_at: u64,
    pub target: String,
    pub identity_source: String,
    pub sources: Vec<ResidueSource>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociationSnapshot {
    pub rule_version: u32,
    pub measured_at: u64,
    pub sources: Vec<AssociationSource>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AssociationSource {
    pub path: String,
    pub name: String,
    pub status: String,
    pub present: bool,
    pub allocated_bytes: Option<u64>,
}
pub(super) fn before_snapshot(
    report: &ResidueReport,
    path: &str,
    id: &str,
    time: u64,
) -> Option<AssociationSnapshot> {
    if report.target != id
        || report.target_app_path.as_deref() != Some(path)
        || report.measured_at > time
        || time - report.measured_at >= 300_000
    {
        return None;
    }
    let metadata = fs::symlink_metadata(path).ok()?;
    if report.target_app_identity
        != Some((
            metadata.dev(),
            metadata.ino(),
            metadata.ctime(),
            metadata.ctime_nsec(),
        ))
    {
        return None;
    }
    Some(AssociationSnapshot {
        rule_version: report.rule_version,
        measured_at: report.measured_at,
        sources: report
            .sources
            .iter()
            .map(|s| AssociationSource {
                path: s.path.clone(),
                name: s.name.clone(),
                status: s.coverage.status.clone(),
                present: s.candidates.iter().any(|c| c.path == s.path),
                allocated_bytes: (s.coverage.status == "complete")
                    .then(|| s.candidates.iter().map(|c| c.allocated_bytes).sum()),
            })
            .collect(),
    })
}
pub(super) fn safe_path(path: &Path) -> Result<(), String> {
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
    inspect_target(home, cancel, max_entries, limit, None)
}
fn valid_bundle_id(id: &str) -> bool {
    id.len() <= 200
        && id.contains('.')
        && id.split('.').all(|part| {
            !part.is_empty() && part.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-')
        })
}
fn inspect_target(
    home: &Path,
    cancel: &AtomicBool,
    max_entries: usize,
    limit: Duration,
    bundle: Option<&str>,
) -> ResidueReport {
    let started = Instant::now();
    let mut visited = 0usize;
    let mut count = 0usize;
    let mut seen = HashSet::new();
    let mut sources = Vec::new();
    let specs = if let Some(id) = bundle {
        vec![
            (
                "应用缓存",
                format!("Library/Caches/{id}"),
                "通常用于可重建数据；仍需应用规则验证，不保证独占或可删除",
            ),
            (
                "应用支持数据（可能含个人资料）",
                format!("Library/Application Support/{id}"),
                "可能包含个人资料、数据库和凭据，默认保留",
            ),
            (
                "偏好设置（可能含敏感配置）",
                format!("Library/Preferences/{id}.plist"),
                "可能包含敏感配置，默认保留",
            ),
            (
                "应用日志",
                format!("Library/Logs/{id}"),
                "可能包含诊断线索与敏感信息；移除后失去排障记录，默认保留",
            ),
            (
                "保存状态",
                format!("Library/Saved Application State/{id}.savedState"),
                "用于恢复窗口与会话，可能包含敏感恢复资料，默认保护",
            ),
        ]
    } else {
        vec![
            (
                "配置与可能的凭据",
                ".cc-switch".into(),
                "可能包含凭据，默认保护",
            ),
            (
                "下载安装包线索",
                "Downloads".into(),
                "仅文件名线索，不证明归属",
            ),
            (
                "崩溃记录线索",
                "Library/Application Support/CrashReporter".into(),
                "仅文件名线索，可能包含排障资料",
            ),
        ]
    };
    for (index, (name, relative, impact)) in specs.into_iter().enumerate() {
        let root = home.join(relative);
        let mut source = ResidueSource {
            impact: impact.into(),
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
        if bundle.is_some() && metadata.is_file() {
            count += 1;
            source.candidates.push(ResidueCandidate {
                id: count,
                path: root.to_string_lossy().into(),
                category: name.into(),
                evidence:
                    "app.bundle-exact v2；应用标识精确路径线索，未验证归属，不证明独占或可删除"
                        .into(),
                allocated_bytes: metadata.blocks() * 512,
                logical_bytes: metadata.len(),
                cleanup_eligible: false,
                identity: (metadata.dev(), metadata.ino(), metadata.mode()),
            });
            sources.push(source);
            continue;
        }
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
                if bundle.is_some() || index == 0 {
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
        if bundle.is_some() || index == 0 {
            count += 1;
            source.candidates.push(ResidueCandidate { id: count, path: root.to_string_lossy().into(), category: name.into(), evidence: if bundle.is_some() { "app.bundle-exact v2；应用标识精确路径线索，未验证归属，不证明独占或可删除" } else { "cc-switch.config v1；本机4.0.21历史样例路径；可能包含凭据，不读正文，不证明独占" }.into(), allocated_bytes: total.0, logical_bytes: total.1, cleanup_eligible: false, identity: (metadata.dev(), metadata.ino(), metadata.mode()) });
        }
        sources.push(source);
    }
    ResidueReport {
        rule_version: if bundle.is_some() { 2 } else { 1 },
        target_app_path: None,
        target_app_identity: None,
        id: NEXT_REPORT_ID.fetch_add(1, Ordering::SeqCst),
        measured_at: now(),
        target: bundle.unwrap_or("cc-switch（历史样例专属路径）").into(),
        identity_source: "用户提供标识或历史样例；安装与活动状态未知".into(),
        sources,
    }
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub version: Option<String>,
    pub path: String,
    pub name: String,
    pub bundle_id: String,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppCatalog {
    pub apps: Vec<InstalledApp>,
    pub coverage: Coverage,
}
pub(super) fn app_identity(home: &Path, path: &Path) -> Result<InstalledApp, String> {
    let allowed = [PathBuf::from("/Applications"), home.join("Applications")];
    if !allowed.iter().any(|root| {
        path.strip_prefix(root)
            .is_ok_and(|p| p.components().count() >= 1 && p.components().count() <= 2)
    }) || path.extension().is_none_or(|e| e != "app")
    {
        return Err("只支持常规应用目录内的应用包，不接受其他路径".into());
    }
    safe_path(path)?;
    let info = path.join("Contents/Info.plist");
    safe_path(&info)?;
    let metadata = fs::symlink_metadata(&info).map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > 1024 * 1024 {
        return Err("应用身份文件类型或大小超出限制".into());
    }
    let mut command = Command::new("/usr/bin/plutil");
    command.args(["-convert", "json", "-o", "-"]).arg(&info);
    let output = run_command(command, Duration::from_secs(2))?;
    let value: serde_json::Value =
        serde_json::from_str(&output).map_err(|_| "应用身份文件无法解析")?;
    let id = value["CFBundleIdentifier"]
        .as_str()
        .filter(|id| valid_bundle_id(id))
        .ok_or("应用没有合法标识")?;
    let name = value["CFBundleDisplayName"]
        .as_str()
        .or_else(|| value["CFBundleName"].as_str())
        .unwrap_or("未命名应用");
    Ok(InstalledApp {
        version: value["CFBundleShortVersionString"]
            .as_str()
            .map(|v| v.chars().take(80).collect()),
        path: path.to_string_lossy().into(),
        name: name.chars().take(200).collect(),
        bundle_id: id.into(),
    })
}
#[cfg(target_os = "macos")]
fn system_icon(path: &str) -> Option<String> {
    use objc2_app_kit::{NSBitmapImageFileType, NSBitmapImageRep, NSWorkspace};
    use objc2_foundation::{NSDataBase64EncodingOptions, NSDictionary, NSString};
    objc2::rc::autoreleasepool(|_| {
        let image = NSWorkspace::sharedWorkspace().iconForFile(&NSString::from_str(path));
        use objc2::AllocAnyThread;
        use objc2_foundation::{NSPoint, NSRect, NSSize};
        let mut rect = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(64.0, 64.0));
        // 请求列表尺寸表示，避免展开包含多分辨率图像的完整 TIFF。
        let cg = unsafe { image.CGImageForProposedRect_context_hints(&mut rect, None, None) }?;
        let bitmap = NSBitmapImageRep::initWithCGImage(NSBitmapImageRep::alloc(), &cg);
        // 空属性字典不含类型不匹配的键值。
        let png = unsafe {
            bitmap.representationUsingType_properties(
                NSBitmapImageFileType::PNG,
                &NSDictionary::new(),
            )
        }?;

        if png.length() > 256 * 1024 {
            return None;
        }
        Some(format!(
            "data:image/png;base64,{}",
            png.base64EncodedStringWithOptions(NSDataBase64EncodingOptions::empty())
        ))
    })
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppUsage {
    pub path: String,
    pub bundle_id: String,
    pub measured_at: u64,
    pub allocated_bytes: u64,
    pub entries: u64,
    pub coverage: Coverage,
}
impl Engine {
    pub fn app_usage(&self, path: String, bundle_id: String) -> Result<AppUsage, String> {
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        let root = Path::new(&path);
        checked_read_path(root)?;
        let app = app_identity(&self.home, root)?;
        if app.bundle_id != bundle_id {
            return Err("应用身份已变化，请重新读取应用列表".into());
        }
        let before = fs::symlink_metadata(root).map_err(|e| e.to_string())?;
        let measured = measure_directory(root, &self.cancel, Duration::from_secs(5), |_| {});
        let after = fs::symlink_metadata(root).map_err(|e| e.to_string())?;
        let verified = app_identity(&self.home, root)?;
        if (
            before.dev(),
            before.ino(),
            before.ctime(),
            before.ctime_nsec(),
        ) != (after.dev(), after.ino(), after.ctime(), after.ctime_nsec())
            || verified.bundle_id != bundle_id
        {
            return Err("应用包已变化，请重新计算占用".into());
        }
        Ok(AppUsage {
            path: app.path,
            bundle_id,
            measured_at: now(),
            allocated_bytes: measured.stats.bytes,
            entries: measured.stats.files,
            coverage: measured.stats.coverage(),
        })
    }

    pub fn app_icon(&self, path: String, bundle_id: String) -> Result<Option<String>, String> {
        let app = app_identity(&self.home, Path::new(&path))?;
        if app.bundle_id != bundle_id {
            return Err("应用身份已变化，请重新读取列表".into());
        }
        #[cfg(target_os = "macos")]
        {
            Ok(system_icon(&path))
        }
        #[cfg(not(target_os = "macos"))]
        {
            Ok(None)
        }
    }

    pub fn installed_apps(&self) -> Result<AppCatalog, String> {
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        let started = Instant::now();
        let mut result = AppCatalog {
            apps: vec![],
            coverage: Coverage {
                status: "complete".into(),
                ..Coverage::default()
            },
        };
        let mut stack = vec![
            (PathBuf::from("/Applications"), 0),
            (self.home.join("Applications"), 0),
        ];
        let mut visited = 0;
        while let Some((dir, depth)) = stack.pop() {
            if self.cancel.load(Ordering::SeqCst)
                || started.elapsed() >= Duration::from_secs(15)
                || visited >= 2000
                || result.apps.len() >= 500
            {
                result.coverage.status = if self.cancel.load(Ordering::SeqCst) {
                    "cancelled"
                } else {
                    "limited"
                }
                .into();
                result.coverage.cancelled = self.cancel.load(Ordering::SeqCst);
                result.coverage.limited = !result.coverage.cancelled;
                result
                    .coverage
                    .diagnose(&dir, "limited", "应用发现已停止或达到预算");
                break;
            }
            let entries =
                safe_path(&dir).and_then(|_| fs::read_dir(&dir).map_err(|e| e.to_string()));
            let entries = match entries {
                Ok(e) => e,
                Err(e) => {
                    result.coverage.status = "skipped".into();
                    result.coverage.diagnose(&dir, "unavailable", &e);
                    continue;
                }
            };
            for entry in entries {
                if self.cancel.load(Ordering::SeqCst)
                    || started.elapsed() >= Duration::from_secs(15)
                    || visited >= 2000
                    || result.apps.len() >= 500
                {
                    stack.push((dir.clone(), depth));
                    break;
                }
                visited += 1;
                let entry = match entry {
                    Ok(e) => e,
                    Err(e) => {
                        result.coverage.status = "skipped".into();
                        result.coverage.diagnose(&dir, "read", &e.to_string());
                        continue;
                    }
                };
                let path = entry.path();
                let metadata = match fs::symlink_metadata(&path) {
                    Ok(m) => m,
                    Err(e) => {
                        result.coverage.status = "skipped".into();
                        result.coverage.diagnose(&path, "read", &e.to_string());
                        continue;
                    }
                };
                if metadata.file_type().is_symlink() {
                    result.coverage.status = "skipped".into();
                    result.coverage.diagnose(&path, "link", "链接未读取");
                    continue;
                }
                if !metadata.is_dir() {
                    continue;
                }
                if path.extension().is_some_and(|e| e == "app") {
                    match app_identity(&self.home, &path) {
                        Ok(app) => result.apps.push(app),
                        Err(e) => {
                            result.coverage.status = "skipped".into();
                            result.coverage.diagnose(&path, "identity", &e);
                        }
                    }
                } else if depth == 0 {
                    stack.push((path, 1));
                }
            }
        }
        result
            .apps
            .sort_by(|a, b| a.name.cmp(&b.name).then(a.path.cmp(&b.path)));
        Ok(result)
    }
    pub fn inspect_installed_app(
        &self,
        path: String,
        expected_bundle_id: String,
    ) -> Result<ResidueReport, String> {
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        *self.residue.lock().map_err(|_| "报告状态不可用")? = None;
        let identity = app_identity(&self.home, Path::new(&path))?;
        if identity.bundle_id != expected_bundle_id {
            return Err("应用标识已变化，请重新读取列表、选择并确认范围".into());
        }
        let metadata = fs::symlink_metadata(&path).map_err(|e| e.to_string())?;
        let mut report = inspect_target(
            &self.home,
            &self.cancel,
            20_000,
            Duration::from_secs(30),
            Some(&identity.bundle_id),
        );
        report.target_app_path = Some(identity.path.clone());
        report.target_app_identity = Some((
            metadata.dev(),
            metadata.ino(),
            metadata.ctime(),
            metadata.ctime_nsec(),
        ));
        report.identity_source = format!(
            "应用包Info.plist：{}；已发现此应用副本，不等于正在运行，关联数据不是卸载残留证明",
            identity.path
        );
        *self.residue.lock().map_err(|_| "报告状态不可用")? = Some(report.clone());
        Ok(report)
    }

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
    pub fn inspect_bundle_residue(&self, bundle_id: String) -> Result<ResidueReport, String> {
        if !valid_bundle_id(&bundle_id) {
            return Err("应用标识须为点分隔的字母、数字或连字符，最长200字符；不接受路径".into());
        }
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        *self.residue.lock().map_err(|_| "报告状态不可用")? = None;
        let report = inspect_target(
            &self.home,
            &self.cancel,
            20_000,
            Duration::from_secs(30),
            Some(&bundle_id),
        );
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
    fn generic_bundle_paths_are_exact_and_do_not_need_special_rules() {
        let f = super::super::tests::Fixture::new();
        let engine = Engine::new(f.0.clone());
        for id in ["org.example.editor", "net.other.tool"] {
            let dir = f.0.join(format!("Library/Application Support/{id}"));
            fs::create_dir_all(&dir).unwrap();
            fs::write(dir.join("private.db"), "只计元数据").unwrap();
            let prefs = f.0.join(format!("Library/Preferences/{id}.plist"));
            fs::create_dir_all(prefs.parent().unwrap()).unwrap();
            fs::write(&prefs, "不解析偏好正文").unwrap();
            let report = engine.inspect_bundle_residue(id.into()).unwrap();
            assert_eq!(report.target, id);
            assert_eq!(report.sources[1].candidates.len(), 1);
            assert!(report.sources[1].candidates[0]
                .evidence
                .contains("精确路径"));
            assert_eq!(
                report.sources[2].candidates[0].path,
                prefs.to_string_lossy()
            );
            assert!(checked_read_path(&dir).is_err());
        }
        let missing = engine
            .inspect_bundle_residue("org.unknown.app".into())
            .unwrap();
        assert!(missing
            .sources
            .iter()
            .all(|s| s.coverage.status == "absent"));
        for id in [
            "../escape",
            "org/evil.app",
            "org..app",
            "org.app;rm",
            "org.app\n",
            "single",
        ] {
            assert!(engine.inspect_bundle_residue(id.into()).is_err());
        }
        assert!(!valid_bundle_id(&"a".repeat(201)));
    }
    #[test]
    fn application_identity_is_bounded_and_reread_before_inspection() {
        let f = super::super::tests::Fixture::new();
        let app = f.0.join("Applications/测试.app");
        fs::create_dir_all(app.join("Contents")).unwrap();
        let info = app.join("Contents/Info.plist");
        let plist = |id: &str| {
            format!(
                r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>{id}</string><key>CFBundleName</key><string>测试应用</string></dict></plist>"#
            )
        };
        fs::write(&info, plist("org.example.first")).unwrap();
        assert_eq!(
            app_identity(&f.0, &app).unwrap().bundle_id,
            "org.example.first"
        );
        fs::write(&info, plist("org.example.changed")).unwrap();
        let engine = Engine::new(f.0.clone());
        let report = engine
            .inspect_installed_app(app.to_string_lossy().into(), "org.example.changed".into())
            .unwrap();
        assert_eq!(report.target, "org.example.changed");
        assert!(engine
            .inspect_installed_app(app.to_string_lossy().into(), "org.example.first".into())
            .is_err());
        assert!(engine.residue.lock().unwrap().is_none());
        assert!(report.identity_source.contains("已发现此应用副本"));
        assert!(app_identity(&f.0, &f.0.join("elsewhere/Test.app")).is_err());
        fs::remove_file(&info).unwrap();
        std::os::unix::fs::symlink("/etc/passwd", &info).unwrap();
        assert!(app_identity(&f.0, &app).is_err());
    }
    #[test]
    fn icon_requires_matching_app_identity_and_has_bounded_png_output() {
        let f = super::super::tests::Fixture::new();
        let app = f.0.join("Applications/Icon.app");
        fs::create_dir_all(app.join("Contents")).unwrap();
        fs::write(app.join("Contents/Info.plist"), r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.fixture.icon</string></dict></plist>"#).unwrap();
        let engine = Engine::new(f.0.clone());
        assert!(engine
            .app_icon("/etc/passwd".into(), "org.fixture.icon".into())
            .is_err());
        assert!(engine
            .app_icon(app.to_string_lossy().into(), "org.wrong.id".into())
            .is_err());
        #[cfg(target_os = "macos")]
        assert!(
            system_icon(app.to_str().unwrap()).is_some(),
            "临时应用应取得系统默认图标"
        );
        if let Some(icon) = engine
            .app_icon(app.to_string_lossy().into(), "org.fixture.icon".into())
            .unwrap()
        {
            assert!(icon.starts_with("data:image/png;base64,iVBOR"));
            assert!(icon.len() < 350_000);
        }
    }
    #[test]
    fn ledger_adds_exact_logs_and_protected_state_with_shared_limits() {
        let f = super::super::tests::Fixture::new();
        let id = "org.fixture.ledger";
        for dir in [
            format!("Library/Logs/{id}"),
            format!("Library/Saved Application State/{id}.savedState"),
            format!("Library/Logs/{id}.other"),
        ] {
            fs::create_dir_all(f.0.join(&dir)).unwrap();
            fs::write(f.0.join(&dir).join("private-data"), "不读取正文").unwrap();
        }
        let report = Engine::new(f.0.clone())
            .inspect_bundle_residue(id.into())
            .unwrap();
        assert_eq!(report.rule_version, 2);
        assert_eq!(report.sources.len(), 5);
        assert_eq!(report.sources[3].candidates.len(), 1);
        assert!(report.sources[4].impact.contains("默认保护"));
        assert!(report
            .sources
            .iter()
            .flat_map(|s| &s.candidates)
            .all(|c| !c.cleanup_eligible && !c.path.ends_with(".other")));
        let limited = inspect_target(
            &f.0,
            &AtomicBool::new(false),
            1,
            Duration::from_secs(1),
            Some(id),
        );
        assert_eq!(limited.sources[4].coverage.status, "pending");
        let state =
            f.0.join(format!("Library/Saved Application State/{id}.savedState"));
        fs::remove_dir_all(&state).unwrap();
        std::os::unix::fs::symlink(f.0.join(format!("Library/Logs/{id}")), &state).unwrap();
        let linked = Engine::new(f.0.clone())
            .inspect_bundle_residue(id.into())
            .unwrap();
        assert_eq!(linked.sources[4].coverage.status, "failed");
        assert!(linked.sources[4].candidates.is_empty());
    }
    #[test]
    fn before_observation_requires_fresh_matching_unchanged_app_copy() {
        let f = super::super::tests::Fixture::new();
        let p = f.0.join("Applications/Before.app");
        fs::create_dir_all(p.join("Contents")).unwrap();
        fs::write(p.join("Contents/Info.plist"), r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.fixture.before</string></dict></plist>"#).unwrap();
        let engine = Engine::new(f.0.clone());
        let mut report = engine
            .inspect_installed_app(p.to_string_lossy().into(), "org.fixture.before".into())
            .unwrap();
        let path = p.to_str().unwrap();
        assert!(before_snapshot(&report, path, "org.fixture.before", report.measured_at).is_some());
        assert!(before_snapshot(&report, path, "org.wrong.app", report.measured_at).is_none());
        assert!(before_snapshot(
            &report,
            path,
            "org.fixture.before",
            report.measured_at + 300_000
        )
        .is_none());
        assert!(
            before_snapshot(&report, path, "org.fixture.before", report.measured_at - 1).is_none()
        );
        report.sources[0].coverage.status = "limited".into();
        assert!(
            before_snapshot(&report, path, "org.fixture.before", report.measured_at)
                .unwrap()
                .sources[0]
                .allocated_bytes
                .is_none()
        );
        let manual = engine
            .inspect_bundle_residue("org.fixture.before".into())
            .unwrap();
        assert!(before_snapshot(&manual, path, "org.fixture.before", manual.measured_at).is_none());
        fs::rename(&p, f.0.join("old.app")).unwrap();
        fs::create_dir_all(p.join("Contents")).unwrap();
        assert!(before_snapshot(&report, path, "org.fixture.before", report.measured_at).is_none());
    }
    #[test]
    fn app_usage_is_bound_to_bundle_and_skips_link_targets() {
        let f = super::super::tests::Fixture::new();
        let app = f.0.join("Applications/Usage.app");
        fs::create_dir_all(app.join("Contents")).unwrap();
        fs::write(app.join("Contents/Info.plist"), r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.fixture.usage</string></dict></plist>"#).unwrap();
        let file = app.join("Contents/body");
        fs::write(&file, "应用本体数据").unwrap();
        fs::hard_link(&file, app.join("Contents/body-hardlink")).unwrap();
        let outside = f.0.join("outside");
        fs::write(&outside, vec![1u8; 1024 * 1024]).unwrap();
        std::os::unix::fs::symlink(&outside, app.join("Contents/external-link")).unwrap();
        let engine = Engine::new(f.0.clone());
        assert!(engine
            .app_usage("/etc/passwd".into(), "org.fixture.usage".into())
            .is_err());
        assert!(engine
            .app_usage(app.to_string_lossy().into(), "org.wrong.app".into())
            .is_err());
        let usage = engine
            .app_usage(app.to_string_lossy().into(), "org.fixture.usage".into())
            .unwrap();
        assert_eq!(usage.entries, 4);
        assert_eq!(usage.coverage.status, "complete");
        assert!(usage.allocated_bytes < fs::metadata(&outside).unwrap().blocks() * 512);
        assert_eq!(usage.path, app.to_string_lossy());
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
