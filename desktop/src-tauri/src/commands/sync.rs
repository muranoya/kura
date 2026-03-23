use vault_core::api::*;
use serde_json::json;

#[tauri::command]
pub async fn sync_vault(storage_config: String) -> Result<serde_json::Value, String> {
    let result = api_sync(storage_config).await?;
    Ok(json!({
        "hasConflicts": result.has_conflicts,
        "conflicts": result.conflicts,
    }))
}

#[tauri::command]
pub async fn push_vault(storage_config: String) -> Result<(), String> {
    api_push(storage_config).await
}

#[tauri::command]
pub async fn download_vault(storage_config: String) -> Result<bool, String> {
    api_download(storage_config).await
}

#[tauri::command]
pub async fn resolve_conflict(id: String, resolution: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || api_resolve_conflict(id, resolution))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}
