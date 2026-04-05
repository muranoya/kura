use std::path::PathBuf;
use tauri::Manager;

fn vault_file_path(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("Failed to get app data dir")
        .join("vault.bin")
}

#[tauri::command]
pub async fn read_vault_file(app: tauri::AppHandle) -> Result<Option<Vec<u8>>, String> {
    tokio::task::spawn_blocking(move || {
        let path = vault_file_path(&app);
        if !path.exists() {
            return Ok(None);
        }
        std::fs::read(&path).map(Some).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub async fn write_vault_file(app: tauri::AppHandle, bytes: Vec<u8>) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let path = vault_file_path(&app);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        std::fs::write(&path, bytes).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}

#[tauri::command]
pub fn vault_file_exists(app: tauri::AppHandle) -> bool {
    vault_file_path(&app).exists()
}

#[tauri::command]
pub async fn delete_vault_file(app: tauri::AppHandle) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let path = vault_file_path(&app);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("Task error: {}", e))?
}
