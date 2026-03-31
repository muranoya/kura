use crate::error::{Result, VaultError};
use crate::store::VaultContents;
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

/// Encrypt entire VaultContents with DEK
/// Returns: base64-encoded [12-byte IV | ciphertext | 16-byte GCM tag]
pub fn encrypt_vault(contents: &VaultContents, dek: &super::Dek) -> Result<String> {
    use base64::Engine;

    let json_bytes: Vec<u8> = contents.to_bytes()?;

    let iv_bytes: [u8; 12] = rand::random();
    let nonce = Nonce::from_slice(&iv_bytes);

    let cipher = Aes256Gcm::new_from_slice(dek.as_bytes())
        .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;

    let ciphertext = cipher
        .encrypt(nonce, json_bytes.as_ref())
        .map_err(|_| VaultError::EncryptionError("Encryption failed".to_string()))?;

    let mut encrypted_data = Vec::with_capacity(12 + ciphertext.len());
    encrypted_data.extend_from_slice(&iv_bytes);
    encrypted_data.extend_from_slice(&ciphertext);

    let engine = base64::engine::general_purpose::STANDARD;
    Ok(engine.encode(&encrypted_data))
}

/// Decrypt vault from base64-encoded encrypted data
/// Input: base64-encoded [12-byte IV | ciphertext | 16-byte GCM tag]
pub fn decrypt_vault(encrypted_b64: &str, dek: &super::Dek) -> Result<VaultContents> {
    use base64::Engine;

    let engine = base64::engine::general_purpose::STANDARD;
    let encrypted_data = engine.decode(encrypted_b64)
        .map_err(|_| VaultError::DecryptionError("Invalid base64 encoding".to_string()))?;

    // Minimum: 12-byte IV + 16-byte GCM tag + at least 1 byte ciphertext
    if encrypted_data.len() < 29 {
        return Err(VaultError::DecryptionError(
            "Encrypted data too short".to_string(),
        ));
    }

    let nonce = Nonce::from_slice(&encrypted_data[..12]);
    let ciphertext = &encrypted_data[12..];

    let cipher = Aes256Gcm::new_from_slice(dek.as_bytes())
        .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| VaultError::DecryptionError("Decryption failed".to_string()))?;

    VaultContents::from_bytes(&plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encrypt_decrypt_vault() {
        let dek = super::super::Dek::generate();
        let contents = VaultContents::new();

        // The test would verify encrypt/decrypt of vault contents
        // For now, just ensure the functions are callable
        let encrypted = encrypt_vault(&contents, &dek).unwrap();
        let decrypted = decrypt_vault(&encrypted, &dek).unwrap();

        assert_eq!(contents.entries.len(), decrypted.entries.len());
        assert_eq!(contents.labels.len(), decrypted.labels.len());
    }

    #[test]
    fn test_wrong_key_fails() {
        let dek1 = super::super::Dek::generate();
        let dek2 = super::super::Dek::generate();
        let contents = VaultContents::new();

        let encrypted = encrypt_vault(&contents, &dek1).unwrap();
        assert!(decrypt_vault(&encrypted, &dek2).is_err());
    }
}
