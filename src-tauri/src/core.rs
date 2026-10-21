#[path = "model_storage.rs"]
mod model_storage;
use serde::{Deserialize, Serialize};
#[path = "projects.rs"]
mod projects;
pub use projects::ProjectReport;
use std::{
    collections::{HashMap, HashSet},
    fs,
    hash::{Hash, Hasher},
    io::{Read, Write},
    os::unix::{fs::MetadataExt, process::CommandExt},
    path::{Component, Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    pub total: u64,
    pub available: u64,
    pub used: u64,
    pub shared: u64,
}
#[derive(Clone, Serialize, Deserialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub status: String,
    pub permission_denied: u64,
    pub excluded: u64,
    pub limited: bool,
    pub cancelled: bool,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct RuleEvidence {
    pub rule_id: String,
    pub version: u32,
    pub source: String,
    pub scope: String,
    pub recovery: String,
    pub protected: bool,
}
#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    pub name: String,
    pub category: String,
    pub path: String,
    pub bytes: u64,
    pub files: u64,
    pub issues: u64,
    pub complete: bool,
    pub impact: String,
    pub command: Option<String>,
    pub blocked: Option<String>,
    pub details: Vec<String>,
    #[serde(default)]
    pub coverage: Option<Coverage>,
    #[serde(default)]
    pub evidence: Option<RuleEvidence>,
    // 元数据摘要只供当前进程复核，历史／前端不能提供可信摘要。
    #[serde(skip)]
    snapshot: Option<u64>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scan {
    pub extended: bool,
    pub id: u64,
    pub disk: Disk,
    pub items: Vec<Item>,
    pub roots: Vec<Item>,
    pub duration_ms: u64,
    pub cancelled: bool,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Progress {
    pub name: String,
    pub done: usize,
    pub total: usize,
    pub files: u64,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Listing {
    pub items: Vec<Item>,
    pub next_offset: Option<usize>,
    pub total: usize,
    pub measured_at: u64,
    pub complete: bool,
    pub issues: u64,
}
#[derive(Clone)]
struct Directory {
    items: Vec<Item>,
    measured_at: u64,
    stats: Stats,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub token: u64,
    pub created_at: u64,
    pub items: Vec<Item>,
    pub estimated: u64,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Outcome {
    pub name: String,
    pub success: bool,
    pub message: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub before_bytes: Option<u64>,
    #[serde(default)]
    pub after_bytes: Option<u64>,
    #[serde(default)]
    pub verification: Option<String>,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Record {
    pub at: u64,
    pub estimated: u64,
    pub released: u64,
    pub before_available: u64,
    pub after_available: u64,
    pub outcomes: Vec<Outcome>,
    pub warning: Option<String>,
    #[serde(default)]
    pub disk_verified: Option<bool>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
enum Action {
    Uv,
    Npm,
    Pip,
}
struct Rule {
    id: &'static str,
    name: &'static str,
    relative: &'static str,
    category: &'static str,
    impact: &'static str,
    action: Option<Action>,
}
fn rules() -> Vec<Rule> {
    vec![
        Rule {
            id: "uv",
            name: "uv 缓存",
            relative: ".cache/uv",
            category: "开发缓存",
            impact: "重新安装依赖时需下载或构建；从缓存运行的工具必须先退出。",
            action: Some(Action::Uv),
        },
        Rule {
            id: "npm",
            name: "npm 下载缓存",
            relative: ".npm/_cacache",
            category: "开发缓存",
            impact: "下次安装依赖需重新下载；不包含 npx 工具环境。",
            action: Some(Action::Npm),
        },
        Rule {
            id: "pip",
            name: "pip 缓存",
            relative: "Library/Caches/pip",
            category: "开发缓存",
            impact: "下次安装 Python 依赖需重新下载或构建。",
            action: Some(Action::Pip),
        },
        Rule {
            id: "npx",
            name: "npx 工具环境",
            relative: ".npm/_npx",
            category: "开发缓存",
            impact: "可能包含正在运行的工具，仅分析。",
            action: None,
        },
        Rule {
            id: "yarn",
            name: "Yarn 缓存",
            relative: "Library/Caches/Yarn",
            category: "开发缓存",
            impact: "暂不自动清理，避免不同 Yarn 版本的缓存行为差异。",
            action: None,
        },
        Rule {
            id: "gradle",
            name: "Gradle 缓存",
            relative: ".gradle/caches",
            category: "开发缓存",
            impact: "清理会影响构建和离线使用；首版仅分析。",
            action: None,
        },
        Rule {
            id: "poetry",
            name: "Poetry 缓存",
            relative: "Library/Caches/pypoetry",
            category: "开发缓存",
            impact: "包含依赖与构建缓存；首版仅分析。",
            action: None,
        },
        Rule {
            id: "pnpm",
            name: "pnpm 存储",
            relative: "Library/pnpm/store",
            category: "开发缓存",
            impact: "可能与项目依赖共享文件；首版仅分析。",
            action: None,
        },
        Rule {
            id: "jetbrains",
            name: "JetBrains 缓存",
            relative: "Library/Caches/JetBrains",
            category: "应用缓存",
            impact: "可能包含索引与本地历史，应通过对应 IDE 管理。",
            action: None,
        },
        Rule {
            id: "vscode",
            name: "VS Code 更新缓存",
            relative: "Library/Caches/com.microsoft.VSCode.ShipIt",
            category: "应用缓存",
            impact: "退出应用后可评估清理；首版仅分析。",
            action: None,
        },
        Rule {
            id: "playwright",
            name: "Playwright 浏览器",
            relative: "Library/Caches/ms-playwright",
            category: "开发缓存",
            impact: "运行中的自动化工具可能依赖这些浏览器。",
            action: None,
        },
        Rule {
            id: "downloads",
            name: "下载文件",
            relative: "Downloads",
            category: "个人文件",
            impact: "需要逐项判断保留或迁移；不自动删除。",
            action: None,
        },
        Rule {
            id: "ollama",
            name: "Ollama 本地模型",
            relative: ".ollama/models",
            category: "模型与数据",
            impact: "删除后相关项目需要重新下载模型；首版只读列出型号。",
            action: None,
        },
        Rule {
            id: "docker",
            name: "Docker 应用数据",
            relative: "Library/Containers/com.docker.docker",
            category: "模型与数据",
            impact: "包含镜像、容器或数据卷；应通过 Docker 管理。",
            action: None,
        },
        Rule {
            id: "wework",
            name: "企业微信数据",
            relative: "Library/Containers/com.tencent.WeWorkMac",
            category: "模型与数据",
            impact: "可能包含聊天记录和附件；通过应用管理。",
            action: None,
        },
    ]
}
fn rule(id: &str) -> Result<Rule, String> {
    rules()
        .into_iter()
        .find(|r| r.id == id)
        .ok_or_else(|| "未知分析项目".into())
}

pub struct Engine {
    home: PathBuf,
    history_path: PathBuf,
    scan: Mutex<Option<Scan>>,
    plan: Mutex<Option<Plan>>,
    pub cancel: AtomicBool,
    busy: AtomicBool,
    cleaning: AtomicBool,
    directories: Mutex<HashMap<PathBuf, Directory>>,
}
struct Job<'a>(&'a AtomicBool);
impl Drop for Job<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}
impl Engine {
    pub fn new(home: PathBuf) -> Self {
        Self {
            history_path: home
                .join("Library/Application Support/local.diskcare.desktop/history.json"),
            home,
            scan: Mutex::new(None),
            plan: Mutex::new(None),
            cancel: AtomicBool::new(false),
            busy: AtomicBool::new(false),
            cleaning: AtomicBool::new(false),
            directories: Mutex::new(HashMap::new()),
        }
    }
    fn job(&self) -> Result<Job<'_>, String> {
        self.busy
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "已有任务正在执行".to_string())?;
        Ok(Job(&self.busy))
    }
    pub fn is_cleaning(&self) -> bool {
        self.cleaning.load(Ordering::SeqCst)
    }
    pub fn disk(&self) -> Result<Disk, String> {
        disk(&self.home)
    }
    pub fn projects(
        &self,
        root: String,
        progress: impl Fn(Progress),
    ) -> Result<ProjectReport, String> {
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        projects::scan(&self.home, &root, &self.cancel, progress)
    }
    pub fn scan(&self, extended: bool, progress: impl Fn(Progress)) -> Result<Scan, String> {
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        let targets = self.discover_targets(extended);
        let roots = if extended {
            analysis_roots(&self.home)
        } else {
            vec![]
        };
        self.scan_targets(targets, roots, progress)
    }
    fn scan_targets(
        &self,
        targets: Vec<Item>,
        mut roots: Vec<Item>,
        progress: impl Fn(Progress),
    ) -> Result<Scan, String> {
        *self.plan.lock().map_err(|_| "计划状态不可用")? = None;
        self.directories
            .lock()
            .map_err(|_| "目录缓存不可用")?
            .clear();
        let start = Instant::now();
        let extended = !roots.is_empty();
        let total = targets.len() + roots.len();
        let mut items = Vec::new();
        for (done, mut item) in targets.into_iter().enumerate() {
            if self.cancel.load(Ordering::SeqCst) {
                mark_pending(&mut item);
            } else {
                self.measure_item(&mut item, done, total, 45, &progress)?;
            }
            items.push(item);
        }
        let mut measured_roots = Vec::new();
        for mut root in roots.drain(..) {
            if self.cancel.load(Ordering::SeqCst) {
                mark_pending(&mut root);
            } else {
                self.measure_item(
                    &mut root,
                    items.len() + measured_roots.len(),
                    total,
                    300,
                    &progress,
                )?;
            }
            measured_roots.push(root);
        }
        let scan = Scan {
            extended,
            id: now(),
            disk: self.disk()?,
            items,
            roots: measured_roots,
            duration_ms: start.elapsed().as_millis() as u64,
            cancelled: self.cancel.load(Ordering::SeqCst),
        };
        *self.scan.lock().map_err(|_| "扫描状态不可用")? = Some(scan.clone());
        Ok(scan)
    }
    fn measure_item(
        &self,
        item: &mut Item,
        done: usize,
        total: usize,
        seconds: u64,
        progress: &impl Fn(Progress),
    ) -> Result<(), String> {
        progress(Progress {
            name: item.name.clone(),
            done,
            total,
            files: 0,
        });
        let path = PathBuf::from(&item.path);
        if let Err(reason) = checked_read_path(&path) {
            item.complete = false;
            item.issues = u64::from(!excluded_app_data(&path));
            let denied = !excluded_app_data(&path)
                && fs::symlink_metadata(&path)
                    .is_err_and(|e| e.kind() == std::io::ErrorKind::PermissionDenied);
            item.coverage = Some(Coverage {
                permission_denied: u64::from(denied),
                status: if denied {
                    "denied"
                } else if excluded_app_data(&path) {
                    "skipped"
                } else {
                    "failed"
                }
                .into(),
                excluded: u64::from(excluded_app_data(&path)),
                ..Coverage::default()
            });
            item.blocked = Some(reason);
            return Ok(());
        }
        match fs::symlink_metadata(&path) {
            Ok(metadata) if item.id == "uv" && !metadata.is_dir() => {
                item.complete = false;
                item.issues = 1;
                item.snapshot = None;
                item.blocked = Some("uv 缓存路径不是目录，无法确认规则范围，已阻止清理".into());
                item.coverage = Some(Coverage {
                    status: "failed".into(),
                    ..Coverage::default()
                });
                return Ok(());
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                item.coverage = Some(Coverage {
                    status: "absent".into(),
                    ..Coverage::default()
                });
                item.details
                    .push("目录不存在，占用为 0；不代表已扫描其他位置。".into());
                return Ok(());
            }
            _ => {}
        }
        let directory =
            measure_directory(&path, &self.cancel, Duration::from_secs(seconds), |files| {
                progress(Progress {
                    name: item.name.clone(),
                    done,
                    total,
                    files,
                })
            });
        item.coverage = Some(directory.stats.coverage());
        if item.id == "uv" && directory.stats.complete && directory.stats.issues == 0 {
            item.snapshot = Some(directory.stats.fingerprint);
        }
        item.bytes = directory.stats.bytes;
        item.files = directory.stats.files;
        item.issues = directory.stats.issues;
        item.complete = directory.stats.complete && directory.stats.issues == 0;
        if directory.stats.excluded > 0 {
            item.details.push(format!(
                "主动跳过 {} 个其他应用私有数据边界；统计仅覆盖其余可读范围。",
                directory.stats.excluded
            ));
        }
        if directory.stats.excluded > 0 && item.issues == 0 {
            item.blocked =
                Some("统计不完整：已主动跳过其他应用私有数据；未读取部分不代表占用为零。".into());
        } else if !item.complete || item.issues > 0 {
            item.blocked = Some("统计不完整：存在权限限制、扫描上限或任务已取消".into());
        }
        if item.id == "ollama" {
            item.details.extend(models(&path));
        }
        self.directories
            .lock()
            .map_err(|_| "目录缓存不可用")?
            .insert(path, directory);
        Ok(())
    }
    fn discover_targets(&self, extended: bool) -> Vec<Item> {
        let ps = processes();
        let mut items = Vec::new();
        for r in rules()
            .into_iter()
            .filter(|r| extended || r.action.is_some())
        {
            let default = self.home.join(r.relative);
            let mut item = self.inspect(&r, &ps);
            if !extended || self.cancel.load(Ordering::SeqCst) {
                item.details
                    .push("仅统计默认缓存位置；清理预览时重新核对实际配置。".into());
                items.push(item);
                continue;
            }
            if let Some(action) = r.action {
                match discover_cache(action, &self.home) {
                    Ok(actual) => {
                        if actual != default {
                            item.path = actual.to_string_lossy().into();
                            if let Some(evidence) = &mut item.evidence {
                                evidence.source = "工具缓存配置查询；自定义路径仅供分析".into();
                                evidence.scope = "工具配置返回的缓存目录仅供只读分析；目录保护按钮仅影响默认 .cache/uv".into();
                            }
                            item.command = None;
                            item.blocked = Some(
                                "实际缓存位于自定义路径，本版仅分析；不会自动删除自定义目录。"
                                    .into(),
                            );
                            item.details.push("路径来自工具的缓存配置查询。".into());
                            if default.exists() {
                                let mut legacy = self.inspect(&r, &ps);
                                legacy.id = format!("{}-default", r.id);
                                legacy.name = format!("{}（旧默认位置）", r.name);
                                legacy.command = None;
                                legacy.blocked = Some("旧默认位置，仅分析".into());
                                items.push(legacy);
                            }
                        } else {
                            if let Some(evidence) = &mut item.evidence {
                                evidence.source = "已查询工具，确认当前默认缓存位置".into();
                            }
                            item.details
                                .push("已查询工具，确认当前默认缓存位置。".into());
                        }
                    }
                    Err(reason) => {
                        item.blocked = Some("无法确认工具实际缓存配置，已阻止清理".into());
                        item.details.push(format!("默认位置供参考；{reason}"));
                    }
                }
            }
            items.push(item);
        }
        items
    }
    #[cfg(test)]
    fn scan_fixture(&self, progress: impl Fn(Progress)) -> Result<Scan, String> {
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        let ps = processes();
        self.scan_targets(
            rules().iter().map(|r| self.inspect(r, &ps)).collect(),
            vec![],
            progress,
        )
    }
    fn inspect(&self, r: &Rule, processes: &Result<Vec<Process>, String>) -> Item {
        let path = self.home.join(r.relative);
        let mut blocked = if r.action.is_none() {
            Some("此项仅分析".into())
        } else {
            None
        };
        if !excluded_app_data(&path) && checked_path(&self.home, &path).is_err() {
            blocked = Some("路径含符号链接或超出允许范围".into());
        }
        let command = r.action.map(|a| display_command(a, &path, &self.home));
        if let Some(action) = r.action {
            if tool(action, &self.home).is_none() {
                blocked = Some("未找到对应工具，无法使用官方清理命令".into());
            }
            match processes {
                Ok(ps) => {
                    if let Some(reason) = running(action, &path, ps) {
                        blocked = Some(reason);
                    }
                }
                Err(_) => blocked = Some("无法检查运行进程，已阻止清理".into()),
            }
        }
        let mut evidence = None;
        if r.id == "uv" {
            let protected = match self.uv_protected() {
                Ok(value) => value,
                Err(reason) => {
                    blocked = Some(reason);
                    true
                }
            };
            if protected && blocked.is_none() {
                blocked = Some("用户已保护此缓存目录；仅供分析".into());
            }
            evidence = Some(RuleEvidence {
                rule_id: "dev.uv-cache".into(), version: 1,
                source: "固定默认路径；预览时重新查询工具配置，不代表已确认当前配置".into(),
                scope: "当前主目录的 .cache/uv 整个缓存根目录；不含项目 .venv 和独立工具安装目录".into(),
                recovery: "重新安装依赖可能需要网络、私有源凭据和本地构建；缓存中的临时运行环境需重建。请先保存工作并退出关联程序。".into(),
                protected,
            });
        }
        Item {
            id: r.id.into(),
            name: r.name.into(),
            category: r.category.into(),
            path: path.to_string_lossy().into(),
            bytes: 0,
            files: 0,
            issues: 0,
            complete: true,
            impact: r.impact.into(),
            command,
            blocked,
            details: vec![],
            coverage: None,
            evidence,
            snapshot: None,
        }
    }
    pub fn children(
        &self,
        id: &str,
        relative: &str,
        offset: usize,
        progress: impl Fn(Progress),
    ) -> Result<Listing, String> {
        let _job = self.job()?;
        self.cancel.store(false, Ordering::SeqCst);
        let relative = Path::new(relative);
        if relative.is_absolute()
            || relative
                .components()
                .any(|c| !matches!(c, Component::Normal(_)))
        {
            return Err("子目录路径无效".into());
        }
        let snapshot = self
            .scan
            .lock()
            .map_err(|_| "扫描状态不可用")?
            .clone()
            .ok_or("请先扫描，再浏览目录")?;
        let item = snapshot
            .items
            .iter()
            .chain(&snapshot.roots)
            .find(|i| i.id == id)
            .ok_or("该目录不在当前扫描结果中")?;
        let root = PathBuf::from(&item.path);
        let path = root.join(relative);
        if !path.starts_with(&root) {
            return Err("目录越界".into());
        }
        checked_read_path(&path)?;
        if !path.is_dir() {
            return Err("目录不存在或不可访问".into());
        }
        let cached = self
            .directories
            .lock()
            .map_err(|_| "目录缓存不可用")?
            .get(&path)
            .filter(|c| c.stats.complete && now().saturating_sub(c.measured_at) < 5 * 60 * 1000)
            .cloned();
        if offset > 0 && cached.is_none() {
            return Err("目录缓存已过期，请重新打开目录".into());
        }
        let directory = match cached {
            Some(c) => c,
            None => {
                let c = measure_directory(&path, &self.cancel, Duration::from_secs(300), |files| {
                    progress(Progress {
                        name: item.name.clone(),
                        done: 0,
                        total: 1,
                        files,
                    })
                });
                self.directories
                    .lock()
                    .map_err(|_| "目录缓存不可用")?
                    .insert(path.clone(), c.clone());
                c
            }
        };
        let total = directory.items.len();
        if offset > total {
            return Err("分页位置无效，请重新打开目录".into());
        }
        let mut items: Vec<Item> = directory.items.into_iter().skip(offset).take(200).collect();
        for child in &mut items {
            child.id = Path::new(&child.path)
                .strip_prefix(&root)
                .map_err(|e| e.to_string())?
                .to_string_lossy()
                .into();
        }
        Ok(Listing {
            next_offset: if directory.stats.complete && offset + items.len() < total {
                Some(offset + items.len())
            } else {
                None
            },
            items,
            total,
            measured_at: directory.measured_at,
            complete: directory.stats.complete && directory.stats.issues == 0,
            issues: directory.stats.issues,
        })
    }
    pub fn prepare(&self, scan_id: u64, ids: Vec<String>) -> Result<Plan, String> {
        let _job = self.job()?;
        let scan = self
            .scan
            .lock()
            .map_err(|_| "扫描状态不可用")?
            .clone()
            .ok_or("请先扫描")?;
        if scan.id != scan_id || now().saturating_sub(scan.id) > 30 * 60 * 1000 {
            return Err("扫描结果已过期，请重新扫描".into());
        }
        if ids.is_empty() || ids.len() > 3 {
            return Err("请选择 1 至 3 个可清理项目".into());
        }
        let mut seen = HashSet::new();
        let mut items = Vec::new();
        let ps = processes();
        for id in ids {
            if !seen.insert(id.clone()) {
                return Err("清理项目重复".into());
            }
            let r = rule(&id)?;
            let old = scan
                .items
                .iter()
                .find(|i| i.id == id)
                .ok_or("此项目不在扫描结果中")?;
            if old.blocked.is_some() || old.bytes == 0 || !old.complete || old.issues != 0 {
                return Err(format!("{} 不可清理，请重新扫描检查状态", r.name));
            }
            if Path::new(&old.path) != self.home.join(r.relative) {
                return Err("自定义缓存目录仅分析".into());
            }
            self.check_cache(&r)?;
            let current = self.inspect(&r, &ps);
            if let Some(reason) = current.blocked {
                return Err(format!("{}：{reason}", r.name));
            }
            self.verify_snapshot(&r, old)?;
            let mut preview = old.clone();
            if let Some(evidence) = &mut preview.evidence {
                evidence.source = "预览已重新查询 uv 配置并复核元数据；执行前还将复核".into();
            }
            items.push(preview);
        }
        let plan = Plan {
            token: now(),
            created_at: now(),
            estimated: items.iter().map(|i| i.bytes).sum(),
            items,
        };
        *self.plan.lock().map_err(|_| "计划状态不可用")? = Some(plan.clone());
        Ok(plan)
    }
    fn protection_path(&self) -> PathBuf {
        self.history_path.with_file_name("uv-protection.json")
    }
    fn uv_protected(&self) -> Result<bool, String> {
        let path = self.protection_path();
        checked_path(&self.home, &path)?;
        match fs::read(&path) {
            Ok(data) => serde_json::from_slice(&data)
                .map_err(|_| "目录保护设置无法读取，已阻止 uv 清理".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(format!("目录保护设置无法读取，已阻止 uv 清理：{e}")),
        }
    }
    pub fn protect_uv(&self, protected: bool) -> Result<(), String> {
        let _job = self.job()?;
        let path = self.protection_path();
        let parent = path.parent().ok_or("保护设置路径不可用")?;
        checked_path(&self.home, parent)?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        checked_path(&self.home, &path)?;
        let temporary = parent.join(format!("uv-protection-{}.pending", now()));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(if protected { b"true" } else { b"false" })
            .map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(temporary, path).map_err(|e| e.to_string())?;
        *self.plan.lock().map_err(|_| "计划状态不可用")? = None;
        *self.scan.lock().map_err(|_| "扫描状态不可用")? = None;
        Ok(())
    }
    // shortcut: 元数据摘要不锁定并发写入；需要事务级清理时应接入工具自身的锁定接口。
    fn verify_snapshot(&self, r: &Rule, item: &Item) -> Result<(), String> {
        if r.id != "uv" {
            return Ok(());
        }
        let path = self.home.join(r.relative);
        checked_path(&self.home, &path)?;
        let current = measure_directory(
            &path,
            &AtomicBool::new(false),
            Duration::from_secs(45),
            |_| {},
        )
        .stats;
        if !current.complete || current.issues != 0 || item.snapshot != Some(current.fingerprint) {
            return Err("uv 缓存内容或目录身份已变化，或复核不完整；请重新扫描并预览".into());
        }
        Ok(())
    }
    fn check_cache(&self, r: &Rule) -> Result<(), String> {
        let action = r.action.ok_or("该项只读")?;
        let actual = discover_cache(action, &self.home)?;
        if actual != self.home.join(r.relative) {
            return Err("缓存配置已变化，请重新扫描".into());
        }
        Ok(())
    }
    pub fn clean(&self, token: u64, progress: impl Fn(Progress)) -> Result<Record, String> {
        let _job = self.job()?;
        let plan = self
            .plan
            .lock()
            .map_err(|_| "计划状态不可用")?
            .take()
            .ok_or("请重新预览清理计划")?;
        validate_plan(&plan, token, now())?;
        self.cleaning.store(true, Ordering::SeqCst);
        let _cleaning = Job(&self.cleaning);
        let before = self.disk()?.available;
        // 在任何删除前统一复核，避免已知错误造成部分执行。
        let ps = processes();
        for i in &plan.items {
            let r = rule(&i.id)?;
            self.check_cache(&r)?;
            self.verify_snapshot(&r, i)?;
            let current = self.inspect(&r, &ps);
            if let Some(reason) = current.blocked {
                return Err(format!("{}：{reason}", i.name));
            }
        }
        let mut outcomes = Vec::new();
        for (done, i) in plan.items.iter().enumerate() {
            progress(Progress {
                name: i.name.clone(),
                done,
                total: plan.items.len(),
                files: 0,
            });
            let r = rule(&i.id)?;
            let action = r.action.ok_or("此项目不能自动清理")?;
            let mut attempted = false;
            let result = if let Err(reason) = self
                .check_cache(&r)
                .and_then(|_| self.verify_snapshot(&r, i))
            {
                Err(reason)
            } else {
                checked_path(&self.home, &self.home.join(r.relative)).and_then(|_| {
                    if let Some(reason) = self.inspect(&r, &processes()).blocked {
                        return Err(reason);
                    }
                    let executable = tool(action, &self.home).ok_or("清理工具不可用")?;
                    let mut command = Command::new(executable);
                    command.args(arguments(action, &self.home.join(r.relative), &self.home));
                    command_path(&mut command)?;
                    command.env_remove("UV_CACHE_DIR").env_remove("UV_NO_CACHE");
                    attempted = true;
                    run_command(command, Duration::from_secs(300))
                })
            };
            let failed = result.is_err();
            outcomes.push(cleanup_outcome(i, result, attempted));
            if failed {
                for skipped in plan.items.iter().skip(done + 1) {
                    outcomes.push(Outcome {
                        name: skipped.name.clone(),
                        success: false,
                        status: Some("skipped".into()),
                        message: "前一项目失败，本项未执行；请重新扫描后确认".into(),
                        before_bytes: None,
                        after_bytes: None,
                        verification: None,
                    });
                }
                break;
            }
        }
        let (after, mut warning) = match self.disk() {
            Ok(d) => (d.available, None),
            Err(e) => (before, Some(format!("操作结束，但无法复核磁盘：{e}"))),
        };
        let mut record = Record {
            at: now(),
            estimated: plan.estimated,
            released: after.saturating_sub(before),
            before_available: before,
            after_available: after,
            outcomes,
            disk_verified: Some(warning.is_none()),
            warning: warning.clone(),
        };
        *self.scan.lock().map_err(|_| "扫描状态不可用")? = None;
        self.directories
            .lock()
            .map_err(|_| "目录缓存不可用")?
            .clear();
        let saved = self.history().and_then(|mut history| {
            history.insert(0, record.clone());
            history.truncate(100);
            let parent = self.history_path.parent().ok_or("历史路径不可用")?;
            checked_path(&self.home, parent)?;
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            checked_path(&self.home, &self.history_path)?;
            let temporary = parent.join(format!("history-{}.pending", now()));
            let mut file = fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&temporary)
                .map_err(|e| e.to_string())?;
            file.write_all(&serde_json::to_vec_pretty(&history).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            file.sync_all().map_err(|e| e.to_string())?;
            fs::rename(&temporary, &self.history_path).map_err(|e| e.to_string())
        });
        if let Err(e) = saved {
            let message = format!("操作已结束，但历史记录保存失败：{e}");
            warning = Some(warning.map_or(message.clone(), |w| format!("{w}；{message}")));
        }
        record.warning = warning;
        Ok(record)
    }
    pub fn history(&self) -> Result<Vec<Record>, String> {
        checked_path(&self.home, &self.history_path)?;
        match fs::read(&self.history_path) {
            Ok(data) => serde_json::from_slice(&data).map_err(|e| format!("历史记录读取失败：{e}")),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(vec![]),
            Err(e) => Err(e.to_string()),
        }
    }
}

fn validate_plan(plan: &Plan, token: u64, time: u64) -> Result<(), String> {
    if plan.token != token || time.saturating_sub(plan.created_at) > 60_000 {
        return Err("清理预览已失效，请重新预览确认".into());
    }
    Ok(())
}

pub fn checked_path(home: &Path, path: &Path) -> Result<(), String> {
    if path == home || !path.starts_with(home) {
        return Err("路径超出允许范围".into());
    }
    let relative = path.strip_prefix(home).map_err(|e| e.to_string())?;
    if relative
        .components()
        .any(|c| !matches!(c, Component::Normal(_)))
    {
        return Err("路径含非法层级".into());
    }
    let mut current = home.to_path_buf();
    for component in relative.components() {
        current.push(component);
        match fs::symlink_metadata(&current) {
            Ok(m) if m.file_type().is_symlink() => return Err("路径含符号链接".into()),
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(format!("无法校验路径：{e}")),
        }
    }
    Ok(())
}

fn readonly_item(id: &str, name: &str, path: &Path) -> Item {
    Item {
        id: id.into(),
        name: name.into(),
        category: "主要目录".into(),
        path: path.to_string_lossy().into(),
        bytes: 0,
        files: 0,
        issues: 0,
        complete: true,
        impact: "只读分析。占用不等于可清理空间；展开查看子目录。".into(),
        command: None,
        blocked: Some("仅分析".into()),
        details: vec![],
        coverage: None,
        evidence: None,
        snapshot: None,
    }
}
fn analysis_roots(home: &Path) -> Vec<Item> {
    vec![
        ("root-home", "用户主目录", home.to_path_buf()),
        ("root-apps", "已安装应用", PathBuf::from("/Applications")),
        ("root-opt", "开发工具与数据库", PathBuf::from("/opt")),
        ("root-library", "系统应用支持", PathBuf::from("/Library")),
        ("root-var", "系统运行数据", PathBuf::from("/private/var")),
        (
            "root-data-system",
            "数据卷系统文件",
            PathBuf::from("/System/Volumes/Data/System"),
        ),
        (
            "root-shared",
            "共享用户文件",
            PathBuf::from("/Users/Shared"),
        ),
        ("root-local", "本地安装文件", PathBuf::from("/usr/local")),
    ]
    .into_iter()
    .map(|(id, name, path)| readonly_item(id, name, &path))
    .collect()
}
fn excluded_app_data(path: &Path) -> bool {
    let mut in_library = false;
    for part in path.components() {
        if in_library
            && matches!(
                part.as_os_str().to_str(),
                Some(
                    "Containers"
                        | "Group Containers"
                        | "Application Scripts"
                        | "Application Support"
                        | "Mail"
                        | "Messages"
                        | "Safari"
                        | "Calendars"
                        | "Accounts"
                        | "HomeKit"
                        | "Keychains"
                )
            )
        {
            return true;
        }
        in_library = part.as_os_str() == "Library";
    }
    false
}
fn checked_read_path(path: &Path) -> Result<(), String> {
    if excluded_app_data(path) {
        return Err("已主动跳过其他应用的私有数据目录；未读取，不代表占用为零。".into());
    }
    if !path.is_absolute()
        || path == Path::new("/")
        || path
            .components()
            .any(|c| matches!(c, Component::ParentDir | Component::CurDir))
    {
        return Err("分析路径无效".into());
    }
    let mut current = PathBuf::new();
    for part in path.components() {
        current.push(part);
        match fs::symlink_metadata(&current) {
            Ok(m) if m.file_type().is_symlink() => return Err("分析路径含符号链接，已跳过".into()),
            Ok(_) => (),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => (),
            Err(e) => return Err(format!("无法校验分析路径：{e}")),
        }
    }
    Ok(())
}
#[derive(Clone, Default, Debug)]
struct Stats {
    bytes: u64,
    files: u64,
    issues: u64,
    excluded: u64,
    complete: bool,
    permission_denied: u64,
    limited: bool,
    cancelled: bool,
    fingerprint: u64,
}
impl Stats {
    fn error(&mut self, error: &std::io::Error) {
        self.issues += 1;
        if error.kind() == std::io::ErrorKind::PermissionDenied {
            self.permission_denied += 1;
        }
    }
    fn coverage(&self) -> Coverage {
        Coverage {
            status: if self.cancelled {
                "cancelled"
            } else if self.limited {
                "limited"
            } else if self.permission_denied > 0 {
                "denied"
            } else if self.issues > 0 {
                "failed"
            } else if self.excluded > 0 {
                "skipped"
            } else {
                "complete"
            }
            .into(),
            permission_denied: self.permission_denied,
            excluded: self.excluded,
            limited: self.limited,
            cancelled: self.cancelled,
        }
    }
}
fn mark_pending(item: &mut Item) {
    item.complete = false;
    item.blocked = Some("扫描已停止，此位置未访问".into());
    item.coverage = Some(Coverage {
        status: "pending".into(),
        ..Coverage::default()
    });
}
fn cleanup_outcome(item: &Item, result: Result<String, String>, attempted: bool) -> Outcome {
    let success = result.is_ok();
    let message = match result {
        Ok(output) if output.trim().is_empty() => "官方命令执行成功".into(),
        Ok(output) => output,
        Err(error) => error,
    };
    let (after_bytes, verification) = if !attempted {
        (None, Some("执行前检查未通过，未调用清理命令".into()))
    } else if item.id == "uv" {
        let path = Path::new(&item.path);
        match checked_read_path(path).and_then(|_| match fs::symlink_metadata(path) {
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e.to_string()),
            Ok(_) => Ok(Some(
                measure_directory(
                    path,
                    &AtomicBool::new(false),
                    Duration::from_secs(45),
                    |_| {},
                )
                .stats,
            )),
        }) {
            Ok(None) => (
                Some(0),
                Some("复核时缓存目录不存在；不代表该命令独立释放了等量磁盘空间".into()),
            ),
            Ok(Some(stats)) if stats.complete && stats.issues == 0 => (
                Some(stats.bytes),
                Some("已重新测量目录分配块；剩余内容可能包括工具保留或并发新增的数据".into()),
            ),
            _ => (
                None,
                Some("执行后目录复核未完成；无法确认剩余占用，请重新扫描".into()),
            ),
        }
    } else {
        (
            None,
            Some("本类尚未逐目录复核；下方命令状态不代表全部内容已清空".into()),
        )
    };
    Outcome {
        name: item.name.clone(),
        success,
        message,
        status: Some(
            if !attempted {
                "skipped"
            } else if success {
                "success"
            } else {
                "failed"
            }
            .into(),
        ),
        before_bytes: Some(item.bytes),
        after_bytes,
        verification,
    }
}
#[cfg(test)]
fn measure(root: &Path, cancel: &AtomicBool, progress: impl Fn(u64)) -> Stats {
    measure_directory(root, cancel, Duration::from_secs(45), progress).stats
}
fn measure_directory(
    root: &Path,
    cancel: &AtomicBool,
    limit: Duration,
    progress: impl Fn(u64),
) -> Directory {
    let mut stats = Stats {
        complete: true,
        ..Stats::default()
    };
    let mut children: Vec<Item> = Vec::new();
    let mut stack = vec![(root.to_path_buf(), None::<usize>)];
    let mut seen = HashSet::new();
    let start = Instant::now();
    let mut queued = 0u64;
    let device = if excluded_app_data(root) {
        0
    } else {
        fs::symlink_metadata(root).map(|m| m.dev()).unwrap_or(0)
    };
    while let Some((path, branch)) = stack.pop() {
        if cancel.load(Ordering::SeqCst) || stats.files >= 5_000_000 || start.elapsed() > limit {
            stats.complete = false;
            stats.cancelled = cancel.load(Ordering::SeqCst);
            stats.limited = !stats.cancelled;
            break;
        }
        if excluded_app_data(&path) {
            stats.excluded += 1;
            stats.complete = false;
            if let Some(i) = branch {
                children[i].blocked = Some("已主动跳过其他应用私有数据，未读取。".into());
                children[i]
                    .details
                    .push("此处为已知应用数据边界；不是系统授权检测结果。".into());
            }
            continue;
        }
        let metadata = match fs::symlink_metadata(&path) {
            Ok(m) => m,
            Err(e) => {
                stats.error(&e);
                if let Some(i) = branch {
                    children[i].issues += 1;
                }
                continue;
            }
        };
        // 无序合并各条目元数据，目录遍历顺序变化不会使同一观测失效。
        let mut stamp = std::collections::hash_map::DefaultHasher::new();
        (
            &path,
            metadata.dev(),
            metadata.ino(),
            metadata.mode(),
            metadata.len(),
            metadata.blocks(),
            metadata.mtime(),
            metadata.mtime_nsec(),
            metadata.ctime(),
            metadata.ctime_nsec(),
            metadata.nlink(),
        )
            .hash(&mut stamp);
        stats.fingerprint ^= stamp.finish();
        if metadata.dev() != device || metadata.file_type().is_symlink() {
            continue;
        }
        if !seen.insert((metadata.dev(), metadata.ino())) {
            continue;
        }
        stats.files += 1;
        let bytes = metadata.blocks() * 512;
        stats.bytes = stats.bytes.saturating_add(bytes);
        if let Some(i) = branch {
            children[i].bytes = children[i].bytes.saturating_add(bytes);
            children[i].files += 1;
        }
        if stats.files.is_multiple_of(2048) {
            progress(stats.files);
        }
        if metadata.is_dir() {
            match fs::read_dir(&path) {
                Ok(entries) => {
                    for entry in entries {
                        if cancel.load(Ordering::SeqCst)
                            || queued >= 5_000_000
                            || start.elapsed() > limit
                        {
                            stats.complete = false;
                            stats.cancelled = cancel.load(Ordering::SeqCst);
                            stats.limited = !stats.cancelled;
                            break;
                        }
                        match entry {
                            Ok(entry) => {
                                let branch = if branch.is_none() {
                                    let mut item = readonly_item(
                                        "",
                                        &entry.file_name().to_string_lossy(),
                                        &entry.path(),
                                    );
                                    match if excluded_app_data(&entry.path()) {
                                        Ok(metadata.file_type())
                                    } else {
                                        entry.file_type()
                                    } {
                                        Ok(t) => {
                                            item.category = if t.is_symlink() {
                                                "符号链接"
                                            } else if t.is_dir() {
                                                "目录"
                                            } else {
                                                "文件"
                                            }
                                            .into()
                                        }
                                        Err(e) => {
                                            item.issues += 1;
                                            stats.error(&e);
                                        }
                                    }
                                    children.push(item);
                                    Some(children.len() - 1)
                                } else {
                                    branch
                                };
                                stack.push((entry.path(), branch));
                                queued += 1;
                            }
                            Err(e) => {
                                stats.error(&e);
                                if let Some(i) = branch {
                                    children[i].issues += 1;
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    stats.error(&e);
                    if let Some(i) = branch {
                        children[i].issues += 1;
                    }
                }
            }
        }
    }
    for child in &mut children {
        child.complete = stats.complete && child.issues == 0;
        if !child.complete && child.blocked.is_none() {
            child.blocked =
                Some("统计不完整，仅显示已读取部分；可能含主动跳过的私有数据目录".into());
        }
    }
    children.sort_by(|a, b| b.bytes.cmp(&a.bytes).then_with(|| a.name.cmp(&b.name)));
    Directory {
        items: children,
        stats,
        measured_at: now(),
    }
}
fn parse_disk(output: &str) -> Result<Disk, String> {
    let fields: Vec<_> = output
        .lines()
        .rfind(|l| !l.trim().is_empty())
        .ok_or("磁盘统计为空")?
        .split_whitespace()
        .collect();
    if fields.len() < 6 {
        return Err("无法解析磁盘统计".into());
    }
    let read = |index: usize| -> Result<u64, String> {
        let value = fields[index]
            .parse::<i128>()
            .map_err(|_| "磁盘数值格式无效".to_string())?;
        let value = if index == 3 { value.max(0) } else { value };
        u64::try_from(value)
            .map_err(|_| "磁盘数值无效".to_string())?
            .checked_mul(1024)
            .ok_or("磁盘数值过大".into())
    };
    let (total, used, available) = (read(1)?, read(2)?, read(3)?);
    Ok(Disk {
        total,
        used,
        available,
        shared: total.saturating_sub(used).saturating_sub(available),
    })
}
fn disk(home: &Path) -> Result<Disk, String> {
    let output = Command::new("/bin/df")
        .args(["-kP"])
        .arg(home)
        .env("LC_ALL", "C")
        .output()
        .map_err(|e| e.to_string())?;
    if !output.status.success() {
        return Err("无法读取数据卷容量".into());
    }
    parse_disk(&String::from_utf8_lossy(&output.stdout))
}
#[derive(Clone, Debug)]
struct Process {
    pid: u32,
    executable: String,
    args: String,
}
fn processes() -> Result<Vec<Process>, String> {
    let read = |field: &str| -> Result<HashMap<u32, String>, String> {
        let output = Command::new("/bin/ps")
            .args(["-axo", field])
            .output()
            .map_err(|e| e.to_string())?;
        if !output.status.success() {
            return Err("无法读取运行进程".into());
        }
        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .filter_map(|line| {
                let line = line.trim();
                let split = line.find(char::is_whitespace)?;
                Some((
                    line[..split].parse().ok()?,
                    line[split..].trim().to_string(),
                ))
            })
            .collect())
    };
    let names = read("pid=,comm=")?;
    let args = read("pid=,args=")?;
    Ok(args
        .into_iter()
        .map(|(pid, args)| Process {
            pid,
            executable: names.get(&pid).cloned().unwrap_or_default(),
            args,
        })
        .collect())
}
fn argv(text: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut word = String::new();
    let mut quote = None;
    let mut escaped = false;
    for c in text.chars() {
        if escaped {
            word.push(c);
            escaped = false;
            continue;
        }
        if c == '\\' && quote != Some('\'') {
            escaped = true;
            continue;
        }
        if Some(c) == quote {
            quote = None;
            continue;
        }
        if (c == '\'' || c == '"') && quote.is_none() {
            quote = Some(c);
            continue;
        }
        if c.is_whitespace() && quote.is_none() {
            if !word.is_empty() {
                result.push(std::mem::take(&mut word));
            }
        } else {
            word.push(c);
        }
    }
    if escaped {
        word.push('\\');
    }
    if !word.is_empty() {
        result.push(word);
    }
    result
}
fn basename(path: &str) -> String {
    Path::new(path)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_lowercase()
}
fn pip_name(name: &str) -> bool {
    name == "pip"
        || name
            .strip_prefix("pip")
            .is_some_and(|v| !v.is_empty() && v.chars().all(|c| c.is_ascii_digit() || c == '.'))
}
fn npm_operation(args: &[String]) -> Option<&str> {
    let mut i = 0;
    while i < args.len() {
        let a = args[i].as_str();
        if [
            "--prefix",
            "--cache",
            "--registry",
            "--userconfig",
            "--workspace",
            "-w",
            "--location",
            "--loglevel",
        ]
        .contains(&a)
        {
            i += 2;
            continue;
        }
        if a.starts_with('-') {
            i += 1;
            continue;
        }
        return Some(a);
    }
    None
}
fn running(action: Action, path: &Path, processes: &[Process]) -> Option<String> {
    for process in processes {
        let words = argv(&process.args);
        let executable = basename(&process.executable);
        let first = words.first().map(|s| basename(s)).unwrap_or_default();
        let interpreter = executable.starts_with("python")
            || matches!(
                executable.as_str(),
                "node" | "nodejs" | "bash" | "sh" | "zsh"
            );
        let mut program = executable.as_str();
        let mut arguments = words.get(1..).unwrap_or_default();
        if interpreter {
            if matches!(first.as_str(), "npm" | "uv" | "uvx") || pip_name(&first) {
                program = &first;
            } else {
                let mut index = 1;
                while index < words.len() {
                    if words[index] == "-m" {
                        program = words.get(index + 1).map(String::as_str).unwrap_or("");
                        arguments = words.get(index + 2..).unwrap_or_default();
                        break;
                    }
                    if ["-r", "--require", "--loader", "--import", "-W", "-X"]
                        .contains(&words[index].as_str())
                    {
                        index += 2;
                        continue;
                    }
                    if ["-c", "-e", "--eval", "-p", "--print"].contains(&words[index].as_str()) {
                        break;
                    }
                    if words[index].starts_with('-') {
                        index += 1;
                        continue;
                    }
                    program = &words[index];
                    arguments = words.get(index + 1..).unwrap_or_default();
                    break;
                }
            }
        }
        let program = basename(program);
        let active = match action {
            Action::Uv => matches!(program.as_str(), "uv" | "uvx"),
            Action::Npm => {
                matches!(program.as_str(), "npm" | "npm-cli.js")
                    && npm_operation(arguments).is_some_and(|a| {
                        [
                            "install",
                            "i",
                            "ci",
                            "update",
                            "rebuild",
                            "cache",
                            "exec",
                            "add",
                            "uninstall",
                            "remove",
                            "rm",
                            "prune",
                            "dedupe",
                        ]
                        .contains(&a)
                    })
            }
            Action::Pip => pip_name(&program),
        };
        let references = std::iter::once(&process.executable)
            .chain(words.iter())
            .any(|arg| Path::new(arg).is_absolute() && Path::new(arg).starts_with(path));
        if active || references {
            return Some(format!(
                "关联进程 PID {} · {}，请退出后重新扫描",
                process.pid,
                if executable.is_empty() {
                    &program
                } else {
                    &executable
                }
            ));
        }
    }
    None
}
fn discover_cache(action: Action, home: &Path) -> Result<PathBuf, String> {
    let executable = tool(action, home).ok_or("未找到对应工具")?;
    let mut command = Command::new(&executable);
    let args: &[&str] = match action {
        Action::Uv => &["cache", "dir"],
        Action::Npm => &["config", "get", "cache"],
        Action::Pip => &["-m", "pip", "cache", "dir"],
    };
    command
        .args(args)
        .current_dir(home)
        .env("HOME", home)
        .env("NO_UPDATE_NOTIFIER", "1")
        .env("NPM_CONFIG_UPDATE_NOTIFIER", "false");
    command_path(&mut command)?;
    let output = run_command(command, Duration::from_secs(5))?;
    cache_path(
        action,
        output
            .lines()
            .find(|line| line.starts_with('/'))
            .ok_or("工具未返回绝对缓存路径")?,
    )
}
fn cache_path(action: Action, value: &str) -> Result<PathBuf, String> {
    let mut path = PathBuf::from(value.trim());
    if !path.is_absolute()
        || path == Path::new("/")
        || path.components().any(|c| matches!(c, Component::ParentDir))
    {
        return Err("工具返回的缓存路径无效".into());
    }
    if action == Action::Npm {
        path.push("_cacache");
    }
    if excluded_app_data(&path) {
        return Err("缓存位于其他应用私有数据边界内，已跳过。".into());
    }
    if path.exists() {
        path = fs::canonicalize(&path).map_err(|e| format!("无法解析缓存位置：{e}"))?;
    }
    checked_read_path(&path)?;
    Ok(path)
}
fn command_path(command: &mut Command) -> Result<(), String> {
    let mut search = vec![
        executable_dir(command),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/usr/bin"),
        PathBuf::from("/bin"),
    ];
    if let Some(value) = std::env::var_os("PATH") {
        search.extend(std::env::split_paths(&value));
    }
    command.env(
        "PATH",
        std::env::join_paths(search).map_err(|e| e.to_string())?,
    );
    Ok(())
}
fn tool(action: Action, home: &Path) -> Option<PathBuf> {
    let name = match action {
        Action::Uv => "uv",
        Action::Npm => "npm",
        Action::Pip => "python3",
    };
    let mut paths = vec![
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/usr/local/bin"),
        home.join(".local/bin"),
        PathBuf::from("/opt/anaconda3/bin"),
    ];
    if let Ok(entries) = fs::read_dir(home.join(".nvm/versions/node")) {
        let mut dirs: Vec<_> = entries.flatten().map(|e| e.path().join("bin")).collect();
        dirs.sort();
        dirs.reverse();
        paths.extend(dirs);
    }
    if let Some(path) = std::env::var_os("PATH") {
        paths.extend(std::env::split_paths(&path));
    }
    paths.push(PathBuf::from("/usr/bin"));
    paths
        .into_iter()
        .map(|p| p.join(name))
        .find(|p| fs::metadata(p).is_ok_and(|m| m.is_file() && m.mode() & 0o111 != 0))
}
fn arguments(action: Action, path: &Path, home: &Path) -> Vec<String> {
    let cache = path.to_string_lossy().into_owned();
    match action {
        Action::Uv => vec!["cache".into(), "clean".into(), "--cache-dir".into(), cache],
        Action::Npm => vec![
            "cache".into(),
            "clean".into(),
            "--force".into(),
            "--cache".into(),
            home.join(".npm").to_string_lossy().into(),
        ],
        Action::Pip => vec![
            "-m".into(),
            "pip".into(),
            "cache".into(),
            "purge".into(),
            "--cache-dir".into(),
            cache,
        ],
    }
}
fn executable_dir(command: &Command) -> PathBuf {
    Path::new(command.get_program())
        .parent()
        .unwrap_or(Path::new("/usr/bin"))
        .to_path_buf()
}
fn display_command(action: Action, path: &Path, home: &Path) -> String {
    let name = match action {
        Action::Uv => "uv",
        Action::Npm => "npm",
        Action::Pip => "python3",
    };
    format!(
        "{} {}",
        name,
        arguments(action, path, home)
            .iter()
            .map(|a| format!("{:?}", a))
            .collect::<Vec<_>>()
            .join(" ")
    )
}
fn read_output(mut pipe: impl Read) -> String {
    let mut result = Vec::new();
    let mut buf = [0u8; 4096];
    while let Ok(n) = pipe.read(&mut buf) {
        if n == 0 {
            break;
        }
        let keep = n.min(16_384usize.saturating_sub(result.len()));
        result.extend_from_slice(&buf[..keep]);
    }
    String::from_utf8_lossy(&result).into_owned()
}
fn run_command(mut command: Command, timeout: Duration) -> Result<String, String> {
    command
        .process_group(0)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    let mut child = command
        .spawn()
        .map_err(|e| format!("无法启动清理命令：{e}"))?;
    let stdout = child.stdout.take().ok_or("无法读取命令输出")?;
    let stderr = child.stderr.take().ok_or("无法读取命令错误")?;
    let out = thread::spawn(move || read_output(stdout));
    let err = thread::spawn(move || read_output(stderr));
    let start = Instant::now();
    let mut timed_out = false;
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
            break status;
        }
        if start.elapsed() > timeout {
            unsafe {
                libc::killpg(child.id() as i32, libc::SIGKILL);
            }
            let _ = child.kill();
            timed_out = true;
            break child.wait().map_err(|e| e.to_string())?;
        }
        thread::sleep(Duration::from_millis(100));
    };
    let output = format!(
        "{}{}",
        out.join().unwrap_or_default(),
        err.join().unwrap_or_default()
    );
    if timed_out {
        return Err(format!(
            "命令超过 {} 秒，已终止；清理命令可能已处理部分内容，请重新扫描",
            timeout.as_secs()
        ));
    }
    if !status.success() {
        return Err(format!("清理命令失败（{}）：{}", status, output));
    }
    Ok(output)
}
fn models(root: &Path) -> Vec<String> {
    let manifests = root.join("manifests");
    let mut stack = vec![manifests.clone()];
    let mut models = Vec::new();
    while let Some(path) = stack.pop() {
        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            if let Ok(entries) = fs::read_dir(&path) {
                stack.extend(entries.flatten().map(|e| e.path()));
            }
        } else if let Ok(relative) = path.strip_prefix(&manifests) {
            let parts: Vec<_> = relative.iter().map(|p| p.to_string_lossy()).collect();
            if parts.len() >= 4 {
                models.push(format!(
                    "{}:{}",
                    parts[parts.len() - 2],
                    parts[parts.len() - 1]
                ));
            }
        }
        if models.len() >= 100 {
            break;
        }
    }
    models.sort();
    models
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    fn process(args: &str) -> Process {
        Process {
            pid: 123,
            executable: args.split_whitespace().next().unwrap().into(),
            args: args.into(),
        }
    }
    static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            let p = std::env::temp_dir().join(format!(
                "disk-care-test-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::SeqCst)
            ));
            fs::create_dir_all(&p).unwrap();
            Self(fs::canonicalize(p).unwrap())
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn app_data_is_excluded_before_reading_and_cannot_be_browsed() {
        let f = Fixture::new();
        let library = f.0.join("Library");
        for dir in ["Containers/test", "Application Support/test", "Caches/pip"] {
            fs::create_dir_all(library.join(dir)).unwrap();
            fs::write(library.join(dir).join("data"), "保留").unwrap();
        }
        let d = measure_directory(
            &library,
            &AtomicBool::new(false),
            Duration::from_secs(1),
            |_| {},
        );
        assert_eq!(d.stats.excluded, 2);
        assert_eq!(d.stats.issues, 0);
        assert_eq!(d.stats.files, 4);
        assert!(!d.stats.complete);
        assert!(d
            .items
            .iter()
            .filter(|i| i.name == "Containers" || i.name == "Application Support")
            .all(|i| i.bytes == 0 && !i.complete && i.blocked.is_some()));
        let engine = Engine::new(f.0.clone());
        let scan = engine
            .scan_targets(
                vec![],
                vec![readonly_item("library", "用户资源", &library)],
                |_| {},
            )
            .unwrap();
        assert!(!scan.roots[0].complete);
        assert_eq!(scan.roots[0].issues, 0);
        assert!(engine.children("library", "Containers", 0, |_| {}).is_err());
        let direct = engine
            .scan_targets(
                vec![],
                vec![readonly_item(
                    "data",
                    "私有数据",
                    &library.join("Containers"),
                )],
                |_| {},
            )
            .unwrap();
        assert!(!direct.roots[0].complete);
        assert_eq!(direct.roots[0].issues, 0);
        assert_eq!(direct.roots[0].bytes, 0);
        assert!(engine
            .projects(library.join("Containers").to_string_lossy().into(), |_| {})
            .is_err());
    }
    #[test]
    fn app_data_boundary_is_lexical_and_keeps_normal_caches() {
        for directory in [
            "Containers",
            "Group Containers",
            "Application Scripts",
            "Application Support",
            "Mail",
            "Messages",
            "Safari",
            "Calendars",
            "Accounts",
            "HomeKit",
            "Keychains",
        ] {
            let path = PathBuf::from("/Users/test/Library")
                .join(directory)
                .join("private/data");
            assert!(excluded_app_data(&path));
            assert!(checked_read_path(&path).is_err());
            assert!(cache_path(Action::Uv, path.to_str().unwrap()).is_err());
        }
        for path in [
            "/Users/test/Library/Caches/pip",
            "/Users/test/work/Containers",
            "/Users/test/.cache/uv",
            "/Library/Caches",
        ] {
            assert!(!excluded_app_data(Path::new(path)));
        }
    }
    #[test]
    fn basic_scan_stays_with_default_caches() {
        let fixture = Fixture::new();
        let engine = Engine::new(fixture.0.clone());
        let targets = engine.discover_targets(false);
        assert_eq!(targets.len(), 3);
        assert_eq!(
            targets.iter().map(|i| i.id.as_str()).collect::<Vec<_>>(),
            vec!["uv", "npm", "pip"]
        );
        assert!(targets
            .iter()
            .all(|i| Path::new(&i.path).starts_with(&fixture.0)));
        let scan = engine.scan(false, |_| {}).unwrap();
        assert!(scan.roots.is_empty());
        assert_eq!(scan.items.len(), 3);
    }
    #[test]
    #[ignore = "仅手动运行本机只读扫描"]
    fn real_scan_smoke() {
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let engine = Engine::new(home);
        let scan = engine
            .scan(true, |p| {
                if p.files == 0 {
                    println!("扫描 {} {}/{}", p.name, p.done, p.total);
                }
            })
            .unwrap();
        assert!(scan.items.len() >= rules().len());
        assert_eq!(scan.roots.len(), analysis_roots(&engine.home).len());
        assert!(scan.disk.total > scan.disk.available);
        for item in &scan.items {
            println!("{}: {} bytes; {:?}", item.name, item.bytes, item.blocked);
        }
        for root in &scan.roots {
            println!(
                "主要目录 {}: {} bytes，完整={}，读取失败={}",
                root.path, root.bytes, root.complete, root.issues
            );
        }
        println!(
            "磁盘 单卷已用={}，可用={}，共享/保留={}",
            scan.disk.used, scan.disk.available, scan.disk.shared
        );
        fs::write(
            "/tmp/disk-care-020-scan.json",
            serde_json::to_vec_pretty(&scan).unwrap(),
        )
        .unwrap();
        let yarn = engine.home.join("Library/Caches/Yarn/v6");
        if yarn.is_dir() {
            let listing = engine.children("yarn", "v6", 0, |_| {}).unwrap();
            println!(
                "真实 Yarn 子项={}，第一页={}，下一页={:?}",
                listing.total,
                listing.items.len(),
                listing.next_offset
            );
            assert!(listing.total < 201 || listing.next_offset.is_some());
        }
        assert!(engine.history().is_ok());
    }
    #[test]
    #[ignore = "仅手动运行应用目录只读交叉核验"]
    fn real_apps_crosscheck() {
        let root = Path::new("/Applications");
        let directory = measure_directory(
            root,
            &AtomicBool::new(false),
            Duration::from_secs(300),
            |_| {},
        );
        let du = Command::new("/usr/bin/du")
            .args(["-skx"])
            .arg(root)
            .output()
            .unwrap();
        assert!(du.status.success());
        let expected = String::from_utf8_lossy(&du.stdout)
            .split_whitespace()
            .next()
            .unwrap()
            .parse::<u64>()
            .unwrap()
            * 1024;
        println!(
            "应用目录 core={}，du={}，差异={}",
            directory.stats.bytes,
            expected,
            directory.stats.bytes as i128 - expected as i128
        );
        assert!(directory.stats.complete);
        assert_eq!(directory.stats.issues, 0);
        assert_eq!(
            directory.stats.bytes, expected,
            "目录在统计期间可能变化，请核对后台更新"
        );
    }
    #[test]
    #[ignore = "需本机安装 uv，仅执行自有独立临时缓存的官方命令与复核"]
    fn official_uv_cleanup_in_fixture() {
        let f = Fixture::new();
        let cache = f.0.join(".cache/uv");
        fs::create_dir_all(&cache).unwrap();
        fs::write(cache.join("download"), vec![1u8; 8192]).unwrap();
        let sentinel = f.0.join("keep.txt");
        fs::write(&sentinel, "保留").unwrap();
        let mut item = readonly_item("uv", "uv 缓存", &cache);
        item.bytes = measure(&cache, &AtomicBool::new(false), |_| {}).bytes;
        let executable = tool(Action::Uv, &f.0).expect("本机需安装 uv");
        let mut command = Command::new(executable);
        command.args(arguments(Action::Uv, &cache, &f.0));
        command_path(&mut command).unwrap();
        let outcome = cleanup_outcome(&item, run_command(command, Duration::from_secs(30)), true);
        assert!(outcome.success, "{}", outcome.message);
        assert_eq!(outcome.after_bytes, Some(0));
        assert!(!cache.exists());
        assert_eq!(fs::read_to_string(sentinel).unwrap(), "保留");
        println!(
            "临时 uv 缓存官方命令与执行后复核通过；未调用 Engine 全链，不代表真实进程保护已放行"
        );
    }
    #[test]
    #[ignore = "需本机安装 uv 且无关联运行进程，仅清理临时夹具"]
    fn official_uv_engine_flow_in_fixture() {
        let f = Fixture::new();
        let cache = f.0.join(".cache/uv");
        fs::create_dir_all(&cache).unwrap();
        fs::write(cache.join("download"), vec![1u8; 8192]).unwrap();
        let sentinel = f.0.join("keep.txt");
        fs::write(&sentinel, "保留").unwrap();
        let engine = Engine::new(f.0.clone());
        let scan = engine.scan_fixture(|_| {}).unwrap();
        let uv = scan.items.iter().find(|item| item.id == "uv").unwrap();
        assert!(uv.blocked.is_none(), "uv 样本预检：{:?}", uv.blocked);
        fs::write(cache.join("added-after-scan"), "new").unwrap();
        let error = engine.prepare(scan.id, vec!["uv".into()]).unwrap_err();
        assert!(error.contains("变化"), "{error}");
        let scan = engine.scan_fixture(|_| {}).unwrap();
        let plan = engine.prepare(scan.id, vec!["uv".into()]).unwrap();
        fs::write(cache.join("added-after-preview"), "new").unwrap();
        assert!(engine
            .clean(plan.token, |_| {})
            .err()
            .unwrap()
            .contains("变化"));
        assert!(cache.join("download").exists());
        let scan = engine.scan_fixture(|_| {}).unwrap();
        let plan = engine.prepare(scan.id, vec!["uv".into()]).unwrap();
        let record = engine.clean(plan.token, |_| {}).unwrap();
        assert!(record.outcomes[0].success, "{}", record.outcomes[0].message);
        assert_eq!(record.outcomes[0].after_bytes, Some(0));
        assert_eq!(record.outcomes[0].status.as_deref(), Some("success"));
        assert_eq!(engine.history().unwrap().len(), 1);
        assert!(engine.clean(plan.token, |_| {}).is_err());
        assert!(!cache.exists());
        assert_eq!(fs::read_to_string(sentinel).unwrap(), "保留");
    }
    #[test]
    #[ignore = "需本机安装 pip，仅清理临时夹具"]
    fn official_pip_flow_in_fixture() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let wheels = f.0.join("Library/Caches/pip/wheels");
        fs::create_dir_all(&wheels).unwrap();
        let wheel = wheels.join("fixture-1.0-py3-none-any.whl");
        fs::write(&wheel, vec![1u8; 8192]).unwrap();
        let sentinel = f.0.join("keep.txt");
        fs::write(&sentinel, "保留").unwrap();
        let scan = engine.scan_fixture(|_| {}).unwrap();
        let plan = engine.prepare(scan.id, vec!["pip".into()]).unwrap();
        let record = engine.clean(plan.token, |_| {}).unwrap();
        for outcome in &record.outcomes {
            println!("{}", outcome.message);
        }
        assert!(
            record.outcomes.iter().all(|o| o.success),
            "{:?}",
            record
                .outcomes
                .iter()
                .map(|o| &o.message)
                .collect::<Vec<_>>()
        );
        assert!(!wheel.exists());
        assert_eq!(fs::read_to_string(sentinel).unwrap(), "保留");
        assert_eq!(engine.history().unwrap().len(), 1);
        assert!(engine.scan.lock().unwrap().is_none());
        assert!(engine.clean(plan.token, |_| {}).is_err());
    }
    #[test]
    fn command_output_and_timeout() {
        let command = Command::new("/usr/bin/true");
        assert!(run_command(command, Duration::from_secs(1)).is_ok());
        let mut c = Command::new("/bin/sleep");
        c.arg("5");
        assert!(run_command(c, Duration::from_millis(5))
            .unwrap_err()
            .contains("终止"));
    }
    #[test]
    fn confirmation_is_single_use() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        *engine.plan.lock().unwrap() = Some(Plan {
            token: 1,
            created_at: 0,
            estimated: 0,
            items: vec![],
        });
        assert!(engine.clean(1, |_| {}).is_err());
        assert!(engine.plan.lock().unwrap().is_none());
    }
    #[test]
    fn traversal_in_browser_is_rejected() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        assert!(engine.children("downloads", "../", 0, |_| {}).is_err());
        assert!(engine.children("downloads", "/tmp", 0, |_| {}).is_err());
    }
    #[test]
    fn history_symlink_is_rejected() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let parent = engine.history_path.parent().unwrap();
        fs::create_dir_all(parent).unwrap();
        symlink("/tmp", &engine.history_path).unwrap();
        assert!(engine.history().is_err());
    }
    #[test]
    fn rejects_unsafe_paths() {
        let f = Fixture::new();
        assert!(checked_path(&f.0, &f.0).is_err());
        assert!(checked_path(&f.0, Path::new("/tmp/elsewhere")).is_err());
        assert!(checked_path(&f.0, &f.0.join("x/../y")).is_err());
        symlink("/tmp", f.0.join("link")).unwrap();
        assert!(checked_path(&f.0, &f.0.join("link/test")).is_err());
        assert!(checked_path(&f.0, &f.0.join("cache/new")).is_ok());
    }
    #[test]
    fn counts_hardlinks_once_and_skips_symlinks() {
        let f = Fixture::new();
        fs::write(f.0.join("a"), vec![1u8; 8192]).unwrap();
        fs::hard_link(f.0.join("a"), f.0.join("b")).unwrap();
        symlink("/", f.0.join("escape")).unwrap();
        let stats = measure(&f.0, &AtomicBool::new(false), |_| {});
        let expected = fs::metadata(&f.0).unwrap().blocks() * 512
            + fs::metadata(f.0.join("a")).unwrap().blocks() * 512;
        assert_eq!(stats.bytes, expected);
        assert_eq!(stats.files, 2);
        assert!(stats.complete);
    }
    #[test]
    fn cancelled_scan_stops() {
        let f = Fixture::new();
        let s = measure(&f.0, &AtomicBool::new(true), |_| {});
        assert!(!s.complete);
        assert_eq!(s.files, 0);
    }
    #[test]
    fn blocks_running_cached_tools() {
        let p = Path::new("/Users/test/.cache/uv");
        assert!(running(
            Action::Uv,
            p,
            &[process("/Users/test/.cache/uv/archive/bin/python server")]
        )
        .is_some());
        assert!(running(Action::Uv, p, &[process("/opt/bin/uvx server")]).is_some());
        assert!(running(Action::Npm, p, &[process("npm install")]).is_some());
        assert!(running(Action::Npm, p, &[process("node vite")]).is_none());
    }
    #[test]
    fn refuses_readonly_and_unknown_rules() {
        assert!(rule("database").is_err());
        assert!(rule("downloads").unwrap().action.is_none());
        assert!(rule("ollama").unwrap().action.is_none());
    }
    #[test]
    fn expires_confirmation() {
        let plan = Plan {
            token: 123,
            created_at: 100,
            estimated: 0,
            items: vec![],
        };
        assert!(validate_plan(&plan, 123, 1000).is_ok());
        assert!(validate_plan(&plan, 124, 1000).is_err());
        assert!(validate_plan(&plan, 123, 60101).is_err());
    }
    #[test]
    fn fixed_arguments_keep_spaces_as_one_value() {
        let home = Path::new("/Users/Some One");
        let path = home.join(".cache/uv");
        let args = arguments(Action::Uv, &path, home);
        assert_eq!(args.last().unwrap(), "/Users/Some One/.cache/uv");
        assert_eq!(args.len(), 4);
    }
    #[test]
    fn command_failures_are_reported() {
        let mut c = Command::new("/usr/bin/false");
        c.arg("ignored");
        assert!(run_command(c, Duration::from_secs(1)).is_err());
    }
    #[test]
    fn detects_versioned_pip_and_npm_scripts_without_text_false_positive() {
        let cache = Path::new("/Users/test/.npm/_cacache");
        let pip = process("/opt/bin/python3 /opt/bin/pip3.13 install requests");
        assert!(running(Action::Pip, cache, &[pip])
            .unwrap()
            .contains("PID 123"));
        assert!(running(
            Action::Npm,
            cache,
            &[process(
                "/opt/bin/node /opt/lib/npm/bin/npm-cli.js install react"
            )]
        )
        .is_some());
        assert!(running(Action::Npm,cache,&[process("/opt/bin/node --require preload /opt/lib/npm/bin/npm-cli.js --prefix /tmp install react")]).is_some());
        assert!(running(
            Action::Npm,
            cache,
            &[process("/usr/bin/printf npm install usage")]
        )
        .is_none());
        assert!(running(
            Action::Pip,
            cache,
            &[process("/usr/bin/printf pip3.13 install usage")]
        )
        .is_none());
        assert!(running(
            Action::Npm,
            cache,
            &[process("node unrelated.js install react")]
        )
        .is_none());
    }
    #[test]
    fn disk_uses_volume_used_and_separates_shared_space() {
        let d=parse_disk("Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s5 1000 600 200 75% /System/Volumes/Data\n").unwrap();
        assert_eq!(
            (d.total, d.used, d.available, d.shared),
            (1024000, 614400, 204800, 204800)
        );
        assert!(parse_disk("invalid").is_err());
        assert_eq!(
            parse_disk("/dev/test 1000 1000 -20 100% /data")
                .unwrap()
                .available,
            0
        );
    }
    #[test]
    fn child_subtree_sizes_and_pagination_work() {
        let f = Fixture::new();
        let root = f.0.join("Downloads");
        let music = root.join("music");
        fs::create_dir_all(&music).unwrap();
        fs::write(music.join("payload"), vec![1u8; 1024 * 1024]).unwrap();
        for n in 0..501 {
            fs::write(root.join(format!("small-{n}")), "x").unwrap();
        }
        let engine = Engine::new(f.0.clone());
        engine.scan_fixture(|_| {}).unwrap();
        let first = engine.children("downloads", "", 0, |_| {}).unwrap();
        assert_eq!(first.total, 502);
        assert_eq!(first.items.len(), 200);
        assert_eq!(first.items[0].name, "music");
        assert!(first.items[0].bytes >= 1024 * 1024);
        let second = engine
            .children("downloads", "", first.next_offset.unwrap(), |_| {})
            .unwrap();
        assert_eq!(first.measured_at, second.measured_at);
        let last = engine
            .children("downloads", "", second.next_offset.unwrap(), |_| {})
            .unwrap();
        assert_eq!(last.items.len(), 102);
        assert!(last.next_offset.is_none());
        let inner = engine.children("downloads", "music", 0, |_| {}).unwrap();
        assert_eq!(inner.items[0].name, "payload");
    }
    #[test]
    fn readonly_roots_find_unknown_large_directories() {
        let f = Fixture::new();
        let unknown = f.0.join("unknown-data");
        fs::create_dir_all(&unknown).unwrap();
        fs::write(unknown.join("large"), vec![1u8; 65536]).unwrap();
        let engine = Engine::new(f.0.clone());
        let scan = engine
            .scan_targets(
                vec![],
                vec![readonly_item("root-home", "用户主目录", &f.0)],
                |_| {},
            )
            .unwrap();
        assert!(scan.roots[0].bytes >= 65536);
        assert!(scan.roots[0].command.is_none());
        assert!(engine.prepare(scan.id, vec!["root-home".into()]).is_err());
        let listing = engine.children("root-home", "", 0, |_| {}).unwrap();
        assert_eq!(listing.items[0].name, "unknown-data");
    }
    #[test]
    fn actual_cache_path_is_validated_and_not_cleanable_as_default() {
        let home = Path::new("/Users/test");
        assert_eq!(
            cache_path(Action::Npm, "/Users/test/custom npm").unwrap(),
            home.join("custom npm/_cacache")
        );
        assert_eq!(
            cache_path(Action::Uv, "/Users/test/custom-uv").unwrap(),
            home.join("custom-uv")
        );
        assert!(cache_path(Action::Uv, "/").is_err());
        assert!(cache_path(Action::Pip, "../cache").is_err());
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let mut item = engine.inspect(&rule("uv").unwrap(), &Ok(vec![]));
        item.path = f.0.join("custom").to_string_lossy().into();
        item.bytes = 8192;
        item.blocked = None;
        let id = now();
        *engine.scan.lock().unwrap() = Some(Scan {
            extended: true,
            id,
            disk: engine.disk().unwrap(),
            items: vec![item],
            roots: vec![],
            duration_ms: 0,
            cancelled: false,
        });
        assert!(engine
            .prepare(id, vec!["uv".into()])
            .unwrap_err()
            .contains("自定义"));
    }
    #[test]
    fn readonly_scan_rejects_symlinks_and_cancelled_results_are_partial() {
        let f = Fixture::new();
        symlink("/", f.0.join("escape")).unwrap();
        assert!(checked_read_path(&f.0.join("escape/etc")).is_err());
        let d = measure_directory(&f.0, &AtomicBool::new(true), Duration::from_secs(1), |_| {});
        assert!(!d.stats.complete);
        let d = measure_directory(&f.0, &AtomicBool::new(false), Duration::ZERO, |_| {});
        assert!(!d.stats.complete);
    }
    #[test]
    fn configured_cache_symlink_is_resolved_but_default_delete_stays_blocked() {
        let f = Fixture::new();
        let actual = f.0.join("actual-cache");
        fs::create_dir_all(&actual).unwrap();
        let alias = f.0.join("cache-alias");
        symlink(&actual, &alias).unwrap();
        assert_eq!(
            cache_path(Action::Uv, alias.to_str().unwrap()).unwrap(),
            actual
        );
        assert!(checked_read_path(&alias).is_err());
        assert!(checked_path(&f.0, &alias).is_err());
    }
    #[test]
    fn permission_errors_are_not_reported_as_complete() {
        use std::os::unix::fs::PermissionsExt;
        let f = Fixture::new();
        let restricted = f.0.join("restricted");
        fs::create_dir_all(&restricted).unwrap();
        fs::write(restricted.join("data"), "保留").unwrap();
        fs::set_permissions(&restricted, fs::Permissions::from_mode(0o000)).unwrap();
        let cannot_read = fs::read_dir(&restricted).is_err();
        let engine = Engine::new(f.0.clone());
        let scan = engine
            .scan_targets(
                vec![],
                vec![readonly_item("root-home", "主目录", &f.0)],
                |_| {},
            )
            .unwrap();
        let listing = engine.children("root-home", "", 0, |_| {}).unwrap();
        fs::set_permissions(&restricted, fs::Permissions::from_mode(0o700)).unwrap();
        if cannot_read {
            assert!(scan.roots[0].issues > 0);
            assert!(!scan.roots[0].complete);
            assert!(!listing.complete);
            assert!(listing
                .items
                .iter()
                .any(|i| i.name == "restricted" && !i.complete));
        }
    }
    #[test]
    fn empty_history_and_invalid_plan_do_not_delete() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        assert!(engine.history().unwrap().is_empty());
        assert!(engine.clean(999, |_| {}).is_err());
        assert!(engine.prepare(999, vec!["uv".into()]).is_err());
    }
    #[test]
    fn uv_snapshot_detects_same_size_edits_new_files_and_replaced_root() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let path = f.0.join(".cache/uv");
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("data"), "abcd").unwrap();
        let mut item = engine.inspect(&rule("uv").unwrap(), &Ok(vec![]));
        engine.measure_item(&mut item, 0, 1, 45, &|_| {}).unwrap();
        let r = rule("uv").unwrap();
        assert!(engine.verify_snapshot(&r, &item).is_ok());
        fs::write(path.join("data"), "efgh").unwrap();
        assert!(engine.verify_snapshot(&r, &item).is_err());
        engine.measure_item(&mut item, 0, 1, 45, &|_| {}).unwrap();
        fs::write(path.join("new"), "new").unwrap();
        assert!(engine.verify_snapshot(&r, &item).is_err());
        engine.measure_item(&mut item, 0, 1, 45, &|_| {}).unwrap();
        fs::rename(&path, f.0.join("previous-cache")).unwrap();
        fs::create_dir(&path).unwrap();
        assert!(engine.verify_snapshot(&r, &item).is_err());
        fs::remove_dir(&path).unwrap();
        symlink(f.0.join("previous-cache"), &path).unwrap();
        assert!(engine.verify_snapshot(&r, &item).is_err());
        assert_eq!(fs::read_to_string(path.join("data")).unwrap(), "efgh");
    }
    #[test]
    fn uv_protection_persists_invalidates_confirmation_and_fails_closed() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        assert!(!engine.uv_protected().unwrap());
        *engine.plan.lock().unwrap() = Some(Plan {
            token: 1,
            created_at: now(),
            items: vec![],
            estimated: 0,
        });
        engine.protect_uv(true).unwrap();
        assert!(engine.plan.lock().unwrap().is_none());
        assert!(Engine::new(f.0.clone()).uv_protected().unwrap());
        let item = engine.inspect(&rule("uv").unwrap(), &Ok(vec![]));
        assert!(item.evidence.unwrap().protected);
        assert!(item.blocked.is_some());
        assert!(engine.clean(1, |_| {}).is_err());
        engine.protect_uv(false).unwrap();
        assert!(!engine.uv_protected().unwrap());
        fs::write(engine.protection_path(), "bad-json").unwrap();
        assert!(engine.uv_protected().is_err());
        let item = engine.inspect(&rule("uv").unwrap(), &Ok(vec![]));
        assert!(item.blocked.unwrap().contains("保护设置"));
        fs::remove_file(engine.protection_path()).unwrap();
        let sentinel = f.0.join("sentinel");
        fs::write(&sentinel, "keep").unwrap();
        symlink(&sentinel, engine.protection_path()).unwrap();
        assert!(engine.uv_protected().is_err());
        assert!(engine.protect_uv(false).is_err());
        assert_eq!(fs::read_to_string(sentinel).unwrap(), "keep");
    }
    #[test]
    fn coverage_distinguishes_absence_exclusion_denial_limits_and_pending() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let mut missing = readonly_item("missing", "不存在", &f.0.join("missing"));
        engine
            .measure_item(&mut missing, 0, 1, 45, &|_| {})
            .unwrap();
        assert_eq!(missing.coverage.unwrap().status, "absent");
        let mut excluded =
            readonly_item("excluded", "私有数据", &f.0.join("Library/Containers/app"));
        engine
            .measure_item(&mut excluded, 0, 1, 45, &|_| {})
            .unwrap();
        assert_eq!(excluded.coverage.unwrap().status, "skipped");
        assert_eq!(excluded.issues, 0);
        let not_directory = f.0.join("not-directory");
        fs::write(&not_directory, "保留").unwrap();
        let mut invalid = readonly_item("uv", "路径被替换为文件", &not_directory);
        engine
            .measure_item(&mut invalid, 0, 1, 45, &|_| {})
            .unwrap();
        assert!(!invalid.complete && invalid.snapshot.is_none());
        assert!(invalid.blocked.unwrap().contains("不是目录"));
        assert_eq!(fs::read_to_string(not_directory).unwrap(), "保留");
        let mut stats = Stats::default();
        stats.error(&std::io::Error::from(std::io::ErrorKind::PermissionDenied));
        assert_eq!(stats.coverage().status, "denied");
        assert_eq!(stats.coverage().permission_denied, 1);
        let limited =
            measure_directory(&f.0, &AtomicBool::new(false), Duration::ZERO, |_| {}).stats;
        assert_eq!(limited.coverage().status, "limited");
        let targets = vec![
            readonly_item("first", "第一个", &f.0),
            readonly_item("second", "第二个", &f.0),
        ];
        let scan = engine
            .scan_targets(targets, vec![], |_| {
                engine.cancel.store(true, Ordering::SeqCst);
            })
            .unwrap();
        assert_eq!(scan.items.len(), 2);
        assert_eq!(scan.items[0].coverage.as_ref().unwrap().status, "cancelled");
        assert_eq!(scan.items[1].coverage.as_ref().unwrap().status, "pending");
        assert!(!scan.items[1].complete);
    }
    #[test]
    fn outcomes_distinguish_command_status_observation_and_legacy_data() {
        let f = Fixture::new();
        let path = f.0.join("cache");
        fs::create_dir_all(&path).unwrap();
        fs::write(path.join("leftover"), "keep").unwrap();
        let mut item = readonly_item("uv", "uv", &path);
        item.bytes = 8192;
        let success = cleanup_outcome(&item, Ok("done".into()), true);
        assert_eq!(success.status.as_deref(), Some("success"));
        assert!(success.after_bytes.unwrap() > 0);
        let failure = cleanup_outcome(&item, Err("partial failure".into()), true);
        assert_eq!(failure.status.as_deref(), Some("failed"));
        assert!(failure.after_bytes.unwrap() > 0);
        let skipped = cleanup_outcome(&item, Err("blocked".into()), false);
        assert_eq!(skipped.status.as_deref(), Some("skipped"));
        assert!(skipped.after_bytes.is_none());
        let missing = readonly_item("uv", "uv", &f.0.join("absent"));
        assert_eq!(
            cleanup_outcome(&missing, Ok("done".into()), true).after_bytes,
            Some(0)
        );
        let alias = f.0.join("alias");
        symlink(&path, &alias).unwrap();
        let unsafe_item = readonly_item("uv", "uv", &alias);
        assert!(cleanup_outcome(&unsafe_item, Ok("done".into()), true)
            .after_bytes
            .is_none());
        let old: Outcome =
            serde_json::from_str(r#"{"name":"old","success":true,"message":"ok"}"#).unwrap();
        assert!(old.status.is_none());
        let old: Record = serde_json::from_str(r#"{"at":1,"estimated":1,"released":0,"beforeAvailable":10,"afterAvailable":5,"outcomes":[],"warning":null}"#).unwrap();
        assert!(old.disk_verified.is_none());
        let old: Item = serde_json::from_value(serde_json::json!({"id":"uv","name":"uv","category":"cache","path":"/cache","bytes":1,"files":1,"issues":0,"complete":true,"impact":"","command":null,"blocked":null,"details":[]})).unwrap();
        assert!(old.coverage.is_none() && old.evidence.is_none() && old.snapshot.is_none());
    }
}
