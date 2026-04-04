/// Data structures for vault.json serialization/deserialization
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use zeroize::Zeroizing;

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
    #[serde(default)]
    pub created_at: i64,
    /// Tombstone marker for deleted labels (no soft-delete for labels)
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub deleted_at: Option<i64>,
}

/// Entry value in the vault
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    /// Tombstone marker for purged entries. Combined with deleted_at:
    /// - (None, None) = active
    /// - (Some, None) = soft-deleted (in trash)
    /// - (Some, Some) = purged (tombstone)
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub purged_at: Option<i64>,
    pub is_favorite: bool,
    pub label_ids: Vec<String>,
    #[serde(with = "crate::raw_json_serde")]
    pub typed_value: Zeroizing<String>,
    pub notes: Option<String>,
    pub custom_fields: Option<Vec<crate::models::entry_data::CustomField>>,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deserialize_unknown_entry_type() {
        let json = r#"{
            "labels": {},
            "entries": {
                "id-1": {
                    "type": "wifi_password",
                    "name": "Home WiFi",
                    "created_at": 1000,
                    "updated_at": 1000,
                    "deleted_at": null,
                    "is_favorite": false,
                    "label_ids": [],
                    "typed_value": {"ssid": "MyNetwork", "password": "secret"},
                    "notes": null,
                    "custom_fields": null
                },
                "id-2": {
                    "type": "login",
                    "name": "GitHub",
                    "created_at": 2000,
                    "updated_at": 2000,
                    "deleted_at": null,
                    "is_favorite": true,
                    "label_ids": [],
                    "typed_value": {"url": "https://github.com", "username": "user", "password": "pass"},
                    "notes": null,
                    "custom_fields": null
                }
            }
        }"#;

        let contents = VaultContents::from_bytes(json.as_bytes())
            .expect("Should deserialize vault with unknown entry type");

        assert_eq!(contents.entries.len(), 2);

        let wifi = &contents.entries["id-1"];
        assert_eq!(wifi.entry_type, "wifi_password");
        assert_eq!(wifi.name, "Home WiFi");

        let github = &contents.entries["id-2"];
        assert_eq!(github.entry_type, "login");
        assert_eq!(github.name, "GitHub");
    }

    #[test]
    fn test_deserialize_unknown_custom_field_type() {
        let json = r#"{
            "labels": {},
            "entries": {
                "id-1": {
                    "type": "login",
                    "name": "Example",
                    "created_at": 1000,
                    "updated_at": 1000,
                    "deleted_at": null,
                    "is_favorite": false,
                    "label_ids": [],
                    "typed_value": {"url": "https://example.com", "username": "user", "password": "pass"},
                    "notes": null,
                    "custom_fields": [
                        {"id": "cf-1", "name": "Birthday", "field_type": "date", "value": "2000-01-01"},
                        {"id": "cf-2", "name": "Note", "field_type": "text", "value": "hello"}
                    ]
                }
            }
        }"#;

        let contents = VaultContents::from_bytes(json.as_bytes())
            .expect("Should deserialize vault with unknown custom field type");

        let entry = &contents.entries["id-1"];
        let fields = entry.custom_fields.as_ref().unwrap();
        assert_eq!(fields.len(), 2);
        assert_eq!(fields[0].field_type, "date");
        assert_eq!(fields[0].value, "2000-01-01");
        assert_eq!(fields[1].field_type, "text");
    }

    #[test]
    fn test_roundtrip_preserves_unknown_types() {
        let json = r#"{
            "labels": {},
            "entries": {
                "id-1": {
                    "type": "future_type",
                    "name": "Future Entry",
                    "created_at": 1000,
                    "updated_at": 1000,
                    "deleted_at": null,
                    "is_favorite": false,
                    "label_ids": ["label-1"],
                    "typed_value": {"key": "value"},
                    "notes": "some notes",
                    "custom_fields": [
                        {"id": "cf-1", "name": "Field", "field_type": "future_field", "value": "data"}
                    ]
                }
            }
        }"#;

        let contents = VaultContents::from_bytes(json.as_bytes()).unwrap();
        let bytes = contents.to_bytes().unwrap();
        let roundtripped = VaultContents::from_bytes(&bytes).unwrap();

        let entry = &roundtripped.entries["id-1"];
        assert_eq!(entry.entry_type, "future_type");
        assert_eq!(entry.name, "Future Entry");
        let fields = entry.custom_fields.as_ref().unwrap();
        assert_eq!(fields[0].field_type, "future_field");
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
