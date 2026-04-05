use serde_json::json;

use super::get_manager;

#[tauri::command]
pub async fn list_entries(
    vault_id: String,
    search_query: Option<String>,
    entry_type: Option<String>,
    label_id: Option<String>,
    include_trash: bool,
    only_favorites: bool,
    sort_field: Option<String>,
    sort_order: Option<String>,
) -> Result<Vec<serde_json::Value>, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        let rows = manager.api_list_entries(
            search_query,
            entry_type,
            label_id,
            include_trash,
            only_favorites,
            sort_field,
            sort_order,
        )?;
        Ok(rows
            .into_iter()
            .map(|r| {
                json!({
                    "id": r.id,
                    "entryType": r.entry_type,
                    "name": r.name,
                    "subtitle": r.subtitle,
                    "isFavorite": r.is_favorite,
                    "createdAt": r.created_at,
                    "updatedAt": r.updated_at,
                    "deletedAt": r.deleted_at,
                })
            })
            .collect())
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn get_entry(vault_id: String, id: String) -> Result<serde_json::Value, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        let entry = manager.api_get_entry(id)?;
        // typed_value は JSON文字列なので、パースしてオブジェクトとして返す
        let typed_value_obj: serde_json::Value =
            serde_json::from_str(&entry.typed_value).unwrap_or_else(|_| json!({}));
        // custom_fields も JSON文字列をパースしてオブジェクトとして返す
        let custom_fields_obj: serde_json::Value = entry
            .custom_fields
            .and_then(|cf: String| serde_json::from_str(&cf).ok())
            .unwrap_or_else(|| json!([]));
        Ok(json!({
            "id": entry.id,
            "entryType": entry.entry_type,
            "name": entry.name,
            "isFavorite": entry.is_favorite,
            "createdAt": entry.created_at,
            "updatedAt": entry.updated_at,
            "deletedAt": entry.deleted_at,
            "notes": entry.notes,
            "typedValue": typed_value_obj,
            "labels": entry.labels,
            "customFields": custom_fields_obj,
        }))
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn create_entry(
    vault_id: String,
    entry_type: String,
    name: String,
    notes: Option<String>,
    typed_value_json: String,
    label_ids: Vec<String>,
    custom_fields: Option<String>,
) -> Result<String, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        manager.api_create_entry(
            entry_type,
            name,
            notes,
            typed_value_json,
            label_ids,
            custom_fields,
        )
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn update_entry(
    vault_id: String,
    id: String,
    name: String,
    typed_value_json: Option<String>,
    notes: Option<String>,
    label_ids: Option<Vec<String>>,
    custom_fields: Option<String>,
) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        manager.api_update_entry(
            id,
            Some(name),
            notes,
            typed_value_json,
            label_ids,
            custom_fields,
        )
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn delete_entry(vault_id: String, id: String) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_delete_entry(id))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn restore_entry(vault_id: String, id: String) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_restore_entry(id))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn purge_entry(vault_id: String, id: String) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_purge_entry(id))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn set_favorite(vault_id: String, id: String, is_favorite: bool) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_set_favorite(id, is_favorite))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}
