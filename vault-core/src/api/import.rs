use crate::sync::engine::SessionState;

use super::VaultManager;

impl VaultManager {
    /// Phase 1: Parse a .1pux file and generate an import preview.
    /// `file_bytes` is the raw ZIP content read by the platform layer.
    pub fn api_import_1pux_preview(
        &self,
        file_bytes: Vec<u8>,
    ) -> Result<String, String> {
        let parsed_items = crate::import::onepux::parse_1pux(&file_bytes)
            .map_err(|e| format!("Failed to parse 1pux file: {}", e))?;

        let session = self.session.lock().unwrap_or_else(|p| p.into_inner());
        let unlocked = match session.as_ref() {
            Some(SessionState::Unlocked(v)) => v,
            _ => return Err("Vault not unlocked".to_string()),
        };

        let preview = crate::import::preview::generate_preview(
            &parsed_items,
            &file_bytes,
            unlocked,
        ).map_err(|e| format!("Failed to generate preview: {}", e))?;

        serde_json::to_string(&preview)
            .map_err(|e| format!("Serialization error: {}", e))
    }

    /// Phase 2: Execute import with user's chosen actions.
    /// `file_bytes` is the same .1pux file (re-parsed to get full data).
    /// `actions_json` is JSON array of ImportItemAction.
    pub fn api_import_1pux_execute(
        &self,
        file_bytes: Vec<u8>,
        actions_json: String,
    ) -> Result<String, String> {
        let actions: Vec<crate::import::ImportItemAction> =
            serde_json::from_str(&actions_json)
                .map_err(|e| format!("Invalid actions JSON: {}", e))?;

        let parsed_items = crate::import::onepux::parse_1pux(&file_bytes)
            .map_err(|e| format!("Failed to parse 1pux file: {}", e))?;

        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            let result = crate::import::execute_import(
                &parsed_items,
                &actions,
                unlocked,
            ).map_err(|e| format!("Import failed: {}", e))?;

            serde_json::to_string(&result)
                .map_err(|e| format!("Serialization error: {}", e))
        } else {
            Err("Vault not unlocked".to_string())
        }
    }
}
