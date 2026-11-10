use super::*;
use app_residue::{app_identity, before_snapshot, safe_path, AssociationSnapshot};
use std::sync::atomic::AtomicU64;

static NEXT_TOKEN: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallPreview {
    pub token: u64,
    pub name: String,
    pub path: String,
    pub bundle_id: String,
    pub expires_at: u64,
    pub before: Option<AssociationSnapshot>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallResult {
    pub name: String,
    pub path: String,
    pub bundle_id: String,
    pub trash_path: Option<String>,
    pub warning: Option<String>,
    pub at: u64,
    pub before: Option<AssociationSnapshot>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallRecord {
    pub at: u64,
    pub name: String,
    pub path: String,
    pub bundle_id: String,
    pub success: bool,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub before: Option<AssociationSnapshot>,
}
#[derive(Clone, Debug, PartialEq)]
pub(super) struct Identity {
    dev: u64,
    ino: u64,
    mode: u32,
    size: u64,
    modified: (i64, i64),
    changed: (i64, i64),
}
pub(super) fn identity(path: &Path) -> Result<Identity, String> {
    let m = fs::symlink_metadata(path).map_err(|e| e.to_string())?;
    Ok(Identity {
        dev: m.dev(),
        ino: m.ino(),
        mode: m.mode(),
        size: m.len(),
        modified: (m.mtime(), m.mtime_nsec()),
        changed: (m.ctime(), m.ctime_nsec()),
    })
}
#[derive(Debug, PartialEq)]
pub(super) struct Snapshot {
    app: Identity,
    info: Identity,
    parents: Vec<(u64, u64)>,
    reference: String,
}
pub(super) fn snapshot(path: &Path) -> Result<Snapshot, String> {
    safe_path(path)?;
    let info = path.join("Contents/Info.plist");
    safe_path(&info)?;
    if !fs::symlink_metadata(path)
        .map_err(|e| e.to_string())?
        .is_dir()
    {
        return Err("目标不是应用目录".into());
    }
    let parents = path
        .ancestors()
        .skip(1)
        .map(|p| {
            let m = fs::symlink_metadata(p).map_err(|e| e.to_string())?;
            Ok((m.dev(), m.ino()))
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(Snapshot {
        app: identity(path)?,
        info: identity(&info)?,
        parents,
        reference: file_reference(path)?,
    })
}
pub(super) struct UninstallPlan {
    preview: UninstallPreview,
    snapshot: Snapshot,
}
pub(super) fn protect(path: &Path, id: &str, executable: &Path) -> Result<(), String> {
    if id.to_ascii_lowercase().starts_with("com.apple.")
        || id == "local.diskcare.desktop"
        || executable.starts_with(path)
    {
        return Err("不支持卸载系统应用或留白自身".into());
    }
    // 分类目录不能是另一个应用包，避免把内嵌应用当成独立安装。
    if path
        .parent()
        .is_some_and(|p| p.extension().is_some_and(|e| e == "app"))
    {
        return Err("不支持卸载内嵌应用".into());
    }
    Ok(())
}
fn check_bundle_use(status: Option<i32>, stdout: &str, stderr: &str) -> Result<(), String> {
    if status == Some(1) && stdout.is_empty() && stderr.is_empty() {
        return Ok(());
    }
    if !matches!(status, Some(0 | 1)) || !stderr.is_empty() || stdout.is_empty() {
        return Err("无法完整检查应用文件占用，暂不卸载，请稍后重试".into());
    }
    Err("应用或包内辅助进程正在运行，或应用文件仍被占用，请正常退出关联程序后重试".into())
}
#[cfg(target_os = "macos")]
fn check_running(path: &Path, bundle_id: &str) -> Result<(), String> {
    use objc2_app_kit::NSRunningApplication;
    use objc2_foundation::NSString;
    let running = objc2::rc::autoreleasepool(|_| {
        !NSRunningApplication::runningApplicationsWithBundleIdentifier(&NSString::from_str(
            bundle_id,
        ))
        .is_empty()
    });
    if running {
        return Err("此应用标识有正在运行的副本，请正常退出后重试".into());
    }
    // 只查询目标包内文件引用，避免无关进程的路径读取失败阻断卸载。
    let mut command = Command::new("/usr/sbin/lsof");
    command.args(["-nP", "-F", "p", "+D"]).arg(path);
    let (status, stdout, stderr) = run_command_output(command, Duration::from_secs(5))
        .map_err(|_| "应用文件占用检查未完成，暂不卸载，请稍后重试")?;
    check_bundle_use(status.code(), &stdout, &stderr)
}
#[cfg(not(target_os = "macos"))]
fn check_running(_: &Path, _: &str) -> Result<(), String> {
    Err("卸载仅支持 macOS".into())
}
impl Engine {
    pub fn uninstall_history(&self) -> Result<Vec<UninstallRecord>, String> {
        let path = self
            .history_path
            .with_file_name("app-uninstall-history.json");
        checked_path(&self.home, &path)?;
        let mut file = match fs::File::open(&path) {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(e) => return Err(e.to_string()),
        };
        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take(1_048_577)
            .read_to_end(&mut bytes)
            .map_err(|e| e.to_string())?;
        if bytes.len() > 1_048_576 {
            return Err("卸载历史超过读取上限".into());
        }
        let history: Vec<UninstallRecord> =
            serde_json::from_slice(&bytes).map_err(|_| "卸载历史损坏，原文件已保留")?;
        if history.len() > 100 {
            return Err("卸载历史条数超过上限".into());
        }
        Ok(history)
    }
    fn save_uninstall_record(&self, record: UninstallRecord) -> Result<(), String> {
        let mut history = self.uninstall_history()?;
        history.insert(0, record);
        history.truncate(100);
        let path = self
            .history_path
            .with_file_name("app-uninstall-history.json");
        let parent = path.parent().ok_or("历史路径不可用")?;
        checked_path(&self.home, parent)?;
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        checked_path(&self.home, &path)?;
        let data = serde_json::to_vec(&history).map_err(|e| e.to_string())?;
        if data.len() > 1_048_576 {
            return Err("卸载历史超过保存上限，原记录保留".into());
        }
        let temporary = parent.join(format!("uninstall-{}.pending", now()));
        use std::os::unix::fs::OpenOptionsExt;
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|e| e.to_string())?;
        file.write_all(&data).map_err(|e| e.to_string())?;
        file.sync_all().map_err(|e| e.to_string())?;
        fs::rename(temporary, path).map_err(|e| e.to_string())
    }
    pub fn prepare_uninstall(
        &self,
        path: String,
        expected_bundle_id: String,
    ) -> Result<UninstallPreview, String> {
        let _job = self.job()?;
        *self.uninstall.lock().map_err(|_| "卸载计划不可用")? = None;
        let path = Path::new(&path);
        let before = snapshot(path)?;
        let app = app_identity(&self.home, path)?;
        if app.bundle_id != expected_bundle_id {
            return Err("应用标识已变化，请重新读取应用列表".into());
        }
        protect(
            path,
            &app.bundle_id,
            &std::env::current_exe().map_err(|e| e.to_string())?,
        )?;
        check_running(path, &app.bundle_id)?;
        if snapshot(path)? != before {
            return Err("应用已变化，请重新预览".into());
        }
        let preview = UninstallPreview {
            token: NEXT_TOKEN.fetch_add(1, Ordering::SeqCst),
            name: app.name,
            path: app.path.clone(),
            bundle_id: app.bundle_id.clone(),
            expires_at: now() + 60_000,
            before: self
                .residue
                .lock()
                .map_err(|_| "报告状态不可用")?
                .as_ref()
                .and_then(|r| before_snapshot(r, &app.path, &app.bundle_id, now())),
        };
        *self.uninstall.lock().map_err(|_| "卸载计划不可用")? = Some(UninstallPlan {
            preview: preview.clone(),
            snapshot: before,
        });
        Ok(preview)
    }
    pub fn execute_uninstall(&self, token: u64) -> Result<UninstallResult, String> {
        self.execute_uninstall_with(token, trash_app)
    }
    fn execute_uninstall_with(
        &self,
        token: u64,
        trash: impl FnOnce(&Path, &Snapshot) -> Result<Option<String>, String>,
    ) -> Result<UninstallResult, String> {
        let _job = self.job()?;
        let plan = self
            .uninstall
            .lock()
            .map_err(|_| "卸载计划不可用")?
            .take()
            .ok_or("请重新预览卸载")?;
        validate_token(&plan.preview, token, now())?;
        self.cleaning.store(true, Ordering::SeqCst);
        let _cleaning = Job(&self.cleaning);
        let result: Result<UninstallResult, String> = (|| {
            let path = Path::new(&plan.preview.path);
            let app = app_identity(&self.home, path)?;
            protect(
                path,
                &app.bundle_id,
                &std::env::current_exe().map_err(|e| e.to_string())?,
            )?;
            if app.bundle_id != plan.preview.bundle_id || snapshot(path)? != plan.snapshot {
                return Err("应用或目录身份已变化，请重新预览卸载".into());
            }
            check_running(path, &app.bundle_id)?;
            let trash_path = trash(path, &plan.snapshot)?;
            Ok(UninstallResult {
                name: app.name,
                path: app.path,
                bundle_id: app.bundle_id,
                trash_path,
                warning: None,
                at: now(),
                before: plan.preview.before.clone(),
            })
        })();
        let record = UninstallRecord {
            at: result.as_ref().map_or_else(|_| now(), |r| r.at),
            before: plan.preview.before.clone(),
            name: plan.preview.name.clone(),
            path: plan.preview.path.clone(),
            bundle_id: plan.preview.bundle_id.clone(),
            success: result.is_ok(),
            message: match &result {
                Ok(_) => "应用包已移到废纸篓；关联数据保留".into(),
                Err(e) => e.clone(),
            },
        };
        match (result, self.save_uninstall_record(record)) {
            (Ok(mut outcome), Err(error)) => {
                outcome.warning = Some(format!("应用已移到废纸篓，但历史保存失败：{error}"));
                Ok(outcome)
            }
            (Err(error), Err(history_error)) => {
                Err(format!("{error}；历史保存失败：{history_error}"))
            }
            (result, _) => result,
        }
    }
}
fn validate_token(preview: &UninstallPreview, token: u64, time: u64) -> Result<(), String> {
    if preview.token != token || time >= preview.expires_at {
        return Err("卸载预览已失效，请重新预览并确认".into());
    }
    Ok(())
}
#[cfg(target_os = "macos")]
fn file_reference(path: &Path) -> Result<String, String> {
    use objc2_foundation::{NSString, NSURL};
    objc2::rc::autoreleasepool(|_| {
        NSURL::fileURLWithPath_isDirectory(
            &NSString::from_str(path.to_str().ok_or("应用路径编码不支持")?),
            true,
        )
        .fileReferenceURL()
        .and_then(|u| u.absoluteString())
        .map(|s| s.to_string())
        .ok_or("无法绑定应用文件身份".into())
    })
}
#[cfg(not(target_os = "macos"))]
fn file_reference(_: &Path) -> Result<String, String> {
    Err("卸载仅支持 macOS".into())
}
#[cfg(target_os = "macos")]
fn trash_app(path: &Path, expected: &Snapshot) -> Result<Option<String>, String> {
    use objc2_foundation::{NSFileManager, NSString, NSURL};
    objc2::rc::autoreleasepool(|_| {
        let path_text = path.to_str().ok_or("应用路径编码不支持")?;
        let url = NSURL::fileURLWithPath_isDirectory(&NSString::from_str(path_text), true);
        // 文件引用绑定文件身份，避免复核后路径被替换时移动另一个应用。
        let reference = url.fileReferenceURL().ok_or("无法绑定应用文件身份")?;
        let resolved = reference
            .filePathURL()
            .and_then(|u| u.path())
            .ok_or("无法复核应用位置")?;
        if reference
            .absoluteString()
            .is_none_or(|s| s.to_string() != expected.reference)
            || resolved.to_string() != path_text
            || snapshot(path)? != *expected
        {
            return Err("应用位置或身份已变化，请重新预览".into());
        }
        let mut destination = None;
        NSFileManager::defaultManager()
            .trashItemAtURL_resultingItemURL_error(&reference, Some(&mut destination))
            .map_err(|e| {
                format!(
                    "无法移到废纸篓：{}。请检查应用位置后重新预览；不会改用永久删除。",
                    e.localizedDescription()
                )
            })?;
        Ok(destination.and_then(|u| u.path()).map(|p| p.to_string()))
    })
}
#[cfg(not(target_os = "macos"))]
fn trash_app(_: &Path, _: &Snapshot) -> Result<Option<String>, String> {
    Err("卸载功能仅支持 macOS".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::tests::Fixture;
    fn app(home: &Path, name: &str, id: &str) -> PathBuf {
        let path = home.join("Applications").join(name);
        fs::create_dir_all(path.join("Contents")).unwrap();
        fs::write(path.join("Contents/Info.plist"), format!(r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>{id}</string><key>CFBundleName</key><string>卸载测试</string></dict></plist>"#)).unwrap();
        path
    }
    fn preview(engine: &Engine, path: &Path) -> UninstallPreview {
        engine
            .prepare_uninstall(
                path.to_string_lossy().into(),
                "org.fixture.uninstall".into(),
            )
            .unwrap()
    }
    #[test]
    fn uninstall_rejects_paths_identity_changes_and_protected_targets() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let p = app(&f.0, "Fixture.app", "org.fixture.uninstall");
        assert!(engine
            .prepare_uninstall(p.to_string_lossy().into(), "org.fixture.wrong".into())
            .is_err());
        assert!(engine
            .prepare_uninstall(
                "/System/Applications/Finder.app".into(),
                "com.apple.finder".into()
            )
            .is_err());
        let nested = app(&f.0, "Outer.app/Inner.app", "org.fixture.uninstall");
        assert!(engine
            .prepare_uninstall(
                nested.to_string_lossy().into(),
                "org.fixture.uninstall".into()
            )
            .is_err());
        for id in ["com.apple.test", "local.diskcare.desktop"] {
            let protected = app(&f.0, "Protected.app", id);
            assert!(engine
                .prepare_uninstall(protected.to_string_lossy().into(), id.into())
                .is_err());
        }
        assert!(protect(&p, "org.fixture.uninstall", &p.join("Contents/MacOS/test")).is_err());
        let plan = preview(&engine, &p);
        fs::write(p.join("Contents/Info.plist"), "changed").unwrap();
        assert!(engine
            .execute_uninstall_with(plan.token, |_, _| panic!("不可执行变化目标"))
            .is_err());
        let p = app(&f.0, "Fixture.app", "org.fixture.uninstall");
        let plan = preview(&engine, &p);
        let moved = f.0.join("original.app");
        fs::rename(&p, &moved).unwrap();
        app(&f.0, "Fixture.app", "org.fixture.uninstall");
        assert!(engine
            .execute_uninstall_with(plan.token, |_, _| panic!("不可执行替换目标"))
            .is_err());
        let link = f.0.join("Applications/Link.app");
        std::os::unix::fs::symlink(&moved, &link).unwrap();
        assert!(engine
            .prepare_uninstall(
                link.to_string_lossy().into(),
                "org.fixture.uninstall".into()
            )
            .is_err());
    }
    #[test]
    fn uninstall_tokens_are_expiring_single_use_and_fail_closed() {
        let f = Fixture::new();
        let p = app(&f.0, "Fixture.app", "org.fixture.uninstall");
        let engine = Engine::new(f.0.clone());
        assert!(engine
            .execute_uninstall_with(1, |_, _| panic!("无预览不可执行"))
            .is_err());
        let plan = preview(&engine, &p);
        assert!(validate_token(&plan, plan.token, plan.expires_at).is_err());
        assert!(engine
            .execute_uninstall_with(plan.token + 1, |_, _| panic!("错误令牌不可执行"))
            .is_err());
        assert!(engine
            .execute_uninstall_with(plan.token, |_, _| panic!("令牌已消耗"))
            .is_err());
        let plan = preview(&engine, &p);
        let result = engine.execute_uninstall_with(plan.token, |path, _| {
            assert!(engine.is_cleaning());
            assert_eq!(path, p);
            Err("合成：权限不足".into())
        });
        assert!(result.unwrap_err().contains("权限不足"));
        assert!(!engine.is_cleaning());
        assert!(p.exists());
        assert!(engine
            .execute_uninstall_with(plan.token, |_, _| panic!("失败后不可重放"))
            .is_err());
        let first = preview(&engine, &p);
        let second = preview(&engine, &p);
        assert_ne!(first.token, second.token);
        let outcome = engine
            .execute_uninstall_with(second.token, |_, _| Ok(Some("/fixture/trash".into())))
            .unwrap();
        assert_eq!(outcome.bundle_id, "org.fixture.uninstall");
        assert_eq!(outcome.trash_path.as_deref(), Some("/fixture/trash"));
        assert!(!engine.is_cleaning());
    }
    #[test]
    fn history_persists_failures_and_preserves_success_when_storage_fails() {
        let f = Fixture::new();
        let p = app(&f.0, "Fixture.app", "org.fixture.uninstall");
        let engine = Engine::new(f.0.clone());
        let plan = preview(&engine, &p);
        assert!(engine
            .execute_uninstall_with(plan.token, |_, _| Err("合成失败".into()))
            .is_err());
        let restarted = Engine::new(f.0.clone());
        let records = restarted.uninstall_history().unwrap();
        assert_eq!(records.len(), 1);
        assert!(!records[0].success);
        let plan = preview(&engine, &p);
        engine
            .execute_uninstall_with(plan.token, |_, _| Ok(None))
            .unwrap();
        assert!(restarted.uninstall_history().unwrap()[0].success);
        let history_path = engine
            .history_path
            .with_file_name("app-uninstall-history.json");
        fs::write(&history_path, "损坏资料").unwrap();
        assert!(engine.uninstall_history().is_err());
        let plan = preview(&engine, &p);
        let outcome = engine
            .execute_uninstall_with(plan.token, |_, _| Ok(None))
            .unwrap();
        assert!(outcome.warning.unwrap().contains("历史保存失败"));
        assert_eq!(fs::read_to_string(&history_path).unwrap(), "损坏资料");
        fs::remove_file(&history_path).unwrap();
        std::os::unix::fs::symlink("/etc/passwd", &history_path).unwrap();
        assert!(engine.uninstall_history().is_err());
    }
    #[test]
    fn uninstall_before_snapshot_survives_restart_without_locator_tokens() {
        let f = Fixture::new();
        let p = app(&f.0, "Before.app", "org.fixture.uninstall");
        let cache = f.0.join("Library/Caches/org.fixture.uninstall");
        fs::create_dir_all(&cache).unwrap();
        fs::write(cache.join("cache"), "metadata only").unwrap();
        let engine = Engine::new(f.0.clone());
        assert!(preview(&engine, &p).before.is_none());
        engine
            .inspect_installed_app(p.to_string_lossy().into(), "org.fixture.uninstall".into())
            .unwrap();
        let plan = preview(&engine, &p);
        assert_eq!(plan.before.as_ref().unwrap().sources.len(), 5);
        let outcome = engine
            .execute_uninstall_with(plan.token, |_, _| Ok(None))
            .unwrap();
        assert!(outcome.before.is_some());
        let restarted = Engine::new(f.0.clone());
        let records = restarted.uninstall_history().unwrap();
        assert!(records[0].before.as_ref().unwrap().sources[0].present);
        let json = serde_json::to_string(&records).unwrap();
        assert!(!json.contains("candidateId") && !json.contains("reportId"));
        let legacy: UninstallRecord = serde_json::from_str(r#"{"at":1,"name":"旧记录","path":"/Applications/Old.app","bundleId":"org.old.app","success":true,"message":"旧版本"}"#).unwrap();
        assert!(legacy.before.is_none());
    }
    #[test]
    fn uninstall_bundle_use_fails_closed_except_confirmed_absence() {
        assert!(check_bundle_use(Some(1), "", "").is_ok());
        for (status, out, err) in [
            (Some(0), "p12\nftext\n", ""),
            (Some(0), "", ""),
            (Some(0), "invalid", ""),
            (Some(0), "p12\n", "permission denied"),
            (Some(1), "p12\n", ""),
            (Some(1), "", "permission denied"),
            (Some(2), "", ""),
            (None, "", ""),
        ] {
            assert!(check_bundle_use(status, out, err).is_err());
        }
    }

    #[test]
    fn uninstall_rechecks_running_process_and_job_lock() {
        let f = Fixture::new();
        let p = app(&f.0, "Fixture.app", "org.fixture.uninstall");
        let engine = Engine::new(f.0.clone());
        let executable = p.join("Contents/sleep");
        let source = f.0.join("worker.c");
        fs::write(
            &source,
            "#include <unistd.h>\nint main(void) { write(1, \"R\", 1); sleep(10); return 0; }",
        )
        .unwrap();
        assert!(Command::new("/usr/bin/cc")
            .arg(&source)
            .arg("-o")
            .arg(&executable)
            .status()
            .unwrap()
            .success());
        let plan = preview(&engine, &p);
        let mut child = Command::new(&executable)
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        let mut ready = [0u8; 1];
        child.stdout.take().unwrap().read_exact(&mut ready).unwrap();
        assert_eq!(ready, [b'R']);
        assert!(
            child.try_wait().unwrap().is_none(),
            "测试辅助进程必须真实运行"
        );
        let result = engine.execute_uninstall_with(plan.token, |_, _| panic!("运行时不可卸载"));
        let preparation =
            engine.prepare_uninstall(p.to_string_lossy().into(), "org.fixture.uninstall".into());
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(result.unwrap_err().contains("正在运行"));
        assert!(preparation.is_err());
        // 无关且已删除可执行文件的进程不能阻断目标应用。
        let unrelated = f.0.join("unrelated-worker");
        assert!(Command::new("/usr/bin/cc")
            .arg(&source)
            .arg("-o")
            .arg(&unrelated)
            .status()
            .unwrap()
            .success());
        let mut child = Command::new(&unrelated)
            .stdout(Stdio::piped())
            .spawn()
            .unwrap();
        // 确认已进入main，避免启动尚未完成时移除文件导致夹具被系统终止。
        child.stdout.take().unwrap().read_exact(&mut ready).unwrap();
        assert_eq!(ready, [b'R']);
        fs::remove_file(&unrelated).unwrap();
        let unrelated_result =
            engine.prepare_uninstall(p.to_string_lossy().into(), "org.fixture.uninstall".into());
        let alive = child.try_wait().unwrap().is_none();
        child.kill().unwrap();
        child.wait().unwrap();
        assert!(alive, "无关测试进程必须真实运行");
        assert!(unrelated_result.is_ok());
        let _job = engine.job().unwrap();
        assert!(engine
            .prepare_uninstall(p.to_string_lossy().into(), "org.fixture.uninstall".into())
            .is_err());
    }
    #[test]
    #[ignore = "仅手动对临时合成应用验证系统废纸篓，不触碰已有应用"]
    fn native_trash_roundtrip_for_temporary_app_only() {
        let f = Fixture::new();
        let p = app(&f.0, "留白卸载测试.app", "org.fixture.uninstall");
        fs::write(p.join("fixture-marker"), "临时验证资料").unwrap();
        let engine = Engine::new(f.0.clone());
        let cache = f.0.join("Library/Caches/org.fixture.uninstall");
        fs::create_dir_all(&cache).unwrap();
        fs::write(cache.join("cache"), "保留的缓存").unwrap();
        engine
            .inspect_installed_app(p.to_string_lossy().into(), "org.fixture.uninstall".into())
            .unwrap();
        let plan = preview(&engine, &p);
        assert!(plan.before.is_some());
        let outcome = engine.execute_uninstall(plan.token).unwrap();
        assert!(outcome.before.is_some());
        let after = engine
            .inspect_bundle_residue("org.fixture.uninstall".into())
            .unwrap();
        assert_eq!(after.sources.len(), 5);
        assert_eq!(after.sources[0].candidates.len(), 1);
        assert!(engine.uninstall_history().unwrap()[0].before.is_some());
        assert!(!p.exists());
        let trash = PathBuf::from(outcome.trash_path.expect("系统应返回废纸篓路径"));
        assert_eq!(
            fs::read_to_string(trash.join("fixture-marker")).unwrap(),
            "临时验证资料"
        );
        fs::rename(&trash, &p).unwrap();
        assert!(p.exists());
    }
}
