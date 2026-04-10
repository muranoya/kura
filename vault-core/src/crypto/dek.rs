use crate::error::{Result, VaultError};
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use zeroize::{Zeroize, Zeroizing};

/// Data Encryption Key - 32 bytes, automatically zeroized on drop
/// Clone is intentionally not implemented to prevent uncontrolled copies of key material.
pub struct Dek {
    bytes: [u8; 32],
}

impl Drop for Dek {
    fn drop(&mut self) {
        self.bytes.zeroize();
    }
}

impl Dek {
    /// Generate a new random DEK
    pub fn generate() -> Self {
        Dek {
            bytes: rand::random(),
        }
    }

    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Dek { bytes }
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.bytes
    }

    /// Wrap DEK with KEK using AES-256-GCM
    /// Returns: [12-byte nonce | ciphertext | 16-byte GCM tag]
    pub fn wrap(&self, kek: &super::Kek) -> Result<Vec<u8>> {
        let nonce_bytes: [u8; 12] = rand::random();
        let nonce = Nonce::from_slice(&nonce_bytes);

        let cipher = Aes256Gcm::new_from_slice(kek.as_bytes())
            .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;

        let ciphertext = cipher
            .encrypt(nonce, self.bytes.as_ref())
            .map_err(|_| VaultError::EncryptionError("Encryption failed".to_string()))?;

        let mut result = Vec::with_capacity(12 + ciphertext.len());
        result.extend_from_slice(&nonce_bytes);
        result.extend_from_slice(&ciphertext);

        Ok(result)
    }

    /// Unwrap DEK with KEK
    /// Input: [12-byte nonce | ciphertext | 16-byte GCM tag]
    pub fn unwrap(encrypted_data: &[u8], kek: &super::Kek) -> Result<Dek> {
        if encrypted_data.len() < 12 {
            return Err(VaultError::DecryptionError(
                "Encrypted data too short".to_string(),
            ));
        }

        let nonce = Nonce::from_slice(&encrypted_data[..12]);
        let ciphertext = &encrypted_data[12..];

        let cipher = Aes256Gcm::new_from_slice(kek.as_bytes())
            .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;

        let plaintext = Zeroizing::new(
            cipher
                .decrypt(nonce, ciphertext)
                .map_err(|_| VaultError::DecryptionError("Decryption failed".to_string()))?,
        );

        if plaintext.len() != 32 {
            return Err(VaultError::DecryptionError(
                "Invalid DEK length".to_string(),
            ));
        }

        let mut bytes = [0u8; 32];
        bytes.copy_from_slice(&plaintext);

        Ok(Dek { bytes })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dek_generation() {
        let dek = Dek::generate();
        assert_eq!(dek.as_bytes().len(), 32);
    }

    #[test]
    fn test_wrap_unwrap() {
        use crate::crypto::kdf::derive_kek;
        use crate::models::Argon2Params;

        let dek = Dek::generate();
        let params = Argon2Params::default();
        let kek = derive_kek("password123", &params).unwrap();

        let wrapped = dek.wrap(&kek).unwrap();
        let unwrapped = Dek::unwrap(&wrapped, &kek).unwrap();

        assert_eq!(dek.as_bytes(), unwrapped.as_bytes());
    }

    #[test]
    fn test_wrong_kek_fails() {
        use crate::crypto::kdf::derive_kek;
        use crate::models::Argon2Params;

        let dek = Dek::generate();
        let params = Argon2Params::default();
        let kek1 = derive_kek("password1", &params).unwrap();
        let kek2 = derive_kek("password2", &params).unwrap();

        let wrapped = dek.wrap(&kek1).unwrap();
        assert!(Dek::unwrap(&wrapped, &kek2).is_err());
    }
}
