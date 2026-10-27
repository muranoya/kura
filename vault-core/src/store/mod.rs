//! vault.json のシリアライズ/デシリアライズ用データ構造（schema_version 2）。
//!
//! 全ラベル・全エントリの非秘匿値を 1 つの暗号化ブロック（index）にまとめ、
//! 秘匿値はエントリごとの暗号化ブロック（secret）に分けて持つ。
//! 詳細は `docs/vault-format-v2.md` を参照。
pub mod layout;
pub mod v1;

use crate::error::{Result, VaultError};
use crate::models::CustomFieldSelector;
use crate::secret::{PublicJson, PublicString, SecretJson, SecretString};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use zeroize::Zeroizing;

/// v1 → v2 移行のため、読み込み時だけ受け付ける旧スキーマ
pub(crate) const SCHEMA_VERSION_V1: u32 = 1;
/// 書き込み時に使うスキーマ
pub(crate) const SCHEMA_VERSION_V2: u32 = 2;

/// 将来のクライアントが追加したフィールドを、読み書きの往復で失わないよう保持するためのマップ
pub type ExtraFields = serde_json::Map<String, serde_json::Value>;

/// vault.json（v2）のトップレベル構造。`meta` は平文、`index` と `secrets` の各値は
/// `base64(nonce[24] | ciphertext | tag[16])` 形式の XChaCha20-Poly1305 暗号文。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultFile {
    pub schema_version: u32,
    pub meta: crate::models::VaultMeta,
    pub index: String,
    /// entry_id → secret ブロック。purged エントリは secret を持たない
    #[serde(default)]
    pub secrets: BTreeMap<String, String>,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

impl VaultFile {
    /// Convert to JSON bytes for transmission/storage
    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        serde_json::to_vec(self).map_err(VaultError::JsonError)
    }
}

/// ストレージ・ローカルキャッシュから読み込んだ vault.json。
/// v1 はアンロック時（または同期でリモートとして受け取った時）に v2 へ変換する。
#[derive(Debug, Clone)]
pub enum StoredVault {
    V1(v1::VaultFileV1),
    V2(VaultFile),
}

impl StoredVault {
    /// JSON バイト列から読み込む。schema_version が 1 / 2 以外なら拒否する
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        #[derive(Deserialize)]
        struct Probe {
            schema_version: u32,
        }
        let probe: Probe = serde_json::from_slice(bytes).map_err(VaultError::JsonError)?;
        match probe.schema_version {
            SCHEMA_VERSION_V1 => Ok(Self::V1(
                serde_json::from_slice(bytes).map_err(VaultError::JsonError)?,
            )),
            SCHEMA_VERSION_V2 => Ok(Self::V2(
                serde_json::from_slice(bytes).map_err(VaultError::JsonError)?,
            )),
            other => Err(VaultError::UnsupportedSchemaVersion(other)),
        }
    }

    pub fn to_bytes(&self) -> Result<Vec<u8>> {
        match self {
            Self::V1(f) => serde_json::to_vec(f).map_err(VaultError::JsonError),
            Self::V2(f) => f.to_bytes(),
        }
    }

    pub fn schema_version(&self) -> u32 {
        match self {
            Self::V1(f) => f.schema_version,
            Self::V2(f) => f.schema_version,
        }
    }

    pub fn meta(&self) -> &crate::models::VaultMeta {
        match self {
            Self::V1(f) => &f.meta,
            Self::V2(f) => &f.meta,
        }
    }
}

/// index ブロックの平文。アンロック中はメモリに常駐し、検索・一覧表示・
/// オートフィル候補の判定に使う。秘匿値は含まない。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct VaultIndex {
    #[serde(default)]
    pub labels: HashMap<String, LabelValue>,
    #[serde(default)]
    pub entries: HashMap<String, VaultEntry>,
    /// 読み込んだ index にあった meta のダイジェスト（同期時にリモートの meta を検証するのに使う）。
    /// 書き込み時は、その時点の meta から計算した値を `to_bytes_with_meta_digest` で入れる
    #[serde(default, skip_serializing)]
    pub meta_digest: Option<crate::models::MetaDigest>,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

impl VaultIndex {
    /// Create an empty index
    pub fn new() -> Self {
        Self::default()
    }

    /// JSONバイト列に変換する（index も個人情報を含むため`Zeroizing`バッファへ直接書く）
    pub fn to_bytes(&self) -> Result<Zeroizing<Vec<u8>>> {
        crate::secret::to_json_zeroizing(self).map_err(VaultError::JsonError)
    }

