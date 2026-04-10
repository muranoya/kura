use crate::sync::engine::SessionState;
use crate::vault::LockedVault;

use super::VaultManager;

impl VaultManager {
    /// 新規Vaultを作成し、RecoveryKeyを返す
    pub fn api_create_new_vault(&self, master_password: String) -> Result<String, String> {
        let (locked_vault, recovery_key) = LockedVault::create_new(&master_password)
            .map_err(|e| format!("Failed to create vault: {}", e))?;

        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());
        *session = Some(SessionState::Locked(locked_vault));

        Ok(recovery_key.to_display_string())
    }

    /// 既存Vaultをメモリに読み込む
    pub fn api_load_vault(&self, vault_bytes: Vec<u8>, etag: String) -> Result<(), String> {
        let locked_vault = LockedVault::open(vault_bytes, Some(etag))
            .map_err(|e| format!("Failed to load vault: {}", e))?;

        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());
        *session = Some(SessionState::Locked(locked_vault));

        Ok(())
    }

    /// マスターパスワードでアンロック
    pub fn api_unlock(&self, master_password: String) -> Result<(), String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        let locked = match session.take() {
            Some(SessionState::Locked(v)) => v,
            Some(SessionState::Unlocked(_)) => return Err("Already unlocked".to_string()),
            None => return Err("No vault loaded".to_string()),
        };

        // Clone as backup for rollback on unlock failure.
        // This copies only ciphertext (encrypted DEK), not plaintext key material.
        let backup = locked.clone();
        match locked.unlock(&master_password) {
            Ok(unlocked) => {
                *session = Some(SessionState::Unlocked(unlocked));
                Ok(())
            }
            Err(e) => {
                *session = Some(SessionState::Locked(backup));
                Err(format!("Failed to unlock: {}", e))
            }
        }
    }

    /// リカバリーキーでアンロック（新しいマスターパスワード設定フロー）
    pub fn api_unlock_with_recovery_key(&self, recovery_key: String) -> Result<(), String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        let locked = match session.take() {
            Some(SessionState::Locked(v)) => v,
            Some(SessionState::Unlocked(_)) => return Err("Already unlocked".to_string()),
            None => return Err("No vault loaded".to_string()),
        };

        // Clone as backup for rollback on unlock failure.
        // This copies only ciphertext (encrypted DEK), not plaintext key material.
        let backup = locked.clone();
        match locked.unlock_with_recovery_key(&recovery_key) {
            Ok(unlocked) => {
                *session = Some(SessionState::Unlocked(unlocked));
                Ok(())
            }
            Err(e) => {
                *session = Some(SessionState::Locked(backup));
                Err(format!("Failed to unlock with recovery key: {}", e))
            }
        }
    }

    /// ロック（vault_bytesを返す）
    pub fn api_lock(&self) -> Result<Vec<u8>, String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        match session.take() {
            Some(SessionState::Unlocked(unlocked)) => {
                let locked = unlocked
                    .lock()
                    .map_err(|e| format!("Failed to lock: {}", e))?;
                let vault_bytes = locked
                    .to_vault_bytes()
                    .map_err(|e| format!("Failed to serialize vault: {}", e))?;

                *session = Some(SessionState::Locked(locked));
                Ok(vault_bytes)
            }
            Some(SessionState::Locked(_)) => Err("Already locked".to_string()),
            None => Err("No vault loaded".to_string()),
        }
    }
}
