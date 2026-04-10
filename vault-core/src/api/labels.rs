use super::{LabelRow, VaultManager};

impl VaultManager {
    /// ラベル一覧
    pub fn api_list_labels(&self) -> Result<Vec<LabelRow>, String> {
        self.with_unlocked(|unlocked| {
            let labels = unlocked
                .list_labels()
                .map_err(|e| format!("Failed to list labels: {}", e))?;

            Ok(labels
                .into_iter()
                .map(|l| LabelRow {
                    id: l.id,
                    name: l.name,
                    created_at: l.created_at,
                })
                .collect())
        })
    }

    /// ラベル作成
    pub fn api_create_label(&self, name: String) -> Result<String, String> {
        self.with_unlocked_mut(|unlocked| {
            let label = unlocked
                .create_label(name)
                .map_err(|e| format!("Failed to create label: {}", e))?;
            Ok(label.id)
        })
    }

    /// ラベル削除
    pub fn api_delete_label(&self, id: String) -> Result<(), String> {
        self.with_unlocked_mut(|unlocked| {
            unlocked
                .delete_label(&id)
                .map_err(|e| format!("Failed to delete label: {}", e))
        })
    }

    /// ラベル名変更
    pub fn api_rename_label(&self, id: String, new_name: String) -> Result<(), String> {
        self.with_unlocked_mut(|unlocked| {
            unlocked
                .rename_label(&id, new_name)
                .map_err(|e| format!("Failed to rename label: {}", e))
        })
    }

    /// エントリにラベルを紐付け
    pub fn api_set_entry_labels(
        &self,
        entry_id: String,
        label_ids: Vec<String>,
    ) -> Result<(), String> {
        self.with_unlocked_mut(|unlocked| {
            unlocked
                .set_entry_labels(&entry_id, label_ids)
                .map_err(|e| format!("Failed to set entry labels: {}", e))
        })
    }
}
