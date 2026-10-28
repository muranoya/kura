//! 端末ローカルに保存する設定（S3 設定など）の暗号化。
//!
//! - 現行形式: `"v2." + base64(nonce[24] | ciphertext | tag[16])`。
//!   マスターパスワードで DEK をアンラップし、DEK から導出した `ConfigKey` で暗号化する。
//!   DEK はパスワード変更・Argon2 パラメータ更新で変わらないため、別の端末でそれらが
//!   変更された meta を同期で取り込んでも、新しいパスワードで復号できる
//! - 旧形式: `base64(iv[12] | ciphertext | tag[16])`。KEK（パスワードと Argon2 パラメータから導出）で
//!   直接 AES-256-GCM 暗号化していた。復号のみ対応し、呼び出し側で現行形式に暗号化し直す

use crate::error::{Result, VaultError};
use crate::models::VaultMeta;
use crate::secret::{MasterPassword, SecretBytes};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

const CONFIG_V2_PREFIX: &str = "v2.";

/// マスターパスワードで DEK をアンラップし、設定用の鍵を導出する
fn derive_config_key(
    meta: &VaultMeta,
    password: &MasterPassword,
) -> Result<(super::Kek, super::ConfigKey)> {
    use base64::Engine;

    let kek = super::kdf::derive_kek_from_master_password(password, &meta.argon2_params)?;
    let encrypted_dek = base64::engine::general_purpose::STANDARD
        .decode(&meta.encrypted_dek_master)
        .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
    let dek = super::Dek::unwrap(&encrypted_dek, &kek)?;
    Ok((kek, super::ConfigKey::derive(&dek)))
}

/// 設定を現行形式で暗号化する
pub fn encrypt_config(
    meta: &VaultMeta,
    password: &MasterPassword,
    plaintext: &[u8],
) -> Result<String> {
    let (_, config_key) = derive_config_key(meta, password)?;
    let sealed = config_key.seal(&meta.vault_uuid, plaintext)?;
    Ok(format!("{CONFIG_V2_PREFIX}{sealed}"))
}

/// 設定を復号する（旧形式にも対応する）
pub fn decrypt_config(
    meta: &VaultMeta,
    password: &MasterPassword,
    encrypted: &str,
) -> Result<SecretBytes> {
    let (kek, config_key) = derive_config_key(meta, password)?;
    match encrypted.strip_prefix(CONFIG_V2_PREFIX) {
        Some(sealed) => {
            let mut plaintext = config_key.open(&meta.vault_uuid, sealed)?;
            Ok(SecretBytes::from_vec(std::mem::take(&mut *plaintext)))
        }
        None => decrypt_with_kek(encrypted, &kek),
    }
}

/// 旧形式で暗号化された設定かどうか（現行形式で暗号化し直す必要があるか）
pub fn is_legacy_config(encrypted: &str) -> bool {
    !encrypted.starts_with(CONFIG_V2_PREFIX)
}

/// 旧形式（KEK で直接 AES-256-GCM 暗号化）。テストで旧形式のデータを作るためだけに残す
/// Returns: base64-encoded [12-byte IV | ciphertext | 16-byte GCM tag]
#[cfg(test)]
pub(crate) fn encrypt_with_kek(plaintext: &[u8], kek: &super::Kek) -> Result<String> {
    use base64::Engine;

    let iv_bytes: [u8; 12] = rand::random();
    let nonce = Nonce::from_slice(&iv_bytes);

    let cipher = Aes256Gcm::new_from_slice(kek.as_bytes())
        .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| VaultError::EncryptionError("Encryption failed".to_string()))?;

    let mut encrypted_data = Vec::with_capacity(12 + ciphertext.len());
    encrypted_data.extend_from_slice(&iv_bytes);
    encrypted_data.extend_from_slice(&ciphertext);

    let engine = base64::engine::general_purpose::STANDARD;
    Ok(engine.encode(&encrypted_data))
}

