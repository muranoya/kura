mod raw_json_serde;
pub mod config;
pub mod error;
pub mod models;
pub mod crypto;
pub mod store;
pub mod storage;
pub mod vault;
pub mod sync;
pub mod password_gen;
pub mod codec;
pub mod totp;

#[cfg(any(feature = "desktop", feature = "android", feature = "wasm"))]
pub mod api;

pub use config::{VaultConfig, S3Config};
pub use error::{VaultError, Result};
pub use models::{
    Entry, EntryType, EntryFilter, EntryData, Label, VaultMeta, Argon2Params,
};
pub use crypto::{Kek, Dek, RecoveryKey};
pub use store::{VaultFile, VaultContents, VaultEntry, LabelValue};
pub use storage::StorageBackend;
pub use vault::{LockedVault, UnlockedVault};
pub use sync::SyncResult;
pub use password_gen::{PasswordOptions, generate_password};
pub use totp::{generate_totp, generate_totp_default};

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
