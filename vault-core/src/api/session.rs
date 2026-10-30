use crate::crypto::Dek;
use crate::secret::{MasterPassword, RecoveryKeyInput};
use crate::sync::engine::SessionState;
use crate::vault::LockedVault;

use super::VaultManager;

impl VaultManager {
    /// 新規Vaultを作成し、RecoveryKeyを返す
    pub fn api_create_new_vault(&self, master_password: String) -> Result<String, String> {
        let master_password = MasterPassword::from_string(master_password);
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
        let master_password = MasterPassword::from_string(master_password);
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
        let recovery_key = RecoveryKeyInput::from_string(recovery_key);
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

    /// アンロック中の DEK を base64 で書き出す。
    ///
    /// ブラウザ拡張の Service Worker は再起動でメモリ上のセッションを失うため、復元用の値を
    /// セッションストレージ（メモリのみ）に置く必要がある。マスターパスワードそのものを置くと
    /// 他サービスとの使い回しまで漏れうるため、代わりにこの値を置く（`api_unlock_with_dek`）
    pub fn api_export_dek(&self) -> Result<String, String> {
        use base64::Engine;
        self.with_unlocked(|unlocked| {
            Ok(base64::engine::general_purpose::STANDARD.encode(unlocked.dek.as_bytes()))
        })
    }

    /// `api_export_dek` で書き出した DEK でアンロック（Argon2 を通さない）
    pub fn api_unlock_with_dek(&self, dek_b64: String) -> Result<(), String> {
        use base64::Engine;
        use zeroize::{Zeroize, Zeroizing};

        let dek_b64 = Zeroizing::new(dek_b64);
        let decoded = Zeroizing::new(
            base64::engine::general_purpose::STANDARD
                .decode(dek_b64.as_bytes())
                .map_err(|_| "Invalid DEK encoding".to_string())?,
        );
        if decoded.len() != 32 {
            return Err("Invalid DEK length".to_string());
        }
        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(&decoded);
        let dek = Dek::from_bytes(bytes);
        bytes.zeroize();

        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        let locked = match session.take() {
            Some(SessionState::Locked(v)) => v,
            Some(SessionState::Unlocked(_)) => return Err("Already unlocked".to_string()),
            None => return Err("No vault loaded".to_string()),
        };

        // Clone as backup for rollback on unlock failure (ciphertext only).
        let backup = locked.clone();
        match locked.unlock_with_dek(dek) {
            Ok(unlocked) => {
                *session = Some(SessionState::Unlocked(unlocked));
                Ok(())
            }
            Err(e) => {
                *session = Some(SessionState::Locked(backup));
                Err(format!("Failed to unlock with DEK: {}", e))
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