/// 旧形式の設定を復号する
/// Input: base64-encoded [12-byte IV | ciphertext | 16-byte GCM tag]
fn decrypt_with_kek(encrypted_b64: &str, kek: &super::Kek) -> Result<SecretBytes> {
    use base64::Engine;

    let engine = base64::engine::general_purpose::STANDARD;
    let encrypted_data = engine
        .decode(encrypted_b64)
        .map_err(|_| VaultError::DecryptionError("Invalid base64 encoding".to_string()))?;

    // Minimum: 12-byte IV + 16-byte GCM tag = 28 bytes (empty plaintext case)
    if encrypted_data.len() < 28 {
        return Err(VaultError::DecryptionError(
            "Encrypted data too short".to_string(),
        ));
    }

    let nonce = Nonce::from_slice(&encrypted_data[..12]);
    let ciphertext = &encrypted_data[12..];

    let cipher = Aes256Gcm::new_from_slice(kek.as_bytes())
        .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;

    cipher
        .decrypt(nonce, ciphertext)
        .map(SecretBytes::from_vec)
        .map_err(|_| VaultError::DecryptionError("Decryption failed".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::kdf::Kek;

    #[test]
    fn test_encrypt_decrypt_roundtrip() {
        let kek = Kek::from_bytes(rand::random());
        let plaintext = b"secret S3 config data";

        let encrypted = encrypt_with_kek(plaintext, &kek).unwrap();
        let decrypted = decrypt_with_kek(&encrypted, &kek).unwrap();

        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    #[test]
    fn test_wrong_kek_fails() {
        let kek1 = Kek::from_bytes(rand::random());
        let kek2 = Kek::from_bytes(rand::random());
        let plaintext = b"secret data";

        let encrypted = encrypt_with_kek(plaintext, &kek1).unwrap();
        assert!(decrypt_with_kek(&encrypted, &kek2).is_err());
    }

    #[test]
    fn test_empty_plaintext() {
        let kek = Kek::from_bytes(rand::random());
        let plaintext = b"";

        let encrypted = encrypt_with_kek(plaintext, &kek).unwrap();
        let decrypted = decrypt_with_kek(&encrypted, &kek).unwrap();

        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    #[test]
    fn test_large_plaintext() {
        let kek = Kek::from_bytes(rand::random());
        let plaintext = vec![0xABu8; 10000];

        let encrypted = encrypt_with_kek(&plaintext, &kek).unwrap();
        let decrypted = decrypt_with_kek(&encrypted, &kek).unwrap();

        assert_eq!(plaintext.as_slice(), decrypted.as_slice());
    }

    fn mp(value: &str) -> MasterPassword {
        MasterPassword::from_string(value.to_string())
    }

    fn unlocked_vault(password: &str) -> crate::vault::UnlockedVault {
        let (locked, _) = crate::vault::LockedVault::create_new(&mp(password)).unwrap();
        locked.unlock(&mp(password)).unwrap()
    }

    #[test]
    fn test_config_roundtrip() {
        let vault = unlocked_vault("password-1");
        let encrypted =
            encrypt_config(&vault.meta, &mp("password-1"), b"{\"bucket\":\"b\"}").unwrap();
        assert!(!is_legacy_config(&encrypted));
        let decrypted = decrypt_config(&vault.meta, &mp("password-1"), &encrypted).unwrap();
        assert_eq!(decrypted.as_slice(), b"{\"bucket\":\"b\"}");
        assert!(decrypt_config(&vault.meta, &mp("wrong-password"), &encrypted).is_err());
    }

    #[test]
    fn test_config_survives_master_password_change() {
        // 別の端末でマスターパスワード変更が行われ、その meta を取り込んだ端末でも、
        // 変更前に暗号化した設定を新しいパスワードで復号できる
        let mut vault = unlocked_vault("password-1");
        let encrypted = encrypt_config(&vault.meta, &mp("password-1"), b"config").unwrap();

        vault
            .change_master_password(&mp("password-1"), &mp("password-2"))
            .unwrap();
        let decrypted = decrypt_config(&vault.meta, &mp("password-2"), &encrypted).unwrap();
        assert_eq!(decrypted.as_slice(), b"config");
    }

    #[test]
    fn test_legacy_config_is_decrypted() {
        let vault = unlocked_vault("password-1");
        let kek = crate::crypto::kdf::derive_kek_from_master_password(
            &mp("password-1"),
            &vault.meta.argon2_params,
        )
        .unwrap();
        let legacy = encrypt_with_kek(b"config", &kek).unwrap();
        assert!(is_legacy_config(&legacy));
        let decrypted = decrypt_config(&vault.meta, &mp("password-1"), &legacy).unwrap();
        assert_eq!(decrypted.as_slice(), b"config");
    }
}