    /// meta のダイジェストを加えて JSON バイト列に変換する（暗号化して vault.json に書く用）
    pub fn to_bytes_with_meta_digest(
        &self,
        meta_digest: &crate::models::MetaDigest,
    ) -> Result<Zeroizing<Vec<u8>>> {
        #[derive(Serialize)]
        struct WithMetaDigest<'a> {
            #[serde(flatten)]
            index: &'a VaultIndex,
            meta_digest: &'a crate::models::MetaDigest,
        }
        crate::secret::to_json_zeroizing(&WithMetaDigest {
            index: self,
            meta_digest,
        })
        .map_err(VaultError::JsonError)
    }

    /// Create from JSON bytes
    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        serde_json::from_slice(bytes).map_err(VaultError::JsonError)
    }
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

/// index 上のエントリ（非秘匿値のみ）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultEntry {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub name: PublicString,
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
    /// typed_value の非秘匿フィールド
    #[serde(default)]
    pub public_fields: BTreeMap<String, PublicJson>,
    /// 全カスタムフィールドのメタデータ（順序を保持）
    #[serde(default)]
    pub custom_fields: Vec<IndexCustomField>,
    /// secret ブロックの版を表すランダム値（UUID v4）。purged の場合は None。
    /// secret の AAD に含まれるため、index と secret の組み合わせを束縛する。
    #[serde(default)]
    pub secret_rev: Option<String>,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

impl VaultEntry {
    /// 値（public_fields / custom_fields / secret）をまだ持たない active なエントリ行を作る
    pub fn new(entry_type: impl Into<String>, name: impl Into<String>, created_at: i64) -> Self {
        Self {
            entry_type: entry_type.into(),
            name: PublicString::new(name),
            created_at,
            updated_at: created_at,
            deleted_at: None,
            purged_at: None,
            is_favorite: false,
            label_ids: Vec::new(),
            public_fields: BTreeMap::new(),
            custom_fields: Vec::new(),
            secret_rev: None,
            extra: ExtraFields::new(),
        }
    }
}

/// index 上のカスタムフィールド（メタデータと非秘匿の値）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexCustomField {
    pub id: String,
    pub name: PublicString,
    pub field_type: String,
    /// true なら値は secret 側の `custom_fields[id]` にある
    #[serde(default)]
    pub secret: bool,
    /// 非秘匿の値。`secret == true` の場合は公開部のみ（totp の周期、passkey の公開情報）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<PublicString>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub autofill_selector: Option<CustomFieldSelector>,
    #[serde(flatten)]
    pub extra: ExtraFields,
}

/// secret ブロックの平文（エントリごと）。必要なときだけ復号し、使い終わったらゼロ化する。
///
/// 未知のフィールドを `extra` に保持するが、`#[serde(flatten)]` は使わない。
/// flatten は構造体全体をいったん serde 内部のバッファ（ゼロ化されない `String` の複製）に
/// 読み込むため、秘匿値の平文コピーがヒープに残ってしまう。代わりに手書きの
/// `Deserialize` で既知のキーを直接 `SecretString` / `SecretJson` に読み込む。
#[derive(Debug, Clone, Default)]
pub struct EntrySecret {
    /// typed_value の秘匿フィールド
    pub fields: BTreeMap<String, SecretJson>,
    pub notes: Option<SecretString>,
    /// field_id → 秘匿値
    pub custom_fields: BTreeMap<String, SecretString>,
    /// 新しいクライアントが追加した未知のフィールド。秘匿値でありうるので、drop 時にゼロ化する
    pub extra: BTreeMap<String, SecretJson>,
}

impl EntrySecret {
    /// JSONバイト列に変換する（`Zeroizing`バッファへ直接書く）。
    /// キーは BTreeMap で整列されるため、同じ内容なら同じバイト列になる（5-4 の比較に使う）
    pub fn to_bytes(&self) -> Result<Zeroizing<Vec<u8>>> {
        crate::secret::to_json_zeroizing(self).map_err(VaultError::JsonError)
    }

    pub fn from_bytes(bytes: &[u8]) -> Result<Self> {
        serde_json::from_slice(bytes).map_err(VaultError::JsonError)
    }
}

