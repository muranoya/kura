//! WASM向けJavaScript FFI API
//!
//! ブラウザ拡張機能から呼び出し可能な暗号化・エントリ管理API。
//! `api.rs` のモバイル版と同じパターンだが、
//! wasm-bindgen で JavaScript バインディング可能な型のみを使用。

use crate::{
    models::{EntryType, EntryFilter},
    totp::generate_totp_default,
    vault::{LockedVault, UnlockedVault},
    password_gen::{PasswordOptions, generate_password},
};
use once_cell::sync::Lazy;
use serde_json::Value;
use std::sync::Mutex;
use wasm_bindgen::prelude::*;

#[cfg(feature = "storage-s3-wasm")]
#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

/// JavaScript側で受け渡す型は JSON 文字列で受け渡し
/// wasm-bindgen は基本型のみをサポートするため、JSON シリアライゼーションを使用

/// セッション状態
enum SessionState {
    Locked(LockedVault),
    Unlocked(UnlockedVault),
}

/// グローバルセッション管理
static VAULT_SESSION: Lazy<Mutex<Option<SessionState>>> = Lazy::new(|| Mutex::new(None));

// ============================================================================
// セッション管理API
// ============================================================================

/// 新規Vaultを作成し、RecoveryKeyを返す
#[wasm_bindgen]
pub fn api_create_new_vault(master_password: String) -> Result<String, JsValue> {
    let locked_vault = LockedVault::create_new(&master_password)
        .map_err(|e| JsValue::from_str(&format!("Failed to create vault: {}", e)))?;

    // Get recovery key by unlocking first
    let mut unlocked = locked_vault
        .unlock(&master_password)
        .map_err(|e| JsValue::from_str(&format!("Failed to unlock: {}", e)))?;

    // Generate new recovery key
    let recovery_key = unlocked
        .regenerate_recovery_key(&master_password)
        .map_err(|e| JsValue::from_str(&format!("Failed to generate recovery key: {}", e)))?;

    let locked_vault = unlocked
        .lock()
        .map_err(|e| JsValue::from_str(&format!("Failed to lock: {}", e)))?;

    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;
    *session = Some(SessionState::Locked(locked_vault));

    Ok(recovery_key.to_display_string())
}

/// 既存Vaultをメモリに読み込む
#[wasm_bindgen]
pub fn api_load_vault(vault_bytes: &[u8], etag: String) -> Result<(), JsValue> {
    let locked_vault = LockedVault::open(vault_bytes.to_vec(), Some(etag))
        .map_err(|e| JsValue::from_str(&format!("Failed to load vault: {}", e)))?;

    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;
    *session = Some(SessionState::Locked(locked_vault));

    Ok(())
}

/// マスターパスワードでアンロック
#[wasm_bindgen]
pub fn api_unlock(master_password: String) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    let locked = match session.take() {
        Some(SessionState::Locked(v)) => v,
        Some(SessionState::Unlocked(_)) => {
            return Err(JsValue::from_str("Already unlocked"))
        }
        None => return Err(JsValue::from_str("No vault loaded")),
    };

    let unlocked = locked
        .unlock(&master_password)
        .map_err(|e| JsValue::from_str(&format!("Failed to unlock: {}", e)))?;

    *session = Some(SessionState::Unlocked(unlocked));
    Ok(())
}

/// リカバリーキーでアンロック（新しいマスターパスワード設定フロー）
#[wasm_bindgen]
pub fn api_unlock_with_recovery_key(recovery_key: String) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    let locked = match session.take() {
        Some(SessionState::Locked(v)) => v,
        Some(SessionState::Unlocked(_)) => {
            return Err(JsValue::from_str("Already unlocked"))
        }
        None => return Err(JsValue::from_str("No vault loaded")),
    };

    let unlocked = locked
        .unlock_with_recovery_key(&recovery_key)
        .map_err(|e| JsValue::from_str(&format!("Failed to unlock with recovery key: {}", e)))?;

    *session = Some(SessionState::Unlocked(unlocked));
    Ok(())
}

