use zeroize::Zeroizing;

use crate::error::{Result, VaultError};
use crate::models::{Entry, EntryData, EntryFilter, EntrySummary, SortField, SortOrder};
use crate::secret::PublicString;
use crate::store::layout::{combine_entry_data, split_custom_fields, split_typed_value};
use crate::store::{EntrySecret, VaultEntry};

use super::secrets::new_secret_rev;
use super::UnlockedVault;

/// エントリ数の上限。クライアントはこれより多い件数を想定した UI・ストレージ設計に
/// なっていない（拡張機能は vault を chrome.storage.local に保存し、その容量制限を受ける）。
/// 同期で取り込んだ分はこの上限を超えても受け入れ、新規作成だけを止める
pub(crate) const MAX_ENTRIES: usize = 2000;

impl UnlockedVault {
    /// エントリのサマリ一覧をフィルタのソート順で返す（一覧表示・オートフィル候補抽出用）。
    /// index だけから作るため、secret ブロックは一切復号しない。
    pub fn list_entry_summaries(&self, filter: &EntryFilter) -> Vec<EntrySummary> {
        let mut result: Vec<EntrySummary> = self
            .index
            .entries
            .iter()
            .filter(|(_, e)| filter.matches(e))
            .map(|(id, e)| vault_entry_to_summary(id.clone(), e))
            .collect();
        sort_by_filter(&mut result, filter);
        result
    }

    /// ID を指定してエントリを取り出す。完全削除済み（tombstone）は同期のために残しているだけなので、
    /// 存在しないものとして扱う
    fn live_entry(&self, id: &str) -> Option<&VaultEntry> {
        self.index.entries.get(id).filter(|e| e.purged_at.is_none())
    }

    /// Get single entry (decrypted). 対象エントリの secret だけを復号する
    pub fn get_entry(&self, id: &str) -> Result<Option<Entry>> {
        match self.live_entry(id) {
            Some(e) => Ok(Some(self.decrypt_entry(id, e)?)),
            None => Ok(None),
        }
    }

    /// 指定エントリのTOTPカスタムフィールドからTOTPコードを生成する。
    /// 対象エントリの secret だけを復号する。
    /// エントリが存在しない、またはtotpカスタムフィールドを持たない場合は`Ok(None)`。
    pub fn get_totp_code(&self, id: &str) -> Result<Option<String>> {
        let Some(vault_entry) = self.live_entry(id) else {
            return Ok(None);
        };
        let Some(field) = vault_entry
            .custom_fields
            .iter()
            .find(|f| f.field_type == "totp")
        else {
            return Ok(None);
        };
        let value = if field.secret {
            let secret = self.read_secret(id)?;
            secret
                .custom_fields
                .get(&field.id)
                .map(|v| Zeroizing::new(v.as_str().to_string()))
        } else {
            field
                .value
                .as_ref()
                .map(|v| Zeroizing::new(v.as_str().to_string()))
        };
        match value {
            Some(value) => crate::totp::generate_totp_from_value(&value).map(Some),
            None => Ok(None),
        }
    }

    /// 複数エントリのTOTP周期をまとめて取得する（オートフィル候補一覧のN+1回避用）。
    /// 周期は index にある totp フィールドの公開部から読み、secret は復号しない。
    /// 存在しないID・totpカスタムフィールドを持たないエントリは結果から除外する。
    pub fn list_totp_periods(&self, ids: &[String]) -> Vec<(String, u64)> {
        ids.iter()
            .filter_map(|id| {
                let vault_entry = self.live_entry(id)?;
                let field = vault_entry
                    .custom_fields
                    .iter()
                    .find(|f| f.field_type == "totp")?;
                Some((id.clone(), totp_period_from_index(field)))
            })
            .collect()
    }

    /// Create entry
    /// エントリ数（ゴミ箱を含み、完全削除済みは除く）が `MAX_ENTRIES` に達していれば作らない。
    /// 存在しない・削除済みのラベル ID が含まれていれば作らない
    pub fn create_entry(
        &mut self,
        name: String,
        entry_type: String,
        data: EntryData,
        label_ids: Vec<String>,
    ) -> Result<Entry> {
        self.validate_label_ids(&label_ids)?;

        let count = self
            .index
            .entries
            .values()
            .filter(|e| e.purged_at.is_none())
            .count();
        if count >= MAX_ENTRIES {
            return Err(VaultError::EntryLimitReached(MAX_ENTRIES));
        }

        let id = uuid::Uuid::new_v4().to_string();
        let now = crate::get_timestamp();

        let mut vault_entry = VaultEntry::new(entry_type, name, now);
        vault_entry.label_ids = label_ids;
        self.store_entry(&id, vault_entry, &data)?;

        self.get_entry(&id)?
            .ok_or_else(|| VaultError::EntryNotFound(id.clone()))
    }

