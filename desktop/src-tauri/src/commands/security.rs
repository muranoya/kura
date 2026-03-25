use vault_core::api::*;

#[tauri::command]
pub async fn change_master_password(
    old_password: String,
    new_password: String,
) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        api_change_master_password(old_password, new_password)
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn upgrade_argon2_params(
    password: String,
    iterations: u32,
    memory: u32,
    parallelism: u32,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        api_upgrade_argon2_params(password, iterations, memory, parallelism)
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn rotate_dek(password: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || api_rotate_dek(password))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn regenerate_recovery_key(password: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || api_regenerate_recovery_key(password))
        .await
        .map_err(|e| format!("Task error: {}", e))?
}
