use super::get_manager;

#[tauri::command]
pub async fn create_vault(vault_id: String, master_password: String) -> Result<String, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_create_new_vault(master_password))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn load_vault(vault_id: String, vault_bytes: Vec<u8>, etag: String) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_load_vault(vault_bytes, etag))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn unlock(vault_id: String, master_password: String) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_unlock(master_password))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn unlock_with_recovery_key(vault_id: String, recovery_key: String) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_unlock_with_recovery_key(recovery_key))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub fn lock(vault_id: String) -> Result<Vec<u8>, String> {
    let manager = get_manager(&vault_id);
    manager.api_lock()
}

#[tauri::command]
pub fn get_vault_bytes(vault_id: String) -> Result<Vec<u8>, String> {
    let manager = get_manager(&vault_id);
    manager.api_get_vault_bytes()
}

#[tauri::command]
pub fn is_unlocked(vault_id: String) -> bool {
    let manager = get_manager(&vault_id);
    manager.api_is_unlocked()
}

#[tauri::command]
pub fn set_tray_icon(app: tauri::AppHandle, is_locked: bool) -> Result<(), String> {
    let tray = app.tray_by_id("main").ok_or("Tray not found")?;
    let icon_bytes: &[u8] = if is_locked {
        include_bytes!("../../icons/locked.png")
    } else {
        include_bytes!("../../icons/unlocked.png")
    };
    let icon = tauri::image::Image::from_bytes(icon_bytes)
        .map_err(|e| format!("Failed to load icon: {}", e))?;
    tray.set_icon(Some(icon))
        .map_err(|e| format!("Failed to set icon: {}", e))?;
    Ok(())
}
