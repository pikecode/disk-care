use super::*;
use std::collections::BTreeMap;

const ARTIFACTS: &[&str] = &[
    "node_modules",
    "target",
    ".venv",
    "venv",
    "dist",
    "build",
    ".next",
    "__pycache__",
];
const CONFIGS: &[&str] = &[
    ".env",
    ".env.local",
    ".env.example",
    "config.json",
    "config.yaml",
    "config.yml",
    "Modelfile",
    "docker-compose.yml",
    "compose.yaml",
    "package.json",
    "pyproject.toml",
];
const MAX_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Artifact {
    pub name: String,
    pub bytes: u64,
    pub files: u64,
    pub complete: bool,
    pub recovery: String,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Evidence {
    pub kind: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pid: Option<u32>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub path: String,
    pub name: String,
    pub languages: Vec<String>,
    pub artifacts: Vec<Artifact>,
    pub evidence: Vec<Evidence>,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub path: String,
    pub before: Option<u64>,
    pub after: Option<u64>,
}
#[derive(Clone, Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ProjectReport {
    pub root: String,
    pub measured_at: u64,
    pub duration_ms: u64,
    pub complete: bool,
    pub issues: u64,
    pub cancelled: bool,
    pub warnings: Vec<String>,
    pub projects: Vec<Project>,
    pub baseline_at: Option<u64>,
    pub changes: Vec<Change>,
    pub model_storage: Option<model_storage::ModelStorage>,
}
#[derive(Serialize, Deserialize)]
struct Snapshot {
    root: String,
    at: u64,
    sizes: BTreeMap<String, u64>,
}

fn regular(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
}
fn languages(path: &Path) -> Vec<String> {
    [
        ("Node", "package.json"),
        ("Rust", "Cargo.toml"),
        ("Python", "pyproject.toml"),
        ("Python", "requirements.txt"),
    ]
    .into_iter()
    .filter(|(_, file)| regular(&path.join(file)))
    .map(|(language, _)| language.to_string())
    .collect::<HashSet<_>>()
    .into_iter()
    .collect::<Vec<_>>()
}
fn recovery(path: &Path, artifact: &str) -> String {
    match artifact {
        "node_modules" => {
            if [
                "package-lock.json",
                "pnpm-lock.yaml",
                "yarn.lock",
                "bun.lock",
                "bun.lockb",
            ]
            .iter()
            .any(|f| regular(&path.join(f)))
            {
                "存在依赖锁文件；重装仍可能需要网络、私有仓库凭据及生命周期脚本。"
            } else {
                "未发现依赖锁文件；重装版本可能变化，不能保证恢复原环境。"
            }
        }
        "target" => "通常可重新编译；可能需要较长时间、工具链和网络，不保证恢复手动放入的文件。",
        ".venv" | "venv" => {
            "需重新创建虚拟环境；配置和锁文件不保证包含手动安装的包或可用的下载源。"
        }
        "__pycache__" => "Python 通常会重新生成字节码；不能据目录名证明其中没有其他文件。",
        _ => "需检查项目构建流程；目录名只提供线索，可能混有手动文件，不能保证可重建。",
    }
    .into()
}

fn references_path(text: &str, root: &Path) -> bool {
    argv(text).iter().any(|arg| {
        let value = arg.split_once('=').map_or(arg.as_str(), |(_, value)| value);
        let path = Path::new(value);
        path.is_absolute() && path.starts_with(root)
    })
}
fn references_model(text: &str, model: &str) -> bool {
    let identifier = |c: char| c.is_alphanumeric() || "_./:-".contains(c);
    text.match_indices(model).any(|(i, _)| {
        !text[..i].chars().next_back().is_some_and(identifier)
            && !text[i + model.len()..]
                .chars()
                .next()
                .is_some_and(identifier)
    })
}
fn read_small(path: &Path, limit: u64) -> Result<String, String> {
    // 不跟随末级链接；正文仅在内存匹配，不返回或持久化。
    use std::os::unix::fs::OpenOptionsExt;
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
        .open(path)
        .map_err(|e| e.to_string())?;
    let metadata = file.metadata().map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err("文件类型不支持或超出读取上限".into());
    }
    let mut text = String::new();
    file.take(limit + 1)
        .read_to_string(&mut text)
        .map_err(|e| e.to_string())?;
    if text.len() as u64 > limit {
        return Err("文件超出读取上限".into());
    }
    Ok(text)
}

