//! WASM向けJavaScript FFI API
//!
//! ブラウザ拡張機能から呼び出し可能な暗号化・エントリ管理API。
//! vault_core::api の薄いラッパーとして、wasm-bindgen による
//! JavaScript バインディングを提供する。
//!
//! 各API関数は第1引数に `vault_id` を取り、複数のvaultを
//! 同時に管理できる。vault_idに対応するVaultManagerが存在しない場合は
//! 自動的に新規作成される。

use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, PoisonError};

use vault_core::api::VaultManager;
use wasm_bindgen::prelude::*;

static MANAGERS: LazyLock<Mutex<HashMap<String, Arc<VaultManager>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn to_js_err(e: String) -> JsValue {
    JsValue::from_str(&e)
}

fn get_manager(vault_id: &str) -> Arc<VaultManager> {
    let mut map = MANAGERS
        .lock()
        .unwrap_or_else(|p: PoisonError<_>| p.into_inner());
    map.entry(vault_id.to_string())
        .or_insert_with(|| Arc::new(VaultManager::new()))
        .clone()
}

fn with_manager<F, R>(vault_id: &str, f: F) -> R
where
    F: FnOnce(&VaultManager) -> R,
{
    let manager = get_manager(vault_id);
    f(&manager)
}

#[wasm_bindgen(start)]
pub fn init_panic_hook() {
    console_error_panic_hook::set_once();
}

// ============================================================================
// インスタンス管理API
// ============================================================================

/// vault_idに対応するVaultManagerを破棄する
#[wasm_bindgen]
pub fn api_destroy_vault(vault_id: String) {
    let mut map = MANAGERS
        .lock()
        .unwrap_or_else(|p: PoisonError<_>| p.into_inner());
    map.remove(&vault_id);
}

// ============================================================================
// セッション管理API
// ============================================================================

