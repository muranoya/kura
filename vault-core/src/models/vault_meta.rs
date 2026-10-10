use super::Argon2Params;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMeta {
    pub vault_uuid: String,
    pub encrypted_dek_master: String,   // base64-encoded
    pub encrypted_dek_recovery: String, // base64-encoded
    pub argon2_params: Argon2Params,
    pub created_at: i64,
    /// 鍵ラップ（encrypted_dek_* / argon2_params）を最後に更新した時刻。
    /// 同期時にリモートの方が新しければ、リモートのmetaを採用する（古い端末による巻き戻り防止）。
    /// 省略時（旧クライアントが書いたvault）は0扱い。
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub keys_updated_at: Option<i64>,
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
            keys_updated_at: None,
        }
    }

    /// 鍵ラップを更新したことを記録する
    pub(crate) fn touch_keys(&mut self) {
        let now = crate::get_timestamp();
        // 時計の巻き戻りがあっても単調増加させ、自端末の変更が自端末の旧値に負けないようにする
        self.keys_updated_at = Some(now.max(self.keys_updated_at.unwrap_or(0) + 1));
    }

    /// `other`が自身より新しい鍵ラップを持つか
    pub(crate) fn has_newer_keys_than(&self, other: &VaultMeta) -> bool {
        self.vault_uuid == other.vault_uuid
            && self.keys_updated_at.unwrap_or(0) > other.keys_updated_at.unwrap_or(0)
    }
}
