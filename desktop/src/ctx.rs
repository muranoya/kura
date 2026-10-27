//! アプリ全体で共有する状態と、非同期処理を UI スレッドへ戻すためのヘルパー。

use std::cell::RefCell;
use std::future::Future;
use std::sync::{Arc, Mutex, OnceLock, PoisonError};

use slint::ComponentHandle;
use vault_core::api::VaultManager;
use zeroize::Zeroizing;

use crate::store::{keys, Store};
use crate::{paths, vault, AppWindow, Errors, SyncState};

/// スレッドをまたいで共有する状態
pub struct Shared {
    pub rt: tokio::runtime::Handle,
    pub vault: Arc<VaultManager>,
    pub store: Store,
    /// 復号済みの S3 設定 JSON（アンロック中のみ保持する）
    s3_config: Mutex<Option<Zeroizing<String>>>,
    /// オンボーディング中、マスターパスワードで暗号化して保存するまでの S3 設定
    pending_s3_config: Mutex<Option<Zeroizing<String>>>,
}

static SHARED: OnceLock<Shared> = OnceLock::new();
static APP: OnceLock<slint::Weak<AppWindow>> = OnceLock::new();

pub fn init(rt: tokio::runtime::Handle, app: &AppWindow) {
    let shared = Shared {
        rt,
        vault: Arc::new(VaultManager::new()),
        store: Store::open(paths::settings_file()),
        s3_config: Mutex::new(None),
        pending_s3_config: Mutex::new(None),
    };
    if SHARED.set(shared).is_err() || APP.set(app.as_weak()).is_err() {
        panic!("ctx::init called twice");
    }
}

pub fn shared() -> &'static Shared {
    SHARED.get().expect("ctx::init not called")
}

impl Shared {
    pub fn s3_config(&self) -> Option<Zeroizing<String>> {
        self.s3_config
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub fn set_s3_config(&self, config: Option<Zeroizing<String>>) {
        *self
            .s3_config
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = config;
    }

    pub fn pending_s3_config(&self) -> Option<Zeroizing<String>> {
        self.pending_s3_config
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }

    pub fn set_pending_s3_config(&self, config: Option<Zeroizing<String>>) {
        *self
            .pending_s3_config
            .lock()
            .unwrap_or_else(PoisonError::into_inner) = config;
    }
}

/// 引数なしの Slint コールバックから、アプリを受け取る関数を呼ぶハンドラを作る
pub fn handler(app: &AppWindow, f: fn(&AppWindow)) -> impl Fn() + 'static {
    let weak = app.as_weak();
    move || {
        if let Some(app) = weak.upgrade() {
            f(&app);
        }
    }
}

/// tokio 上で `fut` を実行し、完了後に UI スレッドで `done` を呼ぶ
pub fn run_async<T, F, D>(fut: F, done: D)
where
    T: Send + 'static,
    F: Future<Output = T> + Send + 'static,
    D: FnOnce(AppWindow, T) + Send + 'static,
{
    let weak = APP.get().expect("ctx::init not called").clone();
    shared().rt.spawn(async move {
        let result = fut.await;
        let _ = weak.upgrade_in_event_loop(move |app| done(app, result));
    });
}

/// Argon2 などの重い同期処理をブロッキングスレッドで実行し、完了後に UI スレッドで `done` を呼ぶ
pub fn run_blocking<T, F, D>(f: F, done: D)
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
    D: FnOnce(AppWindow, T) + Send + 'static,
{
    run_async(
        async move {
            tokio::task::spawn_blocking(f)
                .await
                .expect("blocking task panicked")
        },
        done,
    );
}

// ---------------------------------------------------------------------------
// エラーバー（旧 ErrorContext）
// ---------------------------------------------------------------------------

thread_local! {
    static ERRORS: RefCell<Vec<(String, String)>> = const { RefCell::new(Vec::new()) };
    static NEXT_ERROR_ID: RefCell<u64> = const { RefCell::new(0) };
}