/// ロック（vault_bytesを返す）
#[wasm_bindgen]
pub fn api_lock() -> Result<Vec<u8>, JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    match session.take() {
        Some(SessionState::Unlocked(unlocked)) => {
            let locked = unlocked
                .lock()
                .map_err(|e| JsValue::from_str(&format!("Failed to lock: {}", e)))?;
            let vault_bytes = locked
                .to_vault_bytes()
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize vault: {}", e)))?;

            *session = Some(SessionState::Locked(locked));
            Ok(vault_bytes)
        }
        Some(SessionState::Locked(_)) => Err(JsValue::from_str("Already locked")),
        None => Err(JsValue::from_str("No vault loaded")),
    }
}

/// 現在のvault_bytesを取得
#[wasm_bindgen]
pub fn api_get_vault_bytes() -> Result<Vec<u8>, JsValue> {
    let session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    match session.as_ref() {
        Some(SessionState::Locked(locked)) => locked
            .to_vault_bytes()
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize vault: {}", e))),
        Some(SessionState::Unlocked(unlocked)) => unlocked
            .to_vault_bytes()
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize vault: {}", e))),
        None => Err(JsValue::from_str("No vault loaded")),
    }
}

/// 現在セッションに保持されているETagを取得（ストレージ永続化用）
#[wasm_bindgen]
pub fn api_get_vault_etag() -> Option<String> {
    let session = VAULT_SESSION.lock().ok()?;

    match session.as_ref() {
        Some(SessionState::Locked(locked)) => locked.get_etag().cloned(),
        Some(SessionState::Unlocked(unlocked)) => unlocked.get_etag().cloned(),
        None => None,
    }
}

// ============================================================================
// エントリ操作API
// ============================================================================

/// エントリ一覧（フィルター付き）
/// 戻り値は JSON 文字列（エントリ行の配列）
#[wasm_bindgen]
pub fn api_list_entries(
    search_query: Option<String>,
    entry_type: Option<String>,
    label_id: Option<String>,
    include_trash: bool,
    only_favorites: bool,
) -> Result<String, JsValue> {
    let session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;
    let unlocked = match session.as_ref() {
        Some(SessionState::Unlocked(v)) => v,
        _ => return Err(JsValue::from_str("Vault not unlocked")),
    };

    let mut filter = EntryFilter::new()
        .with_trash(include_trash)
        .with_search(search_query.unwrap_or_default())
        .with_favorites(only_favorites);

    if let Some(t) = entry_type {
        if let Some(entry_type) = EntryType::from_str(&t) {
            filter = filter.with_type(entry_type);
        }
    }

    if let Some(l) = label_id {
        filter = filter.with_label(l);
    }

    let entries = unlocked
        .list_entries(&filter)
        .map_err(|e| JsValue::from_str(&format!("Failed to list entries: {}", e)))?;

    let result: Vec<serde_json::Value> = entries
        .into_iter()
        .map(|entry| {
            serde_json::json!({
                "id": entry.id,
                "entry_type": entry.entry_type.as_str(),
                "name": entry.name,
                "is_favorite": entry.is_favorite,
                "updated_at": entry.updated_at,
                "deleted_at": entry.deleted_at,
            })
        })
        .collect();

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize entries: {}", e)))
}

/// エントリ詳細（復号済み）
/// 戻り値は JSON 文字列
#[wasm_bindgen]
pub fn api_get_entry(id: String) -> Result<String, JsValue> {
    let session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;
    let unlocked = match session.as_ref() {
        Some(SessionState::Unlocked(v)) => v,
        _ => return Err(JsValue::from_str("Vault not unlocked")),
    };

    let entry = unlocked
        .get_entry(&id)
        .map_err(|e| JsValue::from_str(&format!("Failed to get entry: {}", e)))?
        .ok_or_else(|| JsValue::from_str(&format!("Entry not found: {}", id)))?;

    let wasm_entry = serde_json::json!({
        "id": entry.id,
        "entry_type": entry.entry_type.as_str(),
        "name": entry.name,
        "is_favorite": entry.is_favorite,
        "updated_at": entry.updated_at,
        "deleted_at": entry.deleted_at,
        "notes": entry.data.notes,
        "typed_value": serde_json::to_string(&entry.data.typed_value)
            .unwrap_or_else(|_| "{}".to_string()),
        "labels": entry.labels,
        "custom_fields": entry.data.custom_fields,
    });

    serde_json::to_string(&wasm_entry)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize entry: {}", e)))
}

