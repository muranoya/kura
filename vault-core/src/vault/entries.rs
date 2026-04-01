use crate::error::{Result, VaultError};
use crate::models::{EntryData, Entry, EntryFilter};
use crate::store::VaultEntry;

use super::UnlockedVault;

impl UnlockedVault {
    /// List entries sorted by created_at descending (newest first)
    pub fn list_entries(&self, filter: &EntryFilter) -> Result<Vec<Entry>> {
        let mut result = Vec::new();
        for (id, vault_entry) in &self.contents.entries {
            if filter.matches(vault_entry) {
                result.push(vault_entry_to_entry(id.clone(), vault_entry)?);
            }
        }
        result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(result)
    }

    /// Get single entry (decrypted)
    pub fn get_entry(&self, id: &str) -> Result<Option<Entry>> {
        match self.contents.entries.get(id) {
            Some(e) => Ok(Some(vault_entry_to_entry(id.to_string(), e)?)),
            None => Ok(None),
        }
    }

    /// Create entry
    pub fn create_entry(
        &mut self,
        name: String,
        entry_type: crate::models::EntryType,
        data: EntryData,
        label_ids: Vec<String>,
    ) -> Result<Entry> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = crate::get_timestamp();

        let vault_entry = VaultEntry {
            entry_type,
            name: name.clone(),
            created_at: now,
            updated_at: now,
            deleted_at: None,
            purged_at: None,
            is_favorite: false,
            label_ids: label_ids.clone(),
            typed_value: zeroize::Zeroizing::new(data.typed_value.to_string()),
            notes: data.notes.clone(),
            custom_fields: data.custom_fields.clone(),
        };

        self.contents.entries.insert(id.clone(), vault_entry.clone());

