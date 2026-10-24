use std::collections::HashMap;

use crate::error::Result;
use crate::storage::StorageBackend;
use crate::store::{StoredVault, VaultFile};
use crate::sync::MergeSide;

use super::{LockedVault, UnlockedVault};

impl UnlockedVault {
    /// Push changes to storage
    pub async fn push(&self, storage: &dyn StorageBackend) -> Result<String> {
        let file_bytes = self.to_vault_bytes()?;
        storage.upload(&file_bytes, self.etag.as_deref()).await
    }

    /// Sync with remote storage (auto-merge using LWW + Tombstone strategy)
    pub async fn sync(&mut self, storage: &dyn StorageBackend) -> Result<crate::sync::SyncResult> {
        // Download remote version
        let (remote_bytes, remote_etag) = match storage.download().await? {
            Some((bytes, etag)) => (bytes, etag),
            None => {
                // No remote version - push current state
                let new_etag = self.push(storage).await?;
                self.etag = Some(new_etag.clone());
                return Ok(crate::sync::SyncResult::success(Some(new_etag)));
            }
        };

        let remote = StoredVault::from_bytes(&remote_bytes)?;
        self.merge_remote(&remote)?;
        self.etag = Some(remote_etag);

        // Push merged state back to remote
        let new_etag = self.push(storage).await?;
        self.etag = Some(new_etag.clone());

        Ok(crate::sync::SyncResult::success(Some(new_etag)))
    }

    /// リモートの vault をローカルにマージし、GC を適用する（`docs/vault-format-v2.md` 7章）。
    ///
    /// 1. リモートの index だけを復号する（secret は復号しない）
    /// 2. index 同士をエントリ単位・ラベル単位に既存アルゴリズムでマージする
    /// 3. 各エントリについて、勝った側の secret ブロックを暗号文のまま採用する。
    ///    採用した index 行の `secret_rev` と secret の AAD の一致は復号時に必ず検証されるため、
    ///    取り違えが起きても復号失敗（破損エントリ）として検出できる
    /// 4. GC で削除されたエントリの secret も削除する
    pub(crate) fn merge_remote(&mut self, remote: &StoredVault) -> Result<()> {
        let (remote_index, mut remote_secrets) = self.open_remote(remote)?;

        let merge_result = crate::sync::auto_merge(&self.index, &remote_index)?;

        let mut merged_secrets = HashMap::with_capacity(merge_result.entry_sources.len());
        for (id, side) in &merge_result.entry_sources {
            let sealed = match side {
                MergeSide::Local => self.secrets.remove(id),
                MergeSide::Remote => remote_secrets.remove(id),
            };
            if let Some(sealed) = sealed {
                merged_secrets.insert(id.clone(), sealed);
            }
        }

        self.index.entries = merge_result.merged_entries;
        self.index.labels = merge_result.merged_labels;
        // 未知のトップレベルフィールドは、ローカルにないものだけリモートから引き継ぐ
        for (key, value) in remote_index.extra {
            self.index.extra.entry(key).or_insert(value);
        }
        if let StoredVault::V2(remote_file) = remote {
            for (key, value) in &remote_file.extra {
                self.file_extra
                    .entry(key.clone())
                    .or_insert_with(|| value.clone());
            }
        }
        self.secrets = merged_secrets;

        // Apply garbage collection to remove old tombstones
        let now = crate::get_timestamp();
        crate::sync::apply_gc_to_index(&mut self.index, now);
        self.prune_secrets();

        Ok(())
    }

    /// Get current ETag
    pub fn get_etag(&self) -> Option<&String> {
        self.etag.as_ref()
    }

    /// Set ETag (for after successful upload)
    pub fn set_etag(&mut self, etag: String) {
        self.etag = Some(etag);
    }

    /// Lock vault (DEK, sub keys and index are zeroized on drop)
    pub fn lock(self) -> Result<LockedVault> {
        let vault_file = self.to_vault_file()?;
        Ok(LockedVault {
            vault_file: StoredVault::V2(vault_file),
            etag: self.etag.clone(),
        })
    }

