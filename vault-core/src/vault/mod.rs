mod entries;
mod labels;
mod locked;
mod security;
mod state;

use crate::crypto::Dek;
use crate::models::VaultMeta;
use crate::store::VaultContents;
use crate::store::VaultFile;

/// Current schema version for vault.json
pub(crate) const CURRENT_SCHEMA_VERSION: u32 = 1;

/// Locked vault - encrypted data in memory, DEK not available
#[derive(Clone)]
pub struct LockedVault {
    pub(crate) vault_file: VaultFile,
    pub(crate) etag: Option<String>,
}

/// Unlocked vault - plaintext JSON in memory with DEK available
pub struct UnlockedVault {
    pub(crate) meta: VaultMeta,
    pub contents: VaultContents,
    pub dek: Dek,
    pub(crate) etag: Option<String>,
}