impl Serialize for EntrySecret {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        use serde::ser::SerializeMap;
        let mut map = s.serialize_map(None)?;
        map.serialize_entry("fields", &self.fields)?;
        if let Some(notes) = &self.notes {
            map.serialize_entry("notes", notes)?;
        }
        map.serialize_entry("custom_fields", &self.custom_fields)?;
        for (key, value) in &self.extra {
            map.serialize_entry(key, value)?;
        }
        map.end()
    }
}

impl<'de> Deserialize<'de> for EntrySecret {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        struct SecretVisitor;

        impl<'de> serde::de::Visitor<'de> for SecretVisitor {
            type Value = EntrySecret;

            fn expecting(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
                f.write_str("an entry secret object")
            }

            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                mut map: A,
            ) -> std::result::Result<EntrySecret, A::Error> {
                let mut secret = EntrySecret::default();
                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "fields" => secret.fields = map.next_value()?,
                        "notes" => secret.notes = map.next_value()?,
                        "custom_fields" => secret.custom_fields = map.next_value()?,
                        _ => {
                            let value: SecretJson = map.next_value()?;
                            secret.extra.insert(key, value);
                        }
                    }
                }
                Ok(secret)
            }
        }

        d.deserialize_map(SecretVisitor)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_entry_secret_roundtrip_preserves_unknown_fields() {
        let json = r#"{"fields":{"password":"p"},"notes":"n","custom_fields":{"cf1":"v"},"future":{"x":1}}"#;
        let secret = EntrySecret::from_bytes(json.as_bytes()).unwrap();
        assert_eq!(secret.fields["password"].value(), "p");
        assert_eq!(secret.notes.as_ref().unwrap().as_str(), "n");
        assert_eq!(secret.custom_fields["cf1"].as_str(), "v");

        let bytes = secret.to_bytes().unwrap();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["future"]["x"], 1);
        assert_eq!(v["fields"]["password"], "p");
    }

    #[test]
    fn test_empty_entry_secret() {
        let secret = EntrySecret::from_bytes(b"{}").unwrap();
        assert!(secret.fields.is_empty());
        assert!(secret.notes.is_none());
        let bytes = secret.to_bytes().unwrap();
        assert_eq!(&bytes[..], br#"{"fields":{},"custom_fields":{}}"#);
    }

    #[test]
    fn test_entry_secret_bytes_are_canonical() {
        let a =
            EntrySecret::from_bytes(br#"{"custom_fields":{"b":"2","a":"1"},"fields":{}}"#).unwrap();
        let b =
            EntrySecret::from_bytes(br#"{"fields":{},"custom_fields":{"a":"1","b":"2"}}"#).unwrap();
        assert_eq!(*a.to_bytes().unwrap(), *b.to_bytes().unwrap());
    }

    #[test]
    fn test_index_roundtrip_preserves_unknown_fields() {
        let json = r#"{
            "labels": {"l1": {"name": "Work", "created_at": 1}},
            "entries": {
                "e1": {
                    "type": "login",
                    "name": "GitHub",
                    "created_at": 1,
                    "updated_at": 2,
                    "deleted_at": null,
                    "is_favorite": false,
                    "label_ids": ["l1"],
                    "public_fields": {"url": "https://github.com", "username": "u"},
                    "custom_fields": [
                        {"id": "c1", "name": "PIN", "field_type": "text", "secret": true, "future_attr": 5}
                    ],
                    "secret_rev": "rev",
                    "future_entry_field": [1, 2]
                }
            },
            "future_top": true
        }"#;
        let index = VaultIndex::from_bytes(json.as_bytes()).unwrap();
        let entry = &index.entries["e1"];
        assert_eq!(entry.name, "GitHub");
        assert_eq!(
            entry.public_fields["url"].as_str(),
            Some("https://github.com")
        );
        assert!(entry.custom_fields[0].secret);
        assert!(entry.custom_fields[0].value.is_none());

        let bytes = index.to_bytes().unwrap();
        let v: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(v["future_top"], true);
        assert_eq!(v["entries"]["e1"]["future_entry_field"][1], 2);
        assert_eq!(v["entries"]["e1"]["custom_fields"][0]["future_attr"], 5);
    }

    #[test]
    fn test_stored_vault_rejects_unknown_schema_version() {
        let json = br#"{"schema_version": 3, "meta": {}}"#;
        assert!(matches!(
            StoredVault::from_bytes(json),
            Err(VaultError::UnsupportedSchemaVersion(3))
        ));
    }
}
