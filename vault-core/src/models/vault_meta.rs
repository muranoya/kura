use super::Argon2Params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMeta {
    pub vault_uuid: String,
    pub encrypted_dek_master: String,   // base64-encoded
    pub encrypted_dek_recovery: String, // base64-encoded
    pub argon2_params: Argon2Params,
    pub created_at: i64,
}

impl VaultMeta {
    pub fn new(
        encrypted_dek_master: Vec<u8>,
        encrypted_dek_recovery: Vec<u8>,
        argon2_params: Argon2Params,
    ) -> Self {
        use base64::Engine;
        let engine = base64::engine::general_purpose::STANDARD;

        VaultMeta {
            vault_uuid: uuid::Uuid::new_v4().to_string(),
            encrypted_dek_master: engine.encode(&encrypted_dek_master),
            encrypted_dek_recovery: engine.encode(&encrypted_dek_recovery),
            argon2_params,
            created_at: crate::get_timestamp(),
        }
    }
}
