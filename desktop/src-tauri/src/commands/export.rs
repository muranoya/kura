use super::get_manager;

#[tauri::command]
pub async fn export_bitwarden_json(vault_id: String) -> Result<String, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_export_bitwarden_json())
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn save_export_file(path: String, content: String) -> Result<(), String> {
    tokio::fs::write(&path, content.as_bytes())
        .await
        .map_err(|e| format!("Failed to write file: {}", e))
}