pub(super) fn scan(
    home: &Path,
    input: &str,
    cancel: &AtomicBool,
    progress: impl Fn(Progress),
) -> Result<ProjectReport, String> {
    let input = input.trim();
    let root = input
        .strip_prefix("~/")
        .map_or_else(|| PathBuf::from(input), |relative| home.join(relative));
    checked_read_path(&root)?;
    checked_path(home, &root)?;
    if !root.is_dir() {
        return Err("请选择主目录内存在的工作目录，例如 ~/work".into());
    }
    let root = fs::canonicalize(root).map_err(|e| format!("无法定位工作目录：{e}"))?;
    checked_path(home, &root)?;
    let start = Instant::now();
    let storage = model_storage::scan(home, cancel, start + Duration::from_secs(5), &progress);
    let models = storage
        .models
        .iter()
        .filter_map(|m| m.reference_name.clone())
        .collect::<Vec<_>>();
    let models_complete = storage.complete;
    let ps = processes();
    let mut report = discover(&root, cancel, &ps, &models, start, &progress)?;
    if !models_complete {
        report
            .warnings
            .push("本地 Ollama 模型清单未完整读取，引用证据可能遗漏。".into());
    }
    if ps.is_err() {
        report
            .warnings
            .push("无法读取进程；不能据此判断项目未运行。".into());
    }
    report.model_storage = Some(storage);
    update_baseline(home, &mut report);
    report.duration_ms = start.elapsed().as_millis() as u64;
    Ok(report)
}

