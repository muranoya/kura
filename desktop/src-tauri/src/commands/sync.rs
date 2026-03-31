use vault_core::api::*;
use vault_core::config::S3Config;
use serde_json::json;

use crate::storage::S3Storage;

fn parse_s3_config(storage_config: &str) -> Result<S3Config, String> {
    let mut config_map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(storage_config)
            .map_err(|e| format!("Failed to parse S3 config: {}", e))?;

    if !config_map.contains_key("key") {
        config_map.insert("key".to_string(), serde_json::Value::String("vault.json".to_string()));
    }

    let s3_config: S3Config = serde_json::from_value(serde_json::Value::Object(config_map))
        .map_err(|e| format!("Failed to parse S3 config: {}", e))?;

    s3_config.validate()
        .map_err(|e| format!("Invalid S3 config: {}", e))?;

    Ok(s3_config)
}

#[tauri::command]
pub async fn sync_vault(storage_config: String) -> Result<serde_json::Value, String> {
    let s3_config = parse_s3_config(&storage_config)?;
    let s3_storage = S3Storage::new(s3_config)
        .await
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    let result = api_sync(&s3_storage).await?;
    Ok(json!({
        "synced": result.synced,
        "last_synced_at": result.last_synced_at,
    }))
}

#[tauri::command]
pub async fn push_vault(storage_config: String) -> Result<i64, String> {
    let s3_config = parse_s3_config(&storage_config)?;
    let s3_storage = S3Storage::new(s3_config)
        .await
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    api_push(&s3_storage).await
}

#[tauri::command]
pub fn get_last_sync_time() -> Option<i64> {
    api_get_last_sync_time()
}

#[tauri::command]
pub async fn download_vault(storage_config: String) -> Result<bool, String> {
    let s3_config = parse_s3_config(&storage_config)?;
    let s3_storage = S3Storage::new(s3_config)
        .await
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    api_download(&s3_storage).await
}
