use vault_core::api::parse_s3_config;
use serde_json::json;

use crate::storage::S3Storage;
use super::get_manager;

#[tauri::command]
pub async fn sync_vault(vault_id: String, storage_config: String) -> Result<serde_json::Value, String> {
    let s3_config = parse_s3_config(&storage_config)?;
    let s3_storage = S3Storage::new(s3_config)
        .await
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    let manager = get_manager(&vault_id);
    let result = manager.api_sync(&s3_storage).await?;
    Ok(json!({
        "synced": result.synced,
        "last_synced_at": result.last_synced_at,
    }))
}

#[tauri::command]
pub async fn push_vault(vault_id: String, storage_config: String) -> Result<i64, String> {
    let s3_config = parse_s3_config(&storage_config)?;
    let s3_storage = S3Storage::new(s3_config)
        .await
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    let manager = get_manager(&vault_id);
    manager.api_push(&s3_storage).await
}

#[tauri::command]
pub fn get_last_sync_time(vault_id: String) -> Option<i64> {
    let manager = get_manager(&vault_id);
    manager.api_get_last_sync_time()
}

#[tauri::command]
pub async fn download_vault(vault_id: String, storage_config: String) -> Result<bool, String> {
    let s3_config = parse_s3_config(&storage_config)?;
    let s3_storage = S3Storage::new(s3_config)
        .await
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    let manager = get_manager(&vault_id);
    manager.api_download(&s3_storage).await
}
