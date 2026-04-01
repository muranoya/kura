use crate::sync::engine::SessionState;

use super::VaultManager;

impl VaultManager {
    /// マスターパスワード変更
    pub fn api_change_master_password(&self, old_password: String, new_password: String) -> Result<(), String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            unlocked.change_master_password(&old_password, &new_password)
                .map_err(|e| format!("Failed to change master password: {}", e))
        } else {
            Err("Vault not unlocked".to_string())
        }
    }

    /// Argon2パラメータアップグレード
    pub fn api_upgrade_argon2_params(&self, password: String, iterations: u32, memory: u32, parallelism: u32) -> Result<String, String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        let new_params = crate::models::Argon2Params {
            salt: crate::codec::base32::encode(&rand::random::<[u8; 16]>()),
            iterations,
            memory,
            parallelism,
        };

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            unlocked.upgrade_argon2_params(&password, new_params)
                .map_err(|e| format!("Failed to upgrade argon2 params: {}", e))
                .map(|recovery_key| recovery_key.to_display_string())
        } else {
            Err("Vault not unlocked".to_string())
        }
    }

    /// DEK ローテーション（新しいリカバリーキーを返す）
    pub fn api_rotate_dek(&self, password: String) -> Result<String, String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            let recovery_key = unlocked.rotate_dek(&password)
                .map_err(|e| format!("Failed to rotate DEK: {}", e))?;
            Ok(recovery_key.to_display_string())
        } else {
            Err("Vault not unlocked".to_string())
        }
    }

    /// リカバリーキー再発行
    pub fn api_regenerate_recovery_key(&self, password: String) -> Result<String, String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            let recovery_key = unlocked.regenerate_recovery_key(&password)
                .map_err(|e| format!("Failed to regenerate recovery key: {}", e))?;
            Ok(recovery_key.to_display_string())
        } else {
            Err("Vault not unlocked".to_string())
        }
    }
}
