use super::*;
use std::os::unix::fs::OpenOptionsExt;
use std::sync::atomic::AtomicU64;

static NEXT_ACTIVITY: AtomicU64 = AtomicU64::new(1);
pub(super) fn session_id() -> String {
    format!(
        "{}-{}-{}",
        std::process::id(),
        now(),
        NEXT_ACTIVITY.fetch_add(1, Ordering::SeqCst)
    )
}
const LIMIT: usize = 100;
const MAX_BYTES: u64 = 131_072;

#[derive(Clone, Copy, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanOrigin {
    Cleanup,
    Result,
    History,
    #[default]
    Unknown,
}
#[derive(Clone, Copy, Serialize, Deserialize, PartialEq, Debug)]
#[serde(rename_all = "snake_case")]
pub enum ActivityStatus {
    Received,
    Returned,
    Cancelled,
    Failed,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanActivityEntry {
    id: String,
    session_id: String,
    app_version: String,
    received_at: u64,
    finished_at: Option<u64>,
    duration_ms: Option<u64>,
    origin: ScanOrigin,
    extended: bool,
    requested_roots: Option<usize>,
    status: ActivityStatus,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanActivity {
    session_id: String,
    app_version: String,
    records: Vec<ScanActivityEntry>,
}
impl Engine {
    fn activity_file_lock(&self) -> Result<fs::File, String> {
        use std::os::fd::AsRawFd;
        let path = self.history_path.with_file_name("scan-activity.lock");
        let parent = path.parent().ok_or("扫描活动目录不可用")?;
        checked_path(&self.home, parent)?;
        fs::create_dir_all(parent).map_err(|_| "扫描活动目录无法创建")?;
        checked_path(&self.home, &path)?;
        let file = fs::OpenOptions::new()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .mode(0o600)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)
            .map_err(|_| "扫描活动文件锁不可用")?;
        let metadata = file.metadata().map_err(|_| "扫描活动文件锁属性不可读")?;
        if !metadata.is_file() || metadata.nlink() != 1 {
            return Err("扫描活动文件锁不是独立普通文件".into());
        }
        // 文件锁可短暂随并行子进程继承；有界重试仍避免诊断无限阻塞扫描。
        let start = Instant::now();
        loop {
            if unsafe { libc::flock(file.as_raw_fd(), libc::LOCK_EX | libc::LOCK_NB) } == 0 {
                break;
            }
            let error = std::io::Error::last_os_error();
            if !matches!(error.raw_os_error(), Some(libc::EWOULDBLOCK | libc::EINTR))
                || start.elapsed() >= Duration::from_millis(200)
            {
                return Err("扫描活动记录暂时无法锁定，请稍后重试".into());
            }
            thread::sleep(Duration::from_millis(5));
        }
        Ok(file)
    }
    fn read_activity(&self) -> Result<Vec<ScanActivityEntry>, String> {
        let path = self.history_path.with_file_name("scan-activity.json");
        checked_path(&self.home, &path)?;
        let file = match fs::OpenOptions::new()
            .read(true)
            .custom_flags(libc::O_NOFOLLOW | libc::O_NONBLOCK)
            .open(path)
        {
            Ok(file) => file,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(_) => return Err("扫描活动记录无法读取".into()),
        };
        let metadata = file.metadata().map_err(|_| "扫描活动属性不可读")?;
        if !metadata.is_file() || metadata.nlink() != 1 {
            return Err("扫描活动记录不是独立普通文件".into());
        }
        let mut data = Vec::new();
        file.take(MAX_BYTES + 1)
            .read_to_end(&mut data)
            .map_err(|_| "扫描活动读取失败")?;
        if data.len() as u64 > MAX_BYTES {
            return Err("扫描活动记录超过读取上限".into());
        }
        let records: Vec<ScanActivityEntry> =
            serde_json::from_slice(&data).map_err(|_| "扫描活动记录损坏，原文件已保留")?;
        if records.len() > LIMIT {
            return Err("扫描活动记录条数超过上限".into());
        }
        Ok(records)
    }
    fn save_activity(&self, entry: &ScanActivityEntry) -> Result<(), String> {
        let _guard = self.activity_lock.lock().map_err(|_| "扫描活动锁不可用")?;
        let _file_lock = self.activity_file_lock()?;
        let mut records = self.read_activity()?;
        if let Some(existing) = records.iter_mut().find(|r| r.id == entry.id) {
            *existing = entry.clone();
        } else {
            records.insert(0, entry.clone());
            records.truncate(LIMIT);
        }
        let data = serde_json::to_vec(&records).map_err(|_| "扫描活动序列化失败")?;
        if data.len() as u64 > MAX_BYTES {
            return Err("扫描活动记录超过保存上限".into());
        }
        let path = self.history_path.with_file_name("scan-activity.json");
        let parent = path.parent().ok_or("扫描活动目录不可用")?;
        checked_path(&self.home, parent)?;
        fs::create_dir_all(parent).map_err(|_| "扫描活动目录无法创建")?;
        checked_path(&self.home, &path)?;
        let temporary = parent.join(format!(
            "activity-{}-{}.pending",
            entry.id,
            NEXT_ACTIVITY.fetch_add(1, Ordering::SeqCst)
        ));
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(&temporary)
            .map_err(|_| "扫描活动临时文件无法创建")?;
        let saved = (|| {
            file.write_all(&data).map_err(|_| "扫描活动写入失败")?;
            file.sync_all().map_err(|_| "扫描活动同步失败")?;
            checked_path(&self.home, &path)?;
            fs::rename(&temporary, path).map_err(|_| "扫描活动保存失败".to_string())
        })();
        if saved.is_err() {
            let _ = fs::remove_file(temporary);
        }
        saved
    }
    pub fn scan_activity(&self) -> Result<ScanActivity, String> {
        let _guard = self.activity_lock.lock().map_err(|_| "扫描活动锁不可用")?;
        let _file_lock = self.activity_file_lock()?;
        Ok(ScanActivity {
            session_id: self.activity_session.clone(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            records: self.read_activity()?,
        })
    }
    pub fn scan_with_origin(
        &self,
        extended: bool,
        roots: Option<Vec<String>>,
        origin: ScanOrigin,
        progress: impl Fn(Progress),
    ) -> Result<Scan, String> {
        self.with_activity(origin, extended, roots.as_ref().map(Vec::len), || {
            self.scan(extended, roots, progress)
        })
    }
    fn with_activity(
        &self,
        origin: ScanOrigin,
        extended: bool,
        requested_roots: Option<usize>,
        action: impl FnOnce() -> Result<Scan, String>,
    ) -> Result<Scan, String> {
        let mut entry = ScanActivityEntry {
            id: format!(
                "{}-{}",
                self.activity_session,
                NEXT_ACTIVITY.fetch_add(1, Ordering::SeqCst)
            ),
            session_id: self.activity_session.clone(),
            app_version: env!("CARGO_PKG_VERSION").into(),
            received_at: now(),
            finished_at: None,
            duration_ms: None,
            origin,
            extended,
            requested_roots,
            status: ActivityStatus::Received,
        };
        let start = Instant::now();
        let started = self.save_activity(&entry).is_ok();
        let mut result = action();
        entry.finished_at = Some(now());
        entry.duration_ms = Some(start.elapsed().as_millis() as u64);
        entry.status = match &result {
            Ok(scan) if scan.cancelled => ActivityStatus::Cancelled,
            Ok(_) => ActivityStatus::Returned,
            Err(_) => ActivityStatus::Failed,
        };
        let warning = if !started {
            Some("扫描来源未能持久保存，本次操作记录可能缺失；不能据此判断没有发生扫描".to_string())
        } else if self.save_activity(&entry).is_err() {
            Some("扫描结束状态未能保存；记录中的未结束状态不代表仍在扫描".to_string())
        } else {
            None
        };
        match &mut result {
            Ok(scan) => {
                scan.activity = Some(entry);
                scan.activity_warning = warning;
            }
            Err(message) => {
                if let Some(warning) = warning {
                    *message = format!("{message}；{warning}");
                }
            }
        }
        result
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::Fixture;
    use super::*;
    fn scan(engine: &Engine, cancelled: bool) -> Scan {
        Scan {
            extended: false,
            id: now(),
            disk: engine.disk().unwrap(),
            items: vec![],
            roots: vec![],
            duration_ms: 0,
            cancelled,
            timings: vec![],
            activity: None,
            activity_warning: None,
        }
    }
    #[test]
    fn activity_records_received_and_end_without_private_content() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        assert!(engine.scan_activity().unwrap().records.is_empty());
        let result = engine
            .with_activity(ScanOrigin::History, true, Some(2), || {
                let restarted = Engine::new(f.0.clone());
                let records = restarted.scan_activity().unwrap().records;
                assert_eq!(records.len(), 1);
                assert_eq!(records[0].status, ActivityStatus::Received);
                Ok(scan(&engine, false))
            })
            .unwrap();
        assert!(result.activity_warning.is_none());
        let journal = engine.scan_activity().unwrap();
        assert_eq!(journal.records.len(), 1);
        assert_eq!(journal.records[0].status, ActivityStatus::Returned);
        assert!(journal.records[0].finished_at.is_some());
        let json = serde_json::to_string(&journal).unwrap();
        assert!(!json.contains(&f.0.to_string_lossy().to_string()));
        for field in ["path", "command", "message", "rootIds", "credentials"] {
            assert!(!json.contains(field));
        }
        let path = engine.history_path.with_file_name("scan-activity.json");
        assert_eq!(fs::metadata(path).unwrap().mode() & 0o777, 0o600);
        let error = engine.with_activity(ScanOrigin::Unknown, false, None, || {
            Err("/private/test-credential-contents".into())
        });
        assert!(matches!(error, Err(message) if message.contains("test-credential")));
        assert!(!serde_json::to_string(&engine.scan_activity().unwrap())
            .unwrap()
            .contains("test-credential"));
    }
    #[test]
    fn activity_cancellation_failure_and_restart_remain_distinct() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        engine
            .with_activity(ScanOrigin::Cleanup, false, None, || Ok(scan(&engine, true)))
            .unwrap();
        let failure = engine.scan_with_origin(
            true,
            Some(vec!["invalid-root".into()]),
            ScanOrigin::Result,
            |_| {},
        );
        assert!(failure.is_err());
        let restarted = Engine::new(f.0.clone());
        let records = restarted.scan_activity().unwrap().records;
        assert_eq!(records[0].status, ActivityStatus::Failed);
        assert_eq!(records[1].status, ActivityStatus::Cancelled);
        assert_ne!(records[0].id, records[1].id);
        assert_ne!(restarted.activity_session, engine.activity_session);
        assert!(serde_json::from_str::<ScanOrigin>("\"/private/path\"").is_err());
    }
    #[test]
    fn activity_preserves_corruption_and_links_without_blocking_readonly_work() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let path = engine.history_path.with_file_name("scan-activity.json");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "损坏").unwrap();
        let result = engine
            .with_activity(ScanOrigin::Unknown, false, None, || {
                Ok(scan(&engine, false))
            })
            .unwrap();
        assert!(result.activity_warning.is_some());
        assert_eq!(fs::read_to_string(&path).unwrap(), "损坏");
        assert!(engine.scan_activity().is_err());
        fs::remove_file(&path).unwrap();
        let outside = f.0.join("outside");
        fs::write(&outside, "保留").unwrap();
        std::os::unix::fs::symlink(&outside, &path).unwrap();
        assert!(engine.scan_activity().is_err());
        let _ = engine
            .with_activity(ScanOrigin::Unknown, false, None, || {
                Ok(scan(&engine, false))
            })
            .unwrap();
        assert_eq!(fs::read_to_string(&outside).unwrap(), "保留");
        fs::remove_file(&path).unwrap();
        fs::hard_link(&outside, &path).unwrap();
        assert!(matches!(engine.scan_activity(), Err(message) if message.contains("独立普通文件")));
    }
    #[test]
    fn activity_locks_competing_instances_and_warns_on_finish_failure() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        let other = Engine::new(f.0.clone());
        let lock = engine.activity_file_lock().unwrap();
        assert!(other.scan_activity().is_err());
        let result = other
            .with_activity(ScanOrigin::Cleanup, false, None, || Ok(scan(&other, false)))
            .unwrap();
        assert!(result.activity_warning.is_some());
        drop(lock);
        let result = engine
            .with_activity(ScanOrigin::Cleanup, false, None, || {
                fs::write(
                    engine.history_path.with_file_name("scan-activity.json"),
                    "结束前损坏",
                )
                .unwrap();
                Ok(scan(&engine, false))
            })
            .unwrap();
        assert!(result.activity_warning.unwrap().contains("结束状态"));
        assert_eq!(
            fs::read_to_string(engine.history_path.with_file_name("scan-activity.json")).unwrap(),
            "结束前损坏"
        );
    }
    #[test]
    fn activity_retention_and_read_limits_are_bounded() {
        let f = Fixture::new();
        let engine = Engine::new(f.0.clone());
        for _ in 0..101 {
            let result = engine
                .with_activity(ScanOrigin::Unknown, false, None, || {
                    Ok(scan(&engine, false))
                })
                .unwrap();
            assert!(
                result.activity_warning.is_none(),
                "{:?}",
                result.activity_warning
            );
        }
        assert_eq!(engine.scan_activity().unwrap().records.len(), 100);
        let path = engine.history_path.with_file_name("scan-activity.json");
        fs::write(&path, vec![b' '; MAX_BYTES as usize + 1]).unwrap();
        assert!(engine.scan_activity().is_err());
    }
}
