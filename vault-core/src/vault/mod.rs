mod entries;
mod export;
mod labels;
mod locked;
mod migration;
mod secrets;
mod security;
mod state;
pub(crate) mod webauthn;

use std::collections::HashMap;

use crate::crypto::{Dek, SubKeys};
use crate::models::VaultMeta;
use crate::store::{ExtraFields, StoredVault, VaultIndex};

/// Locked vault - encrypted data in memory, DEK not available
#[derive(Clone)]
pub struct LockedVault {
    /// v1 のまま読み込んだ場合は、アンロック時に v2 へ変換する
    pub(crate) vault_file: StoredVault,
    pub(crate) etag: Option<String>,
}

/// Unlocked vault - index は平文で常駐し、secret はエントリごとの暗号文のまま保持する
/// （`docs/vault-format-v2.md` 6章）
pub struct UnlockedVault {
    pub(crate) meta: VaultMeta,
    pub(crate) dek: Dek,
    /// DEK から導出した index 用・secret 用のサブ鍵
    pub(crate) keys: SubKeys,
    /// 全ラベル・全エントリの非秘匿値。検索・一覧表示に使う
    pub(crate) index: VaultIndex,
    /// entry_id → secret ブロック（base64 の暗号文）。必要なときだけ復号する
    pub(crate) secrets: HashMap<String, String>,
    /// 読み込んだ vault.json にあった未知のトップレベルフィールド（書き戻し用）
    pub(crate) file_extra: ExtraFields,
    pub(crate) etag: Option<String>,
}

impl LockedVault {
    pub(crate) fn meta(&self) -> &VaultMeta {
        self.vault_file.meta()
    }
}
