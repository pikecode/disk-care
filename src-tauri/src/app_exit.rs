use super::*;
use app_residue::app_identity;
use app_uninstall::{identity, protect, snapshot, Identity, Snapshot};
use std::sync::atomic::AtomicU64;

static NEXT_EXIT_TOKEN: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AppExitProcess {
    pub pid: i32,
    pub name: String,
    pub executable: String,
    #[serde(skip_serializing)]
    started: f64,
    #[serde(skip_serializing)]
    executable_identity: Identity,
}
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppExitPreview {
    pub token: u64,
    pub name: String,
    pub path: String,
    pub bundle_id: String,
    pub expires_at: u64,
    pub allow_force: bool,
    pub processes: Vec<AppExitProcess>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppExitResult {
    pub remaining: Option<AppExitPreview>,
}
pub(super) struct AppExitPlan {
    preview: AppExitPreview,
    snapshot: Snapshot,
}

fn belongs_to_target(executable: &Path, target: &Path, pid: i32) -> bool {
    pid > 1 && pid != std::process::id() as i32 && executable.starts_with(target)
}

#[cfg(target_os = "macos")]
fn process_record(
    app: &objc2_app_kit::NSRunningApplication,
    target: &Path,
) -> Option<AppExitProcess> {
    if app.isTerminated() {
        return None;
    }
    let id = app.bundleIdentifier()?.to_string();
    if id.starts_with("com.apple.") || id == "local.diskcare.desktop" {
        return None;
    }
    let executable = fs::canonicalize(app.executableURL()?.path()?.to_string()).ok()?;
    let pid = app.processIdentifier();
    if !belongs_to_target(&executable, target, pid) {
        return None;
    }
    let started = app.launchDate()?.timeIntervalSince1970();
    if !started.is_finite() || started <= 0.0 {
        return None;
    }
    Some(AppExitProcess {
        pid,
        name: app.localizedName().map_or(id, |s| s.to_string()),
        executable: executable.to_str()?.into(),
        executable_identity: identity(&executable).ok()?,
        started,
    })
}
#[cfg(target_os = "macos")]
fn running_inside(target: &Path) -> Result<Vec<AppExitProcess>, String> {
    objc2::rc::autoreleasepool(|_| {
        let mut found = objc2_app_kit::NSWorkspace::sharedWorkspace()
            .runningApplications()
            .iter()
            .filter_map(|app| process_record(&app, target))
            .collect::<Vec<_>>();
        if found.len() > 32 {
            return Err("运行组件超过32项，请手动退出后重试".into());
        }
        found.sort_by_key(|p| p.pid);
        Ok(found)
    })
}
#[cfg(not(target_os = "macos"))]
fn running_inside(_: &Path) -> Result<Vec<AppExitProcess>, String> {
    Err("退出应用仅支持macOS".into())
}
fn validate_exit(
    preview: &AppExitPreview,
    token: u64,
    force: bool,
    time: u64,
) -> Result<(), String> {
    if preview.token != token || time >= preview.expires_at {
        return Err("退出预览已失效，请重新检查运行组件".into());
    }
    if force && !preview.allow_force {
        return Err("请先请求正常退出，等待后再确认强制退出".into());
    }
    Ok(())
}
impl Engine {
    fn new_exit_plan(
        &self,
        path: &str,
        id: &str,
        allow_force: bool,
    ) -> Result<Option<AppExitPreview>, String> {
        let target = Path::new(path);
        let before = snapshot(target)?;
        let app = app_identity(&self.home, target)?;
        if app.bundle_id != id {
            return Err("应用标识已变化，请重新读取应用列表".into());
        }
        protect(
            target,
            id,
            &std::env::current_exe().map_err(|e| e.to_string())?,
        )?;
        let processes = running_inside(target)?;
        if snapshot(target)? != before {
            return Err("应用身份已变化，请重新检查运行组件".into());
        }
        if processes.is_empty() {
            return Ok(None);
        }
        let preview = AppExitPreview {
            token: NEXT_EXIT_TOKEN.fetch_add(1, Ordering::SeqCst),
            name: app.name,
            path: path.into(),
            bundle_id: id.into(),
            expires_at: now() + 60_000,
            allow_force,
            processes,
        };
        *self.app_exit.lock().map_err(|_| "退出计划不可用")? = Some(AppExitPlan {
            preview: preview.clone(),
            snapshot: before,
        });
        Ok(Some(preview))
    }
    pub fn prepare_app_exit(
        &self,
        path: String,
        bundle_id: String,
    ) -> Result<AppExitPreview, String> {
        let _job = self.job()?;
        *self.app_exit.lock().map_err(|_| "退出计划不可用")? = None;
        *self.uninstall.lock().map_err(|_| "卸载计划不可用")? = None;
        self.new_exit_plan(&path, &bundle_id, false)?
            .ok_or("没有可安全退出的包内应用实例；请手动退出占用程序后重新预览卸载".into())
    }
    pub fn execute_app_exit(&self, token: u64, force: bool) -> Result<AppExitResult, String> {
        let _job = self.job()?;
        let plan = self
            .app_exit
            .lock()
            .map_err(|_| "退出计划不可用")?
            .take()
            .ok_or("请重新检查运行组件")?;
        validate_exit(&plan.preview, token, force, now())?;
        let path = Path::new(&plan.preview.path);
        let app = app_identity(&self.home, path)?;
        protect(
            path,
            &app.bundle_id,
            &std::env::current_exe().map_err(|e| e.to_string())?,
        )?;
        if app.bundle_id != plan.preview.bundle_id || snapshot(path)? != plan.snapshot {
            return Err("应用身份已变化，请重新检查运行组件".into());
        }
        self.cleaning.store(true, Ordering::SeqCst);
        let _cleaning = Job(&self.cleaning);
        // 令牌只授权预览中的实例；同PID启动时间或可执行文件变化时不得结束新实例。
        request_exit(&plan.preview.processes, path, force)?;
        let deadline = Instant::now() + Duration::from_secs(3);
        while Instant::now() < deadline {
            if running_inside(path)?.is_empty() {
                return Ok(AppExitResult { remaining: None });
            }
            thread::sleep(Duration::from_millis(100));
        }
        if snapshot(path)? != plan.snapshot {
            return Err("等待期间应用身份已变化，请重新检查运行组件".into());
        }
        Ok(AppExitResult {
            remaining: self.new_exit_plan(&plan.preview.path, &plan.preview.bundle_id, true)?,
        })
    }
}
#[cfg(target_os = "macos")]
fn request_exit(processes: &[AppExitProcess], target: &Path, force: bool) -> Result<(), String> {
    use objc2_app_kit::NSRunningApplication;
    objc2::rc::autoreleasepool(|_| {
        let mut verified = Vec::new();
        for expected in processes {
            if let Some(app) =
                NSRunningApplication::runningApplicationWithProcessIdentifier(expected.pid)
            {
                if app.isTerminated() {
                    continue;
                }
                if process_record(&app, target).as_ref() != Some(expected) {
                    return Err("运行组件身份已变化，请重新检查；没有继续结束其他进程".into());
                }
                verified.push((app, expected));
            }
        }
        for (app, expected) in verified {
            if app.isTerminated() {
                continue;
            }
            if process_record(&app, target).as_ref() != Some(expected) {
                return Err("运行组件身份已变化，请重新检查".into());
            }
            if force {
                app.forceTerminate();
            } else {
                app.terminate();
            }
        }
        Ok(())
    })
}
#[cfg(not(target_os = "macos"))]
fn request_exit(_: &[AppExitProcess], _: &Path, _: bool) -> Result<(), String> {
    Err("退出应用仅支持macOS".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn exit_targets_use_path_components_and_exclude_self() {
        let root = Path::new("/Applications/Example.app");
        assert!(belongs_to_target(
            &root.join("Contents/MacOS/main"),
            root,
            999
        ));
        assert!(belongs_to_target(
            &root.join("Contents/Library/LoginItems/Helper.app/Contents/MacOS/helper"),
            root,
            999
        ));
        for (path, pid) in [
            ("/Applications/Example.app-copy/main", 999),
            ("/Applications/Other.app/main", 999),
            ("/Applications/Example.app/main", 0),
            ("/Applications/Example.app/main", 1),
            ("/Applications/Example.app/main", std::process::id() as i32),
        ] {
            assert!(!belongs_to_target(Path::new(path), root, pid));
        }
    }
    #[test]
    fn exit_requires_current_token_and_normal_attempt_before_force() {
        let mut preview = AppExitPreview {
            token: 7,
            name: "测试".into(),
            path: "".into(),
            bundle_id: "".into(),
            expires_at: 100,
            allow_force: false,
            processes: vec![],
        };
        assert!(validate_exit(&preview, 7, false, 99).is_ok());
        assert!(validate_exit(&preview, 7, true, 99).is_err());
        assert!(validate_exit(&preview, 8, false, 99).is_err());
        assert!(validate_exit(&preview, 7, false, 100).is_err());
        preview.allow_force = true;
        assert!(validate_exit(&preview, 7, true, 99).is_ok());
        let engine = Engine::new(std::env::temp_dir());
        assert!(engine.execute_app_exit(7, true).is_err());
    }
    #[test]
    fn exit_rejects_replaced_bundle_and_consumes_the_plan() {
        let f = crate::core::tests::Fixture::new();
        let root = f.0.join("Applications/Exit.app");
        fs::create_dir_all(root.join("Contents")).unwrap();
        let info = root.join("Contents/Info.plist");
        fs::write(&info, r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.fixture.exit</string><key>CFBundleName</key><string>测试</string></dict></plist>"#).unwrap();
        let engine = Engine::new(f.0.clone());
        let preview = AppExitPreview {
            token: 91,
            name: "测试".into(),
            path: root.to_string_lossy().into(),
            bundle_id: "org.fixture.exit".into(),
            expires_at: now() + 60_000,
            allow_force: true,
            processes: vec![],
        };
        *engine.app_exit.lock().unwrap() = Some(AppExitPlan {
            preview,
            snapshot: snapshot(&root).unwrap(),
        });
        fs::write(&info, r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>org.fixture.exit</string><key>CFBundleName</key><string>已替换应用</string></dict></plist>"#).unwrap();
        assert!(engine
            .execute_app_exit(91, true)
            .err()
            .unwrap()
            .contains("身份已变化"));
        assert!(engine
            .execute_app_exit(91, true)
            .err()
            .unwrap()
            .contains("重新检查"));
    }
    #[test]
    fn exit_preparation_rejects_protected_apps_and_job_conflicts() {
        let f = crate::core::tests::Fixture::new();
        let root = f.0.join("Applications/System.app");
        fs::create_dir_all(root.join("Contents")).unwrap();
        fs::write(root.join("Contents/Info.plist"), r#"<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.apple.fixture</string></dict></plist>"#).unwrap();
        let engine = Engine::new(f.0.clone());
        assert!(engine
            .prepare_app_exit(root.to_string_lossy().into(), "com.apple.fixture".into())
            .err()
            .unwrap()
            .contains("系统应用"));
        let _job = engine.job().unwrap();
        assert!(engine.execute_app_exit(1, false).is_err());
        assert!(engine
            .prepare_app_exit(root.to_string_lossy().into(), "com.apple.fixture".into())
            .is_err());
    }
}
