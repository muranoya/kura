//! WASM向けJavaScript FFI API
//!
//! ブラウザ拡張機能から呼び出し可能な暗号化・エントリ管理API。
//! vault_core::api の薄いラッパーとして、wasm-bindgen による
//! JavaScript バインディングを提供する。

mod storage;

use storage::WasmS3Storage;
use wasm_bindgen::prelude::*;

fn to_js_err(e: String) -> JsValue {
    JsValue::from_str(&e)
}

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

// ============================================================================
// セッション管理API
// ============================================================================

#[wasm_bindgen]
pub fn api_create_new_vault(master_password: String) -> Result<String, JsValue> {
    vault_core::api::api_create_new_vault(master_password).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_load_vault(vault_bytes: &[u8], etag: String) -> Result<(), JsValue> {
    vault_core::api::api_load_vault(vault_bytes.to_vec(), etag).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_unlock(master_password: String) -> Result<(), JsValue> {
    vault_core::api::api_unlock(master_password).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_unlock_with_recovery_key(recovery_key: String) -> Result<(), JsValue> {
    vault_core::api::api_unlock_with_recovery_key(recovery_key).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_lock() -> Result<Vec<u8>, JsValue> {
    vault_core::api::api_lock().map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_get_vault_bytes() -> Result<Vec<u8>, JsValue> {
    vault_core::api::api_get_vault_bytes().map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_get_vault_etag() -> Option<String> {
    vault_core::api::api_get_etag()
}

#[wasm_bindgen]
pub fn api_is_unlocked() -> bool {
    vault_core::api::api_is_unlocked()
}

// ============================================================================
// エントリ操作API
// ============================================================================

#[wasm_bindgen]
pub fn api_list_entries(
    search_query: Option<String>,
    entry_type: Option<String>,
    label_id: Option<String>,
    include_trash: bool,
    only_favorites: bool,
) -> Result<String, JsValue> {
    let entries = vault_core::api::api_list_entries(
        search_query, entry_type, label_id, include_trash, only_favorites,
    ).map_err(to_js_err)?;

    serde_json::to_string(&entries).map_err(|e| to_js_err(format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn api_get_entry(id: String) -> Result<String, JsValue> {
    let entry = vault_core::api::api_get_entry(id).map_err(to_js_err)?;
    serde_json::to_string(&entry).map_err(|e| to_js_err(format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn api_create_entry(
    entry_type: String,
    name: String,
    notes: Option<String>,
    typed_value_json: String,
    label_ids: Vec<String>,
    custom_fields_json: Option<String>,
) -> Result<String, JsValue> {
    vault_core::api::api_create_entry(
        entry_type, name, notes, typed_value_json, label_ids, custom_fields_json,
    ).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_update_entry(
    id: String,
    name: Option<String>,
    notes: Option<String>,
    typed_value_json: Option<String>,
    label_ids: Option<Vec<String>>,
    custom_fields_json: Option<String>,
) -> Result<(), JsValue> {
    vault_core::api::api_update_entry(
        id, name, notes, typed_value_json, label_ids, custom_fields_json,
    ).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_delete_entry(id: String) -> Result<(), JsValue> {
    vault_core::api::api_delete_entry(id).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_restore_entry(id: String) -> Result<(), JsValue> {
    vault_core::api::api_restore_entry(id).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_purge_entry(id: String) -> Result<(), JsValue> {
    vault_core::api::api_purge_entry(id).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_set_favorite(id: String, is_favorite: bool) -> Result<(), JsValue> {
    vault_core::api::api_set_favorite(id, is_favorite).map_err(to_js_err)
}

// ============================================================================
// ラベル操作API
// ============================================================================

#[wasm_bindgen]
pub fn api_list_labels() -> Result<String, JsValue> {
    let labels = vault_core::api::api_list_labels().map_err(to_js_err)?;
    serde_json::to_string(&labels).map_err(|e| to_js_err(format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn api_create_label(name: String) -> Result<String, JsValue> {
    vault_core::api::api_create_label(name).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_delete_label(id: String) -> Result<(), JsValue> {
    vault_core::api::api_delete_label(id).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_rename_label(id: String, new_name: String) -> Result<(), JsValue> {
    vault_core::api::api_rename_label(id, new_name).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_set_entry_labels(entry_id: String, label_ids: Vec<String>) -> Result<(), JsValue> {
    vault_core::api::api_set_entry_labels(entry_id, label_ids).map_err(to_js_err)
}

// ============================================================================
// セキュリティ関連API
// ============================================================================

#[wasm_bindgen]
pub fn api_change_master_password(old_password: String, new_password: String) -> Result<(), JsValue> {
    vault_core::api::api_change_master_password(old_password, new_password).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_upgrade_argon2_params(
    password: String,
    iterations: u32,
    memory: u32,
    parallelism: u32,
) -> Result<String, JsValue> {
    vault_core::api::api_upgrade_argon2_params(password, iterations, memory, parallelism)
        .map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_rotate_dek(password: String) -> Result<String, JsValue> {
    vault_core::api::api_rotate_dek(password).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_regenerate_recovery_key(password: String) -> Result<String, JsValue> {
    vault_core::api::api_regenerate_recovery_key(password).map_err(to_js_err)
}

// ============================================================================
// ユーティリティAPI
// ============================================================================

#[wasm_bindgen]
pub fn api_generate_password(
    length: i32,
    include_uppercase: bool,
    include_lowercase: bool,
    include_numbers: bool,
    include_symbols: bool,
) -> Result<String, JsValue> {
    vault_core::api::api_generate_password(
        length, include_uppercase, include_lowercase, include_numbers, include_symbols,
    ).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_generate_totp(secret: String, digits: u32, period: u32) -> Result<String, JsValue> {
    vault_core::api::api_generate_totp(secret, digits, period).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_generate_totp_default(secret: String) -> Result<String, JsValue> {
    vault_core::api::api_generate_totp_default(secret).map_err(to_js_err)
}

// ============================================================================
// S3 Sync API
// ============================================================================

#[wasm_bindgen]
pub fn api_sync(storage_config: String) -> js_sys::Promise {
    wasm_bindgen_futures::future_to_promise(async move {
        let s3_config = vault_core::api::parse_s3_config(&storage_config)
            .map_err(to_js_err)?;
        let storage = WasmS3Storage::new(s3_config)
            .map_err(|e| to_js_err(format!("{}", e)))?;

        vault_core::api::api_sync(&storage).await
            .map(|_| JsValue::TRUE)
            .map_err(to_js_err)
    })
}

#[wasm_bindgen]
pub fn api_push(storage_config: String) -> js_sys::Promise {
    wasm_bindgen_futures::future_to_promise(async move {
        let s3_config = vault_core::api::parse_s3_config(&storage_config)
            .map_err(to_js_err)?;
        let storage = WasmS3Storage::new(s3_config)
            .map_err(|e| to_js_err(format!("{}", e)))?;

        vault_core::api::api_push(&storage).await
            .map(|_| JsValue::TRUE)
            .map_err(to_js_err)
    })
}

#[wasm_bindgen]
pub fn api_download(storage_config: String) -> js_sys::Promise {
    wasm_bindgen_futures::future_to_promise(async move {
        let s3_config = vault_core::api::parse_s3_config(&storage_config)
            .map_err(to_js_err)?;
        let storage = WasmS3Storage::new(s3_config)
            .map_err(|e| to_js_err(format!("{}", e)))?;

        vault_core::api::api_download(&storage).await
            .map(|exists| JsValue::from_bool(exists))
            .map_err(to_js_err)
    })
}
