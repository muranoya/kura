mod session;
mod entries;
mod labels;
mod security;
mod sync;
mod utils;

pub use session::*;
pub use entries::*;
pub use labels::*;
pub use security::*;
pub use sync::*;
pub use utils::*;

use crate::sync::engine::SessionState;
use once_cell::sync::Lazy;
use std::sync::Mutex;

/// エントリ行データ
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EntryRow {
    pub id: String,
    pub entry_type: String,
    pub name: String,
    pub is_favorite: bool,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

/// 詳細エントリデータ
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EntryDetail {
    pub id: String,
    pub entry_type: String,
    pub name: String,
    pub is_favorite: bool,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub notes: Option<String>,
    pub typed_value: String, // JSON文字列
    pub labels: Vec<String>,
    #[serde(default)]
    pub custom_fields: Option<String>, // JSON文字列
}

/// ラベルデータ
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct LabelRow {
    pub id: String,
    pub name: String,
    pub created_at: i64,
}

/// 同期結果
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SyncApiResult {
    pub synced: bool,
    pub last_synced_at: Option<i64>,
}

/// グローバルセッション管理
static VAULT_SESSION: Lazy<Mutex<Option<SessionState>>> = Lazy::new(|| Mutex::new(None));

/// 最終同期時刻（UNIXタイムスタンプ、秒）
static LAST_SYNC_TIME: Lazy<Mutex<Option<i64>>> = Lazy::new(|| Mutex::new(None));

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
