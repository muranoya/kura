pub mod codec;
pub mod config;
pub mod crypto;
pub mod error;
pub mod models;
pub mod password_gen;
mod raw_json_serde;
pub mod storage;
pub mod store;
pub mod sync;
pub mod totp;
pub mod vault;

#[cfg(any(feature = "desktop", feature = "android", feature = "wasm"))]
pub mod api;

#[cfg(any(feature = "desktop", feature = "android"))]
pub mod import;

pub mod export;

pub use config::{S3Config, VaultConfig};
pub use crypto::{Dek, Kek, RecoveryKey};
pub use error::{Result, VaultError};
pub use models::{
    Argon2Params, Entry, EntryData, EntryFilter, EntryType, Label, SortField, SortOrder, VaultMeta,
};
pub use password_gen::{generate_password, PasswordOptions};
pub use storage::StorageBackend;
pub use store::{LabelValue, VaultContents, VaultEntry, VaultFile};
pub use sync::SyncResult;
pub use totp::{generate_totp, generate_totp_default};
pub use vault::{LockedVault, UnlockedVault};

// Re-export useful types for clients
pub use serde_json;

// ============================================================================
// Timestamp utilities
// ============================================================================

/// Get current Unix timestamp in seconds
#[inline]
pub fn get_timestamp() -> i64 {
    chrono::Utc::now().timestamp()
}