    /// Get vault as JSON bytes (for storage)
    pub fn to_vault_bytes(&self) -> Result<Vec<u8>> {
        let vault_file: VaultFile = self.to_vault_file()?;
        vault_file.to_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::Dek;
    use crate::models::{Argon2Params, EntryData, TypedValue, VaultMeta};
    use crate::store::VaultFile;

    const DEK_BYTES: [u8; 32] = [42u8; 32];

    fn meta() -> VaultMeta {
        VaultMeta {
            vault_uuid: "11111111-1111-4111-8111-111111111111".to_string(),
            encrypted_dek_master: String::new(),
            encrypted_dek_recovery: String::new(),
            argon2_params: Argon2Params::default(),
            created_at: 0,
        }
    }

    /// 同じ vault を開いている別の端末を作る
    fn device(file: &VaultFile) -> UnlockedVault {
        UnlockedVault::from_vault_file(file.clone(), Dek::from_bytes(DEK_BYTES), None).unwrap()
    }

    fn login(password: &str) -> EntryData {
        EntryData::new_login(
            Some("https://example.com".into()),
            "user".into(),
            password.into(),
            None,
        )
    }

    fn password_of(vault: &UnlockedVault, id: &str) -> String {
        match vault.get_entry(id).unwrap().unwrap().data.typed_value {
            TypedValue::Login(d) => d.password.as_str().to_string(),
            _ => panic!("Expected Login"),
        }
    }

    fn remote_of(vault: &UnlockedVault) -> StoredVault {
        StoredVault::V2(vault.to_vault_file().unwrap())
    }

    #[test]
    fn test_merge_adopts_secret_of_winning_side() {
        let base = UnlockedVault::new_empty(meta(), Dek::from_bytes(DEK_BYTES));
        let mut a = device(&base.to_vault_file().unwrap());
        let shared = a
            .create_entry("Shared".into(), "login".into(), login("v1"), vec![])
            .unwrap();
        let mut b = device(&a.to_vault_file().unwrap());

        // 端末 B で後から編集し、端末 A で別のエントリを追加する
        a.index.entries.get_mut(&shared.id).unwrap().updated_at = 1;
        let a_only = a
            .create_entry("A only".into(), "login".into(), login("a"), vec![])
            .unwrap();
        b.update_entry(&shared.id, "Shared".into(), login("v2"))
            .unwrap();
        let b_only = b
            .create_entry("B only".into(), "login".into(), login("b"), vec![])
            .unwrap();

        a.merge_remote(&remote_of(&b)).unwrap();

        assert_eq!(password_of(&a, &shared.id), "v2");
        assert_eq!(password_of(&a, &a_only.id), "a");
        assert_eq!(password_of(&a, &b_only.id), "b");
        assert_eq!(a.secrets[&shared.id], b.secrets[&shared.id]);
    }

    #[test]
    fn test_merge_does_not_need_remote_secrets_to_be_decryptable() {
        // マージは index だけで行い、secret は復号しない。リモートで壊れている secret も
        // そのまま引き継ぎ、そのエントリだけが破損として扱われる
        let base = UnlockedVault::new_empty(meta(), Dek::from_bytes(DEK_BYTES));
        let a = device(&base.to_vault_file().unwrap());
        let mut b = device(&a.to_vault_file().unwrap());
        let entry = b
            .create_entry("E".into(), "login".into(), login("x"), vec![])
            .unwrap();
        let mut remote_file = b.to_vault_file().unwrap();
        remote_file
            .secrets
            .insert(entry.id.clone(), "garbage".to_string());

        let mut a = a;
        a.merge_remote(&StoredVault::V2(remote_file)).unwrap();
        assert!(matches!(
            a.get_entry(&entry.id),
            Err(crate::VaultError::CorruptedEntry(_))
        ));
        assert_eq!(a.secrets[&entry.id], "garbage");
    }

    #[test]
    fn test_merge_remote_v1_is_migrated() {
        use crate::secret::EntrySecretJson;
        use crate::store::v1::{VaultContentsV1, VaultEntryV1, VaultFileV1};

        let mut contents = VaultContentsV1::default();
        contents.entries.insert(
            "old".to_string(),
            VaultEntryV1 {
                entry_type: "login".to_string(),
                name: "Old".to_string(),
                created_at: 1,
                updated_at: 1,
                deleted_at: None,
                purged_at: None,
                is_favorite: false,
                label_ids: vec![],
                typed_value: EntrySecretJson::from_string(
                    r#"{"url":null,"username":"u","password":"from-v1"}"#.to_string(),
                ),
                notes: None,
                custom_fields: None,
            },
        );
        let remote = StoredVault::V1(VaultFileV1 {
            schema_version: 1,
            meta: meta(),
            encrypted_vault: crate::crypto::v1::encrypt_vault(
                &contents,
                &Dek::from_bytes(DEK_BYTES),
            )
            .unwrap(),
        });

        let mut local = UnlockedVault::new_empty(meta(), Dek::from_bytes(DEK_BYTES));
        let local_entry = local
            .create_entry("New".into(), "login".into(), login("local"), vec![])
            .unwrap();
        local.merge_remote(&remote).unwrap();

        assert_eq!(password_of(&local, "old"), "from-v1");
        assert_eq!(password_of(&local, &local_entry.id), "local");
        assert_eq!(local.to_vault_file().unwrap().schema_version, 2);
    }

    #[test]
    fn test_merge_rejects_different_vault() {
        let mut local = UnlockedVault::new_empty(meta(), Dek::from_bytes(DEK_BYTES));
        let mut other_meta = meta();
        other_meta.vault_uuid = "22222222-2222-4222-8222-222222222222".to_string();
        let other = UnlockedVault::new_empty(other_meta, Dek::from_bytes(DEK_BYTES));
        assert!(matches!(
            local.merge_remote(&remote_of(&other)),
            Err(crate::VaultError::VaultUuidMismatch { .. })
        ));
    }

    #[test]
    fn test_merge_purge_on_remote_removes_local_secret() {
        let base = UnlockedVault::new_empty(meta(), Dek::from_bytes(DEK_BYTES));
        let mut a = device(&base.to_vault_file().unwrap());
        let entry = a
            .create_entry("E".into(), "login".into(), login("x"), vec![])
            .unwrap();
        let mut b = device(&a.to_vault_file().unwrap());
        a.index.entries.get_mut(&entry.id).unwrap().updated_at = 1;
        b.purge_entry(&entry.id).unwrap();

        a.merge_remote(&remote_of(&b)).unwrap();
        assert!(a.index.entries[&entry.id].purged_at.is_some());
        assert!(!a.secrets.contains_key(&entry.id));
    }

    #[test]
    fn test_gc_after_merge_removes_old_tombstones() {
        let base = UnlockedVault::new_empty(meta(), Dek::from_bytes(DEK_BYTES));
        let mut a = device(&base.to_vault_file().unwrap());
        let entry = a
            .create_entry("E".into(), "login".into(), login("x"), vec![])
            .unwrap();
        a.purge_entry(&entry.id).unwrap();
        let tombstone = a.index.entries.get_mut(&entry.id).unwrap();
        tombstone.purged_at = Some(0);
        tombstone.deleted_at = Some(0);
        tombstone.updated_at = 0;

        let b = device(&base.to_vault_file().unwrap());
        a.merge_remote(&remote_of(&b)).unwrap();
        assert!(!a.index.entries.contains_key(&entry.id));
    }
}
