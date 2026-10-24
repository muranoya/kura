//! v1 → v2 の移行（`docs/vault-format-v2.md` 11章）。
//!
//! v1 を読み込むコード（AES-256-GCM による一括復号と変換処理）は、すべての端末の
//! 移行が済んだ後に削除する。
use std::collections::HashMap;

use crate::crypto::{Dek, SubKeys};
use crate::error::{Result, VaultError};
use crate::secret::PublicString;
use crate::store::layout::{split_custom_fields, split_typed_value};
use crate::store::v1::{VaultContentsV1, VaultEntryV1, VaultFileV1};
use crate::store::{EntrySecret, ExtraFields, VaultEntry, VaultIndex};

use super::secrets::new_secret_rev;
use super::UnlockedVault;

impl UnlockedVault {
    /// v1 の vault.json を DEK で一括復号し、メモリ上で v2 の構造に変換する。
    /// 変換結果はまだストレージに書かれていないので、呼び出し側はアンロック直後の同期で
    /// v2 として push する（push するまで、リモートは v1 のまま）。
    pub(crate) fn from_v1_file(file: VaultFileV1, dek: Dek, etag: Option<String>) -> Result<Self> {
        let contents = crate::crypto::v1::decrypt_vault(&file.encrypted_vault, &dek)?;
        let mut vault = UnlockedVault::new_empty(file.meta, dek);
        let (index, secrets) = migrate_v1_contents(contents, &vault.keys, &vault.meta.vault_uuid)?;
        vault.index = index;
        vault.secrets = secrets;
        vault.etag = etag;
        Ok(vault)
    }
}

/// v1 の中身を、4 章の振り分け表に従って index と（暗号化済みの）secret に分ける。
///
/// - 既知のエントリタイプ: 4-1 の表に従う
/// - 未知のエントリタイプ: typed_value 全体を secret に置く（どれが非秘匿値か判断できないため）
/// - カスタムフィールド: 4-2 の既定値に従う。未知のフィールドタイプは secret に置く
/// - notes は secret に置く
/// - 各エントリの `secret_rev` を新しく生成する
pub(crate) fn migrate_v1_contents(
    contents: VaultContentsV1,
    keys: &SubKeys,
    vault_uuid: &str,
) -> Result<(VaultIndex, HashMap<String, String>)> {
    let mut index = VaultIndex {
        labels: contents.labels,
        entries: HashMap::with_capacity(contents.entries.len()),
        extra: ExtraFields::new(),
    };
    let mut secrets = HashMap::with_capacity(contents.entries.len());

    for (id, v1) in contents.entries {
        let (entry, secret) = migrate_v1_entry(&id, v1)?;
        if let (Some(secret_rev), Some(secret)) = (&entry.secret_rev, secret) {
            let sealed = keys.seal_secret(vault_uuid, &id, secret_rev, &secret.to_bytes()?)?;
            secrets.insert(id.clone(), sealed);
        }
        index.entries.insert(id, entry);
    }

    Ok((index, secrets))
}