    /// Update entry (only active entries can be updated)
    /// secret は平文が変わった場合だけ再暗号化する（`docs/vault-format-v2.md` 5-4）
    ///
    /// `label_ids` が Some ならラベルも同じ書き込みで置き換える。存在しない・削除済みの
    /// ラベル ID は外す（編集中に別の画面や同期マージでラベルが消えても、編集内容を失わないため）
    pub fn update_entry(
        &mut self,
        id: &str,
        name: String,
        data: EntryData,
        label_ids: Option<Vec<String>>,
    ) -> Result<()> {
        let entry = self
            .index
            .entries
            .get(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        if entry.deleted_at.is_some() || entry.purged_at.is_some() {
            return Err(VaultError::EntryNotFound(id.to_string()));
        }

        let mut entry = entry.clone();
        entry.name = PublicString::new(name);
        if let Some(mut label_ids) = label_ids {
            label_ids.retain(|lid| self.is_active_label(lid));
            entry.label_ids = label_ids;
        }
        entry.updated_at = crate::get_timestamp();
        self.store_entry(id, entry, &data)
    }

    /// `EntryData` を index（非秘匿値）と secret（秘匿値）に振り分け、`entry` を `id` の行として書き込む。
    /// 既存のエントリでは、未知のエントリタイプ・フィールドタイプの配置と、
    /// 未知のフィールド（`extra`）を引き継ぐ。
    ///
    /// 振り分けと暗号化をすべて済ませてから index と secret を書き換えるため、
    /// 途中で失敗しても vault の状態は変わらない。
    pub(crate) fn store_entry(
        &mut self,
        id: &str,
        mut entry: VaultEntry,
        data: &EntryData,
    ) -> Result<()> {
        // 既存の secret が破損していても、新しい内容で上書きできるようにする
        let previous_secret = if self.index.entries.contains_key(id) {
            self.read_secret(id).ok()
        } else {
            None
        };

        let typed_value_json = Zeroizing::new(data.typed_value.to_json_string());
        let (public_fields, secret_fields) = split_typed_value(
            &entry.entry_type,
            &typed_value_json,
            Some(&entry.public_fields),
        )?;
        let (custom_fields, secret_custom_fields) = split_custom_fields(
            data.custom_fields.as_deref().unwrap_or_default(),
            &entry.custom_fields,
        );
        entry.public_fields = public_fields;
        entry.custom_fields = custom_fields;

        let previous_plaintext = previous_secret.as_ref().map(|s| s.to_bytes()).transpose()?;
        let secret = EntrySecret {
            fields: secret_fields,
            notes: data.notes.clone(),
            custom_fields: secret_custom_fields,
            extra: previous_secret.map(|s| s.extra).unwrap_or_default(),
        };

        // 平文が変わっていなければ、暗号文と `secret_rev` を維持する（5-4）
        let plaintext = secret.to_bytes()?;
        let unchanged = entry.secret_rev.is_some()
            && previous_plaintext.is_some_and(|previous| *previous == *plaintext);
        let sealed = if unchanged {
            None
        } else {
            let secret_rev = new_secret_rev();
            let sealed = self.seal_secret(id, &secret_rev, &plaintext)?;
            entry.secret_rev = Some(secret_rev);
            Some(sealed)
        };

        self.index.entries.insert(id.to_string(), entry);
        if let Some(sealed) = sealed {
            self.secrets.insert(id.to_string(), sealed);
        }
        Ok(())
    }

    /// Delete entry (soft delete to trash)
    /// Idempotent: calling on an already soft-deleted entry is a no-op.
    pub fn delete_entry(&mut self, id: &str) -> Result<()> {
        let entry = self
            .index
            .entries
            .get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        if entry.purged_at.is_some() {
            return Err(VaultError::InvalidInput(
                "Cannot delete a purged entry".to_string(),
            ));
        }

        // Already soft-deleted — no-op for idempotency
        if entry.deleted_at.is_some() {
            return Ok(());
        }

        let now = crate::get_timestamp();
        entry.deleted_at = Some(now);
        entry.updated_at = now;
        Ok(())
    }

    /// Restore entry from trash (only soft-deleted entries can be restored)
    pub fn restore_entry(&mut self, id: &str) -> Result<()> {
        let entry = self
            .index
            .entries
            .get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        if entry.purged_at.is_some() {
            return Err(VaultError::InvalidInput(
                "Cannot restore a purged entry".to_string(),
            ));
        }

        entry.deleted_at = None;
        entry.updated_at = crate::get_timestamp();
        Ok(())
    }

    /// Permanently delete entry (converts to tombstone)
    /// index 上の値を空にし、secret ブロックを削除する（`secret_rev = null`）。
    /// Idempotent: calling on an already-purged entry is a no-op.
    pub fn purge_entry(&mut self, id: &str) -> Result<()> {
        let entry = self
            .index
            .entries
            .get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        // Already purged — no-op for idempotency
        if entry.purged_at.is_some() {
            return Ok(());
        }

        let now = crate::get_timestamp();

        // Ensure entry is marked as deleted first
        if entry.deleted_at.is_none() {
            entry.deleted_at = Some(now);
        }

        // Convert to tombstone: clear values and mark as purged
        entry.purged_at = Some(now);
        entry.updated_at = now;
        entry.name = PublicString::default();
        entry.public_fields.clear();
        entry.custom_fields.clear();
        entry.label_ids.clear();
        entry.is_favorite = false;
        entry.extra.clear();
        entry.secret_rev = None;
        self.secrets.remove(id);

        Ok(())
    }

    /// Set entry favorite (only active entries). secret は再暗号化しない
    pub fn set_favorite(&mut self, id: &str, is_favorite: bool) -> Result<()> {
        let entry = self
            .index
            .entries
            .get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        if entry.deleted_at.is_some() || entry.purged_at.is_some() {
            return Err(VaultError::EntryNotFound(id.to_string()));
        }

        entry.is_favorite = is_favorite;
        entry.updated_at = crate::get_timestamp();
        Ok(())
    }

    /// index 行と、そのエントリの secret を合成して `Entry` を作る
    fn decrypt_entry(&self, id: &str, e: &VaultEntry) -> Result<Entry> {
        let secret = self.read_secret(id)?;
        let data = combine_entry_data(e, &secret).map_err(|err| {
            VaultError::InvalidInput(format!("Invalid typed_value for entry {}: {:?}", id, err))
        })?;
        Ok(Entry {
            id: id.to_string(),
            name: e.name.to_string(),
            entry_type: e.entry_type.clone(),
            is_favorite: e.is_favorite,
            created_at: e.created_at,
            updated_at: e.updated_at,
            deleted_at: e.deleted_at,
            data,
            labels: e.label_ids.clone(),
            secret_field_keys: secret.fields.keys().cloned().collect(),
        })
    }
}

fn sort_by_filter(items: &mut [EntrySummary], filter: &EntryFilter) {
    items.sort_by(|a, b| {
        let cmp = match filter.sort_field {
            SortField::Name => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            SortField::CreatedAt => a.created_at.cmp(&b.created_at),
            SortField::UpdatedAt => a.updated_at.cmp(&b.updated_at),
        };
        match filter.sort_order {
            SortOrder::Asc => cmp,
            SortOrder::Desc => cmp.reverse(),
        }
    });
}

/// totp フィールドの公開部（`{"period": 30}`）から周期を読む。
/// 公開部がない・読めない場合は、非秘匿の値ならそこから、そうでなければ既定値（30 秒）を返す。
fn totp_period_from_index(field: &crate::store::IndexCustomField) -> u64 {
    #[derive(serde::Deserialize)]
    struct TotpPublic {
        period: u64,
    }
    let value = field.value.as_deref().unwrap_or_default();
    if field.secret {
        serde_json::from_str::<TotpPublic>(value)
            .map(|p| p.period)
            .unwrap_or_else(|_| crate::totp::parse_totp_period(""))
    } else {
        crate::totp::parse_totp_period(value)
    }
}

/// index 上の非秘匿の値を文字列として取り出す（空文字列は None）
fn public_text(e: &VaultEntry, key: &str) -> Option<String> {
    e.public_fields
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// VaultEntry（index 行）から一覧表示用の軽量サマリを作る。secret は復号しない。
pub(crate) fn vault_entry_to_summary(id: String, e: &VaultEntry) -> EntrySummary {
    // エントリタイプごとの非秘匿な代表フィールド
    let subtitle = match e.entry_type.as_str() {
        "login" | "password" => public_text(e, "username"),
        "bank" => public_text(e, "bank_name"),
        "credit_card" => public_text(e, "cardholder"),
        _ => None,
    };
    let login_url = if e.entry_type == "login" {
        public_text(e, "url")
    } else {
        None
    };

    // 非秘匿のURL型カスタムフィールドをオートフィル候補抽出用に収集
    let additional_urls: Vec<String> = e
        .custom_fields
        .iter()
        .filter(|f| f.field_type == "url" && !f.secret)
        .filter_map(|f| f.value.as_deref())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect();

    EntrySummary {
        id,
        name: e.name.to_string(),
        entry_type: e.entry_type.clone(),
        is_favorite: e.is_favorite,
        created_at: e.created_at,
        updated_at: e.updated_at,
        deleted_at: e.deleted_at,
        subtitle,
        login_url,
        additional_urls,
    }
}

#[cfg(test)]
mod tests {
    use super::super::UnlockedVault;
    use super::*;
    use crate::crypto::Dek;
    use crate::models::{Argon2Params, CustomField, SortField, SortOrder, VaultMeta};
    use crate::secret::SecretString;

    fn make_vault() -> UnlockedVault {
        let dek = Dek::generate();
        let params = Argon2Params::default();
        let password = crate::secret::MasterPassword::from_string("test".to_string());
        let kek = crate::crypto::kdf::derive_kek_from_master_password(&password, &params).unwrap();
        let meta = VaultMeta::new(dek.wrap(&kek).unwrap(), dek.wrap(&kek).unwrap(), params);
        UnlockedVault::new_empty(meta, dek)
    }

    fn make_login_data() -> EntryData {
        EntryData::new_login(
            Some("https://example.com".into()),
            "user".into(),
            "pass".into(),
            None,
        )
    }

    fn insert_entry(vault: &mut UnlockedVault, id: &str, name: &str, created_at: i64) {
        let data = make_login_data();
        let mut entry = VaultEntry::new("login", name, created_at);
        entry.updated_at = created_at;
        vault.store_entry(id, entry, &data).unwrap();
    }

    #[test]
    fn test_create_entry() {
        let mut vault = make_vault();
        let data = make_login_data();
        let entry = vault
            .create_entry("Test".into(), "login".to_string(), data, vec![])
            .unwrap();

        assert_eq!(entry.name, "Test");
        assert_eq!(entry.entry_type, "login");
        assert!(!entry.is_favorite);
        assert!(entry.deleted_at.is_none());
        assert!(vault.index.entries.contains_key(&entry.id));
    }

    #[test]
    fn test_create_entry_rejects_unknown_or_deleted_label() {
        let mut vault = make_vault();
        let deleted = vault.create_label("Deleted".into()).unwrap();
        vault.delete_label(&deleted.id).unwrap();

        for label_id in ["nonexistent".to_string(), deleted.id] {
            let result = vault.create_entry(
                "Test".into(),
                "login".into(),
                make_login_data(),
                vec![label_id],
            );
            assert!(matches!(result, Err(VaultError::LabelNotFound(_))));
        }
        assert!(vault.index.entries.is_empty());
    }

    #[test]
    fn test_create_entry_stops_at_limit() {
        // ゴミ箱のエントリも数え、完全削除済み（tombstone）は数えない
        let mut vault = make_vault();
        for i in 0..MAX_ENTRIES {
            insert_entry(&mut vault, &format!("e{i}"), "Entry", 1000);
        }
        vault.delete_entry("e0").unwrap();
        let result = vault.create_entry("Over".into(), "login".into(), make_login_data(), vec![]);
        assert!(matches!(
            result,
            Err(VaultError::EntryLimitReached(MAX_ENTRIES))
        ));

        vault.purge_entry("e0").unwrap();
        assert!(vault
            .create_entry("Ok".into(), "login".into(), make_login_data(), vec![])
            .is_ok());
    }

    /// typed_value として JSON オブジェクト以外を持つ（振り分けに失敗する）データ
    fn invalid_data() -> EntryData {
        EntryData {
            entry_type: "future_type".to_string(),
            typed_value: crate::models::TypedValue::parse("future_type", "[1]").unwrap(),
            notes: None,
            custom_fields: None,
        }
    }

    #[test]
    fn test_create_entry_failure_leaves_no_entry() {
        let mut vault = make_vault();
        let result =
            vault.create_entry("Ghost".into(), "future_type".into(), invalid_data(), vec![]);
        assert!(result.is_err());
        assert!(vault.index.entries.is_empty());
        assert!(vault.secrets.is_empty());
    }

    #[test]
    fn test_update_entry_failure_keeps_entry_unchanged() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Before", 1000);
        let before_rev = vault.index.entries["e1"].secret_rev.clone();

        assert!(vault
            .update_entry("e1", "After".into(), invalid_data(), None)
            .is_err());

        let entry = &vault.index.entries["e1"];
        assert_eq!(entry.name, "Before");
        assert_eq!(entry.updated_at, 1000);
        assert_eq!(entry.secret_rev, before_rev);
        assert!(vault.get_entry("e1").is_ok());
    }

    #[test]
    fn test_active_entry_without_secret_rev_is_corrupted() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Entry1", 1000);
        vault.index.entries.get_mut("e1").unwrap().secret_rev = None;

        assert!(matches!(
            vault.get_entry("e1"),
            Err(VaultError::CorruptedEntry(_))
        ));
    }