        Ok(Entry {
            id,
            name,
            entry_type,
            is_favorite: false,
            created_at: now,
            updated_at: now,
            deleted_at: None,
            data,
            labels: label_ids,
        })
    }

    /// Update entry (only active entries can be updated)
    pub fn update_entry(&mut self, id: &str, name: String, data: EntryData) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        if entry.deleted_at.is_some() || entry.purged_at.is_some() {
            return Err(VaultError::EntryNotFound(id.to_string()));
        }

        entry.name = name;
        entry.typed_value = zeroize::Zeroizing::new(data.typed_value.to_string());
        entry.notes = data.notes.clone();
        entry.custom_fields = data.custom_fields.clone();
        entry.updated_at = crate::get_timestamp();

        Ok(())
    }

    /// Delete entry (soft delete to trash)
    pub fn delete_entry(&mut self, id: &str) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;
        let now = crate::get_timestamp();
        entry.deleted_at = Some(now);
        entry.updated_at = now;
        Ok(())
    }

    /// Restore entry from trash (only soft-deleted entries can be restored)
    pub fn restore_entry(&mut self, id: &str) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        if entry.purged_at.is_some() {
            return Err(VaultError::InvalidInput("Cannot restore a purged entry".to_string()));
        }

        entry.deleted_at = None;
        entry.updated_at = crate::get_timestamp();
        Ok(())
    }

    /// Permanently delete entry (converts to tombstone)
    /// Clears sensitive data and marks as purged for sync-safe deletion.
    /// Idempotent: calling on an already-purged entry is a no-op.
    pub fn purge_entry(&mut self, id: &str) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
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

        // Convert to tombstone: clear sensitive data and mark as purged
        entry.purged_at = Some(now);
        entry.updated_at = now;
        entry.name = String::new();
        entry.typed_value = zeroize::Zeroizing::new("{}".to_string());
        entry.notes = None;
        entry.custom_fields = None;
        entry.label_ids.clear();

        Ok(())
    }

    /// Set entry favorite (only active entries)
    pub fn set_favorite(&mut self, id: &str, is_favorite: bool) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        if entry.deleted_at.is_some() || entry.purged_at.is_some() {
            return Err(VaultError::EntryNotFound(id.to_string()));
        }

        entry.is_favorite = is_favorite;
        entry.updated_at = crate::get_timestamp();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::Dek;
    use crate::models::{Argon2Params, EntryType, VaultMeta};
    use crate::store::VaultContents;
    use super::super::UnlockedVault;

    fn make_vault() -> UnlockedVault {
        let dek = Dek::generate();
        let params = Argon2Params::default();
        let kek = crate::crypto::kdf::derive_kek("test", &params).unwrap();
        let meta = VaultMeta::new(
            dek.wrap(&kek).unwrap(),
            dek.wrap(&kek).unwrap(),
            params,
        );
        UnlockedVault {
            meta,
            contents: VaultContents::new(),
            dek,
            etag: None,
        }
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
        vault.contents.entries.insert(id.to_string(), VaultEntry {
            entry_type: EntryType::Login,
            name: name.to_string(),
            created_at,
            updated_at: created_at,
            deleted_at: None,
            purged_at: None,
            is_favorite: false,
            label_ids: vec![],
            typed_value: zeroize::Zeroizing::new(data.typed_value.to_string()),
            notes: None,
            custom_fields: None,
        });
    }

    #[test]
    fn test_create_entry() {
        let mut vault = make_vault();
        let data = make_login_data();
        let entry = vault.create_entry("Test".into(), EntryType::Login, data, vec![]).unwrap();

        assert_eq!(entry.name, "Test");
        assert_eq!(entry.entry_type, EntryType::Login);
        assert!(!entry.is_favorite);
        assert!(entry.deleted_at.is_none());
        assert!(vault.contents.entries.contains_key(&entry.id));
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

    #[test]
    fn test_list_entries_sorted_by_created_at_desc() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "old", "Old", 1000);
        insert_entry(&mut vault, "mid", "Mid", 2000);
        insert_entry(&mut vault, "new", "New", 3000);

        let filter = EntryFilter::new();
        let entries = vault.list_entries(&filter).unwrap();

        assert_eq!(entries.len(), 3);
        assert_eq!(entries[0].id, "new");
        assert_eq!(entries[1].id, "mid");
        assert_eq!(entries[2].id, "old");
    }

    #[test]
    fn test_list_entries_excludes_deleted_by_default() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Active", 1000);
        insert_entry(&mut vault, "e2", "Deleted", 2000);
        vault.contents.entries.get_mut("e2").unwrap().deleted_at = Some(2000);

        let filter = EntryFilter::new();
        let entries = vault.list_entries(&filter).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].id, "e1");

        let filter_with_trash = EntryFilter::new().with_trash(true);
        let entries = vault.list_entries(&filter_with_trash).unwrap();
        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn test_update_entry() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Original", 1000);

        let new_data = EntryData::new_login(
            Some("https://updated.com".into()),
            "newuser".into(),
            "newpass".into(),
            Some("notes".into()),
        );
        vault.update_entry("e1", "Updated".into(), new_data).unwrap();

        let entry = vault.get_entry("e1").unwrap().unwrap();
        assert_eq!(entry.name, "Updated");
        assert_eq!(entry.data.notes, Some("notes".into()));
        assert!(entry.updated_at > entry.created_at);
    }

    #[test]
    fn test_update_nonexistent_entry() {
        let mut vault = make_vault();
        let data = make_login_data();
        let result = vault.update_entry("nonexistent", "Name".into(), data);
        assert!(result.is_err());
    }

    #[test]
    fn test_delete_and_restore_entry() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);

        vault.delete_entry("e1").unwrap();
        let ve = &vault.contents.entries["e1"];
        assert!(ve.deleted_at.is_some());

        vault.restore_entry("e1").unwrap();
        let ve = &vault.contents.entries["e1"];
        assert!(ve.deleted_at.is_none());
    }

    #[test]
    fn test_purge_entry() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Secret", 1000);

        vault.purge_entry("e1").unwrap();

        let ve = &vault.contents.entries["e1"];
        assert!(ve.deleted_at.is_some());
        assert!(ve.purged_at.is_some());
        assert!(ve.name.is_empty());
        assert_eq!(&*ve.typed_value, "{}");
        assert!(ve.notes.is_none());
        assert!(ve.custom_fields.is_none());
        assert!(ve.label_ids.is_empty());
    }

    #[test]
    fn test_purge_nonexistent_entry() {
        let mut vault = make_vault();
        assert!(vault.purge_entry("nonexistent").is_err());
    }

    #[test]
    fn test_set_favorite() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);

        vault.set_favorite("e1", true).unwrap();
        assert!(vault.contents.entries["e1"].is_favorite);

        vault.set_favorite("e1", false).unwrap();
        assert!(!vault.contents.entries["e1"].is_favorite);
    }

    #[test]
    fn test_set_favorite_nonexistent() {
        let mut vault = make_vault();
        assert!(vault.set_favorite("nonexistent", true).is_err());
    }

    #[test]
    fn test_list_entries_filter_by_type() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Login", 1000);

        let note_data = EntryData::new_secure_note("content".into(), None);
        vault.contents.entries.insert("e2".to_string(), VaultEntry {
            entry_type: EntryType::SecureNote,
            name: "Note".to_string(),
            created_at: 2000,
            updated_at: 2000,
            deleted_at: None,
            purged_at: None,
            is_favorite: false,
            label_ids: vec![],
            typed_value: zeroize::Zeroizing::new(note_data.typed_value.to_string()),
            notes: None,
            custom_fields: None,
        });

        let filter = EntryFilter::new().with_type(EntryType::Login);
        let entries = vault.list_entries(&filter).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Login");
    }

    #[test]
    fn test_list_entries_filter_favorites() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Normal", 1000);
        insert_entry(&mut vault, "e2", "Fav", 2000);
        vault.contents.entries.get_mut("e2").unwrap().is_favorite = true;

        let filter = EntryFilter::new().favorites_only();
        let entries = vault.list_entries(&filter).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Fav");
    }

    #[test]
    fn test_list_entries_filter_by_label() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "NoLabel", 1000);
        insert_entry(&mut vault, "e2", "WithLabel", 2000);
        vault.contents.entries.get_mut("e2").unwrap().label_ids = vec!["label1".into()];

        let filter = EntryFilter::new().with_label("label1".into());
        let entries = vault.list_entries(&filter).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "WithLabel");
    }

    #[test]
    fn test_list_entries_search() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "GitHub Login", 1000);
        insert_entry(&mut vault, "e2", "Gmail Login", 2000);
        insert_entry(&mut vault, "e3", "Bank Account", 3000);

        let filter = EntryFilter::new().with_search("github".into());
        let entries = vault.list_entries(&filter).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "GitHub Login");
    }

    // ===== State transition guard tests =====

    #[test]
    fn test_update_deleted_entry_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.delete_entry("e1").unwrap();

        let data = make_login_data();
        let result = vault.update_entry("e1", "Updated".into(), data);
        assert!(result.is_err());
    }

    #[test]
    fn test_update_purged_entry_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Test", 1000);
        vault.purge_entry("e1").unwrap();

        let data = make_login_data();
        let result = vault.update_entry("e1", "Updated".into(), data);
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

        let first_purged_at = vault.contents.entries["e1"].purged_at;

        // Second purge should be a no-op
        vault.purge_entry("e1").unwrap();
        assert_eq!(vault.contents.entries["e1"].purged_at, first_purged_at);
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

/// Helper function to convert VaultEntry to Entry
pub(crate) fn vault_entry_to_entry(id: String, e: &VaultEntry) -> Result<Entry> {
    // Convert typed_value back to EntryData
    // Zeroizing<String> contains JSON that needs to be parsed
    let typed_value: serde_json::Value = serde_json::from_str(e.typed_value.as_ref())
        .map_err(|err| VaultError::InvalidInput(
            format!("Corrupted typed_value for entry {}: {}", id, err)
        ))?;

    let data = EntryData {
        entry_type: e.entry_type,
        typed_value,
        notes: e.notes.clone(),
        custom_fields: e.custom_fields.clone(),
    };

    Ok(Entry {
        id,
        name: e.name.clone(),
        entry_type: e.entry_type,
        is_favorite: e.is_favorite,
        created_at: e.created_at,
        updated_at: e.updated_at,
        deleted_at: e.deleted_at,
        data,
        labels: e.label_ids.clone(),
    })
}
