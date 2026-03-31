use crate::vault::LockedVault;
use crate::sync::engine::SessionState;

use super::VAULT_SESSION;

/// 新規Vaultを作成し、RecoveryKeyを返す
pub fn api_create_new_vault(master_password: String) -> Result<String, String> {
    let locked_vault = LockedVault::create_new(&master_password)
        .map_err(|e| format!("Failed to create vault: {}", e))?;

    // Get recovery key by unlocking first
    let mut unlocked = locked_vault.unlock(&master_password)
        .map_err(|e| format!("Failed to unlock: {}", e))?;

    // Generate new recovery key
    let recovery_key = unlocked.regenerate_recovery_key(&master_password)
        .map_err(|e| format!("Failed to generate recovery key: {}", e))?;

    let locked_vault = unlocked.lock()
        .map_err(|e| format!("Failed to lock: {}", e))?;

    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());
    *session = Some(SessionState::Locked(locked_vault));

    Ok(recovery_key.to_display_string())
}

/// 既存Vaultをメモリに読み込む
pub fn api_load_vault(vault_bytes: Vec<u8>, etag: String) -> Result<(), String> {
    let locked_vault = LockedVault::open(vault_bytes, Some(etag))
        .map_err(|e| format!("Failed to load vault: {}", e))?;

    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());
    *session = Some(SessionState::Locked(locked_vault));

    Ok(())
}

/// マスターパスワードでアンロック
pub fn api_unlock(master_password: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    let locked = match session.take() {
        Some(SessionState::Locked(v)) => v,
        Some(SessionState::Unlocked(_)) => return Err("Already unlocked".to_string()),
        None => return Err("No vault loaded".to_string()),
    };

    let unlocked = locked.unlock(&master_password)
        .map_err(|e| format!("Failed to unlock: {}", e))?;

    *session = Some(SessionState::Unlocked(unlocked));
    Ok(())
}

/// リカバリーキーでアンロック（新しいマスターパスワード設定フロー）
pub fn api_unlock_with_recovery_key(recovery_key: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    let locked = match session.take() {
        Some(SessionState::Locked(v)) => v,
        Some(SessionState::Unlocked(_)) => return Err("Already unlocked".to_string()),
        None => return Err("No vault loaded".to_string()),
    };

    let recovery_key_str = recovery_key.clone();

    let unlocked = locked.unlock_with_recovery_key(&recovery_key_str)
        .map_err(|e| format!("Failed to unlock with recovery key: {}", e))?;

    *session = Some(SessionState::Unlocked(unlocked));
    Ok(())
}

/// ロック（vault_bytesを返す）
pub fn api_lock() -> Result<Vec<u8>, String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    match session.take() {
        Some(SessionState::Unlocked(unlocked)) => {
            let locked = unlocked.lock()
                .map_err(|e| format!("Failed to lock: {}", e))?;
            let vault_bytes = locked.to_vault_bytes()
                .map_err(|e| format!("Failed to serialize vault: {}", e))?;

            *session = Some(SessionState::Locked(locked));
            Ok(vault_bytes)
        }
        Some(SessionState::Locked(_)) => Err("Already locked".to_string()),
        None => Err("No vault loaded".to_string()),
    }
}