    #[test]
    fn test_get_entry() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Entry1", 1000);

        let entry = vault.get_entry("e1").unwrap().unwrap();
        assert_eq!(entry.id, "e1");
        assert_eq!(entry.name, "Entry1");
        assert_eq!(entry.created_at, 1000);

        assert!(vault.get_entry("nonexistent").unwrap().is_none());
    }

    fn insert_entry_with_updated(
        vault: &mut UnlockedVault,
        id: &str,
        name: &str,
        created_at: i64,
        updated_at: i64,
    ) {
        let data = make_login_data();
        let mut entry = VaultEntry::new("login", name, created_at);
        entry.updated_at = updated_at;
        vault.store_entry(id, entry, &data).unwrap();
    }

    #[test]
    fn test_list_entry_summaries_default_sort_created_at_desc() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "old", "Old", 1000);
        insert_entry(&mut vault, "mid", "Mid", 2000);
        insert_entry(&mut vault, "new", "New", 3000);

        let filter = EntryFilter::new();
        let entries = vault.list_entry_summaries(&filter);

        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].id, "new");
        assert_eq!(entries[1].id, "mid");
        assert_eq!(entries[2].id, "old");
    }

    #[test]
    fn test_list_entry_summaries_sort_created_at_asc() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "old", "Old", 1000);
        insert_entry(&mut vault, "mid", "Mid", 2000);
        insert_entry(&mut vault, "new", "New", 3000);

        let filter = EntryFilter::new().with_sort(SortField::CreatedAt, SortOrder::Asc);
        let entries = vault.list_entry_summaries(&filter);

        assert_eq!(entries[0].id, "old");
        assert_eq!(entries[1].id, "mid");
        assert_eq!(entries[2].id, "new");
    }

    #[test]
    fn test_list_entry_summaries_sort_name_asc() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Charlie", 1000);
        insert_entry(&mut vault, "e2", "Alice", 2000);
        insert_entry(&mut vault, "e3", "Bob", 3000);

        let filter = EntryFilter::new().with_sort(SortField::Name, SortOrder::Asc);
        let entries = vault.list_entry_summaries(&filter);

        assert_eq!(entries[0].name, "Alice");
        assert_eq!(entries[1].name, "Bob");
        assert_eq!(entries[2].name, "Charlie");
    }

    #[test]
    fn test_list_entry_summaries_sort_name_desc() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Charlie", 1000);
        insert_entry(&mut vault, "e2", "Alice", 2000);
        insert_entry(&mut vault, "e3", "Bob", 3000);

        let filter = EntryFilter::new().with_sort(SortField::Name, SortOrder::Desc);
        let entries = vault.list_entry_summaries(&filter);

        assert_eq!(entries[0].name, "Charlie");
        assert_eq!(entries[1].name, "Bob");
        assert_eq!(entries[2].name, "Alice");
    }

    #[test]
    fn test_list_entry_summaries_sort_name_case_insensitive() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "banana", 1000);
        insert_entry(&mut vault, "e2", "Apple", 2000);
        insert_entry(&mut vault, "e3", "cherry", 3000);

        let filter = EntryFilter::new().with_sort(SortField::Name, SortOrder::Asc);
        let entries = vault.list_entry_summaries(&filter);

        assert_eq!(entries[0].name, "Apple");
        assert_eq!(entries[1].name, "banana");
        assert_eq!(entries[2].name, "cherry");
    }

    #[test]
    fn test_list_entry_summaries_sort_updated_at_desc() {
        let mut vault = make_vault();
        insert_entry_with_updated(&mut vault, "e1", "First", 1000, 5000);
        insert_entry_with_updated(&mut vault, "e2", "Second", 2000, 3000);
        insert_entry_with_updated(&mut vault, "e3", "Third", 3000, 4000);

        let filter = EntryFilter::new().with_sort(SortField::UpdatedAt, SortOrder::Desc);
        let entries = vault.list_entry_summaries(&filter);

        assert_eq!(entries[0].id, "e1"); // updated_at=5000
        assert_eq!(entries[1].id, "e3"); // updated_at=4000
        assert_eq!(entries[2].id, "e2"); // updated_at=3000
    }

    #[test]
    fn test_list_entry_summaries_sort_updated_at_asc() {
        let mut vault = make_vault();
        insert_entry_with_updated(&mut vault, "e1", "First", 1000, 5000);
        insert_entry_with_updated(&mut vault, "e2", "Second", 2000, 3000);
        insert_entry_with_updated(&mut vault, "e3", "Third", 3000, 4000);

        let filter = EntryFilter::new().with_sort(SortField::UpdatedAt, SortOrder::Asc);
        let entries = vault.list_entry_summaries(&filter);

        assert_eq!(entries[0].id, "e2"); // updated_at=3000
        assert_eq!(entries[1].id, "e3"); // updated_at=4000
        assert_eq!(entries[2].id, "e1"); // updated_at=5000
    }

    #[test]
    fn test_list_entry_summaries_excludes_deleted_by_default() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Active", 1000);
        insert_entry(&mut vault, "e2", "Deleted", 2000);
        vault.index.entries.get_mut("e2").unwrap().deleted_at = Some(2000);

        let filter = EntryFilter::new();
        let entries = vault.list_entry_summaries(&filter);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "e1");

        let filter_with_trash = EntryFilter::new().with_trash(true);
        let entries = vault.list_entry_summaries(&filter_with_trash);
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn test_list_entry_summaries_login_subtitle_and_url() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "GitHub", 1000);

        let filter = EntryFilter::new();
        let summaries = vault.list_entry_summaries(&filter);

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].id, "e1");
        assert_eq!(summaries[0].subtitle.as_deref(), Some("user"));
        assert_eq!(
            summaries[0].login_url.as_deref(),
            Some("https://example.com")
        );
    }

    #[test]
    fn test_list_entry_summaries_bank_subtitle_no_login_url() {
        let mut vault = make_vault();
        let data = EntryData::new_bank(
            "My Bank".to_string(),
            "Account Holder".to_string(),
            "001".to_string(),
            "Checking".to_string(),
            "1234567890".to_string(),
            "1234".to_string(),
            None,
        );
        vault
            .create_entry("Bank".into(), "bank".to_string(), data, vec![])
            .unwrap();

        let filter = EntryFilter::new();
        let summaries = vault.list_entry_summaries(&filter);

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].subtitle.as_deref(), Some("My Bank"));
        // bankエントリはlogin_urlの対象外
        assert_eq!(summaries[0].login_url, None);
    }

    #[test]
    fn test_list_entry_summaries_additional_urls_from_custom_fields() {
        let mut vault = make_vault();
        let mut data = make_login_data();
        data.custom_fields = Some(vec![
            CustomField {
                id: "cf1".to_string(),
                name: "Recovery URL".to_string(),
                field_type: "url".to_string(),
                value: SecretString::from_string("https://recovery.example.com".to_string()),
                secret: false,
                autofill_selector: None,
            },
            CustomField {
                id: "cf2".to_string(),
                name: "API Endpoint".to_string(),
                field_type: "url".to_string(),
                value: SecretString::from_string("https://api.example.com".to_string()),
                secret: false,
                autofill_selector: None,
            },
            CustomField {
                id: "cf3".to_string(),
                name: "Note".to_string(),
                field_type: "text".to_string(),
                value: SecretString::from_string("not a url".to_string()),
                secret: false,
                autofill_selector: None,
            },
        ]);
        vault
            .create_entry("Login".into(), "login".to_string(), data, vec![])
            .unwrap();

        let filter = EntryFilter::new();
        let summaries = vault.list_entry_summaries(&filter);

        assert_eq!(summaries.len(), 1);
        // login_url は typed_value.url から
        assert_eq!(
            summaries[0].login_url.as_deref(),
            Some("https://example.com")
        );
        // URL型カスタムフィールドのみが additional_urls に収集される
        assert_eq!(
            summaries[0].additional_urls,
            vec![
                "https://recovery.example.com".to_string(),
                "https://api.example.com".to_string(),
            ]
        );
    }

    #[test]
    fn test_list_entry_summaries_additional_urls_empty_when_no_url_fields() {
        let mut vault = make_vault();
        let mut data = make_login_data();
        data.custom_fields = Some(vec![CustomField {
            id: "cf1".to_string(),
            name: "Security Q".to_string(),
            field_type: "text".to_string(),
            value: SecretString::from_string("answer".to_string()),
            secret: false,
            autofill_selector: None,
        }]);
        vault
            .create_entry("Login".into(), "login".to_string(), data, vec![])
            .unwrap();

        let filter = EntryFilter::new();
        let summaries = vault.list_entry_summaries(&filter);

        assert_eq!(summaries.len(), 1);
        assert!(summaries[0].additional_urls.is_empty());
    }

    #[test]
    fn test_list_entry_summaries_credit_card_subtitle() {
        let mut vault = make_vault();
        let data = EntryData::new_credit_card(
            "John Doe".to_string(),
            "4532015112830366".to_string(),
            "12/25".to_string(),
            "123".to_string(),
            "5678".to_string(),
            None,
        );
        vault
            .create_entry("Card".into(), "credit_card".to_string(), data, vec![])
            .unwrap();

        let filter = EntryFilter::new();
        let summaries = vault.list_entry_summaries(&filter);

        assert_eq!(summaries.len(), 1);
        assert_eq!(summaries[0].subtitle.as_deref(), Some("John Doe"));
        assert_eq!(summaries[0].login_url, None);
    }

    #[test]
    fn test_update_entry() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Original", 1000);

        let new_data = EntryData::new_login(
            Some("https://updated.com".into()),
            "newuser".into(),
            "newpass".into(),
            Some(SecretString::from_string("notes".to_string())),
        );
        vault
            .update_entry("e1", "Updated".into(), new_data, None)
            .unwrap();

        let entry = vault.get_entry("e1").unwrap().unwrap();
        assert_eq!(entry.name, "Updated");
        assert_eq!(entry.data.notes.as_ref().map(|n| n.as_str()), Some("notes"));
        assert!(entry.updated_at > entry.created_at);
    }

    #[test]
    fn test_update_entry_replaces_labels_and_drops_inactive_ones() {
        let mut vault = make_vault();
        let active = vault.create_label("Active".into()).unwrap();
        let deleted = vault.create_label("Deleted".into()).unwrap();
        vault.delete_label(&deleted.id).unwrap();
        insert_entry(&mut vault, "e1", "Original", 1000);

        // 存在しない・削除済みのラベルは外し、内容の更新は通す
        vault
            .update_entry(
                "e1",
                "Updated".into(),
                make_login_data(),
                Some(vec![
                    active.id.clone(),
                    "nonexistent".into(),
                    deleted.id.clone(),
                ]),
            )
            .unwrap();
        let entry = &vault.index.entries["e1"];
        assert_eq!(entry.name, "Updated");
        assert_eq!(entry.label_ids, vec![active.id.clone()]);

        // None ならラベルはそのまま
        vault
            .update_entry("e1", "Again".into(), make_login_data(), None)
            .unwrap();
        assert_eq!(vault.index.entries["e1"].label_ids, vec![active.id]);
    }

    #[test]
    fn test_update_nonexistent_entry() {
        let mut vault = make_vault();
        let data = make_login_data();
        let result = vault.update_entry("nonexistent", "Name".into(), data, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_already_deleted_is_noop() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);

        vault.delete_entry("e1").unwrap();
        let first_deleted_at = vault.index.entries["e1"].deleted_at;
        let first_updated_at = vault.index.entries["e1"].updated_at;

        // Second delete should be a no-op
        vault.delete_entry("e1").unwrap();
        assert_eq!(vault.index.entries["e1"].deleted_at, first_deleted_at);
        assert_eq!(vault.index.entries["e1"].updated_at, first_updated_at);
    }

    #[test]
    fn test_delete_purged_entry_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.purge_entry("e1").unwrap();

        let result = vault.delete_entry("e1");
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_and_restore_entry() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);

        vault.delete_entry("e1").unwrap();
        let ve = &vault.index.entries["e1"];
        assert!(ve.deleted_at.is_some());

        vault.restore_entry("e1").unwrap();
        let ve = &vault.index.entries["e1"];
        assert!(ve.deleted_at.is_none());
    }

    #[test]
    fn test_purge_entry() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Secret", 1000);
        vault.set_favorite("e1", true).unwrap();
        vault.index.entries.get_mut("e1").unwrap().extra.insert(
            "icon".to_string(),
            serde_json::json!("https://example.com/icon.png"),
        );

        vault.purge_entry("e1").unwrap();

        let ve = &vault.index.entries["e1"];
        assert!(ve.deleted_at.is_some());
        assert!(ve.purged_at.is_some());
        assert!(ve.name.is_empty());
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
        assert!(ve.custom_fields.is_empty());
        assert!(ve.label_ids.is_empty());
        assert!(!ve.is_favorite);
        assert!(ve.extra.is_empty());
    }

    #[test]
    fn test_purged_entry_is_not_listed_even_with_trash() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "trashed", "Trashed", 1000);
        insert_entry(&mut vault, "purged", "Purged", 1001);
        vault.delete_entry("trashed").unwrap();
        vault.purge_entry("purged").unwrap();

        let filter = EntryFilter::new().with_trash(true);
        let summary_ids: Vec<String> = vault
            .list_entry_summaries(&filter)
            .into_iter()
            .map(|e| e.id)
            .collect();
        assert_eq!(summary_ids, vec!["trashed".to_string()]);
        // tombstone 自体は同期のために index に残っている
        assert!(vault.index.entries.contains_key("purged"));
    }

    #[test]
    fn test_purged_entry_is_not_found_by_id() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "purged", "Purged", 1000);
        vault.purge_entry("purged").unwrap();

        assert!(vault.get_entry("purged").unwrap().is_none());
        assert!(vault.get_totp_code("purged").unwrap().is_none());
        assert!(vault.list_totp_periods(&["purged".to_string()]).is_empty());
    }

    #[test]
    fn test_purge_nonexistent_entry() {
        let mut vault = make_vault();
        assert!(vault.purge_entry("nonexistent").is_err());
    }

    #[test]
    fn test_purge_entry_clears_notes() {
        let mut vault = make_vault();
        let data = EntryData::new_login(
            Some("https://example.com".into()),
            "user".into(),
            "pass".into(),
            Some(SecretString::from_string("secret note".to_string())),
        );
        vault
            .create_entry("TestWithNotes".into(), "login".to_string(), data, vec![])
            .unwrap();

        let entries: Vec<_> = vault.index.entries.keys().cloned().collect();
        let entry_id = entries[0].clone();

        vault.purge_entry(&entry_id).unwrap();

        let ve = &vault.index.entries[&entry_id];
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
    }

    #[test]
    fn test_purge_entry_clears_custom_fields() {
        let mut vault = make_vault();
        let mut data = EntryData::new_login(
            Some("https://example.com".into()),
            "user".into(),
            "pass".into(),
            None,
        );
        data.custom_fields = Some(vec![crate::models::CustomField {
            id: "f1".to_string(),
            name: "Custom".to_string(),
            field_type: "text".to_string(),
            value: SecretString::from_string("value".to_string()),
            secret: false,
            autofill_selector: None,
        }]);

        vault
            .create_entry("TestWithFields".into(), "login".to_string(), data, vec![])
            .unwrap();

        let entries: Vec<_> = vault.index.entries.keys().cloned().collect();
        let entry_id = entries[0].clone();

        vault.purge_entry(&entry_id).unwrap();

        let ve = &vault.index.entries[&entry_id];
        assert!(ve.custom_fields.is_empty());
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
    }

    #[test]
    fn test_get_totp_code_and_list_totp_periods() {
        let mut vault = make_vault();
        let mut data = EntryData::new_login(
            Some("https://example.com".into()),
            "user".into(),
            "pass".into(),
            None,
        );
        data.custom_fields = Some(vec![crate::models::CustomField {
            id: "f1".to_string(),
            name: "TOTP".to_string(),
            field_type: "totp".to_string(),
            value: SecretString::from_string("JBSWY3DPEHPK3PXP".to_string()),
            secret: false,
            autofill_selector: None,
        }]);
        let created = vault
            .create_entry("WithTotp".into(), "login".to_string(), data, vec![])
            .unwrap();

        insert_entry(&mut vault, "no_totp", "NoTotp", 1000);

        // get_totp_code: totpフィールドを持つエントリはコードを返す
        let code = vault.get_totp_code(&created.id).unwrap();
        assert!(code.is_some());
        assert_eq!(code.unwrap().len(), 6);

        // get_totp_code: totpフィールドを持たないエントリはNone
        assert_eq!(vault.get_totp_code("no_totp").unwrap(), None);

        // get_totp_code: 存在しないIDもNone（エラーにしない）
        assert_eq!(vault.get_totp_code("nonexistent").unwrap(), None);

        // list_totp_periods: totpを持つものだけ返す
        let ids = vec![created.id.clone(), "no_totp".to_string()];
        let periods = vault.list_totp_periods(&ids);
        assert_eq!(periods, vec![(created.id.clone(), 30)]);
    }

    #[test]
    fn test_purge_bank_entry() {
        let mut vault = make_vault();
        let data = EntryData::new_bank(
            "Bank Name".to_string(),
            "Account Holder".to_string(),
            "001".to_string(),
            "Checking".to_string(),
            "1234567890".to_string(),
            "1234".to_string(),
            None,
        );
        vault
            .create_entry("BankAccount".into(), "bank".to_string(), data, vec![])
            .unwrap();

        let entries: Vec<_> = vault.index.entries.keys().cloned().collect();
        let entry_id = entries[0].clone();

        vault.purge_entry(&entry_id).unwrap();

        let ve = &vault.index.entries[&entry_id];
        assert!(ve.deleted_at.is_some());
        assert!(ve.purged_at.is_some());
        assert!(ve.name.is_empty());
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
        assert!(ve.custom_fields.is_empty());
        assert!(ve.label_ids.is_empty());
    }

    #[test]
    fn test_purge_ssh_key_entry() {
        let mut vault = make_vault();
        let data = EntryData::new_ssh_key(
            "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkq\n-----END PRIVATE KEY-----".to_string(),
            None,
        );
        vault
            .create_entry("SSHKey".into(), "ssh_key".to_string(), data, vec![])
            .unwrap();

        let entries: Vec<_> = vault.index.entries.keys().cloned().collect();
        let entry_id = entries[0].clone();

        vault.purge_entry(&entry_id).unwrap();

        let ve = &vault.index.entries[&entry_id];
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
    }

    #[test]
    fn test_purge_secure_note_entry() {
        let mut vault = make_vault();
        let data = EntryData::new_secure_note("Secret note content".to_string(), None);
        vault
            .create_entry("SecureNote".into(), "secure_note".to_string(), data, vec![])
            .unwrap();

        let entries: Vec<_> = vault.index.entries.keys().cloned().collect();
        let entry_id = entries[0].clone();

        vault.purge_entry(&entry_id).unwrap();

        let ve = &vault.index.entries[&entry_id];
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
    }

    #[test]
    fn test_purge_credit_card_entry() {
        let mut vault = make_vault();
        let data = EntryData::new_credit_card(
            "John Doe".to_string(),
            "4532015112830366".to_string(),
            "12/25".to_string(),
            "123".to_string(),
            "5678".to_string(),
            None,
        );
        vault
            .create_entry("CreditCard".into(), "credit_card".to_string(), data, vec![])
            .unwrap();

        let entries: Vec<_> = vault.index.entries.keys().cloned().collect();
        let entry_id = entries[0].clone();

        vault.purge_entry(&entry_id).unwrap();

        let ve = &vault.index.entries[&entry_id];
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
    }

    #[test]
    fn test_purge_password_entry() {
        let mut vault = make_vault();
        let data = EntryData::new_password(
            "username123".to_string(),
            "securepassword".to_string(),
            None,
        );
        vault
            .create_entry("Password".into(), "password".to_string(), data, vec![])
            .unwrap();

        let entries: Vec<_> = vault.index.entries.keys().cloned().collect();
        let entry_id = entries[0].clone();

        vault.purge_entry(&entry_id).unwrap();

        let ve = &vault.index.entries[&entry_id];
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
    }

    #[test]
    fn test_purge_software_license_entry() {
        let mut vault = make_vault();
        let data = EntryData::new_software_license(
            "XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX".to_string(),
            None,
        );
        vault
            .create_entry(
                "SoftwareLicense".into(),
                "software_license".to_string(),
                data,
                vec![],
            )
            .unwrap();

        let entries: Vec<_> = vault.index.entries.keys().cloned().collect();
        let entry_id = entries[0].clone();

        vault.purge_entry(&entry_id).unwrap();

        let ve = &vault.index.entries[&entry_id];
        assert!(ve.public_fields.is_empty());
        assert!(ve.secret_rev.is_none());
    }

    #[test]
    fn test_set_favorite() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);

        vault.set_favorite("e1", true).unwrap();
        assert!(vault.index.entries["e1"].is_favorite);

        vault.set_favorite("e1", false).unwrap();
        assert!(!vault.index.entries["e1"].is_favorite);
    }

    #[test]
    fn test_set_favorite_nonexistent() {
        let mut vault = make_vault();
        assert!(vault.set_favorite("nonexistent", true).is_err());
    }

    #[test]
    fn test_list_entry_summaries_filter_by_type() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Login", 1000);

        let note_data = EntryData::new_secure_note("content".into(), None);
        vault
            .create_entry("Note".into(), "secure_note".to_string(), note_data, vec![])
            .unwrap();

        let filter = EntryFilter::new().with_type("login");
        let entries = vault.list_entry_summaries(&filter);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Login");
    }

    #[test]
    fn test_list_entry_summaries_filter_favorites() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Normal", 1000);
        insert_entry(&mut vault, "e2", "Fav", 2000);
        vault.index.entries.get_mut("e2").unwrap().is_favorite = true;

        let filter = EntryFilter::new().favorites_only();
        let entries = vault.list_entry_summaries(&filter);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Fav");
    }

    #[test]
    fn test_list_entry_summaries_filter_by_label() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "NoLabel", 1000);
        insert_entry(&mut vault, "e2", "WithLabel", 2000);
        vault.index.entries.get_mut("e2").unwrap().label_ids = vec!["label1".into()];

        let filter = EntryFilter::new().with_label("label1".into());
        let entries = vault.list_entry_summaries(&filter);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "WithLabel");
    }

    #[test]
    fn test_list_entry_summaries_search() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "GitHub Login", 1000);
        insert_entry(&mut vault, "e2", "Gmail Login", 2000);
        insert_entry(&mut vault, "e3", "Bank Account", 3000);

        let filter = EntryFilter::new().with_search("github".into());
        let entries = vault.list_entry_summaries(&filter);
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "GitHub Login");
    }

    // ===== v2: index / secret の分離 =====

    fn secret_rev(vault: &UnlockedVault, id: &str) -> Option<String> {
        vault.index.entries[id].secret_rev.clone()
    }

    #[test]
    fn test_index_only_updates_keep_secret_rev() {
        let mut vault = make_vault();
        let entry = vault
            .create_entry(
                "Name".into(),
                "login".to_string(),
                make_login_data(),
                vec![],
            )
            .unwrap();
        let rev = secret_rev(&vault, &entry.id);
        let sealed = vault.secrets[&entry.id].clone();
        assert!(rev.is_some());

        let label = vault.create_label("L".into()).unwrap();
        vault.set_favorite(&entry.id, true).unwrap();
        // 名前・ラベル・public_fields だけの変更でも secret は再暗号化しない
        let data = EntryData::new_login(
            Some("https://changed.example".into()),
            "changed-user".into(),
            "pass".into(),
            None,
        );
        vault
            .update_entry(&entry.id, "Renamed".into(), data, Some(vec![label.id]))
            .unwrap();

        assert_eq!(secret_rev(&vault, &entry.id), rev);
        assert_eq!(vault.secrets[&entry.id], sealed);
        let summary = &vault.list_entry_summaries(&EntryFilter::new())[0];
        assert_eq!(summary.name, "Renamed");
        assert_eq!(summary.subtitle.as_deref(), Some("changed-user"));
    }

    #[test]
    fn test_secret_change_regenerates_secret_rev() {
        let mut vault = make_vault();
        let entry = vault
            .create_entry(
                "Name".into(),
                "login".to_string(),
                make_login_data(),
                vec![],
            )
            .unwrap();
        let rev = secret_rev(&vault, &entry.id);

        let data = EntryData::new_login(
            Some("https://example.com".into()),
            "user".into(),
            "new-password".into(),
            None,
        );
        vault
            .update_entry(&entry.id, "Name".into(), data, None)
            .unwrap();
        assert_ne!(secret_rev(&vault, &entry.id), rev);

        // notes の変更も secret の変更
        let rev = secret_rev(&vault, &entry.id);
        let data = EntryData::new_login(
            Some("https://example.com".into()),
            "user".into(),
            "new-password".into(),
            Some(SecretString::from_string("memo".to_string())),
        );
        vault
            .update_entry(&entry.id, "Name".into(), data, None)
            .unwrap();
        assert_ne!(secret_rev(&vault, &entry.id), rev);
    }

    #[test]
    fn test_secret_field_keys_and_index_contents() {
        let mut vault = make_vault();
        let entry = vault
            .create_entry(
                "Card".into(),
                "credit_card".to_string(),
                EntryData::new_credit_card(
                    "Holder".into(),
                    "4111".into(),
                    "12/30".into(),
                    "123".into(),
                    "0000".into(),
                    None,
                ),
                vec![],
            )
            .unwrap();
        assert_eq!(
            entry.secret_field_keys,
            vec!["cvv".to_string(), "number".to_string(), "pin".to_string()]
        );
        let ve = &vault.index.entries[&entry.id];
        assert_eq!(
            ve.public_fields.keys().collect::<Vec<_>>(),
            vec!["cardholder", "expiry"]
        );
    }

    #[test]
    fn test_every_entry_has_secret_block_even_without_secrets() {
        // 秘匿値を持たないエントリでも secret ブロックを作る（3-3）
        let mut vault = make_vault();
        let entry = vault
            .create_entry(
                "Note".into(),
                "password".to_string(),
                EntryData::new_password("user".into(), String::new(), None),
                vec![],
            )
            .unwrap();
        assert!(vault.secrets.contains_key(&entry.id));
    }

    #[test]
    fn test_corrupted_secret_is_reported_per_entry() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "ok", "Ok", 1000);
        insert_entry(&mut vault, "broken", "Broken", 2000);
        insert_entry(&mut vault, "missing", "Missing", 3000);

        // 他のエントリの secret を持ち込む（入れ替え攻撃）と、AAD の不一致で復号に失敗する
        let other = vault.secrets["ok"].clone();
        vault.secrets.insert("broken".to_string(), other);
        vault.secrets.remove("missing");

        assert!(vault.get_entry("ok").unwrap().is_some());
        assert!(matches!(
            vault.get_entry("broken"),
            Err(VaultError::CorruptedEntry(id)) if id == "broken"
        ));
        assert!(matches!(
            vault.get_entry("missing"),
            Err(VaultError::CorruptedEntry(_))
        ));
        // 一覧は index だけで処理するので影響を受けない
        assert_eq!(vault.list_entry_summaries(&EntryFilter::new()).len(), 3);

        // 破損した暗号文は勝手に消さずに書き戻す
        let file = vault.to_vault_file().unwrap();
        assert!(file.secrets.contains_key("broken"));
    }

    #[test]
    fn test_orphan_secret_is_dropped_on_write() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "E", 1000);
        vault
            .secrets
            .insert("orphan".to_string(), vault.secrets["e1"].clone());
        let file = vault.to_vault_file().unwrap();
        assert!(!file.secrets.contains_key("orphan"));
        assert!(file.secrets.contains_key("e1"));
    }

    #[test]
    fn test_purge_removes_secret_block() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "E", 1000);
        assert!(vault.secrets.contains_key("e1"));
        vault.purge_entry("e1").unwrap();
        assert!(!vault.secrets.contains_key("e1"));
        assert!(vault.to_vault_file().unwrap().secrets.is_empty());
        // purged エントリは tombstone として index に残るが、ID 指定でも見つからない扱いになる
        assert!(vault.get_entry("e1").unwrap().is_none());
    }

    #[test]
    fn test_list_totp_periods_does_not_decrypt_secrets() {
        let mut vault = make_vault();
        let mut data = make_login_data();
        data.custom_fields = Some(vec![CustomField {
            id: "f1".to_string(),
            name: "TOTP".to_string(),
            field_type: "totp".to_string(),
            value: SecretString::from_string(
                "otpauth://totp/x?secret=JBSWY3DPEHPK3PXP&period=60".to_string(),
            ),
            secret: false,
            autofill_selector: None,
        }]);
        let entry = vault
            .create_entry("T".into(), "login".to_string(), data, vec![])
            .unwrap();

        // secret が無くても周期は index から取れる
        let sealed = vault.secrets.remove(&entry.id).unwrap();
        assert_eq!(
            vault.list_totp_periods(std::slice::from_ref(&entry.id)),
            vec![(entry.id.clone(), 60)]
        );
        // コード生成は secret が必要
        assert!(vault.get_totp_code(&entry.id).is_err());
        vault.secrets.insert(entry.id.clone(), sealed);
        assert_eq!(vault.get_totp_code(&entry.id).unwrap().unwrap().len(), 6);
    }

    #[test]
    fn test_secret_custom_url_not_used_for_autofill() {
        let mut vault = make_vault();
        let mut data = make_login_data();
        data.custom_fields = Some(vec![CustomField {
            id: "cf1".to_string(),
            name: "Hidden URL".to_string(),
            field_type: "url".to_string(),
            value: SecretString::from_string("https://hidden.example".to_string()),
            secret: true,
            autofill_selector: None,
        }]);
        vault
            .create_entry("Login".into(), "login".to_string(), data, vec![])
            .unwrap();
        let summaries = vault.list_entry_summaries(&EntryFilter::new());
        assert!(summaries[0].additional_urls.is_empty());
    }

    #[test]
    fn test_custom_field_secret_flag_roundtrip() {
        let mut vault = make_vault();
        let mut data = make_login_data();
        data.custom_fields = Some(vec![
            CustomField {
                id: "a".to_string(),
                name: "PIN".to_string(),
                field_type: "text".to_string(),
                value: SecretString::from_string("1234".to_string()),
                secret: true,
                autofill_selector: None,
            },
            CustomField {
                id: "b".to_string(),
                name: "API".to_string(),
                field_type: "password".to_string(),
                value: SecretString::from_string("key".to_string()),
                // password 型は常に秘匿値として扱われる
                secret: false,
                autofill_selector: None,
            },
        ]);
        let entry = vault
            .create_entry("Login".into(), "login".to_string(), data, vec![])
            .unwrap();
        let fields = entry.data.custom_fields.unwrap();
        assert!(fields[0].secret);
        assert_eq!(fields[0].value.as_str(), "1234");
        assert!(fields[1].secret);
        assert_eq!(fields[1].value.as_str(), "key");
    }

    // ===== State transition guard tests =====

    #[test]
    fn test_update_deleted_entry_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.delete_entry("e1").unwrap();

        let data = make_login_data();
        let result = vault.update_entry("e1", "Updated".into(), data, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_update_purged_entry_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.purge_entry("e1").unwrap();

        let data = make_login_data();
        let result = vault.update_entry("e1", "Updated".into(), data, None);
        assert!(result.is_err());
    }

    #[test]
    fn test_restore_purged_entry_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.purge_entry("e1").unwrap();

        let result = vault.restore_entry("e1");
        assert!(result.is_err());
    }

    #[test]
    fn test_purge_is_idempotent() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.purge_entry("e1").unwrap();

        let first_purged_at = vault.index.entries["e1"].purged_at;

        // Second purge should be a no-op
        vault.purge_entry("e1").unwrap();
        assert_eq!(vault.index.entries["e1"].purged_at, first_purged_at);
    }

    #[test]
    fn test_set_favorite_deleted_entry_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.delete_entry("e1").unwrap();

        let result = vault.set_favorite("e1", true);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_favorite_purged_entry_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.purge_entry("e1").unwrap();

        let result = vault.set_favorite("e1", true);
        assert!(result.is_err());
    }
}
