use crate::error::{Result, VaultError};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

/// Encrypt arbitrary data with KEK using AES-256-GCM
/// Returns: base64-encoded [12-byte IV | ciphertext | 16-byte GCM tag]
pub fn encrypt_with_kek(plaintext: &[u8], kek: &super::Kek) -> Result<String> {
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

/// Decrypt data encrypted with encrypt_with_kek
/// Input: base64-encoded [12-byte IV | ciphertext | 16-byte GCM tag]
pub fn decrypt_with_kek(encrypted_b64: &str, kek: &super::Kek) -> Result<Vec<u8>> {
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

        assert_eq!(plaintext.as_slice(), &decrypted);
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

        assert_eq!(plaintext.as_slice(), &decrypted);
    }

    #[test]
    fn test_large_plaintext() {
        let kek = Kek::from_bytes(rand::random());
        let plaintext = vec![0xABu8; 10000];

        let encrypted = encrypt_with_kek(&plaintext, &kek).unwrap();
        let decrypted = decrypt_with_kek(&encrypted, &kek).unwrap();

        assert_eq!(plaintext, decrypted);
    }
}