fn migrate_v1_entry(id: &str, v1: VaultEntryV1) -> Result<(VaultEntry, Option<EntrySecret>)> {
    let mut entry = VaultEntry {
        entry_type: v1.entry_type,
        name: PublicString::new(v1.name),
        created_at: v1.created_at,
        updated_at: v1.updated_at,
        deleted_at: v1.deleted_at,
        purged_at: v1.purged_at,
        is_favorite: v1.is_favorite,
        label_ids: v1.label_ids,
        public_fields: Default::default(),
        custom_fields: Vec::new(),
        secret_rev: None,
        extra: ExtraFields::new(),
    };

    // purged（tombstone）は名前や値を持たず、secret も持たない
    if entry.purged_at.is_some() {
        entry.name = PublicString::default();
        entry.label_ids.clear();
        return Ok((entry, None));
    }

    let (public_fields, secret_fields) =
        split_typed_value(&entry.entry_type, v1.typed_value.as_str(), None).map_err(|e| {
            VaultError::InvalidInput(format!("Failed to migrate entry {}: {}", id, e))
        })?;
    let (custom_fields, secret_custom_fields) =
        split_custom_fields(v1.custom_fields.as_deref().unwrap_or_default(), &[]);

    entry.public_fields = public_fields;
    entry.custom_fields = custom_fields;
    entry.secret_rev = Some(new_secret_rev());

    let secret = EntrySecret {
        fields: secret_fields,
        notes: v1.notes,
        custom_fields: secret_custom_fields,
        extra: ExtraFields::new(),
    };
    Ok((entry, Some(secret)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::CustomField;
    use crate::secret::{EntrySecretJson, SecretString};

    const UUID: &str = "11111111-1111-4111-8111-111111111111";

    fn v1_entry(entry_type: &str, typed_value: &str) -> VaultEntryV1 {
        VaultEntryV1 {
            entry_type: entry_type.to_string(),
            name: "Name".to_string(),
            created_at: 1000,
            updated_at: 2000,
            deleted_at: None,
            purged_at: None,
            is_favorite: true,
            label_ids: vec!["l1".to_string()],
            typed_value: EntrySecretJson::from_string(typed_value.to_string()),
            notes: Some(SecretString::from_string("recovery codes".to_string())),
            custom_fields: None,
        }
    }

    fn v1_field(id: &str, field_type: &str, value: &str) -> CustomField {
        CustomField {
            id: id.to_string(),
            name: id.to_string(),
            field_type: field_type.to_string(),
            value: SecretString::from_string(value.to_string()),
            secret: false,
            autofill_selector: None,
        }
    }

    #[test]
    fn test_migrate_login_entry() {
        let mut v1 = v1_entry(
            "login",
            r#"{"url":"https://example.com","username":"user","password":"pw"}"#,
        );
        v1.custom_fields = Some(vec![
            v1_field("t", "text", "visible"),
            v1_field("p", "password", "hidden"),
            v1_field("u", "future_type", "unknown"),
        ]);
        let (entry, secret) = migrate_v1_entry("e1", v1).unwrap();
        let secret = secret.unwrap();

        assert_eq!(entry.name, "Name");
        assert_eq!(entry.updated_at, 2000);
        assert!(entry.is_favorite);
        assert_eq!(entry.label_ids, vec!["l1".to_string()]);
        assert_eq!(
            entry.public_fields.keys().collect::<Vec<_>>(),
            vec!["url", "username"]
        );
        assert!(entry.secret_rev.is_some());
        assert_eq!(secret.fields.keys().collect::<Vec<_>>(), vec!["password"]);
        assert_eq!(secret.notes.as_ref().unwrap().as_str(), "recovery codes");

        assert!(!entry.custom_fields[0].secret);
        assert!(entry.custom_fields[1].secret);
        // 未知のフィールドタイプは secret に置く
        assert!(entry.custom_fields[2].secret);
        assert_eq!(
            secret.custom_fields.keys().collect::<Vec<_>>(),
            vec!["p", "u"]
        );
    }

    #[test]
    fn test_migrate_unknown_entry_type_puts_everything_in_secret() {
        let v1 = v1_entry("wifi", r#"{"ssid":"home","password":"pw"}"#);
        let (entry, secret) = migrate_v1_entry("e1", v1).unwrap();
        assert!(entry.public_fields.is_empty());
        assert_eq!(secret.unwrap().fields.len(), 2);
    }

    #[test]
    fn test_migrate_purged_entry_has_no_secret() {
        let mut v1 = v1_entry("login", "");
        v1.deleted_at = Some(1500);
        v1.purged_at = Some(1500);
        let (entry, secret) = migrate_v1_entry("e1", v1).unwrap();
        assert!(secret.is_none());
        assert!(entry.secret_rev.is_none());
        assert_eq!(entry.purged_at, Some(1500));
    }

    #[test]
    fn test_migrate_contents_encrypts_secrets_with_aad() {
        let keys = SubKeys::derive(&Dek::generate());
        let mut contents = VaultContentsV1::default();
        contents.entries.insert(
            "e1".to_string(),
            v1_entry("login", r#"{"url":null,"username":"u","password":"pw"}"#),
        );
        let mut purged = v1_entry("login", "{}");
        purged.deleted_at = Some(1);
        purged.purged_at = Some(1);
        contents.entries.insert("e2".to_string(), purged);

        let (index, secrets) = migrate_v1_contents(contents, &keys, UUID).unwrap();
        assert_eq!(index.entries.len(), 2);
        assert_eq!(secrets.keys().collect::<Vec<_>>(), vec!["e1"]);

        let rev = index.entries["e1"].secret_rev.as_deref().unwrap();
        let plaintext = keys.open_secret(UUID, "e1", rev, &secrets["e1"]).unwrap();
        let secret = EntrySecret::from_bytes(&plaintext).unwrap();
        assert_eq!(secret.fields["password"].value(), "pw");
    }
}
