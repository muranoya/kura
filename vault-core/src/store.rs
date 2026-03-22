/// Data structures for vault.json serialization/deserialization
use crate::models::EntryType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Top-level vault.json structure stored in S3
/// schema_version and meta are in plaintext, encrypted_vault is AES-256-GCM encrypted
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFile {
    pub schema_version: u32,
    pub meta: crate::models::VaultMeta,
    pub encrypted_vault: String, // base64-encoded [12-byte IV | ciphertext | 16-byte GCM tag]
}

/// In-memory vault contents after decryption
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultContents {
    pub labels: HashMap<String, LabelValue>,
    pub entries: HashMap<String, VaultEntry>,
}

/// Label value in the vault
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LabelValue {
    pub name: String,
}

/// Entry value in the vault
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    #[serde(rename = "type")]
    pub entry_type: EntryType,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub is_favorite: bool,
    pub label_ids: Vec<String>,
    pub typed_value: serde_json::Value,
    pub notes: Option<String>,
}

impl VaultContents {
    /// Create an empty vault
    pub fn new() -> Self {
        VaultContents {
            labels: HashMap::new(),
            entries: HashMap::new(),
        }
    }

    /// Convert to JSON bytes
    pub fn to_bytes(&self) -> crate::error::Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|e| crate::error::VaultError::JsonError(e))
    }

    /// Create from JSON bytes
    pub fn from_bytes(bytes: &[u8]) -> crate::error::Result<Self> {
        serde_json::from_slice(bytes).map_err(|e| crate::error::VaultError::JsonError(e))
    }
}

impl VaultFile {
    /// Convert to JSON bytes for transmission/storage
    pub fn to_bytes(&self) -> crate::error::Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(|e| crate::error::VaultError::JsonError(e))
    }

    /// Create from JSON bytes
    pub fn from_bytes(bytes: &[u8]) -> crate::error::Result<Self> {
        serde_json::from_slice(bytes).map_err(|e| crate::error::VaultError::JsonError(e))
    }
}
