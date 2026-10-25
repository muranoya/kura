use crate::crypto::{Dek, SubKeys};
use crate::error::{Result, VaultError};
use crate::models::Argon2Params;
use crate::secret::{MasterPassword, RecoveryKeyInput};

use super::UnlockedVault;

impl UnlockedVault {
    /// Change master password
    pub fn change_master_password(
        &mut self,
        old_password: &MasterPassword,
        new_password: &MasterPassword,
    ) -> Result<()> {
        use base64::Engine;

        // Verify old password
        let old_kek = crate::crypto::kdf::derive_kek_from_master_password(
            old_password,
            &self.meta.argon2_params,
        )?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine
            .decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _old_dek = Dek::unwrap(&encrypted_dek_bytes, &old_kek)?;

        // Derive new KEK from new password
        let new_kek = crate::crypto::kdf::derive_kek_from_master_password(
            new_password,
            &self.meta.argon2_params,
        )?;
        let encrypted_dek_master = self.dek.wrap(&new_kek)?;

        // Update vault_meta
        let engine = base64::engine::general_purpose::STANDARD;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);
        self.meta.updated_at = crate::get_timestamp();

        Ok(())
    }

    /// Reset master password using the recovery key (forgotten master password flow)
    pub fn reset_master_password_with_recovery_key(
        &mut self,
        recovery_key: &RecoveryKeyInput,
        new_password: &MasterPassword,
    ) -> Result<()> {
        use base64::Engine;

        // Verify recovery key
        let recovery_kek = crate::crypto::RecoveryKey::derive_kek_from_input(
            recovery_key,
            &self.meta.argon2_params,
        )?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine
            .decode(&self.meta.encrypted_dek_recovery)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _recovery_dek = Dek::unwrap(&encrypted_dek_bytes, &recovery_kek)?;

        // Derive new KEK from new password
        let new_kek = crate::crypto::kdf::derive_kek_from_master_password(
            new_password,
            &self.meta.argon2_params,
        )?;
        let encrypted_dek_master = self.dek.wrap(&new_kek)?;

        // Update vault_meta
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);

        Ok(())
    }

    /// Rotate DEK and regenerate recovery key
    /// Returns the new recovery key for user to save
    pub fn rotate_dek(
        &mut self,
        master_password: &MasterPassword,
    ) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify master password first
        let kek_master = crate::crypto::kdf::derive_kek_from_master_password(
            master_password,
            &self.meta.argon2_params,
        )?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine
            .decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _verified_dek = Dek::unwrap(&encrypted_dek_bytes, &kek_master)?;

        // 旧 DEK のうちに全 secret を復号しておく。1 件でも復号できなければ、
        // vault の状態を変えずにエラーを返す（新しい DEK に切り替えると、その secret は
        // 二度と復号できなくなるため）
        let mut plaintexts = Vec::new();
        for (id, entry) in &self.index.entries {
            if entry.secret_rev.is_some() {
                plaintexts.push((id.clone(), self.read_secret(id)?.to_bytes()?));
            }
        }

        // Generate new DEK
        let new_dek = Dek::generate();
        let encrypted_dek_master = new_dek.wrap(&kek_master)?;

        // Generate new recovery key
        let new_recovery_key = crate::crypto::RecoveryKey::generate();
        let kek_recovery = new_recovery_key.derive_kek(&self.meta.argon2_params)?;
        let encrypted_dek_recovery = new_dek.wrap(&kek_recovery)?;

        // Update vault state
        self.keys = SubKeys::derive(&new_dek);
        self.dek = new_dek;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);
        self.meta.encrypted_dek_recovery = engine.encode(&encrypted_dek_recovery);
        self.meta.updated_at = crate::get_timestamp();

        // 全 secret を新しいサブ鍵で再暗号化する（secret_rev も再生成する）。
        // index は次の書き込み時に新しいサブ鍵で暗号化される
        for (id, plaintext) in plaintexts {
            self.seal_secret_with_new_rev(&id, &plaintext)?;
        }

        Ok(new_recovery_key)
    }

    /// Upgrade Argon2 parameters for stronger key derivation
    pub fn upgrade_argon2_params(
        &mut self,
        master_password: &MasterPassword,
        new_params: Argon2Params,
    ) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify password with old params
        let old_kek = crate::crypto::kdf::derive_kek_from_master_password(
            master_password,
            &self.meta.argon2_params,
        )?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine
            .decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _old_dek = Dek::unwrap(&encrypted_dek_bytes, &old_kek)?;

        // Derive new KEK with new params
        let new_kek =
            crate::crypto::kdf::derive_kek_from_master_password(master_password, &new_params)?;
        let encrypted_dek_master = self.dek.wrap(&new_kek)?;

        // Generate new recovery key with new params
        let new_recovery_key = crate::crypto::RecoveryKey::generate();
        let kek_recovery = new_recovery_key.derive_kek(&new_params)?;
        let encrypted_dek_recovery = self.dek.wrap(&kek_recovery)?;

        // Update vault_meta
        self.meta.argon2_params = new_params;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);
        self.meta.encrypted_dek_recovery = engine.encode(&encrypted_dek_recovery);
        self.meta.updated_at = crate::get_timestamp();

        Ok(new_recovery_key)
    }

    /// Regenerate recovery key
    pub fn regenerate_recovery_key(
        &mut self,
        master_password: &MasterPassword,
    ) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify master password
        let kek_master = crate::crypto::kdf::derive_kek_from_master_password(
            master_password,
            &self.meta.argon2_params,
        )?;
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
        self.meta.updated_at = crate::get_timestamp();

        Ok(new_recovery_key)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::LockedVault;

    const PASSWORD: &str = "test-master-password";

    fn mp(value: &str) -> MasterPassword {
        MasterPassword::from_string(value.to_string())
    }

    fn recovery_key_input(value: String) -> RecoveryKeyInput {
        RecoveryKeyInput::from_string(value)
    }

    fn create_unlocked_vault() -> UnlockedVault {
        let password = mp(PASSWORD);
        let (locked, _) = LockedVault::create_new(&password).unwrap();
        locked.unlock(&password).unwrap()
    }

    #[test]
    fn test_change_master_password_success() {
        let mut vault = create_unlocked_vault();
        let new_password = "new-master-password";

        vault
            .change_master_password(&mp(PASSWORD), &mp(new_password))
            .unwrap();

        // Lock and unlock with new password should work
        let locked = vault.lock().unwrap();
        let _unlocked = locked.unlock(&mp(new_password)).unwrap();
    }

    /// 同じ vault を開いている 2 台の端末を作る（meta の更新時刻は過去にしておく）
    fn two_devices() -> (UnlockedVault, UnlockedVault) {
        let mut a = create_unlocked_vault();
        a.meta.updated_at = 0;
        let locked = LockedVault {
            vault_file: crate::store::StoredVault::V2(a.to_vault_file().unwrap()),
            etag: None,
        };
        let b = locked.unlock(&mp(PASSWORD)).unwrap();
        (a, b)
    }

    #[test]
    fn test_merge_keeps_password_change_from_other_device() {
        let (mut a, mut b) = two_devices();
        a.change_master_password(&mp(PASSWORD), &mp("new-password"))
            .unwrap();

        // 端末 B は古い meta のまま編集し、A の変更をマージしてから push する
        b.create_entry(
            "note".into(),
            "secure_note".into(),
            crate::models::EntryData::new_secure_note("s".into(), None),
            vec![],
        )
        .unwrap();
        b.merge_remote(&crate::store::StoredVault::V2(a.to_vault_file().unwrap()))
            .unwrap();

        let locked = b.lock().unwrap();
        assert!(locked.clone().unlock(&mp(PASSWORD)).is_err());
        assert!(locked.unlock(&mp("new-password")).is_ok());
    }

    #[test]
    fn test_merge_keeps_local_password_change_not_yet_pushed() {
        let (mut a, b) = two_devices();
        // 端末 A で変更し、push する前に（古い meta のままの）リモートをマージする
        a.change_master_password(&mp(PASSWORD), &mp("new-password"))
            .unwrap();
        a.merge_remote(&crate::store::StoredVault::V2(b.to_vault_file().unwrap()))
            .unwrap();

        let locked = a.lock().unwrap();
        assert!(locked.unlock(&mp("new-password")).is_ok());
    }

    #[test]
    fn test_change_master_password_wrong_old_password() {
        let mut vault = create_unlocked_vault();

        let result = vault.change_master_password(&mp("wrong-password"), &mp("new-password"));
        assert!(result.is_err());
    }

    #[test]
    fn test_change_master_password_old_password_no_longer_works() {
        let mut vault = create_unlocked_vault();
        let new_password = "new-master-password";

        vault
            .change_master_password(&mp(PASSWORD), &mp(new_password))
            .unwrap();

        let locked = vault.lock().unwrap();
        let result = locked.unlock(&mp(PASSWORD));
        assert!(result.is_err());
    }

    #[test]
    fn test_rotate_dek_success() {
        let mut vault = create_unlocked_vault();

        // Add an entry to verify data survives rotation
        let entry = vault
            .create_entry(
                "test-note".to_string(),
                "secure_note".to_string(),
                crate::models::EntryData::new_secure_note("secret".to_string(), None),
                vec![],
            )
            .unwrap();
        let rev_before = vault.index.entries[&entry.id].secret_rev.clone();
        let sealed_before = vault.secrets[&entry.id].clone();

        let recovery_key = vault.rotate_dek(&mp(PASSWORD)).unwrap();

        // secret は新しい鍵で再暗号化され、secret_rev も再生成される
        assert_ne!(vault.index.entries[&entry.id].secret_rev, rev_before);
        assert_ne!(vault.secrets[&entry.id], sealed_before);

        // Should still unlock with master password after lock
        let locked = vault.lock().unwrap();
        let unlocked = locked.unlock(&mp(PASSWORD)).unwrap();
        assert_eq!(unlocked.index.entries.len(), 1);
        let restored = unlocked.get_entry(&entry.id).unwrap().unwrap();
        match restored.data.typed_value {
            crate::models::TypedValue::SecureNote(d) => assert_eq!(d.content.as_str(), "secret"),
            _ => panic!("Expected SecureNote"),
        }

        // New recovery key should work
        let locked2 = unlocked.lock().unwrap();
        let _unlocked2 = locked2
            .unlock_with_recovery_key(&recovery_key_input(recovery_key.to_display_string()))
            .unwrap();
    }

    #[test]
    fn test_rotate_dek_wrong_password() {
        let mut vault = create_unlocked_vault();

        let result = vault.rotate_dek(&mp("wrong-password"));
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

        let recovery_key = vault
            .upgrade_argon2_params(&mp(PASSWORD), new_params)
            .unwrap();

        // Verify params were updated
        assert_eq!(vault.meta.argon2_params.iterations, 4);
        assert_eq!(vault.meta.argon2_params.memory, 131072);

        // Should still work with master password
        let locked = vault.lock().unwrap();
        let unlocked = locked.unlock(&mp(PASSWORD)).unwrap();

        // Recovery key should also work
        let locked2 = unlocked.lock().unwrap();
        let _unlocked2 = locked2
            .unlock_with_recovery_key(&recovery_key_input(recovery_key.to_display_string()))
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

        let result = vault.upgrade_argon2_params(&mp("wrong-password"), new_params);
        assert!(result.is_err());
    }

    #[test]
    fn test_regenerate_recovery_key() {
        let mut vault = create_unlocked_vault();

        let new_recovery_key = vault.regenerate_recovery_key(&mp(PASSWORD)).unwrap();

        // New recovery key should work
        let locked = vault.lock().unwrap();
        let _unlocked = locked
            .unlock_with_recovery_key(&recovery_key_input(new_recovery_key.to_display_string()))
            .unwrap();
    }

    #[test]
    fn test_regenerate_recovery_key_wrong_password() {
        let mut vault = create_unlocked_vault();

        let result = vault.regenerate_recovery_key(&mp("wrong-password"));
        assert!(result.is_err());
    }

    #[test]
    fn test_change_password_then_rotate_dek() {
        let mut vault = create_unlocked_vault();
        let new_password = "new-password";

        vault
            .change_master_password(&mp(PASSWORD), &mp(new_password))
            .unwrap();
        let recovery_key = vault.rotate_dek(&mp(new_password)).unwrap();

        let locked = vault.lock().unwrap();
        let unlocked = locked.unlock(&mp(new_password)).unwrap();
        assert!(unlocked.index.entries.is_empty());

        let locked2 = unlocked.lock().unwrap();
        let _unlocked2 = locked2
            .unlock_with_recovery_key(&recovery_key_input(recovery_key.to_display_string()))
            .unwrap();
    }

    #[test]
    fn test_reset_master_password_with_recovery_key_success() {
        let (locked, recovery_key) = LockedVault::create_new(&mp(PASSWORD)).unwrap();
        let recovery_str = recovery_key.to_display_string();
        let mut vault = locked
            .unlock_with_recovery_key(&recovery_key_input(recovery_str.clone()))
            .unwrap();
        let new_password = "new-master-password";

        vault
            .reset_master_password_with_recovery_key(
                &recovery_key_input(recovery_str.clone()),
                &mp(new_password),
            )
            .unwrap();

        // New password works, old password no longer works, recovery key still works
        let locked = vault.lock().unwrap();
        assert!(locked.clone().unlock(&mp(PASSWORD)).is_err());
        assert!(locked
            .clone()
            .unlock_with_recovery_key(&recovery_key_input(recovery_str))
            .is_ok());
        let _unlocked = locked.unlock(&mp(new_password)).unwrap();
    }

    #[test]
    fn test_reset_master_password_with_wrong_recovery_key() {
        let mut vault = create_unlocked_vault();
        let (_, other_recovery) = LockedVault::create_new(&mp("other-password")).unwrap();

        let result = vault.reset_master_password_with_recovery_key(
            &recovery_key_input(other_recovery.to_display_string()),
            &mp("new-password"),
        );
        assert!(result.is_err());

        // Original password still works
        let locked = vault.lock().unwrap();
        let _unlocked = locked.unlock(&mp(PASSWORD)).unwrap();
    }
}
