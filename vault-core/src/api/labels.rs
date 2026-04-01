use crate::sync::engine::SessionState;

use super::{VaultManager, LabelRow};

impl VaultManager {
    /// ラベル一覧
    pub fn api_list_labels(&self) -> Result<Vec<LabelRow>, String> {
        let session = self.session.lock().unwrap_or_else(|p| p.into_inner());
        let unlocked = match session.as_ref() {
            Some(SessionState::Unlocked(v)) => v,
            _ => return Err("Vault not unlocked".to_string()),
        };

        let labels = unlocked.list_labels()
            .map_err(|e| format!("Failed to list labels: {}", e))?;

        Ok(labels.into_iter().map(|l| LabelRow {
            id: l.id,
            name: l.name,
            created_at: l.created_at,
        }).collect())
    }

    /// ラベル作成
    pub fn api_create_label(&self, name: String) -> Result<String, String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            let label = unlocked.create_label(name)
                .map_err(|e| format!("Failed to create label: {}", e))?;
            Ok(label.id)
        } else {
            Err("Vault not unlocked".to_string())
        }
    }

    /// ラベル削除
    pub fn api_delete_label(&self, id: String) -> Result<(), String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            unlocked.delete_label(&id)
                .map_err(|e| format!("Failed to delete label: {}", e))
        } else {
            Err("Vault not unlocked".to_string())
        }
    }

    /// ラベル名変更
    pub fn api_rename_label(&self, id: String, new_name: String) -> Result<(), String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            unlocked.rename_label(&id, new_name)
                .map_err(|e| format!("Failed to rename label: {}", e))
        } else {
            Err("Vault not unlocked".to_string())
        }
    }

    /// エントリにラベルを紐付け
    pub fn api_set_entry_labels(&self, entry_id: String, label_ids: Vec<String>) -> Result<(), String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            unlocked.set_entry_labels(&entry_id, label_ids)
                .map_err(|e| format!("Failed to set entry labels: {}", e))
        } else {
            Err("Vault not unlocked".to_string())
        }
    }
}
