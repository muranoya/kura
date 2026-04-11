use super::VaultManager;

impl VaultManager {
    /// Export all active entries as Bitwarden JSON format.
    /// Returns the JSON string for the client to save to a file.
    pub fn api_export_bitwarden_json(&self) -> Result<String, String> {
        self.with_unlocked(|vault| vault.export_bitwarden_json())
    }
}
