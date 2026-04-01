use super::get_manager;

#[tauri::command]
pub async fn change_master_password(
    vault_id: String,
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        manager.api_change_master_password(old_password, new_password)
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn upgrade_argon2_params(
    vault_id: String,
    password: String,
    iterations: u32,
    memory: u32,
    parallelism: u32,
) -> Result<String, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || {
        manager.api_upgrade_argon2_params(password, iterations, memory, parallelism)
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn rotate_dek(vault_id: String, password: String) -> Result<String, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_rotate_dek(password))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn regenerate_recovery_key(vault_id: String, password: String) -> Result<String, String> {
    let manager = get_manager(&vault_id);
    tokio::task::spawn_blocking(move || manager.api_regenerate_recovery_key(password))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}
