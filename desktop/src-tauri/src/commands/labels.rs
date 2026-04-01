use serde_json::json;

use super::get_manager;

#[tauri::command]
pub async fn list_labels(vault_id: String) -> Result<Vec<serde_json::Value>, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        let labels = manager.api_list_labels()?;
        Ok(labels
            .into_iter()
            .map(|l| json!({"id": l.id, "name": l.name}))
            .collect())
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn create_label(vault_id: String, name: String) -> Result<serde_json::Value, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        let label_id = manager.api_create_label(name.clone())?;
        Ok(json!({"id": label_id, "name": name}))
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn delete_label(vault_id: String, id: String) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_delete_label(id))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn rename_label(vault_id: String, id: String, new_name: String) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_rename_label(id, new_name))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn set_entry_labels(vault_id: String, entry_id: String, label_ids: Vec<String>) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_set_entry_labels(entry_id, label_ids))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}
