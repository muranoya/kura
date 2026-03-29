use vault_core::api::*;
use serde_json::json;

#[tauri::command]
pub async fn sync_vault(storage_config: String) -> Result<serde_json::Value, String> {
    let result = api_sync(storage_config).await?;
    Ok(json!({
        "synced": result.synced,
        "last_synced_at": result.last_synced_at,
    }))
}

#[tauri::command]
pub async fn push_vault(storage_config: String) -> Result<i64, String> {
    api_push(storage_config).await
}

#[tauri::command]
pub fn get_last_sync_time() -> Option<i64> {
    api_get_last_sync_time()
}

#[tauri::command]
pub async fn download_vault(storage_config: String) -> Result<bool, String> {
    api_download(storage_config).await
}
