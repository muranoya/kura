mod entries;
mod labels;
mod security;
mod session;
mod sync;
mod transfer;
mod utils;

#[cfg(any(feature = "desktop", feature = "android"))]
mod import;

pub use sync::parse_s3_config;
pub use transfer::*;
pub use utils::*;

use crate::sync::engine::SessionState;
use std::sync::Mutex;

/// エントリ行データ
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EntryRow {
    pub id: String,
    pub entry_type: String,
    pub name: String,
    pub subtitle: Option<String>,
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
    /// FFI境界越しに `serde_json::Value` を渡せないため、JSON文字列として返す。
    /// 永続化層では `Zeroizing<String>` として保持している。
    pub typed_value: String,
    pub labels: Vec<String>,
    /// FFI境界越しに構造体の配列を渡せないため、JSON文字列として返す。
    #[serde(default)]
    pub custom_fields: Option<String>,
}

/// オートフィル候補データ（パスワードを含まない）
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct AutofillCandidate {
    pub id: String,
    pub name: String,
    pub url: String,
    pub username: Option<String>,
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
///
/// API層の全メソッドは `Result<T, String>` を返す。これはJNI/WASM/Tauri IPC等の
/// FFI境界で型付きenumを自然に渡せないための意図的な設計。内部では `VaultError` を
/// 使用し、API境界で文字列に変換している。
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

impl VaultManager {
    /// Read-only access to the unlocked vault session.
    pub(crate) fn with_unlocked<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&crate::vault::UnlockedVault) -> Result<T, String>,
    {
        let session = self.session.lock().unwrap_or_else(|p| p.into_inner());
        match session.as_ref() {
            Some(SessionState::Unlocked(v)) => f(v),
            _ => Err("Vault not unlocked".to_string()),
        }
    }

    /// Mutable access to the unlocked vault session.
    pub(crate) fn with_unlocked_mut<F, T>(&self, f: F) -> Result<T, String>
    where
        F: FnOnce(&mut crate::vault::UnlockedVault) -> Result<T, String>,
    {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());
        match session.as_mut() {
            Some(SessionState::Unlocked(ref mut v)) => f(v),
            _ => Err("Vault not unlocked".to_string()),
        }
    }
}
