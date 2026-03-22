use vault_core::api::*;

#[tauri::command]
pub async fn create_vault(master_password: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || api_create_new_vault(master_password))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn load_vault(vault_bytes: Vec<u8>, etag: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || api_load_vault(vault_bytes, etag))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn unlock(master_password: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || api_unlock(master_password))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn unlock_with_recovery_key(recovery_key: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || api_unlock_with_recovery_key(recovery_key))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub fn lock() -> Result<Vec<u8>, String> {
    api_lock()
}

#[tauri::command]
pub fn get_vault_bytes() -> Result<Vec<u8>, String> {
    api_get_vault_bytes()
}

#[tauri::command]
pub fn is_unlocked() -> bool {
    api_is_unlocked()
}
