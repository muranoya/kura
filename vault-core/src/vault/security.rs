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
        let params = self.meta.argon2_params.clone();
        self.set_master_slot(engine.encode(&encrypted_dek_master), params);

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
        let recovery_params = self.meta.argon2_params.clone();
        let kek_recovery = new_recovery_key.derive_kek(&recovery_params)?;
        let encrypted_dek_recovery = new_dek.wrap(&kek_recovery)?;

        // Update vault state
        self.keys = SubKeys::derive(&new_dek);
        self.dek = new_dek;
        let master_params = self.meta.argon2_params.clone();
        self.set_master_slot(engine.encode(&encrypted_dek_master), master_params);
        self.set_recovery_slot(engine.encode(&encrypted_dek_recovery), recovery_params);

        // 全 secret を新しいサブ鍵で再暗号化する（secret_rev も再生成する）。
        // index は次の書き込み時に新しいサブ鍵で暗号化される
        for (id, plaintext) in plaintexts {
            self.seal_secret_with_new_rev(&id, &plaintext)?;
        }

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
        let recovery_params = self.meta.argon2_params.clone();
        let kek_recovery = new_recovery_key.derive_kek(&recovery_params)?;
        let encrypted_dek_recovery = self.dek.wrap(&kek_recovery)?;

        // Update vault_meta
        self.set_recovery_slot(engine.encode(&encrypted_dek_recovery), recovery_params);

        Ok(new_recovery_key)
    }
}

impl UnlockedVault {
    /// master スロットを置き換える。新しく書いた値なので、改ざんの疑いも解消する
    fn set_master_slot(&mut self, encrypted_dek: String, params: Argon2Params) {
        self.meta.set_master_slot(encrypted_dek, params);
        self.untrusted_meta.master = None;
    }

    /// recovery スロットを置き換える。新しく書いた値なので、改ざんの疑いも解消する
    fn set_recovery_slot(&mut self, encrypted_dek: String, params: Argon2Params) {
        self.meta.set_recovery_slot(encrypted_dek, params);
        self.untrusted_meta.recovery = None;
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
        a.meta.master_updated_at = 0;
        a.meta.recovery_updated_at = 0;
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

    fn v2(vault: &UnlockedVault) -> crate::store::StoredVault {
        crate::store::StoredVault::V2(vault.to_vault_file().unwrap())
    }

    fn lock_vault(vault: UnlockedVault) -> LockedVault {
        vault.lock().unwrap()
    }

    #[test]
    fn test_merge_ignores_tampered_remote_meta() {
        // ストレージに書き込める攻撃者が、index はそのままに meta だけを壊し、
        // 更新時刻を未来にしても採用しない
        let (mut a, b) = two_devices();
        let mut file = b.to_vault_file().unwrap();
        file.meta.encrypted_dek_master = "AAAA".into();
        file.meta.encrypted_dek_recovery = "AAAA".into();
        file.meta.master_updated_at = 4_102_444_800;
        file.meta.recovery_updated_at = 4_102_444_800;
        a.merge_remote(&crate::store::StoredVault::V2(file))
            .unwrap();

        assert!(lock_vault(a).unlock(&mp(PASSWORD)).is_ok());
    }

    #[test]
    fn test_new_device_does_not_spread_tampered_meta() {
        // ストレージ上で recovery スロットだけを改ざんされた vault を、新しい端末がダウンロードして
        // そのまま push しても、改ざんされたスロットは他の端末に採用されない。
        // 新しい端末自身も、次の同期で正しいスロットに戻る
        let password = mp(PASSWORD);
        let (locked, recovery_key) = LockedVault::create_new(&password).unwrap();
        let mut a = locked.unlock(&password).unwrap();
        let mut file = a.to_vault_file().unwrap();
        file.meta.encrypted_dek_recovery = "AAAA".into();
        file.meta.recovery_updated_at = 4_102_444_800;
        let mut new_device = LockedVault {
            vault_file: crate::store::StoredVault::V2(file),
            etag: None,
        }
        .unlock(&password)
        .unwrap();

        a.merge_remote(&v2(&new_device)).unwrap();
        new_device.merge_remote(&v2(&a)).unwrap();

        let recovery = || recovery_key_input(recovery_key.to_display_string());
        for vault in [a, new_device] {
            assert!(lock_vault(vault)
                .unlock_with_recovery_key(&recovery())
                .is_ok());
        }
    }

    #[test]
    fn test_merge_ignores_remote_meta_without_digest() {
        // ダイジェストを持たない index（このクライアントより前の版が書いたもの）の meta は採用しない
        let (mut a, mut b) = two_devices();
        b.change_master_password(&mp(PASSWORD), &mp("new-password"))
            .unwrap();
        let mut file = b.to_vault_file().unwrap();
        // to_bytes はダイジェストを書かない
        file.index = b
            .keys
            .seal_index(&b.meta.vault_uuid, &b.index.to_bytes().unwrap())
            .unwrap();
        a.merge_remote(&crate::store::StoredVault::V2(file))
            .unwrap();

        assert!(lock_vault(a).unlock(&mp(PASSWORD)).is_ok());
    }

    #[test]
    fn test_merge_keeps_concurrent_changes_to_different_slots() {
        // 端末 A でリカバリーキーを再発行し、それを知らない端末 B でマスターパスワードを変更する。
        // どちらの順でマージしても、両方の変更が残る
        let (mut a, mut b) = two_devices();
        let recovery_key = a.regenerate_recovery_key(&mp(PASSWORD)).unwrap();
        b.change_master_password(&mp(PASSWORD), &mp("new-password"))
            .unwrap();

        let a_file = v2(&a);
        b.merge_remote(&a_file).unwrap();
        a.merge_remote(&v2(&b)).unwrap();

        for vault in [a, b] {
            let locked = lock_vault(vault);
            assert!(locked.clone().unlock(&mp("new-password")).is_ok());
            assert!(locked
                .unlock_with_recovery_key(&recovery_key_input(recovery_key.to_display_string()))
                .is_ok());
        }
    }

    #[test]
    fn test_merge_converges_when_slot_times_are_equal() {
        // 移行直後など、両端末のスロットの更新時刻が同じで中身が異なる場合でも、
        // どちらの端末も同じ方を採用して収束する
        let (mut a, mut b) = two_devices();
        a.change_master_password(&mp(PASSWORD), &mp("password-a"))
            .unwrap();
        b.change_master_password(&mp(PASSWORD), &mp("password-b"))
            .unwrap();
        a.meta.master_updated_at = 0;
        b.meta.master_updated_at = 0;

        let a_file = v2(&a);
        a.merge_remote(&v2(&b)).unwrap();
        b.merge_remote(&a_file).unwrap();

        assert_eq!(a.meta.encrypted_dek_master, b.meta.encrypted_dek_master);
    }

    #[test]
    fn test_change_after_adopting_future_slot_still_wins() {
        // 時計が進んでいる端末の変更を取り込んだ後でも、次の変更はそれより新しくなる
        let (mut a, mut b) = two_devices();
        a.change_master_password(&mp(PASSWORD), &mp("password-a"))
            .unwrap();
        a.meta.master_updated_at = crate::get_timestamp() + 1_000_000;
        b.merge_remote(&v2(&a)).unwrap();

        b.change_master_password(&mp("password-a"), &mp("password-b"))
            .unwrap();
        a.merge_remote(&v2(&b)).unwrap();

        assert!(lock_vault(a).unlock(&mp("password-b")).is_ok());
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
