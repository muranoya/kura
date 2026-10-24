use crate::crypto::{Dek, Kek};
use crate::error::{Result, VaultError};
use crate::models::Argon2Params;
use crate::secret::{MasterPassword, RecoveryKeyInput};
use crate::store::StoredVault;

use super::{LockedVault, UnlockedVault};

impl LockedVault {
    /// Create new vault with master password, returning the vault and its recovery key.
    pub fn create_new(
        master_password: &MasterPassword,
    ) -> Result<(Self, crate::crypto::RecoveryKey)> {
        let argon2_params = Argon2Params::default();
        let dek = Dek::generate();
        let recovery_key = crate::crypto::RecoveryKey::generate();

        // Derive KEKs
        let kek_master =
            crate::crypto::kdf::derive_kek_from_master_password(master_password, &argon2_params)?;
        let kek_recovery = recovery_key.derive_kek(&argon2_params)?;

        // Wrap DEK with both KEKs
        let encrypted_dek_master = dek.wrap(&kek_master)?;
        let encrypted_dek_recovery = dek.wrap(&kek_recovery)?;

        // Create vault_meta
        let vault_meta = crate::models::VaultMeta::new(
            encrypted_dek_master,
            encrypted_dek_recovery,
            argon2_params,
        );

        // Create empty vault (index only, no secrets)
        let vault_file = UnlockedVault::new_empty(vault_meta, dek).to_vault_file()?;

        Ok((
            LockedVault {
                vault_file: StoredVault::V2(vault_file),
                etag: None,
            },
            recovery_key,
        ))
    }

    /// Open existing vault from JSON bytes.
    /// schema_version 1（v2 への移行前）と 2 を受け付け、それ以外は拒否する。
    pub fn open(bytes: impl AsRef<[u8]>, etag: Option<String>) -> Result<Self> {
        let vault_file = StoredVault::from_bytes(bytes.as_ref())?;
        Ok(LockedVault { vault_file, etag })
    }

    /// Unlock vault with master password
    pub fn unlock(self, master_password: &MasterPassword) -> Result<UnlockedVault> {
        // Derive KEK from password
        let kek = crate::crypto::kdf::derive_kek_from_master_password(
            master_password,
            &self.meta().argon2_params,
        )?;
        let encrypted_dek = self.meta().encrypted_dek_master.clone();
        self.unlock_with_kek(&kek, &encrypted_dek, "encrypted_dek_master")
    }

    /// Get vault bytes (for storage)
    pub fn to_vault_bytes(&self) -> Result<Vec<u8>> {
        self.vault_file.to_bytes()
    }

    /// Get current ETag
    pub fn get_etag(&self) -> Option<&String> {
        self.etag.as_ref()
    }

    /// Set ETag (for after successful upload)
    pub fn set_etag(&mut self, etag: String) {
        self.etag = Some(etag);
    }

    /// Unlock vault with recovery key
    pub fn unlock_with_recovery_key(
        self,
        recovery_key: &RecoveryKeyInput,
    ) -> Result<UnlockedVault> {
        let kek = crate::crypto::RecoveryKey::derive_kek_from_input(
            recovery_key,
            &self.meta().argon2_params,
        )?;
        let encrypted_dek = self.meta().encrypted_dek_recovery.clone();
        self.unlock_with_kek(&kek, &encrypted_dek, "encrypted_dek_recovery")
    }

