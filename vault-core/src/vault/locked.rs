use crate::error::{Result, VaultError};
use crate::crypto::Dek;
use crate::models::Argon2Params;
use crate::store::VaultFile;

use super::{LockedVault, UnlockedVault, CURRENT_SCHEMA_VERSION};

impl LockedVault {
    /// Create new vault with master password
    pub fn create_new(master_password: &str) -> Result<Self> {
        let argon2_params = Argon2Params::default();
        let dek = Dek::generate();
        let recovery_key = crate::crypto::RecoveryKey::generate();

        // Derive KEKs
        let kek_master = crate::crypto::kdf::derive_kek(master_password, &argon2_params)?;
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

        // Create empty vault contents
        let contents = crate::store::VaultContents::new();
        let encrypted_vault = crate::crypto::encryption::encrypt_vault(&contents, &dek)?;

        let vault_file = VaultFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            meta: vault_meta,
            encrypted_vault,
        };

        Ok(LockedVault {
            vault_file,
            etag: None,
        })
    }

    /// Open existing vault from JSON bytes
    pub fn open(bytes: Vec<u8>, etag: Option<String>) -> Result<Self> {
        let vault_file = VaultFile::from_bytes(&bytes)?;

        // Validate schema version
        if vault_file.schema_version != CURRENT_SCHEMA_VERSION {
            return Err(VaultError::UnsupportedSchemaVersion(vault_file.schema_version));
        }

        Ok(LockedVault {
            vault_file,
            etag,
        })
    }

    /// Unlock vault with master password
    pub fn unlock(self, master_password: &str) -> Result<UnlockedVault> {
        use base64::Engine;

        // Derive KEK from password
        let kek = crate::crypto::kdf::derive_kek(master_password, &self.vault_file.meta.argon2_params)?;

        // Decode and unwrap DEK
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(&self.vault_file.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64 in encrypted_dek_master".to_string()))?;
        let dek = Dek::unwrap(&encrypted_dek_bytes, &kek)?;

        // Decrypt vault contents
        let contents = crate::crypto::encryption::decrypt_vault(&self.vault_file.encrypted_vault, &dek)?;

        Ok(UnlockedVault {
            meta: self.vault_file.meta,
            contents,
            dek,
            etag: self.etag,
        })
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
    pub fn unlock_with_recovery_key(self, recovery_key: &str) -> Result<UnlockedVault> {
        use base64::Engine;

        let recovery_key = crate::crypto::RecoveryKey::from_display_string(recovery_key)?;
        let kek = recovery_key.derive_kek(&self.vault_file.meta.argon2_params)?;

        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(&self.vault_file.meta.encrypted_dek_recovery)
            .map_err(|_| VaultError::DecryptionError("Invalid base64 in encrypted_dek_recovery".to_string()))?;
        let dek = Dek::unwrap(&encrypted_dek_bytes, &kek)?;

        let contents = crate::crypto::encryption::decrypt_vault(&self.vault_file.encrypted_vault, &dek)?;

        Ok(UnlockedVault {
            meta: self.vault_file.meta,
            contents,
            dek,
            etag: self.etag,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PASSWORD: &str = "test-master-password";

    #[test]
    fn test_create_new_produces_valid_vault() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();

        assert_eq!(locked.vault_file.schema_version, CURRENT_SCHEMA_VERSION);
        assert!(locked.etag.is_none());
        assert!(!locked.vault_file.meta.vault_uuid.is_empty());
        assert!(uuid::Uuid::parse_str(&locked.vault_file.meta.vault_uuid).is_ok());
        assert!(!locked.vault_file.meta.encrypted_dek_master.is_empty());
        assert!(!locked.vault_file.meta.encrypted_dek_recovery.is_empty());
        assert!(!locked.vault_file.encrypted_vault.is_empty());
    }

    #[test]
    fn test_create_new_each_call_produces_different_dek_and_uuid() {
        let locked1 = LockedVault::create_new(PASSWORD).unwrap();
        let locked2 = LockedVault::create_new(PASSWORD).unwrap();

        assert_ne!(
            locked1.vault_file.meta.encrypted_dek_master,
            locked2.vault_file.meta.encrypted_dek_master,
        );
        assert_ne!(
            locked1.vault_file.meta.vault_uuid,
            locked2.vault_file.meta.vault_uuid,
        );
    }

    #[test]
    fn test_unlock_with_correct_password() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let unlocked = locked.unlock(PASSWORD).unwrap();

        assert!(unlocked.contents.entries.is_empty());
        assert!(unlocked.contents.labels.is_empty());
    }

    #[test]
    fn test_unlock_with_wrong_password() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let result = locked.unlock("wrong-password");

        assert!(result.is_err());
    }

    #[test]
    fn test_open_from_serialized_bytes() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let bytes = locked.to_vault_bytes().unwrap();

        let reopened = LockedVault::open(bytes, Some("etag-123".to_string())).unwrap();

        assert_eq!(reopened.vault_file.schema_version, CURRENT_SCHEMA_VERSION);
        assert_eq!(reopened.get_etag(), Some(&"etag-123".to_string()));

        let unlocked = reopened.unlock(PASSWORD).unwrap();
        assert!(unlocked.contents.entries.is_empty());
    }

    #[test]
    fn test_open_with_invalid_bytes() {
        let result = LockedVault::open(b"not valid json".to_vec(), None);
        assert!(result.is_err());
    }

    #[test]
    fn test_open_with_unsupported_schema_version() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let bytes = locked.to_vault_bytes().unwrap();

        let mut vault_json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        vault_json["schema_version"] = serde_json::json!(999);
        let tampered = serde_json::to_vec(&vault_json).unwrap();

        let result = LockedVault::open(tampered, None);
        assert!(matches!(result, Err(VaultError::UnsupportedSchemaVersion(999))));
    }

    #[test]
    fn test_to_vault_bytes_roundtrip() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let bytes = locked.to_vault_bytes().unwrap();

        let parsed: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        assert_eq!(parsed["schema_version"], CURRENT_SCHEMA_VERSION);
        assert!(parsed["meta"].is_object());
        assert!(parsed["encrypted_vault"].is_string());
    }

    #[test]
    fn test_unlock_with_recovery_key() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let mut unlocked = locked.unlock(PASSWORD).unwrap();

        let recovery_key = unlocked.regenerate_recovery_key(PASSWORD).unwrap();
        let recovery_str = recovery_key.to_display_string();

        let locked_again = unlocked.lock().unwrap();
        let unlocked_again = locked_again.unlock_with_recovery_key(&recovery_str).unwrap();

        assert!(unlocked_again.contents.entries.is_empty());
    }

    #[test]
    fn test_unlock_with_wrong_recovery_key() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();

        // create_new generates a recovery key internally, but we don't have it
        // Using a random recovery key should fail
        let other_locked = LockedVault::create_new("other-password").unwrap();
        let mut other_unlocked = other_locked.unlock("other-password").unwrap();
        let other_recovery = other_unlocked.regenerate_recovery_key("other-password").unwrap();
        let other_recovery_str = other_recovery.to_display_string();

        let result = locked.unlock_with_recovery_key(&other_recovery_str);
        assert!(result.is_err());
    }

    #[test]
    fn test_lock_unlock_preserves_data() {
        use crate::store::VaultEntry;

        use zeroize::Zeroizing;

        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let mut unlocked = locked.unlock(PASSWORD).unwrap();

        unlocked.contents.entries.insert(
            "test-id".to_string(),
            VaultEntry {
                entry_type: "secure_note".to_string(),
                name: "my note".to_string(),
                created_at: 1000,
                updated_at: 1000,
                deleted_at: None,
                purged_at: None,
                is_favorite: false,
                label_ids: vec![],
                typed_value: Zeroizing::new(r#"{"content":"hello"}"#.to_string()),
                notes: None,
                custom_fields: None,
            },
        );

        let locked_again = unlocked.lock().unwrap();
        let unlocked_again = locked_again.unlock(PASSWORD).unwrap();

        assert_eq!(unlocked_again.contents.entries.len(), 1);
        let entry = &unlocked_again.contents.entries["test-id"];
        assert_eq!(entry.name, "my note");
    }

    #[test]
    fn test_vault_uuid_preserved_through_lock_unlock() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let original_uuid = locked.vault_file.meta.vault_uuid.clone();

        let unlocked = locked.unlock(PASSWORD).unwrap();
        assert_eq!(unlocked.meta.vault_uuid, original_uuid);

        let locked_again = unlocked.lock().unwrap();
        assert_eq!(locked_again.vault_file.meta.vault_uuid, original_uuid);
    }

    #[test]
    fn test_vault_uuid_preserved_through_serialization() {
        let locked = LockedVault::create_new(PASSWORD).unwrap();
        let original_uuid = locked.vault_file.meta.vault_uuid.clone();

        let bytes = locked.to_vault_bytes().unwrap();
        let reopened = LockedVault::open(bytes, None).unwrap();
        assert_eq!(reopened.vault_file.meta.vault_uuid, original_uuid);
    }
}
