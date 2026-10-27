//! index / secret ブロックの暗号化・復号と、vault.json（v2）との相互変換
//! （`docs/vault-format-v2.md` 5〜7章）。
use std::collections::HashMap;

use zeroize::Zeroizing;

use crate::crypto::{Dek, SubKeys};
use crate::error::{Result, VaultError};
use crate::models::VaultMeta;
use crate::store::{
    EntrySecret, ExtraFields, StoredVault, VaultFile, VaultIndex, SCHEMA_VERSION_V2,
};

use super::UnlockedVault;

/// secret ブロックの版を表すランダム値を生成する。
/// 連番を使わないのは、同じエントリを 2 台で同時に更新すると同じ値になり、
/// index と secret の組み合わせの取り違えを AAD で検出できなくなるため（5-4）。
pub(crate) fn new_secret_rev() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// secret ブロックの平文を埋める最小の長さ（3-3）
const SECRET_PADDING_MIN: usize = 256;

/// secret ブロックの平文を埋めた後の長さを返す（3-3）。
/// `SECRET_PADDING_MIN` 以下はその長さに揃え、それより長いものは Padmé 方式で丸める
/// （長さから漏れる情報を O(log log L) ビットに抑えつつ、増加量を最大でも約 12% にする）
fn padded_secret_len(len: usize) -> usize {
    if len <= SECRET_PADDING_MIN {
        return SECRET_PADDING_MIN;
    }
    let exponent = len.ilog2();
    let last_bits = exponent - (exponent.ilog2() + 1);
    let mask = (1usize << last_bits) - 1;
    (len + mask) & !mask
}

/// secret ブロックを暗号化する。暗号文の長さから秘匿値の長さを推測されないよう、
/// 平文の末尾を空白で埋めてから暗号化する。JSON は末尾の空白を許すので、
/// 復号する側は何もしなくてよい（3-3）
pub(crate) fn seal_secret_block(
    keys: &SubKeys,
    vault_uuid: &str,
    id: &str,
    secret_rev: &str,
    plaintext: &[u8],
) -> Result<String> {
    let padded_len = padded_secret_len(plaintext.len());
    let mut padded = Zeroizing::new(Vec::with_capacity(padded_len));
    padded.extend_from_slice(plaintext);
    padded.resize(padded_len, b' ');
    keys.seal_secret(vault_uuid, id, secret_rev, &padded)
}

impl UnlockedVault {
    /// 空の index を持つアンロック状態を作る
    pub(crate) fn new_empty(meta: VaultMeta, dek: Dek) -> Self {
        let keys = SubKeys::derive(&dek);
        Self {
            meta,
            dek,
            keys,
            index: VaultIndex::new(),
            secrets: HashMap::new(),
            file_extra: ExtraFields::new(),
            etag: None,
        }
    }

    /// v2 の vault.json を DEK で開く。index だけを復号し、secret は暗号文のまま保持する
    pub(crate) fn from_vault_file(file: VaultFile, dek: Dek, etag: Option<String>) -> Result<Self> {
        let keys = SubKeys::derive(&dek);
        let index = open_index(&keys, &file)?;
        Ok(Self {
            meta: file.meta,
            dek,
            keys,
            index,
            secrets: file.secrets.into_iter().collect(),
            file_extra: file.extra,
            etag,
        })
    }

    /// 同期で受け取ったリモートの vault.json から、index（復号済み）と secret（暗号文のまま）を
    /// 取り出す。リモートが v1 のままなら、同じ DEK で一括復号して v2 の構造に変換する（11-2）。
    pub(crate) fn open_remote(
        &self,
        remote: &StoredVault,
    ) -> Result<(VaultIndex, HashMap<String, String>)> {
        let remote_uuid = &remote.meta().vault_uuid;
        if *remote_uuid != self.meta.vault_uuid {
            return Err(VaultError::VaultUuidMismatch {
                local: self.meta.vault_uuid.clone(),
                remote: remote_uuid.clone(),
            });
        }
        match remote {
            StoredVault::V2(file) => Ok((
                open_index(&self.keys, file)?,
                file.secrets
                    .iter()
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect(),
            )),
            StoredVault::V1(file) => {
                let contents = crate::crypto::v1::decrypt_vault(&file.encrypted_vault, &self.dek)?;
                super::migration::migrate_v1_contents(contents, &self.keys, &self.meta.vault_uuid)
            }
        }
    }