    /// DEK をアンラップし、index を復号する。
    /// v1 の場合は一括復号して v2 の構造に変換する（`docs/vault-format-v2.md` 11-2）。
    fn unlock_with_kek(
        self,
        kek: &Kek,
        encrypted_dek_b64: &str,
        field_name: &str,
    ) -> Result<UnlockedVault> {
        use base64::Engine;

        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(encrypted_dek_b64).map_err(|_| {
            VaultError::DecryptionError(format!("Invalid base64 in {}", field_name))
        })?;
        let dek = Dek::unwrap(&encrypted_dek_bytes, kek)?;

        match self.vault_file {
            StoredVault::V2(file) => UnlockedVault::from_vault_file(file, dek, self.etag),
            StoredVault::V1(file) => UnlockedVault::from_v1_file(file, dek, self.etag),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::EntryData;
    use crate::store::{SCHEMA_VERSION_V1, SCHEMA_VERSION_V2};

    const PASSWORD: &str = "test-master-password";

    fn mp(value: &str) -> MasterPassword {
        MasterPassword::from_string(value.to_string())
    }

    fn recovery_key_input(value: String) -> RecoveryKeyInput {
        RecoveryKeyInput::from_string(value)
    }

    fn v2_file(locked: &LockedVault) -> &crate::store::VaultFile {
        match &locked.vault_file {
            StoredVault::V2(f) => f,
            StoredVault::V1(_) => panic!("expected v2"),
        }
    }

    /// v1 形式の vault.json を作る（移行テスト用）
    fn make_v1_vault_bytes(password: &str) -> Vec<u8> {
        use crate::secret::{EntrySecretJson, SecretString};
        use crate::store::v1::{VaultContentsV1, VaultEntryV1, VaultFileV1};

        let params = Argon2Params::default();
        let dek = Dek::generate();
        let recovery_key = crate::crypto::RecoveryKey::generate();
        let kek =
            crate::crypto::kdf::derive_kek_from_master_password(&mp(password), &params).unwrap();
        let kek_recovery = recovery_key.derive_kek(&params).unwrap();
        let meta = crate::models::VaultMeta::new(
            dek.wrap(&kek).unwrap(),
            dek.wrap(&kek_recovery).unwrap(),
            params,
        );

        let mut contents = VaultContentsV1::default();
        contents.entries.insert(
            "e1".to_string(),
            VaultEntryV1 {
                entry_type: "login".to_string(),
                name: "GitHub".to_string(),
                created_at: 1000,
                updated_at: 2000,
                deleted_at: None,
                purged_at: None,
                is_favorite: true,
                label_ids: vec![],
                typed_value: EntrySecretJson::from_string(
                    r#"{"url":"https://github.com","username":"octo","password":"hunter2"}"#
                        .to_string(),
                ),
                notes: Some(SecretString::from_string("note".to_string())),
                custom_fields: None,
            },
        );
        let file = VaultFileV1 {
            schema_version: SCHEMA_VERSION_V1,
            meta,
            encrypted_vault: crate::crypto::v1::encrypt_vault(&contents, &dek).unwrap(),
        };
        serde_json::to_vec(&file).unwrap()
    }

    #[test]
    fn test_create_new_produces_valid_vault() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let file = v2_file(&locked);

        assert_eq!(file.schema_version, SCHEMA_VERSION_V2);
        assert!(locked.etag.is_none());
        assert!(!file.meta.vault_uuid.is_empty());
        assert!(uuid::Uuid::parse_str(&file.meta.vault_uuid).is_ok());
        assert!(!file.meta.encrypted_dek_master.is_empty());
        assert!(!file.meta.encrypted_dek_recovery.is_empty());
        assert!(!file.index.is_empty());
        assert!(file.secrets.is_empty());
    }

    #[test]
    fn test_create_new_each_call_produces_different_dek_and_uuid() {
        let (locked1, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let (locked2, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();

        assert_ne!(
            locked1.meta().encrypted_dek_master,
            locked2.meta().encrypted_dek_master,
        );
        assert_ne!(locked1.meta().vault_uuid, locked2.meta().vault_uuid);
    }

    #[test]
    fn test_unlock_with_correct_password() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let unlocked = locked.unlock(&mp(PASSWORD)).unwrap();

        assert!(unlocked.index.entries.is_empty());
        assert!(unlocked.index.labels.is_empty());
    }

    #[test]
    fn test_unlock_with_wrong_password() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let result = locked.unlock(&mp("wrong-password"));

        assert!(result.is_err());
    }

    #[test]
    fn test_open_from_serialized_bytes() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let bytes = locked.to_vault_bytes().unwrap();

        let reopened = LockedVault::open(bytes, Some("etag-123".to_string())).unwrap();

        assert_eq!(reopened.vault_file.schema_version(), SCHEMA_VERSION_V2);
        assert_eq!(reopened.get_etag(), Some(&"etag-123".to_string()));

        let unlocked = reopened.unlock(&mp(PASSWORD)).unwrap();
        assert!(unlocked.index.entries.is_empty());
    }