/// エントリ作成
#[wasm_bindgen]
pub fn api_create_entry(
    entry_type: String,
    name: String,
    notes: Option<String>,
    typed_value_json: String,
    label_ids: Vec<String>,
    custom_fields_json: Option<String>,
) -> Result<String, JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    let typed_value: Value = serde_json::from_str(&typed_value_json)
        .map_err(|e| JsValue::from_str(&format!("Invalid typed_value JSON: {}", e)))?;

    let et = EntryType::from_str(&entry_type)
        .ok_or_else(|| JsValue::from_str(&format!("Invalid entry type: {}", entry_type)))?;

    let custom_fields = if let Some(json) = custom_fields_json {
        Some(serde_json::from_str(&json)
            .map_err(|e| JsValue::from_str(&format!("Invalid custom_fields JSON: {}", e)))?)
    } else {
        None
    };

    let data = crate::models::EntryData {
        entry_type: et,
        typed_value,
        notes,
        custom_fields,
    };

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        let entry = unlocked
            .create_entry(name, et, data, label_ids)
            .map_err(|e| JsValue::from_str(&format!("Failed to create entry: {}", e)))?;
        Ok(entry.id)
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// エントリ更新
#[wasm_bindgen]
pub fn api_update_entry(
    id: String,
    name: Option<String>,
    notes: Option<String>,
    typed_value_json: Option<String>,
    label_ids: Option<Vec<String>>,
    custom_fields_json: Option<String>,
) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        // Get current entry to preserve typed_value if not provided
        let current = unlocked
            .get_entry(&id)
            .map_err(|e| JsValue::from_str(&format!("Failed to get entry: {}", e)))?
            .ok_or_else(|| JsValue::from_str(&format!("Entry not found: {}", id)))?;

        let typed_value = if let Some(json) = typed_value_json {
            serde_json::from_str(&json)
                .map_err(|e| JsValue::from_str(&format!("Invalid typed_value JSON: {}", e)))?
        } else {
            current.data.typed_value.clone()
        };

        let custom_fields = if let Some(json) = custom_fields_json {
            Some(serde_json::from_str(&json)
                .map_err(|e| JsValue::from_str(&format!("Invalid custom_fields JSON: {}", e)))?)
        } else {
            current.data.custom_fields.clone()
        };

        let data = crate::models::EntryData {
            entry_type: current.entry_type,
            typed_value,
            notes: notes.or_else(|| current.data.notes.clone()),
            custom_fields,
        };

        unlocked
            .update_entry(&id, name.unwrap_or(current.name), data)
            .map_err(|e| JsValue::from_str(&format!("Failed to update entry: {}", e)))?;

        if let Some(label_ids) = label_ids {
            unlocked
                .set_entry_labels(&id, label_ids)
                .map_err(|e| JsValue::from_str(&format!("Failed to set labels: {}", e)))?;
        }

        Ok(())
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// エントリをゴミ箱へ移動
#[wasm_bindgen]
pub fn api_delete_entry(id: String) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .delete_entry(&id)
            .map_err(|e| JsValue::from_str(&format!("Failed to delete entry: {}", e)))
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// ゴミ箱から復元
#[wasm_bindgen]
pub fn api_restore_entry(id: String) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .restore_entry(&id)
            .map_err(|e| JsValue::from_str(&format!("Failed to restore entry: {}", e)))
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// 完全削除
#[wasm_bindgen]
pub fn api_purge_entry(id: String) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .purge_entry(&id)
            .map_err(|e| JsValue::from_str(&format!("Failed to purge entry: {}", e)))
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// お気に入り設定
#[wasm_bindgen]
pub fn api_set_favorite(id: String, is_favorite: bool) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .set_favorite(&id, is_favorite)
            .map_err(|e| JsValue::from_str(&format!("Failed to set favorite: {}", e)))
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

// ============================================================================
// ラベル操作API
// ============================================================================

