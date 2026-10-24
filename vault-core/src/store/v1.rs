//! schema_version 1 の vault.json（`VaultContents` 全体を単一の AES-256-GCM ブロックとして
//! 暗号化する形式）のデータ構造。
//!
//! v2 への移行（`docs/vault-format-v2.md` 11章）のためだけに残している。
//! すべての端末の移行が済んだら削除する。
use crate::secret::{EntrySecretJson, SecretString};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use zeroize::Zeroizing;

use super::LabelValue;

/// v1 の vault.json のトップレベル構造。
/// schema_version と meta は平文、encrypted_vault は AES-256-GCM で暗号化されている。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFileV1 {
    pub schema_version: u32,
    pub meta: crate::models::VaultMeta,
    pub encrypted_vault: String, // base64-encoded [12-byte IV | ciphertext | 16-byte GCM tag]
}

/// v1 の復号後の中身
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VaultContentsV1 {
    pub labels: HashMap<String, LabelValue>,
    pub entries: HashMap<String, VaultEntryV1>,
}

/// v1 のエントリ（秘匿値・非秘匿値を区別せずに保持する）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntryV1 {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub name: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub purged_at: Option<i64>,
    pub is_favorite: bool,
    pub label_ids: Vec<String>,
    pub typed_value: EntrySecretJson,
    pub notes: Option<SecretString>,
    /// v1 には `secret` 属性がないため、デシリアライズ時は `secret == false` になる。
    /// 移行時に `field_type` から既定値を決め直す。
    pub custom_fields: Option<Vec<crate::models::entry_data::CustomField>>,
}

impl VaultContentsV1 {
    /// JSONバイト列に変換する。
    /// `Zeroizing`バッファへ直接シリアライズすることで、平文（全エントリの
    /// 秘匿値を含む）が非保護の`Vec<u8>`として一瞬たりとも存在しないようにする。
    pub fn to_bytes(&self) -> crate::error::Result<Zeroizing<Vec<u8>>> {
        let mut buf = Zeroizing::new(Vec::new());
        serde_json::to_writer(&mut *buf, self).map_err(crate::error::VaultError::JsonError)?;
        Ok(buf)
    }

    /// Create from JSON bytes
    pub fn from_bytes(bytes: &[u8]) -> crate::error::Result<Self> {
        serde_json::from_slice(bytes).map_err(crate::error::VaultError::JsonError)
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

        let contents = VaultContentsV1::from_bytes(json.as_bytes())
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

        let contents = VaultContentsV1::from_bytes(json.as_bytes())
            .expect("Should deserialize vault with unknown custom field type");

        let entry = &contents.entries["id-1"];
        let fields = entry.custom_fields.as_ref().unwrap();
        assert_eq!(fields.len(), 2);
        assert_eq!(fields[0].field_type, "date");
        assert_eq!(fields[0].value.as_str(), "2000-01-01");
        assert_eq!(fields[1].field_type, "text");
    }
}
