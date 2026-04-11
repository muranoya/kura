use crate::models::EntryFilter;

use super::UnlockedVault;

impl UnlockedVault {
    /// Export all active entries as Bitwarden JSON string.
    pub fn export_bitwarden_json(&self) -> Result<String, String> {
        let filter = EntryFilter::new();
        let entries = self
            .list_entries(&filter)
            .map_err(|e| format!("Failed to list entries: {}", e))?;
        let labels = self
            .list_labels()
            .map_err(|e| format!("Failed to list labels: {}", e))?;

        crate::export::export_bitwarden_json(&entries, &labels)
    }
}
