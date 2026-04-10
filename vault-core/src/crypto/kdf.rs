use crate::error::{Result, VaultError};
use argon2::{Algorithm, Argon2, Params, Version};
use zeroize::Zeroize;

/// Key Encryption Key - 32 bytes, automatically zeroized on drop
/// Clone is intentionally not implemented to prevent uncontrolled copies of key material.
pub struct Kek {
    bytes: [u8; 32],
}

impl Drop for Kek {
    fn drop(&mut self) {
        self.bytes.zeroize();
    }
}

impl Kek {
    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.bytes
    }

    pub fn from_bytes(bytes: [u8; 32]) -> Self {
        Kek { bytes }
    }
}

/// Minimum Argon2 parameters to prevent intentionally weak configurations
const MIN_ARGON2_ITERATIONS: u32 = 3;
const MIN_ARGON2_MEMORY: u32 = 65536; // 64 MiB
const MIN_SALT_LENGTH: usize = 16;

/// Derive KEK from password using Argon2
pub fn derive_kek(password: &str, params: &crate::models::Argon2Params) -> Result<Kek> {
    let salt_bytes = base32_decode(&params.salt)
        .ok_or_else(|| VaultError::InvalidConfiguration("Invalid salt encoding".to_string()))?;

    if salt_bytes.len() < MIN_SALT_LENGTH {
        return Err(VaultError::InvalidConfiguration(format!(
            "Salt must be at least {} bytes, got {}",
            MIN_SALT_LENGTH,
            salt_bytes.len()
        )));
    }

    if params.iterations < MIN_ARGON2_ITERATIONS {
        return Err(VaultError::InvalidConfiguration(format!(
            "Argon2 iterations must be at least {}",
            MIN_ARGON2_ITERATIONS
        )));
    }

    if params.memory < MIN_ARGON2_MEMORY {
        return Err(VaultError::InvalidConfiguration(format!(
            "Argon2 memory must be at least {} KiB",
            MIN_ARGON2_MEMORY
        )));
    }

    let argon2_params = Params::new(params.memory, params.iterations, params.parallelism, None)
        .map_err(|e| VaultError::EncryptionError(format!("Invalid Argon2 params: {}", e)))?;

    let mut hash_output = [0u8; 32];

    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, argon2_params);

    argon2
        .hash_password_into(password.as_bytes(), &salt_bytes, &mut hash_output)
        .map_err(|e| VaultError::EncryptionError(format!("Argon2 hashing failed: {}", e)))?;

    Ok(Kek { bytes: hash_output })
}

fn base32_decode(s: &str) -> Option<Vec<u8>> {
    crate::codec::base32::decode(s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_kek_derivation_same_params() {
        let params = crate::models::Argon2Params::default();
        let kek1 = derive_kek("password123", &params).unwrap();
        let kek2 = derive_kek("password123", &params).unwrap();

        // Same password and params should derive same KEK
        assert_eq!(kek1.as_bytes(), kek2.as_bytes());
    }

    #[test]
    fn test_different_passwords() {
        let params = crate::models::Argon2Params::default();
        let kek1 = derive_kek("password1", &params).unwrap();
        let kek2 = derive_kek("password2", &params).unwrap();

        // Different passwords should derive different KEKs
        assert_ne!(kek1.as_bytes(), kek2.as_bytes());
    }
}
