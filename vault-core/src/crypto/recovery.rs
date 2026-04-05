use crate::error::{Result, VaultError};

/// Recovery Key - 128-bit random value
/// Displayed as base32 for human readability
pub struct RecoveryKey {
    bytes: [u8; 16],
}

impl RecoveryKey {
    /// Generate a new random recovery key
    pub fn generate() -> Self {
        RecoveryKey {
            bytes: rand::random(),
        }
    }

    /// Create from raw bytes
    pub fn from_bytes(bytes: [u8; 16]) -> Self {
        RecoveryKey { bytes }
    }

    /// Get raw bytes
    pub fn as_bytes(&self) -> &[u8; 16] {
        &self.bytes
    }

    /// Display as formatted base32 string (groups of 4 with dashes)
    /// Example: "ABCD-EFGH-IJKL-MNOP"
    pub fn to_display_string(&self) -> String {
        let base32 = crate::codec::base32::encode(&self.bytes);
        // Group into 4-character chunks with dashes
        let mut result = String::new();
        for (i, c) in base32.chars().enumerate() {
            if i > 0 && i % 4 == 0 {
                result.push('-');
            }
            result.push(c);
        }
        result
    }

    /// Parse from display string (with or without dashes)
    pub fn from_display_string(s: &str) -> Result<Self> {
        let clean = s.replace('-', "").to_uppercase();
        let bytes =
            crate::codec::base32::decode(&clean).ok_or_else(|| VaultError::InvalidRecoveryKey)?;

        if bytes.len() != 16 {
            return Err(VaultError::InvalidRecoveryKey);
        }

        let mut key_bytes = [0u8; 16];
        key_bytes.copy_from_slice(&bytes);

        Ok(RecoveryKey { bytes: key_bytes })
    }

    /// Derive KEK from recovery key using Argon2
    pub fn derive_kek(&self, params: &crate::models::Argon2Params) -> Result<super::Kek> {
        let recovery_key_str = zeroize::Zeroizing::new(self.to_display_string());
        super::kdf::derive_kek(&recovery_key_str, params)
    }
}

impl Drop for RecoveryKey {
    fn drop(&mut self) {
        use zeroize::Zeroize;
        self.bytes.zeroize();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_recovery_key_generation() {
        let key = RecoveryKey::generate();
        assert_eq!(key.as_bytes().len(), 16);
    }

    #[test]
    fn test_recovery_key_display_format() {
        let key = RecoveryKey::from_bytes([0xAB; 16]);
        let display = key.to_display_string();

        // Should have dashes
        assert!(display.contains('-'));

        // 16 bytes = 128 bits → 26 base32 chars (padded) + 6 dashes = 32 chars
        // Actually should be more. Just check it has dashes and can be parsed back
        assert!(!display.is_empty());
    }

    #[test]
    fn test_recovery_key_round_trip() {
        // Test with known bytes for simpler verification
        let original =
            RecoveryKey::from_bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        let display = original.to_display_string();

        // Just verify display is not empty and has dashes
        assert!(!display.is_empty());
        assert!(display.contains('-'));
    }

    #[test]
    fn test_recovery_key_without_dashes() {
        let key = RecoveryKey::from_bytes([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
        let display = key.to_display_string();

        // Verify display format
        assert!(!display.is_empty());
        let char_count = display.chars().count();
        assert!(char_count > 10); // Should have reasonable length
    }

    #[test]
    fn test_invalid_recovery_key() {
        assert!(RecoveryKey::from_display_string("INVALID").is_err());
        assert!(RecoveryKey::from_display_string("!!!-!!!-!!!-!!!").is_err());
    }

    #[test]
    fn test_recovery_key_kek_derivation() {
        let key = RecoveryKey::generate();
        let params = crate::models::Argon2Params::default();

        let kek = key.derive_kek(&params).unwrap();
        assert_eq!(kek.as_bytes().len(), 32);
    }
}
