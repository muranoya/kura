use crate::crypto::Dek;
use crate::error::{Result, VaultError};
use crate::models::Argon2Params;

use super::UnlockedVault;

impl UnlockedVault {
    /// Change master password
    pub fn change_master_password(&mut self, old_password: &str, new_password: &str) -> Result<()> {
        use base64::Engine;

        // Verify old password
        let old_kek = crate::crypto::kdf::derive_kek(old_password, &self.meta.argon2_params)?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine
            .decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _old_dek = Dek::unwrap(&encrypted_dek_bytes, &old_kek)?;

        // Derive new KEK from new password
        let new_kek = crate::crypto::kdf::derive_kek(new_password, &self.meta.argon2_params)?;
        let encrypted_dek_master = self.dek.wrap(&new_kek)?;

        // Update vault_meta
        let engine = base64::engine::general_purpose::STANDARD;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);

        Ok(())
    }

    /// Rotate DEK and regenerate recovery key
    /// Returns the new recovery key for user to save
    pub fn rotate_dek(&mut self, master_password: &str) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify master password first
        let kek_master = crate::crypto::kdf::derive_kek(master_password, &self.meta.argon2_params)?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine
            .decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _verified_dek = Dek::unwrap(&encrypted_dek_bytes, &kek_master)?;

        // Generate new DEK
        let new_dek = Dek::generate();
        let encrypted_dek_master = new_dek.wrap(&kek_master)?;

        // Generate new recovery key
        let new_recovery_key = crate::crypto::RecoveryKey::generate();
        let kek_recovery = new_recovery_key.derive_kek(&self.meta.argon2_params)?;
        let encrypted_dek_recovery = new_dek.wrap(&kek_recovery)?;

        // Update vault state
        self.dek = new_dek;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);
        self.meta.encrypted_dek_recovery = engine.encode(&encrypted_dek_recovery);

        Ok(new_recovery_key)
    }

    /// Upgrade Argon2 parameters for stronger key derivation
    pub fn upgrade_argon2_params(
        &mut self,
        master_password: &str,
        new_params: Argon2Params,
    ) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify password with old params
        let old_kek = crate::crypto::kdf::derive_kek(master_password, &self.meta.argon2_params)?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine
            .decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _old_dek = Dek::unwrap(&encrypted_dek_bytes, &old_kek)?;

        // Derive new KEK with new params
        let new_kek = crate::crypto::kdf::derive_kek(master_password, &new_params)?;
        let encrypted_dek_master = self.dek.wrap(&new_kek)?;

        // Generate new recovery key with new params
        let new_recovery_key = crate::crypto::RecoveryKey::generate();
        let kek_recovery = new_recovery_key.derive_kek(&new_params)?;
        let encrypted_dek_recovery = self.dek.wrap(&kek_recovery)?;

        // Update vault_meta
        self.meta.argon2_params = new_params;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);
        self.meta.encrypted_dek_recovery = engine.encode(&encrypted_dek_recovery);

        Ok(new_recovery_key)
    }

    /// Regenerate recovery key
    pub fn regenerate_recovery_key(
        &mut self,
        master_password: &str,
    ) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify master password
        let kek_master = crate::crypto::kdf::derive_kek(master_password, &self.meta.argon2_params)?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine
            .decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _verified_dek = Dek::unwrap(&encrypted_dek_bytes, &kek_master)?;

        // Generate new recovery key
        let new_recovery_key = crate::crypto::RecoveryKey::generate();
        let kek_recovery = new_recovery_key.derive_kek(&self.meta.argon2_params)?;
        let encrypted_dek_recovery = self.dek.wrap(&kek_recovery)?;

        // Update vault_meta
        self.meta.encrypted_dek_recovery = engine.encode(&encrypted_dek_recovery);

        Ok(new_recovery_key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::LockedVault;

    use crate::store::VaultEntry;
    use zeroize::Zeroizing;

    const PASSWORD: &str = "test-master-password";

    fn create_unlocked_vault() -> UnlockedVault {
        let (locked, _) = LockedVault::create_new(PASSWORD).unwrap();
        locked.unlock(PASSWORD).unwrap()
    }

    #[test]
    fn test_change_master_password_success() {
        let mut vault = create_unlocked_vault();
        let new_password = "new-master-password";

        vault
            .change_master_password(PASSWORD, new_password)
            .unwrap();

        // Lock and unlock with new password should work
        let locked = vault.lock().unwrap();
        let _unlocked = locked.unlock(new_password).unwrap();
    }

    #[test]
    fn test_change_master_password_wrong_old_password() {
        let mut vault = create_unlocked_vault();

        let result = vault.change_master_password("wrong-password", "new-password");
        assert!(result.is_err());
    }

    #[test]
    fn test_change_master_password_old_password_no_longer_works() {
        let mut vault = create_unlocked_vault();
        let new_password = "new-master-password";

        vault
            .change_master_password(PASSWORD, new_password)
            .unwrap();

        let locked = vault.lock().unwrap();
        let result = locked.unlock(PASSWORD);
        assert!(result.is_err());
    }

    #[test]
    fn test_rotate_dek_success() {
        let mut vault = create_unlocked_vault();

        // Add an entry to verify data survives rotation
        vault.contents.entries.insert(
            uuid::Uuid::new_v4().to_string(),
            VaultEntry {
                entry_type: "secure_note".to_string(),
                name: "test-note".to_string(),
                created_at: 1000,
                updated_at: 1000,
                deleted_at: None,
                purged_at: None,
                is_favorite: false,
                label_ids: vec![],
                typed_value: Zeroizing::new(r#"{"content":"secret"}"#.to_string()),
                notes: None,
                custom_fields: None,
            },
        );

        let recovery_key = vault.rotate_dek(PASSWORD).unwrap();

        // Should still unlock with master password after lock
        let locked = vault.lock().unwrap();
        let unlocked = locked.unlock(PASSWORD).unwrap();
        assert_eq!(unlocked.contents.entries.len(), 1);

        // New recovery key should work
        let locked2 = unlocked.lock().unwrap();
        let _unlocked2 = locked2
            .unlock_with_recovery_key(&recovery_key.to_display_string())
            .unwrap();
    }

    #[test]
    fn test_rotate_dek_wrong_password() {
        let mut vault = create_unlocked_vault();

        let result = vault.rotate_dek("wrong-password");
        assert!(result.is_err());
    }

    #[test]
    fn test_upgrade_argon2_params() {
        let mut vault = create_unlocked_vault();

        let new_params = Argon2Params {
            salt: vault.meta.argon2_params.salt.clone(),
            iterations: 4,
            memory: 131072,
            parallelism: 4,
        };

        let recovery_key = vault.upgrade_argon2_params(PASSWORD, new_params).unwrap();

        // Verify params were updated
        assert_eq!(vault.meta.argon2_params.iterations, 4);
        assert_eq!(vault.meta.argon2_params.memory, 131072);

        // Should still work with master password
        let locked = vault.lock().unwrap();
        let unlocked = locked.unlock(PASSWORD).unwrap();

        // Recovery key should also work
        let locked2 = unlocked.lock().unwrap();
        let _unlocked2 = locked2
            .unlock_with_recovery_key(&recovery_key.to_display_string())
            .unwrap();
    }

    #[test]
    fn test_upgrade_argon2_params_wrong_password() {
        let mut vault = create_unlocked_vault();

        let new_params = Argon2Params {
            salt: vault.meta.argon2_params.salt.clone(),
            iterations: 4,
            memory: 131072,
            parallelism: 4,
        };

        let result = vault.upgrade_argon2_params("wrong-password", new_params);
        assert!(result.is_err());
    }

    #[test]
    fn test_regenerate_recovery_key() {
        let mut vault = create_unlocked_vault();

        let new_recovery_key = vault.regenerate_recovery_key(PASSWORD).unwrap();

        // New recovery key should work
        let locked = vault.lock().unwrap();
        let _unlocked = locked
            .unlock_with_recovery_key(&new_recovery_key.to_display_string())
            .unwrap();
    }

    #[test]
    fn test_regenerate_recovery_key_wrong_password() {
        let mut vault = create_unlocked_vault();

        let result = vault.regenerate_recovery_key("wrong-password");
        assert!(result.is_err());
    }

    #[test]
    fn test_change_password_then_rotate_dek() {
        let mut vault = create_unlocked_vault();
        let new_password = "new-password";

        vault
            .change_master_password(PASSWORD, new_password)
            .unwrap();
        let recovery_key = vault.rotate_dek(new_password).unwrap();

        let locked = vault.lock().unwrap();
        let unlocked = locked.unlock(new_password).unwrap();
        assert!(unlocked.contents.entries.is_empty());

        let locked2 = unlocked.lock().unwrap();
        let _unlocked2 = locked2
            .unlock_with_recovery_key(&recovery_key.to_display_string())
            .unwrap();
    }
}
