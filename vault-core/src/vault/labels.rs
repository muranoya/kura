use crate::error::{Result, VaultError};
use crate::models::Label;
use crate::store::LabelValue;

use super::UnlockedVault;

impl UnlockedVault {
    /// List labels
    pub fn list_labels(&self) -> Result<Vec<Label>> {
        let mut result: Vec<Label> = self
            .index
            .labels
            .iter()
            .filter(|(_, label)| label.deleted_at.is_none())
            .map(|(id, label)| Label {
                id: id.clone(),
                name: label.name.clone(),
                created_at: label.created_at,
            })
            .collect();
        result.sort_by_key(|b| std::cmp::Reverse(b.created_at));
        Ok(result)
    }

    /// Create label
    pub fn create_label(&mut self, name: String) -> Result<Label> {
        let id = uuid::Uuid::new_v4().to_string();
        let created_at = crate::get_timestamp();
        self.index.labels.insert(
            id.clone(),
            LabelValue {
                name: name.clone(),
                created_at,
                deleted_at: None,
            },
        );
        Ok(Label {
            id,
            name,
            created_at,
        })
    }

    /// Delete label (converts to tombstone)
    /// Marks label as deleted for sync-safe deletion, removes from entries
    pub fn delete_label(&mut self, id: &str) -> Result<()> {
        let label = self
            .index
            .labels
            .get_mut(id)
            .ok_or_else(|| VaultError::LabelNotFound(id.to_string()))?;

        let now = crate::get_timestamp();
        label.deleted_at = Some(now);

        // Remove label_id from all entries
        for entry in self.index.entries.values_mut() {
            entry.label_ids.retain(|label_id| label_id != id);
        }

        Ok(())
    }

    /// Rename label
    pub fn rename_label(&mut self, id: &str, new_name: String) -> Result<()> {
        let label = self
            .index
            .labels
            .get_mut(id)
            .ok_or_else(|| VaultError::LabelNotFound(id.to_string()))?;
        label.name = new_name;
        Ok(())
    }

    /// すべてのラベル ID が存在し、削除されていないことを確かめる
    pub(crate) fn validate_label_ids(&self, label_ids: &[String]) -> Result<()> {
        match label_ids.iter().find(|lid| !self.is_active_label(lid)) {
            Some(lid) => Err(VaultError::LabelNotFound(lid.to_string())),
            None => Ok(()),
        }
    }

    /// ラベルが存在し、削除されていないか
    pub(crate) fn is_active_label(&self, label_id: &str) -> bool {
        self.index
            .labels
            .get(label_id)
            .is_some_and(|l| l.deleted_at.is_none())
    }
}

#[cfg(test)]
mod tests {
    use crate::crypto::Dek;
    use crate::models::{Argon2Params, VaultMeta};
    use crate::store::VaultEntry;

    fn make_vault() -> super::super::UnlockedVault {
        let dek = Dek::generate();
        let params = Argon2Params::default();
        let password = crate::secret::MasterPassword::from_string("test".to_string());
        let kek = crate::crypto::kdf::derive_kek_from_master_password(&password, &params).unwrap();
        let meta = VaultMeta::new(dek.wrap(&kek).unwrap(), dek.wrap(&kek).unwrap(), params);
        super::super::UnlockedVault::new_empty(meta, dek)
    }

    fn insert_entry(vault: &mut super::super::UnlockedVault, id: &str, name: &str) {
        vault
            .index
            .entries
            .insert(id.to_string(), VaultEntry::new("login", name, 1000));
    }

    #[test]
    fn test_create_label() {
        let mut vault = make_vault();
        let label = vault.create_label("Work".into()).unwrap();
        assert_eq!(label.name, "Work");
        assert!(vault.index.labels.contains_key(&label.id));
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

        let stored = &vault.index.labels[&label.id];
        assert!(stored.deleted_at.is_some());
    }

    #[test]
    fn test_delete_label_removes_from_entries() {
        let mut vault = make_vault();
        let label = vault.create_label("Work".into()).unwrap();
        insert_entry(&mut vault, "e1", "Entry1");
        vault.index.entries.get_mut("e1").unwrap().label_ids = vec![label.id.clone()];

        vault.delete_label(&label.id).unwrap();
        assert!(vault.index.entries["e1"].label_ids.is_empty());
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

        assert_eq!(vault.index.labels[&label.id].name, "New");
    }

    #[test]
    fn test_rename_nonexistent_label_fails() {
        let mut vault = make_vault();
        assert!(vault.rename_label("nonexistent", "Name".into()).is_err());
    }
}