fn discover(
    root: &Path,
    cancel: &AtomicBool,
    ps: &Result<Vec<Process>, String>,
    models: &[String],
    start: Instant,
    progress: &impl Fn(Progress),
) -> Result<ProjectReport, String> {
    let device = fs::symlink_metadata(root).map_err(|e| e.to_string())?.dev();
    let deadline = start + Duration::from_secs(120);
    let mut report = ProjectReport {
        root: root.to_string_lossy().into(),
        measured_at: now(),
        duration_ms: 0,
        complete: true,
        issues: 0,
        cancelled: false,
        warnings: vec![],
        projects: vec![],
        baseline_at: None,
        changes: vec![],
        model_storage: None,
    };
    let mut stack = vec![(root.to_path_buf(), 0)];
    let mut directories: usize = 0;
    let mut artifact_count = 0;
    while let Some((path, depth)) = stack.pop() {
        if cancel.load(Ordering::SeqCst)
            || Instant::now() >= deadline
            || directories >= 20_000
            || artifact_count >= 5000
            || report.projects.len() >= 1000
        {
            report.complete = false;
            break;
        }
        if excluded_app_data(&path) {
            report.complete = false;
            report
                .warnings
                .push(format!("主动跳过其他应用私有数据目录：{}", path.display()));
            continue;
        }
        let metadata = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(_) => {
                report.issues += 1;
                continue;
            }
        };
        if metadata.file_type().is_symlink() || !metadata.is_dir() || metadata.dev() != device {
            continue;
        }
        // 逐级复核防止已发现的父目录被替换为符号链接。
        if checked_read_path(&path).is_err() {
            report.issues += 1;
            continue;
        }
        directories += 1;
        let mut kinds = languages(&path);
        kinds.sort();
        if directories == 1 || directories.is_multiple_of(32) {
            progress(Progress {
                name: path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into(),
                done: directories,
                total: 20_000,
                files: artifact_count,
            });
        }
        let mut project = Project {
            path: path
                .strip_prefix(root)
                .unwrap_or(&path)
                .to_string_lossy()
                .into(),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into(),
            languages: kinds,
            artifacts: vec![],
            evidence: vec![],
        };
        if !project.languages.is_empty() {
            if let Ok(ps) = ps {
                for process in ps
                    .iter()
                    .filter(|p| {
                        references_path(&p.args, &path)
                            || Path::new(&p.executable).is_absolute()
                                && Path::new(&p.executable).starts_with(&path)
                    })
                    .take(20)
                {
                    project.evidence.push(Evidence {
                        kind: "process".into(),
                        model: None,
                        source: None,
                        pid: Some(process.pid),
                        message: format!(
                            "PID {} 的绝对路径参数或可执行路径指向此项目；仅为可见路径引用。",
                            process.pid
                        ),
                    });
                }
            }
            for config in CONFIGS {
                let file = path.join(config);
                match fs::symlink_metadata(&file) {
                    Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
                    Ok(m) if m.file_type().is_symlink() => {
                        report.issues += 1;
                        continue;
                    }
                    Err(_) => {
                        report.issues += 1;
                        continue;
                    }
                    _ => (),
                }
                match read_small(&file, 64 * 1024) {
                    Ok(text) => {
                        for model in models.iter().filter(|m| references_model(&text, m)) {
                            project.evidence.push(Evidence {
                                kind: "model".into(),
                                model: Some(model.clone()),
                                source: Some(config.to_string()),
                                pid: None,
                                message: format!(
                                    "{config} 引用已安装模型 {model}；配置引用不代表真实调用。"
                                ),
                            });
                        }
                    }
                    Err(_) => {
                        report.issues += 1;
                    }
                }
            }
        }
        let entries = match fs::read_dir(&path) {
            Ok(entries) => entries,
            Err(_) => {
                report.issues += 1;
                continue;
            }
        };
        for entry in entries {
            if cancel.load(Ordering::SeqCst)
                || Instant::now() >= deadline
                || stack.len() + directories >= 20_000
                || artifact_count >= 5000
                || report.projects.len() >= 1000
            {
                report.complete = false;
                break;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(_) => {
                    report.issues += 1;
                    continue;
                }
            };
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if excluded_app_data(&entry.path()) {
                report.complete = false;
                report.warnings.push(format!(
                    "主动跳过其他应用私有数据目录：{}",
                    entry.path().display()
                ));
                continue;
            }
            let m = match fs::symlink_metadata(entry.path()) {
                Ok(m) => m,
                Err(_) => {
                    report.issues += 1;
                    continue;
                }
            };
            if m.file_type().is_symlink() || !m.is_dir() || m.dev() != device {
                continue;
            }
            if ARTIFACTS.contains(&name.as_ref()) {
                if !project.languages.is_empty() {
                    let remaining = deadline.saturating_duration_since(Instant::now());
                    let stats = measure_directory(&entry.path(), cancel, remaining, |files| {
                        progress(Progress {
                            name: format!("{} / {}", project.name, name),
                            done: directories,
                            total: 20_000,
                            files,
                        });
                    })
                    .stats;
                    let complete = stats.complete && stats.issues == 0;
                    report.complete &= complete;
                    report.issues += stats.issues;
                    project.artifacts.push(Artifact {
                        name: name.into(),
                        bytes: stats.bytes,
                        files: stats.files,
                        complete,
                        recovery: recovery(&path, &entry.file_name().to_string_lossy()),
                    });
                    artifact_count += 1;
                }
            } else if ![
                ".git",
                ".hg",
                ".svn",
                ".cache",
                ".tox",
                "vendor",
                ".yarn",
                ".pnpm-store",
            ]
            .contains(&name.as_ref())
            {
                if depth < 8 {
                    stack.push((entry.path(), depth + 1));
                } else {
                    report.complete = false;
                }
            }
        }
        if !project.languages.is_empty() {
            project
                .artifacts
                .sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.name.cmp(&b.name)));
            project.evidence.push(Evidence {
                kind: "unknown".into(),
                model: None,
                source: None,
                pid: None,
                message: "未匹配不代表没有依赖；相对路径、进程工作目录、动态配置和远程模型未覆盖。"
                    .into(),
            });
            report.projects.push(project);
        }
    }
    report.cancelled = cancel.load(Ordering::SeqCst);
    report.complete &= report.issues == 0 && !report.cancelled;
    if !report.complete {
        report.warnings.push("结果为部分观测：权限、配置读取、深度、数量、时间限制或取消会造成遗漏；本次不更新完整基线。".into());
    }
    report.projects.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(report)
}