/// エラーを追加する。同じ key のエラーがあれば置き換える
pub fn push_error(app: &AppWindow, message: impl Into<String>, key: Option<&str>) {
    let key = key.map(str::to_string).unwrap_or_else(|| {
        NEXT_ERROR_ID.with_borrow_mut(|id| {
            *id += 1;
            format!("error-{id}")
        })
    });
    let message = message.into();
    ERRORS.with_borrow_mut(|errors| {
        if let Some(existing) = errors.iter_mut().find(|(k, _)| *k == key) {
            existing.1 = message;
        } else {
            errors.push((key, message));
        }
    });
    refresh_errors(app);
}

pub fn dismiss_latest_error(app: &AppWindow) {
    ERRORS.with_borrow_mut(|errors| {
        errors.pop();
    });
    refresh_errors(app);
}

pub fn clear_errors(app: &AppWindow) {
    ERRORS.with_borrow_mut(Vec::clear);
    refresh_errors(app);
}

fn refresh_errors(app: &AppWindow) {
    let errors = app.global::<Errors>();
    ERRORS.with_borrow(|list| {
        errors.set_count(list.len() as i32);
        errors.set_latest(list.last().map(|(_, m)| m.as_str()).unwrap_or("").into());
    });
}

// ---------------------------------------------------------------------------
// 保存と同期
// ---------------------------------------------------------------------------

/// メモリ上の vault をローカルファイルへ書き出す
pub fn save_local() -> Result<(), String> {
    let bytes = shared().vault.api_get_vault_bytes()?;
    vault::write_vault_file(&bytes)
}

/// S3 設定がある場合だけ同期する。実際にデータが変わった場合は true を返す
pub async fn sync_if_configured() -> Result<bool, String> {
    let Some(config) = shared().s3_config() else {
        return Ok(false);
    };
    let result = vault::sync(&config).await?;
    if let Some(ts) = result.last_synced_at {
        shared().store.set(keys::LAST_SYNC_TIME, &ts)?;
    }
    Ok(result.synced)
}

/// 変更をローカルに保存し、バックグラウンドで同期する（失敗しても UI には出さない）
pub fn save_and_sync(app: &AppWindow) -> Result<(), String> {
    save_local()?;
    sync_in_background(app);
    Ok(())
}

pub fn sync_in_background(_app: &AppWindow) {
    run_async(sync_if_configured(), |app, result| match result {
        Ok(synced) => {
            refresh_sync_header(&app);
            if synced {
                crate::screens::notify_synced(&app);
            }
        }
        Err(e) => eprintln!("Background sync failed: {e}"),
    });
}

/// ヘッダーの同期ボタンと「n分前」表示を更新する
pub fn refresh_sync_header(app: &AppWindow) {
    let sync = app.global::<SyncState>();
    sync.set_has_config(shared().s3_config().is_some());
    let label = shared()
        .store
        .get::<i64>(keys::LAST_SYNC_TIME)
        .map(format_relative_time)
        .unwrap_or_default();
    sync.set_last_sync(label.into());
}

pub fn format_relative_time(unix_secs: i64) -> String {
    let now = chrono::Utc::now().timestamp();
    let diff_min = (now - unix_secs).div_euclid(60);
    if diff_min < 1 {
        return "たった今".into();
    }
    if diff_min < 60 {
        return format!("{diff_min}分前");
    }
    let hours = diff_min / 60;
    if hours < 24 {
        return format!("{hours}時間前");
    }
    format!("{}日前", hours / 24)
}

pub fn format_timestamp(ts: i64, with_seconds: bool) -> String {
    use chrono::TimeZone;
    let Some(dt) = chrono::Local.timestamp_opt(ts, 0).single() else {
        return String::new();
    };
    if with_seconds {
        dt.format("%Y/%m/%d %H:%M:%S").to_string()
    } else {
        dt.format("%Y/%m/%d %H:%M").to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn relative_time_buckets() {
        let now = chrono::Utc::now().timestamp();
        assert_eq!(format_relative_time(now), "たった今");
        assert_eq!(format_relative_time(now - 5 * 60), "5分前");
        assert_eq!(format_relative_time(now - 3 * 3600), "3時間前");
        assert_eq!(format_relative_time(now - 2 * 86400), "2日前");
    }
}
