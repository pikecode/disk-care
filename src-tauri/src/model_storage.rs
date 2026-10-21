use super::*;
use std::{
    collections::BTreeMap,
    ffi::{CStr, CString, OsString},
    fs::File,
    os::{
        fd::{AsRawFd, FromRawFd},
        unix::ffi::OsStringExt,
    },
};

const MAX_ENTRIES: usize = 1024;
const MAX_REFS: usize = 8192;
const MAX_MANIFEST: u64 = 1024 * 1024;
const MAX_MANIFEST_TOTAL: u64 = 8 * 1024 * 1024;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelIssue {
    pub kind: String,
    pub path: String,
    pub message: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelBlock {
    pub id: String,
    pub digests: Vec<String>,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub model_ids: Vec<String>,
    pub external_links: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelEntry {
    pub id: String,
    pub name: String,
    pub reference_name: Option<String>,
    pub block_ids: Vec<String>,
    pub complete: bool,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub shared_bytes: u64,
    pub exclusive_bytes: Option<u64>,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelStorage {
    pub root: String,
    pub measured_at: u64,
    pub status: String,
    pub complete: bool,
    pub logical_bytes: u64,
    pub allocated_bytes: u64,
    pub models: Vec<ModelEntry>,
    pub blocks: Vec<ModelBlock>,
    pub issues: Vec<ModelIssue>,
}

// 逐级用描述符打开，防止校验后路径被替换成链接；不读取块正文。
fn open_at(parent: &File, name: &std::ffi::OsStr, directory: bool) -> std::io::Result<File> {
    let name = CString::new(name.as_encoded_bytes())?;
    let flags = libc::O_RDONLY
        | libc::O_CLOEXEC
        | libc::O_NOFOLLOW
        | libc::O_NONBLOCK
        | if directory { libc::O_DIRECTORY } else { 0 };
    let fd = unsafe { libc::openat(parent.as_raw_fd(), name.as_ptr(), flags) };
    if fd < 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(unsafe { File::from_raw_fd(fd) })
    }
}
fn open_directory(path: &Path) -> std::io::Result<File> {
    let mut file = File::open("/")?;
    for part in path.components() {
        match part {
            Component::RootDir => (),
            Component::Normal(name) => file = open_at(&file, name, true)?,
            _ => {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidInput,
                    "路径含非法层级",
                ))
            }
        }
    }
    Ok(file)
}
fn open_descendant_directory(root: &File, parts: &[String]) -> std::io::Result<File> {
    // 队列只保留名称；每次从固定根逐级禁止链接，避免积压兄弟目录句柄。
    parts.iter().try_fold(root.try_clone()?, |dir, name| {
        open_at(&dir, std::ffi::OsStr::new(name), true)
    })
}
fn directory_names(dir: &File, limit: usize) -> std::io::Result<Vec<OsString>> {
    let fd = unsafe { libc::dup(dir.as_raw_fd()) };
    if fd < 0 {
        return Err(std::io::Error::last_os_error());
    }
    let stream = unsafe { libc::fdopendir(fd) };
    if stream.is_null() {
        let err = std::io::Error::last_os_error();
        unsafe {
            libc::close(fd);
        };
        return Err(err);
    }
    let mut names = Vec::new();
    let result = loop {
        #[cfg(target_os = "macos")]
        unsafe {
            *libc::__error() = 0;
        }
        #[cfg(target_os = "linux")]
        unsafe {
            *libc::__errno_location() = 0;
        }
        let entry = unsafe { libc::readdir(stream) };
        if entry.is_null() {
            let err = std::io::Error::last_os_error();
            break if err.raw_os_error() == Some(0) {
                Ok(names)
            } else {
                Err(err)
            };
        }
        let bytes = unsafe { CStr::from_ptr((*entry).d_name.as_ptr()) }.to_bytes();
        if bytes == b"." || bytes == b".." {
            continue;
        }
        if names.len() >= limit {
            break Err(std::io::Error::other("目录条目达到上限"));
        }
        names.push(OsString::from_vec(bytes.to_vec()));
    };
    unsafe {
        libc::closedir(stream);
    }
    result
}
fn issue(report: &mut ModelStorage, kind: &str, path: &Path, message: impl ToString) {
    report.complete = false;
    if report.issues.len() < 64 {
        report.issues.push(ModelIssue {
            kind: kind.into(),
            path: path.to_string_lossy().into(),
            message: message.to_string(),
        });
    }
}
fn io_issue(report: &mut ModelStorage, path: &Path, error: std::io::Error, missing: &str) {
    let kind = if error.kind() == std::io::ErrorKind::NotFound {
        missing
    } else if matches!(error.raw_os_error(), Some(libc::ELOOP | libc::ENOTDIR)) {
        "linkOrType"
    } else if error.kind() == std::io::ErrorKind::PermissionDenied {
        "access"
    } else {
        "read"
    };
    issue(report, kind, path, error);
}
#[derive(Deserialize)]
struct Layer {
    digest: String,
    size: u64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Manifest {
    schema_version: u64,
    config: Layer,
    layers: Vec<Layer>,
}
fn parse_manifest(mut file: File) -> Result<BTreeMap<String, u64>, String> {
    let before = file.metadata().map_err(|e| e.to_string())?;
    if !before.is_file() || before.len() > MAX_MANIFEST {
        return Err("清单不是常规文件或超过 1 MiB".into());
    }
    let mut bytes = Vec::new();
    (&mut file)
        .take(MAX_MANIFEST + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    let after = file.metadata().map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_MANIFEST
        || before.len() != after.len()
        || before.mtime() != after.mtime()
        || before.mtime_nsec() != after.mtime_nsec()
    {
        return Err("清单超限或读取中发生变化".into());
    }
    let manifest: Manifest = serde_json::from_slice(&bytes).map_err(|_| "清单 JSON 或字段无效")?;
    if manifest.schema_version != 2 || manifest.layers.len() > 4096 {
        return Err("清单版本不支持或文件块过多".into());
    }
    let mut refs = BTreeMap::new();
    for layer in std::iter::once(manifest.config).chain(manifest.layers) {
        let hex = layer
            .digest
            .strip_prefix("sha256:")
            .ok_or("摘要类型不支持")?;
        if hex.len() != 64
            || !hex
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        {
            return Err("摘要格式无效".into());
        }
        if let Some(size) = refs.insert(layer.digest, layer.size) {
            if size != layer.size {
                return Err("同一摘要大小不一致".into());
            }
        }
    }
    Ok(refs)
}
fn stopped(report: &mut ModelStorage, cancel: &AtomicBool, deadline: Instant, path: &Path) -> bool {
    if cancel.load(Ordering::SeqCst) {
        report.status = "cancelled".into();
        issue(report, "cancelled", path, "用户停止，未读取部分不计入结果");
        true
    } else if Instant::now() >= deadline {
        issue(report, "limit", path, "模型扫描达到时间上限");
        true
    } else {
        false
    }
}

pub(super) fn scan(
    home: &Path,
    cancel: &AtomicBool,
    deadline: Instant,
    progress: &impl Fn(Progress),
) -> ModelStorage {
    let root = home.join(".ollama/models");
    let mut report = ModelStorage {
        root: root.to_string_lossy().into(),
        measured_at: now(),
        status: "complete".into(),
        complete: true,
        logical_bytes: 0,
        allocated_bytes: 0,
        models: vec![],
        blocks: vec![],
        issues: vec![],
    };
    if stopped(&mut report, cancel, deadline, &root) {
        if report.status != "cancelled" {
            report.status = "partial".into();
        }
        return report;
    }
    if let Err(e) = checked_read_path(&root).and_then(|_| checked_path(home, &root)) {
        issue(&mut report, "linkOrType", &root, e);
        report.status = "partial".into();
        return report;
    }
    let store = match open_directory(&root) {
        Ok(f) => f,
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                report.status = "absent".into();
            } else {
                io_issue(&mut report, &root, e, "missingStore");
                report.status = "partial".into();
            }
            return report;
        }
    };
    let manifests = root.join("manifests");
    let directory = match open_at(&store, std::ffi::OsStr::new("manifests"), true) {
        Ok(f) => f,
        Err(e) => {
            io_issue(&mut report, &manifests, e, "missingManifests");
            report.status = "partial".into();
            return report;
        }
    };
    let mut stack = vec![Vec::<String>::new()];
    let mut visited = 0;
    let mut refs_count = 0;
    let mut manifest_bytes = 0u64;
    let mut models = Vec::<(ModelEntry, BTreeMap<String, u64>)>::new();
    while let Some(parts) = stack.pop() {
        if stopped(&mut report, cancel, deadline, &manifests) {
            break;
        }
        let dir = match open_descendant_directory(&directory, &parts) {
            Ok(dir) => dir,
            Err(e) => {
                let path = parts.iter().fold(manifests.clone(), |p, name| p.join(name));
                io_issue(&mut report, &path, e, "missingManifest");
                continue;
            }
        };
        let names = match directory_names(&dir, MAX_ENTRIES.saturating_sub(visited)) {
            Ok(names) => names,
            Err(e) => {
                issue(
                    &mut report,
                    if e.kind() == std::io::ErrorKind::Other {
                        "limit"
                    } else {
                        "read"
                    },
                    &manifests,
                    e,
                );
                continue;
            }
        };
        for name in names {
            if stopped(&mut report, cancel, deadline, &manifests) {
                break;
            }
            visited += 1;
            let mut path = manifests.clone();
            for part in &parts {
                path.push(part);
            }
            path.push(&name);
            let Some(text) = name.to_str() else {
                issue(&mut report, "invalidManifest", &path, "名称不是有效 UTF-8");
                continue;
            };
            if parts.len() < 3 {
                let mut sub = parts.clone();
                sub.push(text.to_string());
                stack.push(sub);
                continue;
            }
            if models.len() >= 512 || refs_count >= MAX_REFS {
                issue(&mut report, "limit", &path, "模型数量或文件块引用达到上限");
                break;
            }
            let file = match open_at(&dir, &name, false) {
                Ok(file) => file,
                Err(e) => {
                    io_issue(&mut report, &path, e, "missingManifest");
                    continue;
                }
            };
            manifest_bytes = manifest_bytes.saturating_add(
                file.metadata()
                    .map(|m| m.len())
                    .unwrap_or(MAX_MANIFEST_TOTAL + 1),
            );
            if manifest_bytes > MAX_MANIFEST_TOTAL {
                issue(&mut report, "limit", &path, "模型清单累计读取超过 8 MiB");
                break;
            }
            let mut rel = parts.clone();
            rel.push(text.into());
            let id = rel.join("/");
            let reference_name = if parts[0] == "registry.ollama.ai" && parts[1] == "library" {
                Some(format!("{}:{text}", parts[2]))
            } else {
                None
            };
            let mut model = ModelEntry {
                id: id.clone(),
                name: reference_name.clone().unwrap_or(id),
                reference_name,
                block_ids: vec![],
                complete: true,
                logical_bytes: 0,
                allocated_bytes: 0,
                shared_bytes: 0,
                exclusive_bytes: None,
            };
            let refs = match parse_manifest(file) {
                Ok(refs) => refs,
                Err(e) => {
                    issue(&mut report, "invalidManifest", &path, e);
                    model.complete = false;
                    BTreeMap::new()
                }
            };
            refs_count += refs.len();
            if refs_count > MAX_REFS {
                issue(&mut report, "limit", &path, "文件块引用达到上限");
                break;
            }
            models.push((model, refs));
        }
    }
    progress(Progress {
        name: "模型文件归属".into(),
        done: models.len(),
        total: models.len(),
        files: 0,
    });
    let mut by_inode = BTreeMap::<(u64, u64), (ModelBlock, u64)>::new();
    let mut by_digest = BTreeMap::<String, ((u64, u64), u64)>::new();
    let blobdir = open_at(&store, std::ffi::OsStr::new("blobs"), true);
    if !models.is_empty() {
        if let Err(e) = &blobdir {
            issue(&mut report, "access", &root.join("blobs"), e);
        }
    }
    for (mut model, refs) in models {
        for (digest, declared) in refs {
            if stopped(&mut report, cancel, deadline, &root) {
                model.complete = false;
                break;
            }
            let key = if let Some((key, size)) = by_digest.get(&digest) {
                if *size != declared {
                    issue(
                        &mut report,
                        "sizeMismatch",
                        &root.join("blobs"),
                        "清单声明大小与文件不同",
                    );
                    model.complete = false;
                }
                *key
            } else {
                let path = root.join("blobs").join(digest.replace(':', "-"));
                let meta = blobdir
                    .as_ref()
                    .map_err(|e| std::io::Error::new(e.kind(), e.to_string()))
                    .and_then(|dir| {
                        open_at(dir, std::ffi::OsStr::new(&digest.replace(':', "-")), false)
                    })
                    .and_then(|f| f.metadata());
                let meta = match meta {
                    Ok(m) if m.is_file() => m,
                    Ok(_) => {
                        issue(&mut report, "linkOrType", &path, "模型块不是常规文件");
                        model.complete = false;
                        continue;
                    }
                    Err(e) => {
                        io_issue(&mut report, &path, e, "missingBlob");
                        model.complete = false;
                        continue;
                    }
                };
                if meta.len() != declared {
                    issue(&mut report, "sizeMismatch", &path, "清单声明大小与文件不同");
                    model.complete = false;
                }
                let key = (meta.dev(), meta.ino());
                let allocated = meta.blocks().saturating_mul(512);
                let (block, _) = by_inode.entry(key).or_insert_with(|| {
                    (
                        ModelBlock {
                            id: format!("{}:{}", key.0, key.1),
                            digests: vec![],
                            logical_bytes: meta.len(),
                            allocated_bytes: allocated,
                            model_ids: vec![],
                            external_links: false,
                        },
                        meta.nlink(),
                    )
                });
                if block.logical_bytes != meta.len() || block.allocated_bytes != allocated {
                    issue(&mut report, "changed", &path, "扫描中文件发生变化");
                    model.complete = false;
                }
                block.digests.push(digest.clone());
                by_digest.insert(digest, (key, meta.len()));
                key
            };
            let (block, _) = by_inode.get_mut(&key).expect("已记录文件块");
            if !block.model_ids.contains(&model.id) {
                block.model_ids.push(model.id.clone());
            }
            if !model.block_ids.contains(&block.id) {
                model.block_ids.push(block.id.clone());
                model.logical_bytes += block.logical_bytes;
                model.allocated_bytes += block.allocated_bytes;
            }
        }
        report.models.push(model);
    }
    for (_, (mut block, links)) in by_inode {
        block.external_links = links > block.digests.len() as u64;
        report.logical_bytes += block.logical_bytes;
        report.allocated_bytes += block.allocated_bytes;
        report.blocks.push(block);
    }
    for model in &mut report.models {
        let blocks = report
            .blocks
            .iter()
            .filter(|b| b.model_ids.contains(&model.id))
            .collect::<Vec<_>>();
        model.shared_bytes = blocks
            .iter()
            .filter(|b| b.model_ids.len() > 1)
            .map(|b| b.allocated_bytes)
            .sum();
        if report.complete && model.complete && !blocks.iter().any(|b| b.external_links) {
            model.exclusive_bytes = Some(
                blocks
                    .iter()
                    .filter(|b| b.model_ids.len() == 1)
                    .map(|b| b.allocated_bytes)
                    .sum(),
            );
        }
    }
    report.models.sort_by(|a, b| a.id.cmp(&b.id));
    if !report.complete && report.status != "cancelled" {
        report.status = "partial".into();
    }
    report
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::symlink;
    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let p = std::env::temp_dir().join(format!(
                "model-storage-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, Ordering::Relaxed)
            ));
            fs::create_dir_all(&p).unwrap();
            Self(fs::canonicalize(p).unwrap())
        }
        fn write(&self, path: &str, data: &[u8]) {
            let p = self.0.join(".ollama/models").join(path);
            fs::create_dir_all(p.parent().unwrap()).unwrap();
            fs::write(p, data).unwrap();
        }
        fn blob(&self, c: char) -> String {
            let digest = format!("sha256:{}", c.to_string().repeat(64));
            self.write(&format!("blobs/{}", digest.replace(':', "-")), &[1; 5000]);
            digest
        }
        fn manifest(&self, name: &str, digests: &[String]) {
            let layer = |d: &String| serde_json::json!({"digest":d,"size":5000});
            let m = serde_json::json!({"schemaVersion":2,"config":layer(&digests[0]),"layers":digests.iter().map(layer).collect::<Vec<_>>()});
            self.write(
                &format!("manifests/registry.ollama.ai/library/{name}/latest"),
                &serde_json::to_vec(&m).unwrap(),
            );
        }
        fn scan(&self) -> ModelStorage {
            scan(
                &self.0,
                &AtomicBool::new(false),
                Instant::now() + Duration::from_secs(5),
                &|_| {},
            )
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }
    #[test]
    fn shared_and_duplicate_digests_are_counted_once() {
        let f = Fixture::new();
        let a = f.blob('a');
        let b = f.blob('b');
        f.manifest("one", &[a.clone(), b]);
        f.manifest("two", &[a]);
        let r = f.scan();
        assert!(r.complete, "{:?}", r.issues);
        assert_eq!(r.models.len(), 2);
        assert_eq!(r.logical_bytes, 10000);
        assert_eq!(r.blocks.len(), 2);
        assert_eq!(r.models[0].logical_bytes, 10000);
        assert_eq!(r.models[1].logical_bytes, 5000);
        assert_eq!(r.models[1].exclusive_bytes, Some(0));
        assert!(r.models[0].shared_bytes > 0);
        assert!(r.models[0].exclusive_bytes.unwrap() > 0);
    }
    #[test]
    fn hardlinks_merge_and_external_links_disable_exclusive() {
        let f = Fixture::new();
        let a = f.blob('a');
        let b = format!("sha256:{}", "b".repeat(64));
        fs::hard_link(
            f.0.join(".ollama/models/blobs").join(a.replace(':', "-")),
            f.0.join(".ollama/models/blobs").join(b.replace(':', "-")),
        )
        .unwrap();
        f.manifest("one", std::slice::from_ref(&a));
        f.manifest("two", &[b]);
        let r = f.scan();
        assert!(r.complete);
        assert_eq!(r.blocks.len(), 1);
        assert_eq!(r.logical_bytes, 5000);
        assert_eq!(r.models[0].exclusive_bytes, Some(0));
        fs::hard_link(
            f.0.join(".ollama/models/blobs").join(a.replace(':', "-")),
            f.0.join("outside-link"),
        )
        .unwrap();
        assert!(f.scan().models.iter().all(|m| m.exclusive_bytes.is_none()));
    }
    #[test]
    fn missing_bad_or_traversing_manifests_hide_exclusive() {
        let f = Fixture::new();
        let a = f.blob('a');
        f.manifest("good", &[a]);
        f.write("manifests/registry.ollama.ai/library/bad/latest", b"{}");
        let r = f.scan();
        assert!(!r.complete);
        assert!(r.models.iter().all(|m| m.exclusive_bytes.is_none()));
        f.manifest("bad", &["sha256:../../outside".into()]);
        assert!(!f.scan().complete);
        f.manifest("bad", &[format!("sha256:{}", "f".repeat(64))]);
        let r = f.scan();
        assert!(!r.complete);
        assert!(r.issues.iter().any(|i| i.kind == "missingBlob"));
        f.write(
            "manifests/registry.ollama.ai/library/bad/latest",
            b"not json",
        );
        assert!(!f.scan().complete);
    }
    #[test]
    fn links_fifo_and_oversized_input_are_rejected() {
        let f = Fixture::new();
        let a = f.blob('a');
        f.manifest("one", std::slice::from_ref(&a));
        let path = f.0.join(".ollama/models/blobs").join(a.replace(':', "-"));
        fs::remove_file(&path).unwrap();
        symlink("/etc/passwd", &path).unwrap();
        assert!(!f.scan().complete);
        fs::remove_file(&path).unwrap();
        let c = std::ffi::CString::new(path.as_os_str().as_encoded_bytes()).unwrap();
        unsafe {
            assert_eq!(libc::mkfifo(c.as_ptr(), 0o600), 0);
        }
        assert!(!f.scan().complete);
        f.write(
            "manifests/registry.ollama.ai/library/large/latest",
            &vec![b' '; MAX_MANIFEST as usize + 1],
        );
        assert!(!f.scan().complete);
        fs::rename(f.0.join(".ollama/models/manifests"), f.0.join("saved")).unwrap();
        symlink(f.0.join("saved"), f.0.join(".ollama/models/manifests")).unwrap();
        assert!(!f.scan().complete);
    }
    #[test]
    fn cancellation_deadline_absence_and_limits_are_distinct() {
        let f = Fixture::new();
        assert_eq!(f.scan().status, "absent");
        let a = f.blob('a');
        f.manifest("one", &[a]);
        let r = scan(
            &f.0,
            &AtomicBool::new(true),
            Instant::now() + Duration::from_secs(5),
            &|_| {},
        );
        assert!(!r.complete);
        assert_eq!(r.status, "cancelled");
        let r = scan(&f.0, &AtomicBool::new(false), Instant::now(), &|_| {});
        assert!(!r.complete);
        assert!(r.issues.iter().any(|i| i.kind == "limit"));
        for i in 0..1100 {
            f.write(
                &format!("manifests/registry.ollama.ai/library/extra/{i}"),
                b"{}",
            );
        }
        let r = f.scan();
        assert!(!r.complete);
        assert!(r.issues.iter().any(|i| i.kind == "limit"));
    }
    #[test]
    fn invalid_sizes_namespaces_and_directory_swaps() {
        let f = Fixture::new();
        let a = f.blob('a');
        f.manifest("one", std::slice::from_ref(&a));
        f.write("manifests/other.registry/library/one/latest", &serde_json::to_vec(&serde_json::json!({"schemaVersion":2,"config":{"digest":a,"size":5000},"layers":[]})).unwrap());
        let r = f.scan();
        assert!(r.complete);
        assert_eq!(r.models.len(), 2);
        assert!(r.models.iter().any(|m| m.reference_name.is_none()));
        assert_eq!(r.logical_bytes, 5000);
        f.write(
            "manifests/registry.ollama.ai/library/one/latest",
            &serde_json::to_vec(
                &serde_json::json!({"schemaVersion":2,"config":{"digest":a,"size":1},"layers":[]}),
            )
            .unwrap(),
        );
        assert!(!f.scan().complete);
        let dir = open_directory(&f.0.join(".ollama/models/blobs")).unwrap();
        fs::rename(f.0.join(".ollama/models/blobs"), f.0.join("pinned-blobs")).unwrap();
        symlink("/etc", f.0.join(".ollama/models/blobs")).unwrap();
        assert_eq!(
            open_at(&dir, std::ffi::OsStr::new(&a.replace(':', "-")), false)
                .unwrap()
                .metadata()
                .unwrap()
                .len(),
            5000
        );
        assert!(!f.scan().complete);
    }
    #[test]
    fn large_multilayer_manifest_is_supported_with_a_total_budget() {
        let f = Fixture::new();
        let a = f.blob('a');
        let config = serde_json::json!({"digest":a,"size":5000});
        let m = serde_json::json!({"schemaVersion":2,"config":config,"layers":vec![config.clone();733]});
        f.write(
            "manifests/registry.ollama.ai/library/large/latest",
            &serde_json::to_vec(&m).unwrap(),
        );
        let r = f.scan();
        assert!(r.complete, "{:?}", r.issues);
        assert_eq!(r.blocks.len(), 1);
        let oversized=serde_json::to_vec(&serde_json::json!({"schemaVersion":2,"config":config,"layers":[],"padding":"x".repeat(800000)})).unwrap();
        for i in 0..12 {
            f.write(
                &format!("manifests/registry.ollama.ai/library/budget/{i}"),
                &oversized,
            );
        }
        let r = f.scan();
        assert!(!r.complete);
        assert!(r.issues.iter().any(|i| i.kind == "limit"));
        assert!(r.models.iter().all(|m| m.exclusive_bytes.is_none()));
    }
    #[test]
    fn queued_paths_stay_under_pinned_root_and_refuse_intermediate_links() {
        let f = Fixture::new();
        let digest = f.blob('a');
        f.manifest("one", std::slice::from_ref(&digest));
        let root = f.0.join(".ollama/models/manifests");
        let pinned = open_directory(&root).unwrap();
        fs::rename(&root, f.0.join("saved-manifests")).unwrap();
        symlink("/etc", &root).unwrap();
        let parts = vec!["registry.ollama.ai".into(), "library".into(), "one".into()];
        let dir = open_descendant_directory(&pinned, &parts).unwrap();
        let refs =
            parse_manifest(open_at(&dir, std::ffi::OsStr::new("latest"), false).unwrap()).unwrap();
        assert_eq!(refs.len(), 1);
        let library = f.0.join("saved-manifests/registry.ollama.ai/library");
        fs::rename(&library, f.0.join("saved-library")).unwrap();
        symlink(f.0.join("saved-library"), &library).unwrap();
        assert!(open_descendant_directory(&pinned, &parts).is_err());
    }
    #[test]
    fn wide_store_uses_bounded_descriptors() {
        const CHILD: &str = "DISKCARE_TEST_LOW_FD_CHILD";
        if std::env::var_os(CHILD).is_none() {
            let result = Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "core::model_storage::tests::wide_store_uses_bounded_descriptors",
                    "--nocapture",
                ])
                .env(CHILD, "1")
                .output()
                .unwrap();
            assert!(
                result.status.success(),
                "低额度子进程失败：{}{}",
                String::from_utf8_lossy(&result.stdout),
                String::from_utf8_lossy(&result.stderr)
            );
            return;
        }
        let f = Fixture::new();
        let digest = f.blob('a');
        for i in 0..200 {
            f.manifest(&format!("model-{i}"), std::slice::from_ref(&digest));
        }
        let mut limit = libc::rlimit {
            rlim_cur: 0,
            rlim_max: 0,
        };
        unsafe {
            assert_eq!(libc::getrlimit(libc::RLIMIT_NOFILE, &mut limit), 0);
        }
        limit.rlim_cur = limit.rlim_cur.min(64);
        unsafe {
            assert_eq!(libc::setrlimit(libc::RLIMIT_NOFILE, &limit), 0);
        }
        let r = f.scan();
        assert!(r.complete, "{:?}", r.issues);
        assert_eq!(r.models.len(), 200);
        assert_eq!(r.blocks.len(), 1);
        assert!(r.models.iter().all(|m| m.exclusive_bytes == Some(0)));
    }
    #[test]
    #[ignore = "仅手动执行：只读检查当前用户默认模型仓库"]
    fn manual_default_store_readonly() {
        let home = PathBuf::from(std::env::var_os("HOME").unwrap());
        let r = scan(
            &home,
            &AtomicBool::new(false),
            Instant::now() + Duration::from_secs(5),
            &|_| {},
        );
        assert!(r.complete || r.models.iter().all(|m| m.exclusive_bytes.is_none()));
        eprintln!(
            "默认仓库只读检查：状态 {}，模型 {}，文件块 {}，去重分配 {}，逻辑 {}，问题 {}",
            r.status,
            r.models.len(),
            r.blocks.len(),
            r.allocated_bytes,
            r.logical_bytes,
            r.issues.len()
        );
        let output = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("output/model-storage");
        fs::create_dir_all(&output).unwrap();
        fs::write(
            output.join("live-report.json"),
            serde_json::to_vec_pretty(&r).unwrap(),
        )
        .unwrap();
    }
}
