mod core;
use core::{Disk, Engine, Listing, Plan, ProjectReport, Record, Scan};
use std::{
    path::PathBuf,
    sync::{atomic::Ordering, Arc},
};
use tauri::{Emitter, Manager, State};

#[tauri::command]
fn disk_info(engine: State<'_, Arc<Engine>>) -> Result<Disk, String> {
    engine.disk()
}
#[tauri::command]
fn cancel_scan(engine: State<'_, Arc<Engine>>) {
    engine.cancel.store(true, Ordering::SeqCst);
}
#[tauri::command]
async fn scan_disk(
    extended: Option<bool>,
    app: tauri::AppHandle,
    engine: State<'_, Arc<Engine>>,
) -> Result<Scan, String> {
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        engine.scan(extended.unwrap_or(false), |p| {
            let _ = app.emit("scan-progress", p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn list_children(
    id: String,
    relative: String,
    offset: usize,
    app: tauri::AppHandle,
    engine: State<'_, Arc<Engine>>,
) -> Result<Listing, String> {
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        engine.children(&id, &relative, offset, |p| {
            let _ = app.emit("browse-progress", p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn prepare_cleanup(
    scan_id: u64,
    ids: Vec<String>,
    engine: State<'_, Arc<Engine>>,
) -> Result<Plan, String> {
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || engine.prepare(scan_id, ids))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn execute_cleanup(
    token: u64,
    app: tauri::AppHandle,
    engine: State<'_, Arc<Engine>>,
) -> Result<Record, String> {
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        engine.clean(token, |p| {
            let _ = app.emit("clean-progress", p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
async fn protect_uv_cache(protected: bool, engine: State<'_, Arc<Engine>>) -> Result<(), String> {
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || engine.protect_uv(protected))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn cleanup_history(engine: State<'_, Arc<Engine>>) -> Result<Vec<Record>, String> {
    engine.history()
}

#[tauri::command]
async fn scan_projects(
    root: String,
    app: tauri::AppHandle,
    engine: State<'_, Arc<Engine>>,
) -> Result<ProjectReport, String> {
    let engine = engine.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        engine.projects(root, |p| {
            let _ = app.emit("project-progress", p);
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn open_privacy_settings() -> Result<(), String> {
    // shortcut: 系统接受深链不保证定位目标页，界面保留手动导航说明。
    if std::process::Command::new("/usr/bin/open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles")
        .status()
        .is_ok_and(|status| status.success())
    {
        return Ok(());
    }
    let status = std::process::Command::new("/usr/bin/open")
        .args(["-b", "com.apple.systempreferences"])
        .status()
        .map_err(|e| format!("无法打开系统设置：{e}"))?;
    if status.success() {
        Ok(())
    } else {
        Err("系统设置打开失败，请手动打开。".into())
    }
}

fn application_bundle(executable: &std::path::Path) -> Result<PathBuf, String> {
    let macos = executable.parent().ok_or("无法定位应用")?;
    let contents = macos.parent().ok_or("无法定位应用")?;
    let bundle = contents.parent().ok_or("无法定位应用")?;
    if macos.file_name().is_some_and(|name| name == "MacOS")
        && contents.file_name().is_some_and(|name| name == "Contents")
        && bundle
            .extension()
            .is_some_and(|extension| extension == "app")
    {
        Ok(bundle.to_path_buf())
    } else {
        Err("当前为开发模式或应用结构不完整，请使用打包后的留白.app 完成授权。".into())
    }
}

#[tauri::command]
fn reveal_current_app() -> Result<String, String> {
    let executable = std::env::current_exe().map_err(|e| format!("无法定位当前应用：{e}"))?;
    let bundle = application_bundle(&executable)?;
    let status = std::process::Command::new("/usr/bin/open")
        .arg("-R")
        .arg(&bundle)
        .status()
        .map_err(|e| format!("无法在 Finder 中定位应用：{e}"))?;
    if !status.success() {
        return Err("无法在 Finder 中定位应用，请手动选择当前使用的留白.app。".into());
    }
    Ok(bundle.to_string_lossy().into_owned())
}

pub fn run() {
    tauri::Builder::default()
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.state::<Arc<Engine>>().is_cleaning() {
                    api.prevent_close();
                }
            }
        })
        .setup(|app| {
            let home = std::env::var_os("HOME").ok_or("无法定位用户主目录")?;
            app.manage(Arc::new(Engine::new(PathBuf::from(home))));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_privacy_settings,
            reveal_current_app,
            disk_info,
            scan_disk,
            cancel_scan,
            list_children,
            prepare_cleanup,
            execute_cleanup,
            cleanup_history,
            protect_uv_cache,
            scan_projects
        ])
        .build(tauri::generate_context!())
        .expect("应用启动失败")
        .run(|app, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                if app.state::<Arc<Engine>>().is_cleaning() {
                    api.prevent_exit();
                }
            }
        });
}

#[cfg(test)]
mod permission_tests {
    use super::*;
    #[test]
    fn bundle_path_uses_only_packaged_executable_structure() {
        for path in ["/Applications/留白.app", "/Users/test/space dir/留白.app"] {
            let bundle = PathBuf::from(path);
            assert_eq!(
                application_bundle(&bundle.join("Contents/MacOS/disk-care")).unwrap(),
                bundle
            );
        }
        for path in [
            "/tmp/target/debug/disk-care",
            "/tmp/fake.app/disk-care",
            "/tmp/fake/Contents/MacOS/disk-care",
        ] {
            assert!(application_bundle(std::path::Path::new(path)).is_err());
        }
    }
}
