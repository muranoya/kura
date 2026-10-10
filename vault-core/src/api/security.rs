use crate::crypto;
use crate::secret::{MasterPassword, PlaintextConfig};

use super::VaultManager;

impl VaultManager {
    /// S3設定などの任意データをマスターパスワードで暗号化
    /// Locked/Unlocked両状態で動作（Argon2Paramsのみ必要）
    pub fn api_encrypt_config(
        &self,
        password: String,
        plaintext: String,
    ) -> Result<String, String> {
        let password = MasterPassword::from_string(password);
        let plaintext = PlaintextConfig::from_string(plaintext);
        let kek = self.derive_kek(&password)?;

        crypto::config::encrypt_with_kek(plaintext.as_bytes(), &kek)
            .map_err(|e| format!("Failed to encrypt config: {}", e))
    }

    /// マスターパスワードで暗号化されたデータを復号
    /// Locked/Unlocked両状態で動作
    pub fn api_decrypt_config(
        &self,
        password: String,
        encrypted_b64: String,
    ) -> Result<String, String> {
        let password = MasterPassword::from_string(password);
        let kek = self.derive_kek(&password)?;
        decrypt_config_with_kek(&encrypted_b64, &kek)
    }

    /// `api_derive_session_key`で得たセッション鍵で、マスターパスワードで暗号化されたデータを復号
    pub fn api_decrypt_config_with_session_key(
        &self,
        session_key: String,
        encrypted_b64: String,
    ) -> Result<String, String> {
        let kek = super::decode_session_key(session_key)?;
        decrypt_config_with_kek(&encrypted_b64, &kek)
    }

    /// マスターパスワードの検証（KEK導出→DEK復号を試みる）
    pub fn api_verify_password(&self, password: String) -> Result<(), String> {
        let password = MasterPassword::from_string(password);
        self.with_unlocked(|unlocked| {
            use base64::Engine;
            let engine = base64::engine::general_purpose::STANDARD;

            let kek = crypto::kdf::derive_kek_from_master_password(
                &password,
                &unlocked.meta.argon2_params,
            )
            .map_err(|e| format!("Failed to derive KEK: {}", e))?;
            let encrypted_dek_bytes = engine
                .decode(&unlocked.meta.encrypted_dek_master)
                .map_err(|_| "Invalid base64".to_string())?;
            crypto::dek::Dek::unwrap(&encrypted_dek_bytes, &kek)
                .map_err(|_| "Invalid password".to_string())?;
            Ok(())
        })
    }

    /// マスターパスワード変更
    pub fn api_change_master_password(
        &self,
        old_password: String,
        new_password: String,
    ) -> Result<(), String> {
        let old_password = MasterPassword::from_string(old_password);
        let new_password = MasterPassword::from_string(new_password);
        self.with_unlocked_mut(|unlocked| {
            unlocked
                .change_master_password(&old_password, &new_password)
                .map_err(|e| format!("Failed to change master password: {}", e))
        })
    }

    /// Argon2パラメータアップグレード
    pub fn api_upgrade_argon2_params(
        &self,
        password: String,
        iterations: u32,
        memory: u32,
        parallelism: u32,
    ) -> Result<String, String> {
        let password = MasterPassword::from_string(password);
        let new_params = crate::models::Argon2Params {
            salt: crate::codec::base32::encode(&rand::random::<[u8; 16]>()),
            iterations,
            memory,
            parallelism,
        };

        self.with_unlocked_mut(|unlocked| {
            unlocked
                .upgrade_argon2_params(&password, new_params)
                .map_err(|e| format!("Failed to upgrade argon2 params: {}", e))
                .map(|recovery_key| recovery_key.to_display_string())
        })
    }

    /// DEK ローテーション（新しいリカバリーキーを返す）
    pub fn api_rotate_dek(&self, password: String) -> Result<String, String> {
        let password = MasterPassword::from_string(password);
        self.with_unlocked_mut(|unlocked| {
            let recovery_key = unlocked
                .rotate_dek(&password)
                .map_err(|e| format!("Failed to rotate DEK: {}", e))?;
            Ok(recovery_key.to_display_string())
        })
    }

    /// リカバリーキー再発行
    pub fn api_regenerate_recovery_key(&self, password: String) -> Result<String, String> {
        let password = MasterPassword::from_string(password);
        self.with_unlocked_mut(|unlocked| {
            let recovery_key = unlocked
                .regenerate_recovery_key(&password)
                .map_err(|e| format!("Failed to regenerate recovery key: {}", e))?;
            Ok(recovery_key.to_display_string())
        })
    }
}

fn decrypt_config_with_kek(encrypted_b64: &str, kek: &crypto::Kek) -> Result<String, String> {
    let decrypted_bytes = crypto::config::decrypt_with_kek(encrypted_b64, kek)
        .map_err(|e| format!("Failed to decrypt config: {}", e))?;

    String::from_utf8(decrypted_bytes.to_vec())
        .map_err(|e| format!("Decrypted config is not valid UTF-8: {}", e))
}