fn sizes(report: &ProjectReport) -> BTreeMap<String, u64> {
    report
        .projects
        .iter()
        .flat_map(|p| {
            p.artifacts.iter().map(move |a| {
                (
                    Path::new(&p.path).join(&a.name).to_string_lossy().into(),
                    a.bytes,
                )
            })
        })
        .collect()
}
fn changes(before: &BTreeMap<String, u64>, after: &BTreeMap<String, u64>) -> Vec<Change> {
    let keys: std::collections::BTreeSet<_> = before.keys().chain(after.keys()).collect();
    let mut result: Vec<_> = keys
        .into_iter()
        .filter_map(|path| {
            let old = before.get(path).copied();
            let new = after.get(path).copied();
            (old != new).then(|| Change {
                path: path.clone(),
                before: old,
                after: new,
            })
        })
        .collect();
    result.sort_by_key(|c| std::cmp::Reverse(c.after.unwrap_or(0).abs_diff(c.before.unwrap_or(0))));
    result
}
fn update_baseline(home: &Path, report: &mut ProjectReport) {
    if let Err(e) = baseline(home, report) {
        report
            .warnings
            .push(format!("扫描基线不可用：{e}；本次结果仍可查看。"));
    }
}
fn baseline(home: &Path, report: &mut ProjectReport) -> Result<(), String> {
    let path = home.join("Library/Application Support/local.diskcare.desktop/projects.json");
    checked_path(home, &path)?;
    let mut snapshots: Vec<Snapshot> = if path.exists() {
        serde_json::from_str(&read_small(&path, MAX_BYTES)?)
            .map_err(|_| "基线格式损坏，不覆盖原文件".to_string())?
    } else {
        vec![]
    };
    if snapshots.len() > 20 || snapshots.iter().any(|s| s.sizes.len() > 5000) {
        return Err("基线超出支持范围".into());
    }
    let current = sizes(report);
    if let Some(old) = snapshots.iter().find(|s| s.root == report.root) {
        report.baseline_at = Some(old.at);
        if report.complete {
            report.changes = changes(&old.sizes, &current);
        } else {
            report
                .warnings
                .push("本次不完整，未计算增减，以免把未扫描项误报为消失。".into());
        }
    }
    if !report.complete {
        return Ok(());
    }
    snapshots.retain(|s| s.root != report.root);
    snapshots.insert(
        0,
        Snapshot {
            root: report.root.clone(),
            at: report.measured_at,
            sizes: current,
        },
    );
    snapshots.truncate(20);
    let data = serde_json::to_vec(&snapshots).map_err(|e| e.to_string())?;
    if data.len() as u64 > MAX_BYTES {
        return Err("基线超出存储上限，未保存".into());
    }
    let parent = path.parent().ok_or("基线路径不可用")?;
    fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    checked_path(home, &path)?;
    let temporary = parent.join(format!("projects-{}-{}.pending", std::process::id(), now()));
    let result = (|| {
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(&data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(&temporary, &path).map_err(|e| e.to_string())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "ledger-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::SeqCst)
            ));
            fs::create_dir_all(&path).unwrap();
            Self(fs::canonicalize(path).unwrap())
        }
        fn write(&self, path: &str, data: &str) {
            let path = self.0.join(path);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, data).unwrap();
        }
        fn scan(&self) -> ProjectReport {
            discover(
                &self.0.join("work"),
                &AtomicBool::new(false),
                &Ok(vec![]),
                &["qwen:7b".into()],
                Instant::now(),
                &|_| {},
            )
            .unwrap()
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn mixed_nested_projects_and_no_dependency_recursion() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        f.write("work/a/Cargo.toml", "");
        f.write("work/a/node_modules/pkg/package.json", "{}");
        f.write("work/a/nested/pyproject.toml", "");
        f.write("work/a/nested/.venv/bin/python", "payload");
        f.write("work/a/.env", "TOKEN=do-not-return\nMODEL=qwen:7b");
        let r = f.scan();
        assert!(r.complete);
        assert_eq!(r.projects.len(), 2);
        assert_eq!(r.projects[0].languages, vec!["Node", "Rust"]);
        assert_eq!(r.projects[0].artifacts[0].name, "node_modules");
        assert_eq!(r.projects[1].artifacts[0].name, ".venv");
        let serialized = serde_json::to_string(&r).unwrap();
        assert!(serialized.contains("qwen:7b"));
        assert!(!serialized.contains("do-not-return"));
        let model = r.projects[0]
            .evidence
            .iter()
            .find(|e| e.kind == "model")
            .unwrap();
        assert_eq!(model.model.as_deref(), Some("qwen:7b"));
        assert_eq!(model.source.as_deref(), Some(".env"));
        assert_eq!(model.pid, None);
    }
    #[test]
    fn legacy_evidence_is_readable_without_invented_identifiers() {
        let evidence: Evidence =
            serde_json::from_str(r#"{"kind":"model","message":"旧版说明"}"#).unwrap();
        assert!(evidence.model.is_none());
        assert!(evidence.source.is_none());
        assert!(evidence.pid.is_none());
        let data = serde_json::to_value(evidence).unwrap();
        assert!(data.get("model").is_none());
        assert!(data.get("source").is_none());
        assert!(data.get("pid").is_none());
    }
    #[test]
    fn evidence_boundaries_and_recovery_limits() {
        assert!(references_path(
            "python /work/app/.venv/bin/tool",
            Path::new("/work/app")
        ));
        assert!(!references_path(
            "python /work/apple/run.py",
            Path::new("/work/app")
        ));
        assert!(references_path(
            "node --prefix=/work/app",
            Path::new("/work/app")
        ));
        assert!(references_model("MODEL='qwen:7b'", "qwen:7b"));
        assert!(!references_model("qwen:7b-extra", "qwen:7b"));
        let f = Fixture::new();
        assert!(recovery(&f.0, "node_modules").contains("未发现"));
        f.write("package-lock.json", "{}");
        assert!(recovery(&f.0, "node_modules").contains("存在"));
    }
    #[test]
    fn symlinks_skipped_and_small_config_limit() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        f.write("external/sentinel", "safe");
        symlink(f.0.join("external"), f.0.join("work/a/node_modules")).unwrap();
        symlink(f.0.join("external/sentinel"), f.0.join("work/a/.env")).unwrap();
        let r = f.scan();
        assert!(!r.complete);
        assert!(r.projects[0].artifacts.is_empty());
        assert!(read_small(&f.0.join("work/a/.env"), 100).is_err());
        assert!(read_small(&f.0.join("external/sentinel"), 2).is_err());
        assert!(scan(&f.0, "../outside", &AtomicBool::new(false), |_| {}).is_err());
    }
    #[test]
    fn baseline_growth_removal_and_partial_preservation() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        f.write("work/a/dist/data", "x");
        let mut r = f.scan();
        baseline(&f.0, &mut r).unwrap();
        assert!(r.baseline_at.is_none());
        let path =
            f.0.join("Library/Application Support/local.diskcare.desktop/projects.json");
        let original = fs::read(&path).unwrap();
        r.complete = false;
        r.projects.clear();
        baseline(&f.0, &mut r).unwrap();
        assert_eq!(original, fs::read(&path).unwrap());
        assert!(r.changes.is_empty());
        let before = BTreeMap::from([("a".into(), 10), ("gone".into(), 5)]);
        let after = BTreeMap::from([("a".into(), 20), ("new".into(), 3)]);
        let c = changes(&before, &after);
        assert_eq!(c.len(), 3);
        assert_eq!(c[0].path, "a");
        fs::write(&path, "invalid").unwrap();
        assert!(baseline(&f.0, &mut r).is_err());
        assert_eq!(fs::read_to_string(&path).unwrap(), "invalid");
    }
    #[test]
    fn nested_app_data_is_skipped_without_claiming_permission_failure() {
        let f = Fixture::new();
        f.write("Library/Containers/private/package.json", "{}");
        f.write("a/package.json", "{}");
        let report = discover(
            &f.0,
            &AtomicBool::new(false),
            &Ok(vec![]),
            &[],
            Instant::now(),
            &|_| {},
        )
        .unwrap();
        assert_eq!(report.projects.len(), 1);
        assert_eq!(report.projects[0].path, "a");
        assert_eq!(report.issues, 0);
        assert!(!report.complete);
        assert!(report
            .warnings
            .iter()
            .any(|w| w.contains("主动跳过其他应用私有数据目录")));
    }
    #[test]
    fn cancelled_scan_does_not_claim_complete() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        let r = discover(
            &f.0.join("work"),
            &AtomicBool::new(true),
            &Ok(vec![]),
            &[],
            Instant::now(),
            &|_| {},
        )
        .unwrap();
        assert!(r.cancelled);
        assert!(!r.complete);
    }
    #[test]
    fn timeout_and_depth_limit_are_partial() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        let r = discover(
            &f.0.join("work"),
            &AtomicBool::new(false),
            &Ok(vec![]),
            &[],
            Instant::now() - Duration::from_secs(121),
            &|_| {},
        )
        .unwrap();
        assert!(!r.complete);
        assert!(!r.cancelled);
        f.write("work/1/2/3/4/5/6/7/8/9/package.json", "{}");
        assert!(!f.scan().complete);
    }
    #[test]
    fn process_evidence_is_redacted_and_path_aware() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        let path = f.0.join("work/a");
        let r = discover(
            &f.0.join("work"),
            &AtomicBool::new(false),
            &Ok(vec![Process {
                pid: 77,
                executable: "/bin/node".into(),
                args: format!(
                    "node '{}/script.js' --token=secret-sentinel",
                    path.display()
                ),
            }]),
            &[],
            Instant::now(),
            &|_| {},
        )
        .unwrap();
        assert!(r.projects[0]
            .evidence
            .iter()
            .any(|e| e.kind == "process" && e.message.contains("77")));
        assert!(!serde_json::to_string(&r)
            .unwrap()
            .contains("secret-sentinel"));
    }
    #[test]
    fn baseline_detects_new_removed_and_isolates_roots() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        f.write("work/a/dist/data", "x");
        let mut first = f.scan();
        baseline(&f.0, &mut first).unwrap();
        fs::remove_dir_all(f.0.join("work/a/dist")).unwrap();
        f.write("work/a/build/data", "x");
        let mut second = f.scan();
        baseline(&f.0, &mut second).unwrap();
        assert!(second.baseline_at.is_some());
        assert!(second
            .changes
            .iter()
            .any(|c| c.path == "a/dist" && c.after.is_none()));
        assert!(second
            .changes
            .iter()
            .any(|c| c.path == "a/build" && c.before.is_none()));
        second.root.push_str("/other");
        second.baseline_at = None;
        second.changes.clear();
        baseline(&f.0, &mut second).unwrap();
        assert!(second.baseline_at.is_none());
        assert!(second.changes.is_empty());
    }
    #[test]
    fn project_measure_deduplicates_hardlinks() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        f.write("work/a/dist/one", "payload");
        fs::hard_link(f.0.join("work/a/dist/one"), f.0.join("work/a/dist/two")).unwrap();
        let r = f.scan();
        let expected = fs::metadata(f.0.join("work/a/dist")).unwrap().blocks() * 512
            + fs::metadata(f.0.join("work/a/dist/one")).unwrap().blocks() * 512;
        assert_eq!(r.projects[0].artifacts[0].bytes, expected);
    }
    #[test]
    #[ignore = "本机工作目录只读验证；写入应用扫描基线，不清理项目"]
    fn real_project_scan_smoke() {
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let engine = Engine::new(home.clone());
        let root = home.join("work/disk-care");
        let report = engine
            .projects(root.to_string_lossy().into(), |_| {})
            .unwrap();
        println!(
            "项目 {}，产物 {}，完整 {}，读取问题 {}，耗时 {}ms",
            report.projects.len(),
            report
                .projects
                .iter()
                .map(|p| p.artifacts.len())
                .sum::<usize>(),
            report.complete,
            report.issues,
            report.duration_ms
        );
        assert!(report
            .projects
            .iter()
            .any(|p| p.languages.contains(&"Node".into())));
        assert!(report
            .projects
            .iter()
            .any(|p| p.languages.contains(&"Rust".into())));
        let again = engine
            .projects(format!("{}/", root.display()), |_| {})
            .unwrap();
        if report.complete {
            assert_eq!(again.baseline_at, Some(report.measured_at));
        }
        assert_eq!(again.root, report.root);
        assert!(engine.projects("/opt".into(), |_| {}).is_err());
    }
    #[test]
    fn baseline_symlink_is_rejected() {
        let f = Fixture::new();
        f.write("work/a/package.json", "{}");
        f.write("sentinel", "safe");
        let path =
            f.0.join("Library/Application Support/local.diskcare.desktop");
        fs::create_dir_all(&path).unwrap();
        symlink(f.0.join("sentinel"), path.join("projects.json")).unwrap();
        assert!(baseline(&f.0, &mut f.scan()).is_err());
        assert_eq!(fs::read_to_string(f.0.join("sentinel")).unwrap(), "safe");
    }
}
