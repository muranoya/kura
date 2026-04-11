use serde::{Deserialize, Serialize};

/// Argon2 key derivation function parameters
/// Used for both master password and recovery key derivation with the same salt
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Argon2Params {
    pub salt: String,     // base32-encoded
    pub iterations: u32,  // t_cost
    pub memory: u32,      // m_cost in KiB
    pub parallelism: u32, // p_cost
}

impl Default for Argon2Params {
    fn default() -> Self {
        let salt_bytes: [u8; 16] = rand::random();

        Argon2Params {
            salt: crate::codec::base32::encode(&salt_bytes),
            iterations: 3,
            memory: 65536, // 64 MiB
            parallelism: 4,
        }
    }
}

impl Argon2Params {
    pub fn to_json(&self) -> crate::error::Result<String> {
        serde_json::to_string(self).map_err(crate::error::VaultError::JsonError)
    }

    pub fn from_json(json_str: &str) -> crate::error::Result<Self> {
        serde_json::from_str(json_str).map_err(crate::error::VaultError::JsonError)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_params_serialization() {
        let params = Argon2Params::default();
        let json = params.to_json().unwrap();
        let deserialized = Argon2Params::from_json(&json).unwrap();

        assert_eq!(params.memory, deserialized.memory);
        assert_eq!(params.iterations, deserialized.iterations);
    }
}
