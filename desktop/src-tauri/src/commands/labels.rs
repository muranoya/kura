use vault_core::api::*;
use serde_json::json;

#[tauri::command]
pub async fn list_labels() -> Result<Vec<serde_json::Value>, String> {
    tokio::task::spawn_blocking(move || {
        let labels = api_list_labels()?;
        Ok(labels
            .into_iter()
            .map(|l| json!({"id": l.id, "name": l.name}))
            .collect())
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn create_label(name: String) -> Result<serde_json::Value, String> {
    tokio::task::spawn_blocking(move || {
        let label_id = api_create_label(name.clone())?;
        Ok(json!({"id": label_id, "name": name}))
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn delete_label(id: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || api_delete_label(id))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn rename_label(id: String, new_name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || api_rename_label(id, new_name))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn set_entry_labels(entry_id: String, label_ids: Vec<String>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || api_set_entry_labels(entry_id, label_ids))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}