#[wasm_bindgen]
pub fn api_create_new_vault(vault_id: String, master_password: String) -> Result<String, JsValue> {
    with_manager(&vault_id, |m| m.api_create_new_vault(master_password)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_load_vault(vault_id: String, vault_bytes: &[u8], etag: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_load_vault(vault_bytes.to_vec(), etag)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_unlock(vault_id: String, master_password: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_unlock(master_password)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_unlock_with_recovery_key(vault_id: String, recovery_key: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_unlock_with_recovery_key(recovery_key)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_lock(vault_id: String) -> Result<Vec<u8>, JsValue> {
    with_manager(&vault_id, |m| m.api_lock()).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_get_vault_bytes(vault_id: String) -> Result<Vec<u8>, JsValue> {
    with_manager(&vault_id, |m| m.api_get_vault_bytes()).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_get_vault_etag(vault_id: String) -> Option<String> {
    with_manager(&vault_id, |m| m.api_get_etag())
}

#[wasm_bindgen]
pub fn api_is_unlocked(vault_id: String) -> bool {
    with_manager(&vault_id, |m| m.api_is_unlocked())
}

// ============================================================================
// 同期API（JS側でS3操作、Rust側はマージのみ）
// ============================================================================

/// リモートvaultをローカルとマージしてセッションを更新
///
/// JS側がS3からダウンロードしたバイト列とETagを受け取り、
/// DEKで復号 → auto_merge → GC → セッション更新を行う。
#[wasm_bindgen]
pub fn api_merge_remote_vault(
    vault_id: String,
    remote_bytes: &[u8],
    remote_etag: String,
) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| {
        m.api_merge_remote_vault(remote_bytes.to_vec(), remote_etag)
    })
    .map_err(to_js_err)
}

/// アップロード成功後にETagを更新
#[wasm_bindgen]
pub fn api_update_etag(vault_id: String, etag: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_update_etag(etag)).map_err(to_js_err)
}

// ============================================================================
// エントリ操作API
// ============================================================================

#[wasm_bindgen]
pub fn api_list_entries(
    vault_id: String,
    search_query: Option<String>,
    entry_type: Option<String>,
    label_id: Option<String>,
    include_trash: bool,
    only_favorites: bool,
    sort_field: Option<String>,
    sort_order: Option<String>,
) -> Result<String, JsValue> {
    let entries = with_manager(&vault_id, |m| {
        m.api_list_entries(
            search_query,
            entry_type,
            label_id,
            include_trash,
            only_favorites,
            sort_field,
            sort_order,
        )
    })
    .map_err(to_js_err)?;

    serde_json::to_string(&entries).map_err(|e| to_js_err(format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn api_get_entry(vault_id: String, id: String) -> Result<String, JsValue> {
    let entry = with_manager(&vault_id, |m| m.api_get_entry(id)).map_err(to_js_err)?;
    serde_json::to_string(&entry).map_err(|e| to_js_err(format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn api_create_entry(
    vault_id: String,
    entry_type: String,
    name: String,
    notes: Option<String>,
    typed_value_json: String,
    label_ids: Vec<String>,
    custom_fields_json: Option<String>,
) -> Result<String, JsValue> {
    with_manager(&vault_id, |m| {
        m.api_create_entry(
            entry_type,
            name,
            notes,
            typed_value_json,
            label_ids,
            custom_fields_json,
        )
    })
    .map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_update_entry(
    vault_id: String,
    id: String,
    name: Option<String>,
    notes: Option<String>,
    typed_value_json: Option<String>,
    label_ids: Option<Vec<String>>,
    custom_fields_json: Option<String>,
) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| {
        m.api_update_entry(
            id,
            name,
            notes,
            typed_value_json,
            label_ids,
            custom_fields_json,
        )
    })
    .map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_delete_entry(vault_id: String, id: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_delete_entry(id)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_restore_entry(vault_id: String, id: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_restore_entry(id)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_purge_entry(vault_id: String, id: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_purge_entry(id)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_set_favorite(vault_id: String, id: String, is_favorite: bool) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_set_favorite(id, is_favorite)).map_err(to_js_err)
}

/// オートフィル候補を返す（全loginエントリのid, name, url, usernameを取��）
#[wasm_bindgen]
pub fn api_list_login_urls(vault_id: String) -> Result<String, JsValue> {
    let candidates = with_manager(&vault_id, |m| m.api_list_login_urls()).map_err(to_js_err)?;
    serde_json::to_string(&candidates).map_err(|e| to_js_err(format!("Serialization error: {}", e)))
}

// ============================================================================
// ラベル操作API
// ============================================================================

#[wasm_bindgen]
pub fn api_list_labels(vault_id: String) -> Result<String, JsValue> {
    let labels = with_manager(&vault_id, |m| m.api_list_labels()).map_err(to_js_err)?;
    serde_json::to_string(&labels).map_err(|e| to_js_err(format!("Serialization error: {}", e)))
}

#[wasm_bindgen]
pub fn api_create_label(vault_id: String, name: String) -> Result<String, JsValue> {
    with_manager(&vault_id, |m| m.api_create_label(name)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_delete_label(vault_id: String, id: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_delete_label(id)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_rename_label(vault_id: String, id: String, new_name: String) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_rename_label(id, new_name)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_set_entry_labels(
    vault_id: String,
    entry_id: String,
    label_ids: Vec<String>,
) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| m.api_set_entry_labels(entry_id, label_ids)).map_err(to_js_err)
}

// ============================================================================
// セキュリティ関連API
// ============================================================================

#[wasm_bindgen]
pub fn api_change_master_password(
    vault_id: String,
    old_password: String,
    new_password: String,
) -> Result<(), JsValue> {
    with_manager(&vault_id, |m| {
        m.api_change_master_password(old_password, new_password)
    })
    .map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_upgrade_argon2_params(
    vault_id: String,
    password: String,
    iterations: u32,
    memory: u32,
    parallelism: u32,
) -> Result<String, JsValue> {
    with_manager(&vault_id, |m| {
        m.api_upgrade_argon2_params(password, iterations, memory, parallelism)
    })
    .map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_rotate_dek(vault_id: String, password: String) -> Result<String, JsValue> {
    with_manager(&vault_id, |m| m.api_rotate_dek(password)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_regenerate_recovery_key(vault_id: String, password: String) -> Result<String, JsValue> {
    with_manager(&vault_id, |m| m.api_regenerate_recovery_key(password)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_encrypt_config(
    vault_id: String,
    password: String,
    plaintext: String,
) -> Result<String, JsValue> {
    with_manager(&vault_id, |m| m.api_encrypt_config(password, plaintext)).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_decrypt_config(
    vault_id: String,
    password: String,
    encrypted_b64: String,
) -> Result<String, JsValue> {
    with_manager(&vault_id, |m| m.api_decrypt_config(password, encrypted_b64)).map_err(to_js_err)
}

// ============================================================================
// ユーティリティAPI
// ============================================================================

#[wasm_bindgen]
pub fn api_generate_password(
    length: i32,
    include_uppercase: bool,
    include_numbers: bool,
    include_symbols: bool,
) -> Result<String, JsValue> {
    vault_core::api::api_generate_password(
        length,
        include_uppercase,
        include_numbers,
        include_symbols,
    )
    .map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_generate_totp(secret: String, digits: u32, period: u32) -> Result<String, JsValue> {
    vault_core::api::api_generate_totp(secret, digits, period).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_generate_totp_default(secret: String) -> Result<String, JsValue> {
    vault_core::api::api_generate_totp_default(secret).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_generate_totp_from_value(value: String) -> Result<String, JsValue> {
    vault_core::api::api_generate_totp_from_value(value).map_err(to_js_err)
}

#[wasm_bindgen]
pub fn api_parse_totp_period(value: String) -> u32 {
    vault_core::api::api_parse_totp_period(value) as u32
}