    /// 指定エントリの secret ブロックを復号する。
    /// index にあるのに secret が欠けている・復号できない場合は `CorruptedEntry` を返す
    /// （vault 全体のエラーにはせず、そのエントリだけを破損として扱う。7-1）。
    pub(crate) fn read_secret(&self, id: &str) -> Result<EntrySecret> {
        let entry = self
            .index
            .entries
            .get(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;
        let Some(secret_rev) = entry.secret_rev.as_deref() else {
            // purged エントリは secret を持たない。active な行に secret_rev がないのは破損
            return if entry.purged_at.is_some() {
                Ok(EntrySecret::default())
            } else {
                Err(VaultError::CorruptedEntry(id.to_string()))
            };
        };
        let sealed = self
            .secrets
            .get(id)
            .ok_or_else(|| VaultError::CorruptedEntry(id.to_string()))?;
        let plaintext = self
            .keys
            .open_secret(&self.meta.vault_uuid, id, secret_rev, sealed)
            .map_err(|_| VaultError::CorruptedEntry(id.to_string()))?;
        EntrySecret::from_bytes(&plaintext).map_err(|_| VaultError::CorruptedEntry(id.to_string()))
    }

    /// 平文の比較をせず、新しい `secret_rev` で secret ブロックを暗号化する
    pub(crate) fn seal_secret_with_new_rev(&mut self, id: &str, plaintext: &[u8]) -> Result<()> {
        let secret_rev = new_secret_rev();
        let sealed = self.seal_secret(id, &secret_rev, plaintext)?;
        let entry = self
            .index
            .entries
            .get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;
        entry.secret_rev = Some(secret_rev);
        self.secrets.insert(id.to_string(), sealed);
        Ok(())
    }

    /// secret ブロックを暗号化した暗号文を返す（vault の状態は変えない）
    pub(crate) fn seal_secret(
        &self,
        id: &str,
        secret_rev: &str,
        plaintext: &[u8],
    ) -> Result<String> {
        seal_secret_block(&self.keys, &self.meta.vault_uuid, id, secret_rev, plaintext)
    }

    /// index に行がない孤立ブロックと、purged エントリのブロックを削除する（7-1）
    pub(crate) fn prune_secrets(&mut self) {
        let index = &self.index;
        self.secrets.retain(|id, _| {
            index
                .entries
                .get(id)
                .is_some_and(|e| e.secret_rev.is_some())
        });
    }

    /// vault.json（v2）を作る。index は毎回再暗号化し、secret は暗号文のまま使い回す
    pub(crate) fn to_vault_file(&self) -> Result<VaultFile> {
        let index = self.keys.seal_index(
            &self.meta.vault_uuid,
            &self.index.to_bytes_with_meta_digest(&self.meta.digest())?,
        )?;
        let secrets = self
            .secrets
            .iter()
            .filter(|(id, _)| {
                self.index
                    .entries
                    .get(*id)
                    .is_some_and(|e| e.secret_rev.is_some())
            })
            .map(|(id, sealed)| (id.clone(), sealed.clone()))
            .collect();
        Ok(VaultFile {
            schema_version: SCHEMA_VERSION_V2,
            meta: self.meta.clone(),
            index,
            secrets,
            extra: self.file_extra.clone(),
        })
    }
}

fn open_index(keys: &SubKeys, file: &VaultFile) -> Result<VaultIndex> {
    let plaintext = keys.open_index(&file.meta.vault_uuid, &file.index)?;
    VaultIndex::from_bytes(&plaintext)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::EntrySecret;

    #[test]
    fn test_padded_secret_len() {
        assert_eq!(padded_secret_len(0), 256);
        assert_eq!(padded_secret_len(256), 256);
        assert_eq!(padded_secret_len(257), 272);
        assert_eq!(padded_secret_len(1000), 1024);
        for len in [257, 300, 1000, 4097, 100_000] {
            let padded = padded_secret_len(len);
            assert!(padded >= len);
            // Padmé の増加量は最大でも約 12%
            assert!(padded as f64 <= len as f64 * 1.12, "{}", len);
        }
    }

    #[test]
    fn test_secret_length_is_hidden() {
        let keys = SubKeys::derive(&Dek::from_bytes([7u8; 32]));
        let seal = |password: &str| {
            let json = format!(
                r#"{{"fields":{{"password":"{}"}},"custom_fields":{{}}}}"#,
                password
            );
            seal_secret_block(&keys, "uuid", "id", "rev", json.as_bytes()).unwrap()
        };
        assert_eq!(
            seal("").len(),
            seal("a-much-longer-password-1234567890").len()
        );

        // 埋めた空白は JSON の末尾の空白として読み飛ばされる
        let sealed = seal("pw");
        let plaintext = keys.open_secret("uuid", "id", "rev", &sealed).unwrap();
        let secret = EntrySecret::from_bytes(&plaintext).unwrap();
        assert_eq!(secret.fields["password"].value(), "pw");
    }
}