/// ラベル一覧
/// 戻り値は JSON 文字列（ラベル配列）
#[wasm_bindgen]
pub fn api_list_labels() -> Result<String, JsValue> {
    let session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;
    let unlocked = match session.as_ref() {
        Some(SessionState::Unlocked(v)) => v,
        _ => return Err(JsValue::from_str("Vault not unlocked")),
    };

    let labels = unlocked
        .list_labels()
        .map_err(|e| JsValue::from_str(&format!("Failed to list labels: {}", e)))?;

    let result: Vec<serde_json::Value> = labels
        .into_iter()
        .map(|l| {
            serde_json::json!({
                "id": l.id,
                "name": l.name,
            })
        })
        .collect();

    serde_json::to_string(&result)
        .map_err(|e| JsValue::from_str(&format!("Failed to serialize labels: {}", e)))
}

/// ラベル作成
#[wasm_bindgen]
pub fn api_create_label(name: String) -> Result<String, JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        let label = unlocked
            .create_label(name)
            .map_err(|e| JsValue::from_str(&format!("Failed to create label: {}", e)))?;
        Ok(label.id)
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// ラベル削除
#[wasm_bindgen]
pub fn api_delete_label(id: String) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .delete_label(&id)
            .map_err(|e| JsValue::from_str(&format!("Failed to delete label: {}", e)))
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// ラベル名変更
#[wasm_bindgen]
pub fn api_rename_label(id: String, new_name: String) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .rename_label(&id, new_name)
            .map_err(|e| JsValue::from_str(&format!("Failed to rename label: {}", e)))
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// エントリにラベルを紐付け
#[wasm_bindgen]
pub fn api_set_entry_labels(entry_id: String, label_ids: Vec<String>) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .set_entry_labels(&entry_id, label_ids)
            .map_err(|e| JsValue::from_str(&format!("Failed to set entry labels: {}", e)))
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

// ============================================================================
// セキュリティ関連API
// ============================================================================

/// マスターパスワード変更
#[wasm_bindgen]
pub fn api_change_master_password(old_password: String, new_password: String) -> Result<(), JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .change_master_password(&old_password, &new_password)
            .map_err(|e| JsValue::from_str(&format!("Failed to change master password: {}", e)))
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// Argon2パラメータアップグレード
#[wasm_bindgen]
pub fn api_upgrade_argon2_params(
    password: String,
    iterations: u32,
    memory: u32,
    parallelism: u32,
) -> Result<String, JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    let new_params = crate::models::Argon2Params {
        salt: crate::codec::base32::encode(&rand::random::<[u8; 16]>()),
        iterations,
        memory,
        parallelism,
    };

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked
            .upgrade_argon2_params(&password, new_params)
            .map_err(|e| JsValue::from_str(&format!("Failed to upgrade argon2 params: {}", e)))
            .map(|recovery_key| recovery_key.to_display_string())
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// DEK ローテーション（新しいリカバリーキーを返す）
#[wasm_bindgen]
pub fn api_rotate_dek(password: String) -> Result<String, JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        let recovery_key = unlocked
            .rotate_dek(&password)
            .map_err(|e| JsValue::from_str(&format!("Failed to rotate DEK: {}", e)))?;
        Ok(recovery_key.to_display_string())
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

/// リカバリーキー再発行
#[wasm_bindgen]
pub fn api_regenerate_recovery_key(password: String) -> Result<String, JsValue> {
    let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        let recovery_key = unlocked
            .regenerate_recovery_key(&password)
            .map_err(|e| JsValue::from_str(&format!("Failed to regenerate recovery key: {}", e)))?;
        Ok(recovery_key.to_display_string())
    } else {
        Err(JsValue::from_str("Vault not unlocked"))
    }
}

// ============================================================================
// ユーティリティAPI
// ============================================================================

/// パスワード生成
#[wasm_bindgen]
pub fn api_generate_password(
    length: i32,
    include_uppercase: bool,
    include_lowercase: bool,
    include_numbers: bool,
    include_symbols: bool,
) -> Result<String, JsValue> {
    let length = length
        .try_into()
        .map_err(|_| JsValue::from_str("Invalid length"))?;

    let options = PasswordOptions {
        length,
        include_uppercase,
        include_lowercase,
        include_numbers,
        include_symbols,
    };

    generate_password(&options)
        .map_err(|e| JsValue::from_str(&format!("Failed to generate password: {}", e)))
}

/// TOTP生成
#[wasm_bindgen]
pub fn api_generate_totp(secret: String, digits: u32, period: u32) -> Result<String, JsValue> {
    crate::totp::generate_totp(&secret, digits, period as u64)
        .map_err(|e| JsValue::from_str(&format!("Failed to generate TOTP: {}", e)))
}

