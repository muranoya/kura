use super::get_manager;

#[tauri::command]
pub async fn import_1pux_preview(
    vault_id: String,
    file_path: String,
) -> Result<serde_json::Value, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        let file_bytes =
            std::fs::read(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;
        let json_str = manager.api_import_1pux_preview(file_bytes)?;
        serde_json::from_str(&json_str).map_err(|e| format!("Parse error: {}", e))
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn import_1pux_execute(
    vault_id: String,
    file_path: String,
    actions_json: String,
) -> Result<serde_json::Value, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        let file_bytes =
            std::fs::read(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;
        let json_str = manager.api_import_1pux_execute(file_bytes, actions_json)?;
        serde_json::from_str(&json_str).map_err(|e| format!("Parse error: {}", e))
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}
