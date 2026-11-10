use super::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeveloperEntry {
    pub tool: String,
    pub name: String,
    pub path: Option<String>,
    pub kind: String,
    pub basis: String,
    pub impact: String,
    pub allocated_bytes: Option<u64>,
    pub entries: Option<u64>,
    pub coverage: Coverage,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeveloperReport {
    pub measured_at: u64,
    pub entries: Vec<DeveloperEntry>,
    pub notes: Vec<String>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeveloperPreview {
    pub measured_at: u64,
    pub executable: String,
    pub output: String,
    pub truncated: bool,
}
const TOOLS: [&str; 5] = ["rust", "yarn", "pnpm", "poetry", "homebrew"];
fn validate_tools(ids: &[String]) -> Result<(), String> {
    let unique: HashSet<_> = ids.iter().collect();
    if ids.is_empty()
        || ids.len() > TOOLS.len()
        || unique.len() != ids.len()
        || ids.iter().any(|s| !TOOLS.contains(&s.as_str()))
    {
        return Err("请选择有效且不重复的开发工具范围".into());
    }
    Ok(())
}
fn tool_command(
    home: &Path,
    executable: &Path,
    args: &[&str],
    timeout: Duration,
) -> Result<String, String> {
    let mut command = Command::new(executable);
    command
        .args(args)
        .current_dir(home)
        .env("HOME", home)
        .env("COREPACK_ENABLE_NETWORK", "0")
        .env("NO_UPDATE_NOTIFIER", "1")
        .env("PNPM_DISABLE_SELF_UPDATE_CHECK", "1")
        .env("HOMEBREW_NO_AUTO_UPDATE", "1")
        .env("HOMEBREW_NO_ANALYTICS", "1")
        .env("NO_COLOR", "1");
    command_path(&mut command)?;
    run_command(command, timeout)
        .map_err(|_| "工具探测失败或超时，请核对安装与GUI环境；未改用默认目录".into())
}
fn path_output(output: &str) -> Result<PathBuf, String> {
    let paths: Vec<_> = output
        .lines()
        .map(str::trim)
        .filter(|s| s.starts_with('/'))
        .collect();
    if paths.len() != 1 {
        return Err("工具未返回唯一的绝对位置".into());
    }
    let path = PathBuf::from(paths[0]);
    if path == Path::new("/")
        || path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err("工具返回的位置过于宽泛或无效".into());
    }
    Ok(path)
}
fn cache_scope(home: &Path, path: &Path, selected: Option<&Path>) -> bool {
    [home.join("Library/Caches"), home.join(".cache")]
        .iter()
        .any(|p| {
            path.strip_prefix(p)
                .is_ok_and(|s| !s.as_os_str().is_empty())
        })
        || path.starts_with(home.join("Library/pnpm/store"))
        || selected.is_some_and(|p| path.starts_with(p))
}
fn service_kind(name: &str) -> (&'static str, &'static str) {
    if ["postgresql", "mysql", "mariadb", "mongodb", "redis"]
        .iter()
        .any(|p| name == *p || name.starts_with(&format!("{p}@")))
    {
        (
            "数据库（保护）",
            "可能包含业务数据库；未运行、旧版本均不证明废弃，不能作为缓存清理",
        )
    } else if name == "log" {
        (
            "服务日志（保护）",
            "可能包含排障记录或活动日志；仅观察，不自动清理",
        )
    } else {
        ("服务数据（保护）", "用途及活动状态未验证，默认保留")
    }
}
fn pending(tool: &str, reason: &str) -> DeveloperEntry {
    DeveloperEntry {
        tool: tool.into(),
        name: tool.into(),
        path: None,
        kind: "未确认".into(),
        basis: reason.into(),
        impact: "未访问不代表没有占用".into(),
        allocated_bytes: None,
        entries: None,
        coverage: Coverage {
            status: "pending".into(),
            ..Coverage::default()
        },
    }
}
fn observe(
    engine: &Engine,
    started: Instant,
    tool: &str,
    name: &str,
    path: &Path,
    policy: (&str, &str),
    basis: &str,
) -> DeveloperEntry {
    let (kind, impact) = policy;
    let mut entry = pending(tool, basis);
    entry.name = name.into();
    entry.path = Some(path.to_string_lossy().into());
    entry.kind = kind.into();
    entry.impact = impact.into();
    if engine.cancel.load(Ordering::SeqCst) || started.elapsed() >= Duration::from_secs(35) {
        return entry;
    }
    if let Err(error) = checked_read_path(path) {
        entry.coverage.status = "skipped".into();
        entry.basis = format!("{basis}；{error}");
        return entry;
    }
    match fs::symlink_metadata(path) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
            entry.coverage.status = "absent".into();
            entry.allocated_bytes = Some(0);
            entry.entries = Some(0);
            return entry;
        }
        Err(e) => {
            entry.coverage.status = if e.kind() == std::io::ErrorKind::PermissionDenied {
                "denied"
            } else {
                "failed"
            }
            .into();
            return entry;
        }
        Ok(_) => {}
    }
    let limit = Duration::from_secs(35)
        .saturating_sub(started.elapsed())
        .min(Duration::from_secs(3));
    let data = measure_directory(path, &engine.cancel, limit, |_| {});
    entry.allocated_bytes = Some(data.stats.bytes);
    entry.entries = Some(data.stats.files);
    entry.coverage = data.stats.coverage();
    entry
}
impl Engine {
    pub fn developer_tools(
        &self,
        ids: Vec<String>,
        selected_id: Option<String>,
    ) -> Result<DeveloperReport, String> {
        validate_tools(&ids)?;
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        let selected = if let Some(id) = selected_id {
            if !id.starts_with("selected-directory-") {
                return Err("项目范围必须来自系统文件夹选择".into());
            }
            Some(PathBuf::from(self.browsing_root(&id)?.path))
        } else {
            None
        };
        if ids.iter().any(|id| id == "rust") && selected.is_none() {
            return Err("Rust分析需要先选择项目目录".into());
        }
        let started = Instant::now();
        let mut report=DeveloperReport{measured_at:0,entries:vec![],notes:vec!["仅元数据观测；占用不等于可释放量，不跨目录相加。路径由工具报告不保证配置正确。".into(),"每来源最多3秒遍历，整体35秒预算，原生命令最多2秒；取消在命令／文件系统调用间生效。".into()]};
        for id in ids {
            if self.cancel.load(Ordering::SeqCst) || started.elapsed() >= Duration::from_secs(35) {
                report.entries.push(pending(&id, "因取消或总预算未访问"));
                continue;
            }
            if id == "rust" {
                let root = selected.as_ref().ok_or("缺少项目目录")?;
                let mut found = false;
                for base in [root.clone(), root.join("src-tauri")] {
                    if checked_read_path(&base).is_err() {
                        report
                            .notes
                            .push("项目子目录含链接或私有边界，未检查其标记".into());
                        continue;
                    }
                    if !fs::symlink_metadata(base.join("Cargo.toml"))
                        .is_ok_and(|m| m.is_file() && !m.file_type().is_symlink())
                    {
                        continue;
                    }
                    found = true;
                    for (tail, name, impact) in [
                        (
                            "debug/incremental",
                            "增量编译缓存",
                            "可重建候选，清理会增加编译时间；本轮不执行",
                        ),
                        (
                            "debug/deps",
                            "编译依赖",
                            "可重建候选；可能用于正在进行的开发，未检查活动状态",
                        ),
                        (
                            "debug/build",
                            "构建脚本产物",
                            "可能包含工具生成结果，需项目规则验证",
                        ),
                        (
                            "release",
                            "发布构建",
                            "可能包含正在运行的应用或唯一发布产物，默认保留",
                        ),
                    ] {
                        report.entries.push(observe(
                            self,
                            started,
                            "Rust",
                            name,
                            &base.join("target").join(tail),
                            (
                                if tail == "release" {
                                    "发布产物（保护）"
                                } else {
                                    "构建候选"
                                },
                                impact,
                            ),
                            "Cargo.toml元数据与默认target约定；未解析自定义CARGO_TARGET_DIR",
                        ));
                    }
                }
                if found {
                    for (tail, name, kind, impact) in [
                        (
                            "node_modules",
                            "项目已安装依赖",
                            "安装依赖（保留）",
                            "不是下载缓存，移除会影响项目运行，本轮仅观察",
                        ),
                        (
                            "output",
                            "项目输出",
                            "输出资料（保护）",
                            "可能是唯一研究／生成资料，不能因为位于output就认定可删除",
                        ),
                        (
                            "release",
                            "项目发布包",
                            "发布产物（保护）",
                            "可能是交付包及回退版本，需单独审阅",
                        ),
                    ] {
                        report.entries.push(observe(
                            self,
                            started,
                            "Rust",
                            name,
                            &root.join(tail),
                            (kind, impact),
                            "所选项目目录约定；用途未独立核实，默认保留",
                        ));
                    }
                }
                if !found {
                    let mut entry = pending(
                        "Rust",
                        "所选目录及src-tauri未发现普通Cargo.toml，未假定target为缓存",
                    );
                    entry.coverage.status = "skipped".into();
                    report.entries.push(entry);
                }
                continue;
            }
            let (program, args, kind, impact) = match id.as_str() {
                "yarn" => (
                    "yarn",
                    vec!["cache", "dir"],
                    "包下载缓存",
                    "通过工具原生机制处理；之后可能重新下载依赖",
                ),
                "pnpm" => (
                    "pnpm",
                    vec!["store", "path"],
                    "依赖存储",
                    "仅可评估工具原生未引用回收；目录总量不等于可回收量",
                ),
                "poetry" => (
                    "poetry",
                    vec!["config", "cache-dir"],
                    "包缓存",
                    "工具缓存可能分为HTTP与构建资源；清理后需重新获取，本轮只读",
                ),
                "homebrew" => (
                    "brew",
                    vec!["--prefix"],
                    "安装内容（保留）",
                    "已安装软件不是缓存；原生清理预览需单独请求",
                ),
                _ => unreachable!(),
            };
            let outcome = find_tool(program, &self.home)
                .ok_or_else(|| "未发现工具可执行文件".to_string())
                .and_then(|exe| tool_command(&self.home, &exe, &args, Duration::from_secs(2)))
                .and_then(|output| path_output(&output));
            let path = match outcome {
                Ok(path) => path,
                Err(error) => {
                    let mut entry = pending(&id, &error);
                    entry.coverage.status = "failed".into();
                    report.entries.push(entry);
                    continue;
                }
            };
            if id != "homebrew" {
                if !cache_scope(&self.home, &path, selected.as_deref()) {
                    let mut entry = pending(
                        &id,
                        "工具报告自定义位置不在本轮缓存／所选范围内，未扫描默认替代目录",
                    );
                    entry.path = Some(path.to_string_lossy().into());
                    entry.coverage.status = "skipped".into();
                    report.entries.push(entry);
                    continue;
                }
                report.entries.push(observe(
                    self,
                    started,
                    &id,
                    "工具实际报告位置",
                    &path,
                    (kind, impact),
                    "固定工具命令返回的位置；未读取配置正文，不证明独占或可删除",
                ));
                continue;
            }
            if path == self.home || path.components().count() < 3 {
                return Err("Homebrew前缀过于宽泛，未扫描".into());
            }
            for tail in ["Cellar", "Caskroom", "share"] {
                report.entries.push(observe(
                    self,
                    started,
                    "Homebrew",
                    tail,
                    &path.join(tail),
                    (kind, impact),
                    "brew --prefix返回的前缀下目录",
                ));
            }
            let data = path.join("var");
            if checked_read_path(&data).is_err() {
                let mut entry = pending("Homebrew", "服务数据路径不满足只读范围校验");
                entry.coverage.status = "skipped".into();
                report.entries.push(entry);
                continue;
            }
            match fs::read_dir(&data) {
                Ok(entries) => {
                    for (index, entry) in entries.enumerate() {
                        if index >= 16 {
                            report
                                .notes
                                .push("Homebrew服务数据最多列出16项，未列出不代表不存在".into());
                            break;
                        }
                        let entry = match entry {
                            Ok(e) => e,
                            Err(_) => {
                                report
                                    .entries
                                    .push(pending("Homebrew", "部分服务目录枚举失败"));
                                continue;
                            }
                        };
                        if !fs::symlink_metadata(entry.path())
                            .is_ok_and(|m| m.is_dir() || m.file_type().is_symlink())
                        {
                            continue;
                        }
                        let name = entry.file_name().to_string_lossy().into_owned();
                        let (kind, impact) = service_kind(&name);
                        report.entries.push(observe(
                            self,
                            started,
                            "Homebrew",
                            &name,
                            &entry.path(),
                            (kind, impact),
                            "前缀下var目录用途线索；未验证数据库是否废弃，不读取数据库内容",
                        ));
                    }
                }
                Err(_) => {
                    report
                        .entries
                        .push(pending("Homebrew", "服务目录未能枚举，数据库占用未知"));
                }
            }
        }
        report.measured_at = now();
        Ok(report)
    }
    pub fn preview_homebrew_cleanup(&self) -> Result<DeveloperPreview, String> {
        let _job = self.job()?;
        let executable = find_tool("brew", &self.home).ok_or("未发现Homebrew")?;
        let output = tool_command(
            &self.home,
            &executable,
            &["cleanup", "--dry-run"],
            Duration::from_secs(15),
        )?;
        let selected = output.lines().take(100).collect::<Vec<_>>().join("\n");
        let text: String = selected.chars().take(20_000).collect();
        let truncated = output.lines().count() > 100 || selected.chars().count() > 20_000;
        Ok(DeveloperPreview {
            measured_at: now(),
            executable: executable.to_string_lossy().into(),
            output: text,
            truncated,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tool_scope_rejects_unknown_duplicate_and_empty() {
        assert!(validate_tools(&[]).is_err());
        assert!(validate_tools(&["yarn".into(), "yarn".into()]).is_err());
        assert!(validate_tools(&["shell".into()]).is_err());
        assert!(validate_tools(&["rust".into(), "homebrew".into()]).is_ok());
    }

    #[test]
    fn native_path_must_be_unique_and_narrow() {
        assert!(path_output("warning\n/Users/test/Library/Caches/yarn\n").is_ok());
        for output in ["/", "/a\n/b", "/a/../b", "relative", ""] {
            assert!(path_output(output).is_err(), "{output}");
        }
        let home = Path::new("/Users/test");
        assert!(cache_scope(home, &home.join("Library/Caches/yarn"), None));
        assert!(!cache_scope(home, &home.join("Library/Caches"), None));
        assert!(!cache_scope(home, &home.join("Library/Caches-other"), None));
        assert!(!cache_scope(home, &home.join("Documents"), None));
    }

    #[test]
    fn service_data_always_remains_protected() {
        for name in [
            "postgresql@14",
            "postgresql@17",
            "mysql",
            "redis",
            "log",
            "unknown",
        ] {
            assert!(service_kind(name).0.contains("保护"));
        }
        assert!(service_kind("postgresql@14").0.contains("数据库"));
    }

    #[test]
    fn rust_ledger_uses_metadata_and_preserves_outputs() {
        let fixture = super::super::tests::Fixture::new();
        let project = fixture.0.join("project");
        fs::create_dir_all(project.join("target/debug/incremental")).unwrap();
        fs::write(project.join("Cargo.toml"), "无需解析的标记").unwrap();
        let artifact = project.join("target/debug/incremental/object");
        fs::write(&artifact, "构建产物").unwrap();
        let engine = Engine::new(fixture.0.clone());
        assert!(engine.developer_tools(vec!["rust".into()], None).is_err());
        let selected = engine.select_directory(project).unwrap();
        let report = engine
            .developer_tools(vec!["rust".into()], Some(selected.id))
            .unwrap();
        assert!(report
            .entries
            .iter()
            .any(|e| e.allocated_bytes.is_some_and(|n| n > 0)));
        assert!(report.entries.iter().any(|e| e.kind.contains("保护")));
        assert_eq!(fs::read_to_string(artifact).unwrap(), "构建产物");
    }
    #[test]
    fn absent_and_unvisited_are_distinct() {
        let fixture = super::super::tests::Fixture::new();
        let engine = Engine::new(fixture.0.clone());
        let path = fixture.0.join("absent-cache");
        let absent = observe(
            &engine,
            Instant::now(),
            "Rust",
            "test",
            &path,
            ("构建候选", "只读"),
            "测试范围",
        );
        assert_eq!(absent.coverage.status, "absent");
        assert_eq!(absent.allocated_bytes, Some(0));
        engine.cancel.store(true, Ordering::SeqCst);
        let unvisited = observe(
            &engine,
            Instant::now(),
            "Rust",
            "test",
            &path,
            ("构建候选", "只读"),
            "测试范围",
        );
        assert_eq!(unvisited.coverage.status, "pending");
        assert_eq!(unvisited.allocated_bytes, None);
    }

    #[test]
    #[ignore = "显式执行真实工具只读位置查询和Homebrew dry-run"]
    fn real_developer_readonly_probe() {
        let engine = Engine::new(PathBuf::from(std::env::var("HOME").unwrap()));
        let report = engine
            .developer_tools(
                ["yarn", "pnpm", "poetry", "homebrew"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect(),
                None,
            )
            .unwrap();
        assert!(!report.entries.is_empty());
        for entry in report.entries {
            println!(
                "{} | {} | {} | {:?}",
                entry.tool, entry.name, entry.coverage.status, entry.allocated_bytes
            );
        }
        let preview = engine.preview_homebrew_cleanup().unwrap();
        assert!(preview.output.chars().count() <= 20_000);
        println!(
            "Homebrew预览成功；字符数={}；截断={}",
            preview.output.chars().count(),
            preview.truncated
        );
    }
}