/// TOTP生成（デフォルト）
#[wasm_bindgen]
pub fn api_generate_totp_default(secret: String) -> Result<String, JsValue> {
    generate_totp_default(&secret)
        .map_err(|e| JsValue::from_str(&format!("Failed to generate TOTP: {}", e)))
}

// ============================================================================
// S3 Sync API (WASM版)
// ============================================================================

#[cfg(feature = "storage-s3-wasm")]
use {
    crate::config::S3Config,
};

#[cfg(feature = "storage-s3-wasm")]
fn parse_s3_config(storage_config: &str) -> Result<S3Config, String> {
    let mut map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(storage_config)
            .map_err(|e| format!("Failed to parse S3 config: {}", e))?;

    // Add default key if not present
    if !map.contains_key("key") {
        map.insert(
            "key".to_string(),
            serde_json::Value::String("vault.json".to_string()),
        );
    }

    // Parse into S3Config
    let config: S3Config = serde_json::from_value(serde_json::Value::Object(map))
        .map_err(|e| format!("Failed to parse S3 config: {}", e))?;

    config
        .validate()
        .map_err(|e| format!("Invalid S3 config: {}", e))?;

    Ok(config)
}

/// S3からVaultをダウンロード＆ローカルデータとマージ
#[cfg(feature = "storage-s3-wasm")]
#[wasm_bindgen]
pub fn api_sync(storage_config: String) -> js_sys::Promise {
    wasm_bindgen_futures::future_to_promise(async move {
        do_sync_inner(storage_config)
            .await
            .map(|_| wasm_bindgen::JsValue::TRUE)
            .map_err(|e| wasm_bindgen::JsValue::from_str(&e))
    })
}

#[cfg(feature = "storage-s3-wasm")]
fn unix_now_wasm() -> i64 {
    // Use JavaScript Date.now() which returns milliseconds since epoch
    // Convert to seconds (Unix timestamp)
    (js_sys::Date::now() / 1000.0) as i64
}

#[cfg(feature = "storage-s3-wasm")]
async fn do_sync_inner(storage_config: String) -> Result<i64, String> {
    use crate::store::VaultFile;

    const MAX_RETRIES: usize = 5;
    let sync_time = unix_now_wasm();

    let s3_config = parse_s3_config(&storage_config)?;
    let storage = crate::storage::WasmS3Storage::new(s3_config)
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    for attempt in 0..MAX_RETRIES {
        // リモートをダウンロード
        let remote_option = storage
            .download()
            .await
            .map_err(|e| format!("S3 download failed: {}", e))?;

        // ローカル・リモートデータを処理（一度のロック内で完結）
        let (vault_bytes, new_etag_for_upload) = {
            let mut session = VAULT_SESSION.lock()
                .map_err(|e| format!("Mutex lock failed: {}", e))?;

            let session_state = session.as_mut()
                .ok_or_else(|| "Session not initialized".to_string())?;

            match session_state {
                SessionState::Unlocked(u) => {
                    match remote_option {
                        None => {
                            // リモートに存在しない → ローカル状態をそのままアップロード
                            let vb = u.to_vault_bytes()
                                .map_err(|e| format!("Serialization failed: {}", e))?;
                            let etag = u.get_etag().cloned();
                            (vb, etag)
                        }
                        Some((remote_bytes, remote_etag)) => {
                            // リモート存在 → マージして更新
                            let remote_vault_file = VaultFile::from_bytes(&remote_bytes)
                                .map_err(|e| format!("Remote vault parse failed: {}", e))?;

                            let remote_contents = crate::crypto::encryption::decrypt_vault(
                                &remote_vault_file.encrypted_vault,
                                &u.dek,
                            )
                            .map_err(|e| format!("Decryption failed: {}", e))?;

                            // マージ
                            let merge_result = crate::sync::auto_merge(&u.contents, &remote_contents)
                                .map_err(|e| format!("Merge failed: {}", e))?;

                            // GC
                            let mut merged = crate::store::VaultContents {
                                entries: merge_result.merged_entries,
                                labels: merge_result.merged_labels,
                            };
                            crate::sync::apply_gc_to_contents(&mut merged, sync_time);

                            // セッション更新
                            u.contents = merged;
                            u.set_etag(remote_etag.clone());

                            // シリアライズ
                            let vb = u.to_vault_bytes()
                                .map_err(|e| format!("Serialization failed: {}", e))?;
                            (vb, Some(remote_etag))
                        }
                    }
                }
                _ => return Err("Vault not unlocked".to_string()),
            }
        };

        // アップロード
        match storage
            .upload(&vault_bytes, new_etag_for_upload.as_deref())
            .await
        {
            Ok(new_etag) => {
                // 成功 → ETag を更新
                let mut session = VAULT_SESSION.lock()
                    .map_err(|e| format!("Mutex lock failed: {}", e))?;
                if let Some(SessionState::Unlocked(ref mut u)) = session.as_mut() {
                    u.set_etag(new_etag);
                }
                return Ok(sync_time);
            }
            Err(crate::error::VaultError::ConflictDetected) => {
                // 409 Conflict → リトライ
                if attempt + 1 == MAX_RETRIES {
                    return Err("Sync failed after maximum retries".to_string());
                }
                continue;
            }
            Err(e) => return Err(format!("Upload failed: {}", e)),
        }
    }

    Err("Sync failed after maximum retries".to_string())
}

