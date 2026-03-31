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

    /// Set entry labels
    pub fn set_entry_labels(&mut self, entry_id: &str, label_ids: Vec<String>) -> Result<()> {
        let entry = self.contents.entries.get_mut(entry_id)
            .ok_or_else(|| VaultError::EntryNotFound(entry_id.to_string()))?;
        entry.label_ids = label_ids;
        entry.updated_at = crate::get_timestamp();
        Ok(())
    }
}