    #[test]
    fn test_open_with_invalid_bytes() {
        let result = LockedVault::open(b"not valid json".to_vec(), None);
        assert!(result.is_err());
    }

    #[test]
    fn test_open_with_unsupported_schema_version() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let bytes = locked.to_vault_bytes().unwrap();

        let mut vault_json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        vault_json["schema_version"] = serde_json::json!(999);
        let tampered = serde_json::to_vec(&vault_json).unwrap();

        let result = LockedVault::open(tampered, None);
        assert!(matches!(
            result,
            Err(VaultError::UnsupportedSchemaVersion(999))
        ));
    }

    #[test]
    fn test_to_vault_bytes_roundtrip() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let bytes = locked.to_vault_bytes().unwrap();

        let parsed: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parsed["schema_version"], SCHEMA_VERSION_V2);
        assert!(parsed["meta"].is_object());
        assert!(parsed["index"].is_string());
        assert!(parsed["secrets"].is_object());
        assert!(parsed.get("encrypted_vault").is_none());
    }

    #[test]
    fn test_unlock_with_recovery_key() {
        let (locked, recovery_key) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let recovery_str = recovery_key.to_display_string();

        let unlocked = locked
            .unlock_with_recovery_key(&recovery_key_input(recovery_str))
            .unwrap();

        assert!(unlocked.index.entries.is_empty());
    }

    #[test]
    fn test_unlock_with_wrong_recovery_key() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();

        // create_new generates a recovery key internally, but we don't have it
        // Using a random recovery key should fail
        let (other_locked, _) = LockedVault::create_new(&mp("other-password")).unwrap();
        let mut other_unlocked = other_locked.unlock(&mp("other-password")).unwrap();
        let other_recovery = other_unlocked
            .regenerate_recovery_key(&mp("other-password"))
            .unwrap();
        let other_recovery_str = other_recovery.to_display_string();

        let result = locked.unlock_with_recovery_key(&recovery_key_input(other_recovery_str));
        assert!(result.is_err());
    }

    #[test]
    fn test_lock_unlock_preserves_data() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let mut unlocked = locked.unlock(&mp(PASSWORD)).unwrap();

        let entry = unlocked
            .create_entry(
                "my note".to_string(),
                "secure_note".to_string(),
                EntryData::new_secure_note("hello".to_string(), None),
                vec![],
            )
            .unwrap();

        let locked_again = unlocked.lock().unwrap();
        assert_eq!(v2_file(&locked_again).secrets.len(), 1);
        let unlocked_again = locked_again.unlock(&mp(PASSWORD)).unwrap();

        assert_eq!(unlocked_again.index.entries.len(), 1);
        let restored = unlocked_again.get_entry(&entry.id).unwrap().unwrap();
        assert_eq!(restored.name, "my note");
        assert_eq!(restored.secret_field_keys, vec!["content".to_string()]);
    }

    #[test]
    fn test_vault_file_does_not_contain_plaintext() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let mut unlocked = locked.unlock(&mp(PASSWORD)).unwrap();
        unlocked
            .create_entry(
                "PlainName".to_string(),
                "login".to_string(),
                EntryData::new_login(
                    Some("https://plain.example".to_string()),
                    "plainuser".to_string(),
                    "plainpassword".to_string(),
                    None,
                ),
                vec![],
            )
            .unwrap();
        let bytes = unlocked.to_vault_bytes().unwrap();
        let text = String::from_utf8(bytes).unwrap();
        for plain in ["PlainName", "plain.example", "plainuser", "plainpassword"] {
            assert!(!text.contains(plain), "{} leaked", plain);
        }
    }

    #[test]
    fn test_vault_uuid_preserved_through_lock_unlock() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let original_uuid = locked.meta().vault_uuid.clone();

        let unlocked = locked.unlock(&mp(PASSWORD)).unwrap();
        assert_eq!(unlocked.meta.vault_uuid, original_uuid);

        let locked_again = unlocked.lock().unwrap();
        assert_eq!(locked_again.meta().vault_uuid, original_uuid);
    }

    #[test]
    fn test_vault_uuid_preserved_through_serialization() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let original_uuid = locked.meta().vault_uuid.clone();

        let bytes = locked.to_vault_bytes().unwrap();
        let reopened = LockedVault::open(bytes, None).unwrap();
        assert_eq!(reopened.meta().vault_uuid, original_uuid);
    }

    #[test]
    fn test_unknown_top_level_fields_preserved() {
        let (locked, _) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let mut json: serde_json::Value =
            serde_json::from_slice(&locked.to_vault_bytes().unwrap()).unwrap();
        json["future_field"] = serde_json::json!({"a": 1});
        let reopened = LockedVault::open(serde_json::to_vec(&json).unwrap(), None).unwrap();

        let unlocked = reopened.unlock(&mp(PASSWORD)).unwrap();
        let written: serde_json::Value =
            serde_json::from_slice(&unlocked.to_vault_bytes().unwrap()).unwrap();
        assert_eq!(written["future_field"]["a"], 1);
    }

    // ===== v1 → v2 移行 =====

    #[test]
    fn test_open_accepts_v1() {
        let locked = LockedVault::open(make_v1_vault_bytes(PASSWORD), None).unwrap();
        assert_eq!(locked.vault_file.schema_version(), SCHEMA_VERSION_V1);
    }

    #[test]
    fn test_unlock_v1_migrates_to_v2() {
        let locked = LockedVault::open(make_v1_vault_bytes(PASSWORD), Some("e".into())).unwrap();
        let unlocked = locked.unlock(&mp(PASSWORD)).unwrap();
        assert_eq!(unlocked.get_etag(), Some(&"e".to_string()));

        let entry = &unlocked.index.entries["e1"];
        assert_eq!(entry.name, "GitHub");
        assert_eq!(entry.updated_at, 2000);
        assert!(entry.public_fields.contains_key("username"));
        assert!(!entry.public_fields.contains_key("password"));

        let restored = unlocked.get_entry("e1").unwrap().unwrap();
        assert_eq!(
            restored.data.notes.as_ref().map(|n| n.as_str()),
            Some("note")
        );
        match &restored.data.typed_value {
            crate::models::TypedValue::Login(d) => assert_eq!(d.password.as_str(), "hunter2"),
            _ => panic!("Expected Login"),
        }

        // ロックすると v2 として書き出される
        let locked_again = unlocked.lock().unwrap();
        assert_eq!(locked_again.vault_file.schema_version(), SCHEMA_VERSION_V2);
        let reopened = LockedVault::open(locked_again.to_vault_bytes().unwrap(), None).unwrap();
        let unlocked_again = reopened.unlock(&mp(PASSWORD)).unwrap();
        assert!(unlocked_again.get_entry("e1").unwrap().is_some());
    }

    #[test]
    fn test_unlock_v1_with_recovery_key_is_not_tested_without_key() {
        // v1 のリカバリーキーでのアンロックも同じ経路（unlock_with_kek）を通る
        let locked = LockedVault::open(make_v1_vault_bytes(PASSWORD), None).unwrap();
        assert!(locked
            .unlock_with_recovery_key(&recovery_key_input("AAAA".to_string()))
            .is_err());
    }
}