/// S3へVaultをプッシュ
#[cfg(feature = "storage-s3-wasm")]
#[wasm_bindgen]
pub fn api_push(storage_config: String) -> js_sys::Promise {
    wasm_bindgen_futures::future_to_promise(async move {
        do_push_inner(storage_config)
            .await
            .map(|_| wasm_bindgen::JsValue::TRUE)
            .map_err(|e| wasm_bindgen::JsValue::from_str(&e))
    })
}

#[cfg(feature = "storage-s3-wasm")]
async fn do_push_inner(storage_config: String) -> Result<(), String> {
    let s3_config = parse_s3_config(&storage_config)?;
    let storage = crate::storage::WasmS3Storage::new(s3_config)
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    let (vault_bytes, etag) = {
        let session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;
        match session.as_ref() {
            Some(SessionState::Locked(l)) => (
                l.to_vault_bytes()
                    .map_err(|e| format!("Failed to serialize vault: {}", e))?,
                l.get_etag().cloned(),
            ),
            Some(SessionState::Unlocked(u)) => (
                u.to_vault_bytes()
                    .map_err(|e| format!("Failed to serialize vault: {}", e))?,
                u.get_etag().cloned(),
            ),
            None => return Err("No vault loaded".to_string()),
        }
    };

    let new_etag = storage
        .upload(&vault_bytes, etag.as_deref())
        .await
        .map_err(|e| format!("S3 upload failed: {}", e))?;

    {
        let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;
        match session.as_mut() {
            Some(SessionState::Locked(ref mut l)) => l.set_etag(new_etag),
            Some(SessionState::Unlocked(ref mut u)) => u.set_etag(new_etag),
            None => {}
        }
    }

    Ok(())
}

/// S3からVaultをダウンロードしてセッションにロード
#[cfg(feature = "storage-s3-wasm")]
#[wasm_bindgen]
pub fn api_download(storage_config: String) -> js_sys::Promise {
    wasm_bindgen_futures::future_to_promise(async move {
        do_download_inner(storage_config)
            .await
            .map(|exists| wasm_bindgen::JsValue::from_bool(exists))
            .map_err(|e| wasm_bindgen::JsValue::from_str(&e))
    })
}

#[cfg(feature = "storage-s3-wasm")]
async fn do_download_inner(storage_config: String) -> Result<bool, String> {
    let s3_config = parse_s3_config(&storage_config)?;
    let storage = crate::storage::WasmS3Storage::new(s3_config)
        .map_err(|e| format!("Failed to create S3 storage: {}", e))?;

    match storage
        .download()
        .await
        .map_err(|e| format!("S3 download failed: {}", e))?
    {
        Some((vault_bytes, etag)) => {
            let locked = LockedVault::open(vault_bytes, Some(etag))
                .map_err(|e| format!("Failed to open vault: {}", e))?;
            let mut session = VAULT_SESSION.lock().map_err(|e| format!("Session lock error: {}", e))?;
            *session = Some(SessionState::Locked(locked));
            Ok(true)
        }
        None => Ok(false),
    }
}
