use super::Argon2Params;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;

/// vault.json の平文の meta。
///
/// ラップ済み DEK は「master スロット」（`encrypted_dek_master` / `argon2_params`）と
/// 「recovery スロット」（`encrypted_dek_recovery` / `recovery_argon2_params`）に分かれ、
/// 同期時はスロットごとに `*_updated_at` による LWW でマージする（`docs/vault-format-v2.md` 7章）。
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VaultMeta {
    pub vault_uuid: String,
    pub encrypted_dek_master: String,   // base64-encoded
    pub encrypted_dek_recovery: String, // base64-encoded
    /// master スロットの Argon2 パラメータ
    pub argon2_params: Argon2Params,
    pub created_at: i64,
    /// recovery スロットの Argon2 パラメータ。省略時は `argon2_params` と同じ
    /// （この値を持たない vault は、両スロットで同じパラメータを使っていた）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recovery_argon2_params: Option<Argon2Params>,
    /// master スロットを最後に変更した時刻（`next_updated_at` で単調に増やす）。
    /// この値を持たない vault は 0 として扱う
    #[serde(default)]
    pub master_updated_at: i64,
    /// recovery スロットを最後に変更した時刻（`next_updated_at` で単調に増やす）。
    /// この値を持たない vault は 0 として扱う
    #[serde(default)]
    pub recovery_updated_at: i64,
}

impl VaultMeta {
    pub fn new(
        encrypted_dek_master: Vec<u8>,
        encrypted_dek_recovery: Vec<u8>,
        argon2_params: Argon2Params,
    ) -> Self {
        use base64::Engine;
        let engine = base64::engine::general_purpose::STANDARD;

        let now = crate::get_timestamp();
        VaultMeta {
            vault_uuid: uuid::Uuid::new_v4().to_string(),
            encrypted_dek_master: engine.encode(&encrypted_dek_master),
            encrypted_dek_recovery: engine.encode(&encrypted_dek_recovery),
            argon2_params,
            created_at: now,
            recovery_argon2_params: None,
            master_updated_at: now,
            recovery_updated_at: now,
        }
    }

    /// recovery スロットの Argon2 パラメータ
    pub fn recovery_argon2_params(&self) -> &Argon2Params {
        self.recovery_argon2_params
            .as_ref()
            .unwrap_or(&self.argon2_params)
    }

    /// master スロットを置き換える
    pub(crate) fn set_master_slot(&mut self, encrypted_dek: String, params: Argon2Params) {
        // recovery スロットが master のパラメータを共有している場合は、先に固定しておく
        self.recovery_argon2_params = Some(self.recovery_argon2_params().clone());
        self.encrypted_dek_master = encrypted_dek;
        self.argon2_params = params;
        self.master_updated_at = next_updated_at(self.master_updated_at);
    }

    /// recovery スロットを置き換える
    pub(crate) fn set_recovery_slot(&mut self, encrypted_dek: String, params: Argon2Params) {
        self.encrypted_dek_recovery = encrypted_dek;
        self.recovery_argon2_params = Some(params);
        self.recovery_updated_at = next_updated_at(self.recovery_updated_at);
    }

    /// master スロットのダイジェスト。暗号化された index に入れ、同期時にリモートの
    /// master スロットが DEK を持つ端末が書いたものかを確認するのに使う
    pub(crate) fn master_slot_digest(&self) -> String {
        slot_digest(
            "kura/v2/meta/master",
            &self.vault_uuid,
            &self.encrypted_dek_master,
            &self.argon2_params,
            self.master_updated_at,
        )
    }

    /// recovery スロットのダイジェスト（`master_slot_digest` を参照）
    pub(crate) fn recovery_slot_digest(&self) -> String {
        slot_digest(
            "kura/v2/meta/recovery",
            &self.vault_uuid,
            &self.encrypted_dek_recovery,
            self.recovery_argon2_params(),
            self.recovery_updated_at,
        )
    }

