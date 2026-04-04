mod session;
mod entries;
mod labels;
mod security;
mod sync;
mod utils;

#[cfg(any(feature = "desktop", feature = "android"))]
mod import;

pub use sync::parse_s3_config;
pub use utils::*;

use crate::sync::engine::SessionState;
use std::sync::Mutex;

/// エントリ行データ
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EntryRow {
    pub id: String,
    pub entry_type: String,
    pub name: String,
    pub is_favorite: bool,
    pub created_at: i64,
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
    pub created_at: i64,
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

/// Vault状態を保持するインスタンス
///
/// アプリ側で複数のVaultManagerを生成することで、
/// 複数のvaultを同時にUnlock状態で保持できる。
pub struct VaultManager {
    pub(crate) session: Mutex<Option<SessionState>>,
    pub(crate) last_sync_time: Mutex<Option<i64>>,
}

impl VaultManager {
    pub fn new() -> Self {
        Self {
            session: Mutex::new(None),
            last_sync_time: Mutex::new(None),
        }
    }
}

impl Default for VaultManager {
    fn default() -> Self {
        Self::new()
    }
}

fn unix_now() -> i64 {
    crate::get_timestamp()
}
