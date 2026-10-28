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