    /// リモートの meta をスロットごとにマージする。`remote_digest` はリモートの
    /// （復号できた＝DEK を持つ端末が書いた）index にあるダイジェストで、これと一致する
    /// スロットだけを採用の候補にする。候補のうち `(updated_at, 暗号文)` が大きい方を採用する
    /// （時刻が同じなら暗号文の比較で決め、どの端末でも同じ結果にする）。
    /// ローカルのスロットが `untrusted`（改ざんの疑いがある）なら、時刻によらず候補を採用し、
    /// 採用したスロットは `untrusted` から外す
    pub(crate) fn merge_slots(
        &mut self,
        remote: &VaultMeta,
        remote_digest: &MetaDigest,
        untrusted: &mut UntrustedSlots,
    ) {
        if remote_digest.master == remote.master_slot_digest()
            && (untrusted.master.is_some()
                || compare_slot(
                    (remote.master_updated_at, &remote.encrypted_dek_master),
                    (self.master_updated_at, &self.encrypted_dek_master),
                ) == Ordering::Greater)
        {
            self.recovery_argon2_params = Some(self.recovery_argon2_params().clone());
            self.encrypted_dek_master = remote.encrypted_dek_master.clone();
            self.argon2_params = remote.argon2_params.clone();
            self.master_updated_at = remote.master_updated_at;
            untrusted.master = None;
        }
        if remote_digest.recovery == remote.recovery_slot_digest()
            && (untrusted.recovery.is_some()
                || compare_slot(
                    (remote.recovery_updated_at, &remote.encrypted_dek_recovery),
                    (self.recovery_updated_at, &self.encrypted_dek_recovery),
                ) == Ordering::Greater)
        {
            self.encrypted_dek_recovery = remote.encrypted_dek_recovery.clone();
            self.recovery_argon2_params = Some(remote.recovery_argon2_params().clone());
            self.recovery_updated_at = remote.recovery_updated_at;
            untrusted.recovery = None;
        }
    }

    /// 暗号化された index に入れるダイジェスト。`untrusted` のスロットは、読み込んだ index に
    /// あった元のダイジェストを入れ直す（改ざんされた疑いのある値に署名しないため）
    pub(crate) fn digest(&self, untrusted: &UntrustedSlots) -> MetaDigest {
        MetaDigest {
            master: untrusted
                .master
                .clone()
                .unwrap_or_else(|| self.master_slot_digest()),
            recovery: untrusted
                .recovery
                .clone()
                .unwrap_or_else(|| self.recovery_slot_digest()),
        }
    }
}

/// 読み込んだ index のダイジェストと一致しなかった meta のスロット。
///
/// 平文の meta はストレージに書き込める攻撃者が改ざんできる。新しい端末でダウンロードした
/// vault のように、マージを経ずに meta をそのまま使う場合でも、改ざんされたスロットに
/// 署名して他の端末へ広げないよう、元のダイジェスト（`Some` の値）を保持して書き込み時に使う。
/// スロットを書き換えるか、検証済みのリモートのスロットを採用した時点で外す
#[derive(Debug, Clone, Default)]
pub(crate) struct UntrustedSlots {
    pub master: Option<String>,
    pub recovery: Option<String>,
}

impl UntrustedSlots {
    /// `meta` の各スロットを、同じファイルの index にあったダイジェストと照合する。
    /// ダイジェストを持たない index（v1 からの移行直後など）は、照合できないので信頼する
    pub(crate) fn detect(meta: &VaultMeta, digest: Option<&MetaDigest>) -> Self {
        let Some(digest) = digest else {
            return Self::default();
        };
        Self {
            master: (digest.master != meta.master_slot_digest()).then(|| digest.master.clone()),
            recovery: (digest.recovery != meta.recovery_slot_digest())
                .then(|| digest.recovery.clone()),
        }
    }
}

/// meta の各スロットのダイジェスト（暗号化された index の `meta_digest`）
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct MetaDigest {
    pub master: String,
    pub recovery: String,
}

/// スロットの更新時刻。現在時刻が前回以下（時計が戻っている・別の端末の時計が進んでいた）でも、
/// 必ず前回より大きくする。取り込んだ変更より後の変更が、常に LWW で勝つようにするため
fn next_updated_at(previous: i64) -> i64 {
    crate::get_timestamp().max(previous.saturating_add(1))
}

fn compare_slot(a: (i64, &String), b: (i64, &String)) -> Ordering {
    a.0.cmp(&b.0).then_with(|| a.1.cmp(b.1))
}

fn slot_digest(
    domain: &str,
    vault_uuid: &str,
    encrypted_dek: &str,
    params: &Argon2Params,
    updated_at: i64,
) -> String {
    use base64::Engine;

    // 長さプレフィックス付きで連結し、曖昧さをなくす
    let mut hasher = Sha256::new();
    for field in [domain, vault_uuid, encrypted_dek, params.salt.as_str()] {
        hasher.update((field.len() as u32).to_be_bytes());
        hasher.update(field.as_bytes());
    }
    hasher.update(params.iterations.to_be_bytes());
    hasher.update(params.memory.to_be_bytes());
    hasher.update(params.parallelism.to_be_bytes());
    hasher.update(updated_at.to_be_bytes());
    base64::engine::general_purpose::STANDARD.encode(hasher.finalize())
}
