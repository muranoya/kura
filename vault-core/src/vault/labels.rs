use crate::error::{Result, VaultError};
use crate::models::Label;
use crate::store::LabelValue;

use super::UnlockedVault;

impl UnlockedVault {
    /// List labels
    pub fn list_labels(&self) -> Result<Vec<Label>> {
        let mut result: Vec<Label> = self.contents.labels.iter()
            .filter(|(_, label)| label.deleted_at.is_none())
            .map(|(id, label)| Label {
                id: id.clone(),
                name: label.name.clone(),
                created_at: label.created_at,
            })
            .collect();
        result.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        Ok(result)
    }

    /// Create label
    pub fn create_label(&mut self, name: String) -> Result<Label> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = crate::get_timestamp();
        self.contents.labels.insert(id.clone(), LabelValue {
            name: name.clone(),
            created_at,
            deleted_at: None,
        });
        Ok(Label { id, name, created_at })
    }

    /// Delete label (converts to tombstone)
    /// Marks label as deleted for sync-safe deletion, removes from entries
    pub fn delete_label(&mut self, id: &str) -> Result<()> {
        let label = self.contents.labels.get_mut(id)
            .ok_or_else(|| VaultError::LabelNotFound(id.to_string()))?;

        let now = crate::get_timestamp();
        label.deleted_at = Some(now);

        // Remove label_id from all entries
        for entry in self.contents.entries.values_mut() {
            entry.label_ids.retain(|label_id| label_id != id);
        }

        Ok(())
    }

    /// Rename label
    pub fn rename_label(&mut self, id: &str, new_name: String) -> Result<()> {
        let label = self.contents.labels.get_mut(id)
            .ok_or_else(|| VaultError::LabelNotFound(id.to_string()))?;
        label.name = new_name;
        Ok(())
    }

    /// Set entry labels (only active entries, all label IDs must exist)
    pub fn set_entry_labels(&mut self, entry_id: &str, label_ids: Vec<String>) -> Result<()> {
        // Validate all label IDs exist and are not deleted
        for lid in &label_ids {
            match self.contents.labels.get(lid) {
                None => return Err(VaultError::LabelNotFound(lid.to_string())),
                Some(l) if l.deleted_at.is_some() => return Err(VaultError::LabelNotFound(lid.to_string())),
                _ => {}
            }
        }

        let entry = self.contents.entries.get_mut(entry_id)
            .ok_or_else(|| VaultError::EntryNotFound(entry_id.to_string()))?;

        if entry.deleted_at.is_some() || entry.purged_at.is_some() {
            return Err(VaultError::EntryNotFound(entry_id.to_string()));
        }

        entry.label_ids = label_ids;
        entry.updated_at = crate::get_timestamp();
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use crate::crypto::Dek;
    use crate::models::{Argon2Params, EntryType, VaultMeta};
    use crate::store::{VaultContents, VaultEntry};

    fn make_vault() -> super::super::UnlockedVault {
        let dek = Dek::generate();
        let params = Argon2Params::default();
        let kek = crate::crypto::kdf::derive_kek("test", &params).unwrap();
        let meta = VaultMeta::new(
            dek.wrap(&kek).unwrap(),
            dek.wrap(&kek).unwrap(),
            params,
        );
        super::super::UnlockedVault {
            meta,
            contents: VaultContents::new(),
            dek,
            etag: None,
        }
    }

    fn insert_entry(vault: &mut super::super::UnlockedVault, id: &str, name: &str) {
        vault.contents.entries.insert(id.to_string(), VaultEntry {
            entry_type: EntryType::Login,
            name: name.to_string(),
            created_at: 1000,
            updated_at: 1000,
            deleted_at: None,
            purged_at: None,
            is_favorite: false,
            label_ids: vec![],
            typed_value: zeroize::Zeroizing::new("{}".to_string()),
            notes: None,
            custom_fields: None,
        });
    }

    #[test]
    fn test_create_label() {
        let mut vault = make_vault();
        let label = vault.create_label("Work".into()).unwrap();
        assert_eq!(label.name, "Work");
        assert!(vault.contents.labels.contains_key(&label.id));
    }

    #[test]
    fn test_list_labels_excludes_deleted() {
        let mut vault = make_vault();
        let l1 = vault.create_label("Active".into()).unwrap();
        let l2 = vault.create_label("ToDelete".into()).unwrap();
        vault.delete_label(&l2.id).unwrap();

        let labels = vault.list_labels().unwrap();
        assert_eq!(labels.len(), 1);
        assert_eq!(labels[0].id, l1.id);
    }

    #[test]
    fn test_delete_label_sets_deleted_at() {
        let mut vault = make_vault();
        let label = vault.create_label("Work".into()).unwrap();
        vault.delete_label(&label.id).unwrap();

        let stored = &vault.contents.labels[&label.id];
        assert!(stored.deleted_at.is_some());
    }

    #[test]
    fn test_delete_label_removes_from_entries() {
        let mut vault = make_vault();
        let label = vault.create_label("Work".into()).unwrap();
        insert_entry(&mut vault, "e1", "Entry1");
        vault.contents.entries.get_mut("e1").unwrap().label_ids = vec![label.id.clone()];

        vault.delete_label(&label.id).unwrap();
        assert!(vault.contents.entries["e1"].label_ids.is_empty());
    }

    #[test]
    fn test_delete_nonexistent_label_fails() {
        let mut vault = make_vault();
        assert!(vault.delete_label("nonexistent").is_err());
    }

    #[test]
    fn test_rename_label() {
        let mut vault = make_vault();
        let label = vault.create_label("Old".into()).unwrap();
        vault.rename_label(&label.id, "New".into()).unwrap();

        assert_eq!(vault.contents.labels[&label.id].name, "New");
    }

    #[test]
    fn test_rename_nonexistent_label_fails() {
        let mut vault = make_vault();
        assert!(vault.rename_label("nonexistent", "Name".into()).is_err());
    }

    #[test]
    fn test_set_entry_labels() {
        let mut vault = make_vault();
        let l1 = vault.create_label("Work".into()).unwrap();
        let l2 = vault.create_label("Personal".into()).unwrap();
        insert_entry(&mut vault, "e1", "Entry1");

        vault.set_entry_labels("e1", vec![l1.id.clone(), l2.id.clone()]).unwrap();
        assert_eq!(vault.contents.entries["e1"].label_ids.len(), 2);
    }

    #[test]
    fn test_set_entry_labels_nonexistent_label_fails() {
        let mut vault = make_vault();
        insert_entry(&mut vault, "e1", "Entry1");

        let result = vault.set_entry_labels("e1", vec!["nonexistent".into()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_entry_labels_deleted_label_fails() {
        let mut vault = make_vault();
        let label = vault.create_label("Work".into()).unwrap();
        insert_entry(&mut vault, "e1", "Entry1");
        vault.delete_label(&label.id).unwrap();

        let result = vault.set_entry_labels("e1", vec![label.id.clone()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_entry_labels_deleted_entry_fails() {
        let mut vault = make_vault();
        let label = vault.create_label("Work".into()).unwrap();
        insert_entry(&mut vault, "e1", "Entry1");
        vault.contents.entries.get_mut("e1").unwrap().deleted_at = Some(2000);

        let result = vault.set_entry_labels("e1", vec![label.id.clone()]);
        assert!(result.is_err());
    }

    #[test]
    fn test_set_entry_labels_nonexistent_entry_fails() {
        let mut vault = make_vault();
        let result = vault.set_entry_labels("nonexistent", vec![]);
        assert!(result.is_err());
    }
}
