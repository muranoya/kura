use crate::codec::base32;
use crate::crypto::kdf;
use crate::error::{Result, VaultError};
use crate::models::Argon2Params;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::Engine;

const TRANSFER_PREFIX: &str = "kura-config-v1$";
const SALT_LEN: usize = 16;
const IV_LEN: usize = 12;
const HEADER_LEN: usize = SALT_LEN + 4 + 4 + 4 + IV_LEN; // 48 bytes
const GCM_TAG_LEN: usize = 16;

/// Encrypt data for transfer between devices.
/// Returns a self-contained string: `kura-config-v1$<base64(salt|iterations|memory|parallelism|iv|ciphertext|tag)>`
/// The Argon2 params are embedded so the receiver can decrypt without a loaded vault.
pub fn encrypt_transfer(password: &str, plaintext: &[u8]) -> Result<String> {
    let params = Argon2Params::default();
    let kek = kdf::derive_kek(password, &params)?;

    let salt_bytes = base32::decode(&params.salt)
        .ok_or_else(|| VaultError::EncryptionError("Failed to decode salt".to_string()))?;

    let iv_bytes: [u8; IV_LEN] = rand::random();
    let nonce = Nonce::from_slice(&iv_bytes);

    let cipher = Aes256Gcm::new_from_slice(kek.as_bytes())
        .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;

    let ciphertext = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| VaultError::EncryptionError("Encryption failed".to_string()))?;

    // Build binary: [salt(16) | iterations(4) | memory(4) | parallelism(4) | iv(12) | ciphertext+tag]
    let mut buf = Vec::with_capacity(HEADER_LEN + ciphertext.len());
    buf.extend_from_slice(&salt_bytes);
    buf.extend_from_slice(&params.iterations.to_be_bytes());
    buf.extend_from_slice(&params.memory.to_be_bytes());
    buf.extend_from_slice(&params.parallelism.to_be_bytes());
    buf.extend_from_slice(&iv_bytes);
    buf.extend_from_slice(&ciphertext);

    let engine = base64::engine::general_purpose::STANDARD;
    let mut result = String::from(TRANSFER_PREFIX);
    result.push_str(&engine.encode(&buf));
    Ok(result)
}

/// Decrypt a transfer string produced by `encrypt_transfer`.
/// Parses the embedded Argon2 params, derives KEK, and decrypts.
pub fn decrypt_transfer(password: &str, transfer_string: &str) -> Result<Vec<u8>> {
    let payload = transfer_string
        .strip_prefix(TRANSFER_PREFIX)
        .ok_or_else(|| {
            VaultError::DecryptionError("Invalid transfer string prefix".to_string())
        })?;

    let engine = base64::engine::general_purpose::STANDARD;
    let buf = engine
        .decode(payload)
        .map_err(|_| VaultError::DecryptionError("Invalid base64 encoding".to_string()))?;

    // Minimum: header(48) + GCM tag(16) = 64 bytes (empty plaintext)
    if buf.len() < HEADER_LEN + GCM_TAG_LEN {
        return Err(VaultError::DecryptionError(
            "Transfer data too short".to_string(),
        ));
    }

    let salt_bytes = &buf[..SALT_LEN];
    let iterations = u32::from_be_bytes(buf[SALT_LEN..SALT_LEN + 4].try_into().unwrap());
    let memory = u32::from_be_bytes(buf[SALT_LEN + 4..SALT_LEN + 8].try_into().unwrap());
    let parallelism = u32::from_be_bytes(buf[SALT_LEN + 8..SALT_LEN + 12].try_into().unwrap());
    let iv = &buf[SALT_LEN + 12..HEADER_LEN];
    let ciphertext = &buf[HEADER_LEN..];

    let params = Argon2Params {
        salt: base32::encode(salt_bytes),
        iterations,
        memory,
        parallelism,
    };

    let kek = kdf::derive_kek(password, &params)?;

    let nonce = Nonce::from_slice(iv);
    let cipher = Aes256Gcm::new_from_slice(kek.as_bytes())
        .map_err(|_| VaultError::DecryptionError("Failed to create cipher".to_string()))?;

    cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| VaultError::DecryptionError("Decryption failed".to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_roundtrip() {
        let password = "test-password-123";
        let config = br#"{"region":"ap-northeast-1","bucket":"my-vault","key":"vault.json","accessKeyId":"AKID","secretAccessKey":"secret"}"#;

        let encrypted = encrypt_transfer(password, config).unwrap();
        assert!(encrypted.starts_with(TRANSFER_PREFIX));

        let decrypted = decrypt_transfer(password, &encrypted).unwrap();
        assert_eq!(config.as_slice(), &decrypted);
    }

    #[test]
    fn test_wrong_password_fails() {
        let config = b"secret config";
        let encrypted = encrypt_transfer("correct", config).unwrap();
        assert!(decrypt_transfer("wrong", &encrypted).is_err());
    }

    #[test]
    fn test_invalid_prefix_fails() {
        assert!(decrypt_transfer("pass", "bad-prefix$AAAA").is_err());
    }

    #[test]
    fn test_invalid_base64_fails() {
        let bad = format!("{}!!!invalid!!!", TRANSFER_PREFIX);
        assert!(decrypt_transfer("pass", &bad).is_err());
    }

    #[test]
    fn test_truncated_data_fails() {
        let encrypted = encrypt_transfer("pass", b"data").unwrap();
        // Truncate the base64 payload
        let truncated = &encrypted[..TRANSFER_PREFIX.len() + 10];
        assert!(decrypt_transfer("pass", truncated).is_err());
    }

    #[test]
    fn test_empty_plaintext() {
        let encrypted = encrypt_transfer("pass", b"").unwrap();
        let decrypted = decrypt_transfer("pass", &encrypted).unwrap();
        assert!(decrypted.is_empty());
    }

    #[test]
    fn test_different_encryptions_produce_different_output() {
        let config = b"same data";
        let enc1 = encrypt_transfer("pass", config).unwrap();
        let enc2 = encrypt_transfer("pass", config).unwrap();
        // Different salt + IV each time
        assert_ne!(enc1, enc2);
        // But both decrypt to the same thing
        assert_eq!(
            decrypt_transfer("pass", &enc1).unwrap(),
            decrypt_transfer("pass", &enc2).unwrap()
        );
    }
}
