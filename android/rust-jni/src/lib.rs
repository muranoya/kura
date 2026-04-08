use std::collections::HashMap;
use std::sync::{Arc, LazyLock, Mutex, PoisonError};

use jni::objects::{JByteArray, JClass, JString};
use jni::sys::{jboolean, jbyteArray, jint, jlong, jstring, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;

use vault_core::api::*;

static MANAGERS: LazyLock<Mutex<HashMap<String, Arc<VaultManager>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

fn with_manager<F, R>(vault_id: &str, f: F) -> R
where
    F: FnOnce(&VaultManager) -> R,
{
    let mut map = MANAGERS
        .lock()
        .unwrap_or_else(|p: PoisonError<_>| p.into_inner());
    let manager = map
        .entry(vault_id.to_string())
        .or_insert_with(|| Arc::new(VaultManager::new()));
    f(manager)
}

// ============================================================================
// Helper macros
// ============================================================================

/// Get a Rust String from a JString (nullable). Returns None for null.
fn get_optional_string(env: &mut JNIEnv, s: &JString) -> Option<String> {
    if s.is_null() {
        None
    } else {
        Some(env.get_string(s).expect("Failed to get string").into())
    }
}

/// Get a Rust String from a JString (non-null).
fn get_string(env: &mut JNIEnv, s: &JString) -> String {
    env.get_string(s).expect("Failed to get string").into()
}

/// Throw a RuntimeException and return a default value.
fn throw_err<T: Default>(env: &mut JNIEnv, msg: &str) -> T {
    let _ = env.throw_new("java/lang/RuntimeException", msg);
    T::default()
}

/// Convert a byte[] to Vec<u8>.
fn get_byte_array(env: &mut JNIEnv, arr: &JByteArray) -> Vec<u8> {
    env.convert_byte_array(arr)
        .expect("Failed to convert byte array")
}

// ============================================================================
// インスタンス管理
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_destroyVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let mut map = MANAGERS
        .lock()
        .unwrap_or_else(|p: PoisonError<_>| p.into_inner());
    map.remove(&vid);
}

// ============================================================================
// Session Management
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_createVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    master_password: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    let mp = get_string(&mut env, &master_password);
    match with_manager(&vid, |m| m.api_create_new_vault(mp)) {
        Ok(recovery_key) => env.new_string(recovery_key).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_loadVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    vault_bytes: JByteArray,
    etag: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let bytes = get_byte_array(&mut env, &vault_bytes);
    let etag_str = get_string(&mut env, &etag);
    if let Err(e) = with_manager(&vid, |m| m.api_load_vault(bytes, etag_str)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_unlock(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    master_password: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let mp = get_string(&mut env, &master_password);
    if let Err(e) = with_manager(&vid, |m| m.api_unlock(mp)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_unlockWithRecoveryKey(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    recovery_key: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let rk = get_string(&mut env, &recovery_key);
    if let Err(e) = with_manager(&vid, |m| m.api_unlock_with_recovery_key(rk)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_lock(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jbyteArray {
    let vid = get_string(&mut env, &vault_id);
    match with_manager(&vid, |m| m.api_lock()) {
        Ok(bytes) => env
            .byte_array_from_slice(&bytes)
            .expect("Failed to create byte array")
            .into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_getVaultBytes(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jbyteArray {
    let vid = get_string(&mut env, &vault_id);
    match with_manager(&vid, |m| m.api_get_vault_bytes()) {
        Ok(bytes) => env
            .byte_array_from_slice(&bytes)
            .expect("Failed to create byte array")
            .into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_isUnlocked(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jboolean {
    let vid = get_string(&mut env, &vault_id);
    if with_manager(&vid, |m| m.api_is_unlocked()) {
        JNI_TRUE
    } else {
        JNI_FALSE
    }
}

// ============================================================================
// Entry Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_listEntries(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    search_query: JString,
    entry_type: JString,
    label_id: JString,
    include_trash: jboolean,
    only_favorites: jboolean,
    sort_field: JString,
    sort_order: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    let sq = get_optional_string(&mut env, &search_query);
    let et = get_optional_string(&mut env, &entry_type);
    let li = get_optional_string(&mut env, &label_id);
    let it = include_trash != JNI_FALSE;
    let of = only_favorites != JNI_FALSE;
    let sf = get_optional_string(&mut env, &sort_field);
    let so = get_optional_string(&mut env, &sort_order);

    match with_manager(&vid, |m| m.api_list_entries(sq, et, li, it, of, sf, so)) {
        Ok(rows) => {
            let json = serde_json::to_string(&rows).unwrap_or_else(|_| "[]".to_string());
            env.new_string(json).unwrap().into_raw()
        }
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_getEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    let entry_id = get_string(&mut env, &id);
    match with_manager(&vid, |m| m.api_get_entry(entry_id)) {
        Ok(entry) => {
            let json = serde_json::to_string(&entry).unwrap_or_else(|_| "{}".to_string());
            env.new_string(json).unwrap().into_raw()
        }
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_createEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    entry_type: JString,
    name: JString,
    notes: JString,
    typed_value_json: JString,
    label_ids_json: JString,
    custom_fields_json: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    let et = get_string(&mut env, &entry_type);
    let n = get_string(&mut env, &name);
    let no = get_optional_string(&mut env, &notes);
    let tv = get_string(&mut env, &typed_value_json);
    let li_json = get_string(&mut env, &label_ids_json);
    let cf = get_optional_string(&mut env, &custom_fields_json);

    let label_ids: Vec<String> = serde_json::from_str(&li_json).unwrap_or_default();

    match with_manager(&vid, |m| m.api_create_entry(et, n, no, tv, label_ids, cf)) {
        Ok(id) => env.new_string(id).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_updateEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
    name: JString,
    typed_value_json: JString,
    notes: JString,
    label_ids_json: JString,
    custom_fields_json: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let entry_id = get_string(&mut env, &id);
    let n = Some(get_string(&mut env, &name));
    let tv = get_optional_string(&mut env, &typed_value_json);
    let no = get_optional_string(&mut env, &notes);
    let cf = get_optional_string(&mut env, &custom_fields_json);

    let li: Option<Vec<String>> =
        get_optional_string(&mut env, &label_ids_json).and_then(|s| serde_json::from_str(&s).ok());

    if let Err(e) = with_manager(&vid, |m| m.api_update_entry(entry_id, n, no, tv, li, cf)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_deleteEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let entry_id = get_string(&mut env, &id);
    if let Err(e) = with_manager(&vid, |m| m.api_delete_entry(entry_id)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_restoreEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let entry_id = get_string(&mut env, &id);
    if let Err(e) = with_manager(&vid, |m| m.api_restore_entry(entry_id)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_purgeEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let entry_id = get_string(&mut env, &id);
    if let Err(e) = with_manager(&vid, |m| m.api_purge_entry(entry_id)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_setFavorite(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
    is_favorite: jboolean,
) {
    let vid = get_string(&mut env, &vault_id);
    let entry_id = get_string(&mut env, &id);
    let fav = is_favorite != JNI_FALSE;
    if let Err(e) = with_manager(&vid, |m| m.api_set_favorite(entry_id, fav)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

// ============================================================================
// Label Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_listLabels(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    match with_manager(&vid, |m| m.api_list_labels()) {
        Ok(labels) => {
            let json = serde_json::to_string(&labels).unwrap_or_else(|_| "[]".to_string());
            env.new_string(json).unwrap().into_raw()
        }
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_createLabel(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    name: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    let n = get_string(&mut env, &name);
    match with_manager(&vid, |m| m.api_create_label(n)) {
        Ok(id) => env.new_string(id).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_deleteLabel(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let label_id = get_string(&mut env, &id);
    if let Err(e) = with_manager(&vid, |m| m.api_delete_label(label_id)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_renameLabel(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
    new_name: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let label_id = get_string(&mut env, &id);
    let nn = get_string(&mut env, &new_name);
    if let Err(e) = with_manager(&vid, |m| m.api_rename_label(label_id, nn)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_setEntryLabels(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    entry_id: JString,
    label_ids_json: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let eid = get_string(&mut env, &entry_id);
    let li_json = get_string(&mut env, &label_ids_json);
    let label_ids: Vec<String> = serde_json::from_str(&li_json).unwrap_or_default();
    if let Err(e) = with_manager(&vid, |m| m.api_set_entry_labels(eid, label_ids)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

// ============================================================================
// Security Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_verifyPassword(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    password: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let pw = get_string(&mut env, &password);
    if let Err(e) = with_manager(&vid, |m| m.api_verify_password(pw)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_changeMasterPassword(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    old_password: JString,
    new_password: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let op = get_string(&mut env, &old_password);
    let np = get_string(&mut env, &new_password);
    if let Err(e) = with_manager(&vid, |m| m.api_change_master_password(op, np)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_rotateDek(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    password: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    let pw = get_string(&mut env, &password);
    match with_manager(&vid, |m| m.api_rotate_dek(pw)) {
        Ok(recovery_key) => env.new_string(recovery_key).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_regenerateRecoveryKey(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    password: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    let pw = get_string(&mut env, &password);
    match with_manager(&vid, |m| m.api_regenerate_recovery_key(pw)) {
        Ok(recovery_key) => env.new_string(recovery_key).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

// ============================================================================
// Transfer Config (VaultManager不要)
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_encryptTransferConfig(
    mut env: JNIEnv,
    _class: JClass,
    password: JString,
    config_json: JString,
) -> jstring {
    let pw = get_string(&mut env, &password);
    let cj = get_string(&mut env, &config_json);
    match api_encrypt_transfer_config(pw, cj) {
        Ok(result) => env.new_string(result).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_decryptTransferConfig(
    mut env: JNIEnv,
    _class: JClass,
    password: JString,
    transfer_string: JString,
) -> jstring {
    let pw = get_string(&mut env, &password);
    let ts = get_string(&mut env, &transfer_string);
    match api_decrypt_transfer_config(pw, ts) {
        Ok(result) => env.new_string(result).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

// ============================================================================
// Utility Functions
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_generatePassword(
    mut env: JNIEnv,
    _class: JClass,
    length: jint,
    lowercase: jboolean,
    uppercase: jboolean,
    numbers: jboolean,
    symbols1: jboolean,
    symbols2: jboolean,
    symbols3: jboolean,
) -> jstring {
    match api_generate_password(
        length,
        lowercase != JNI_FALSE,
        uppercase != JNI_FALSE,
        numbers != JNI_FALSE,
        symbols1 != JNI_FALSE,
        symbols2 != JNI_FALSE,
        symbols3 != JNI_FALSE,
    ) {
        Ok(pw) => env.new_string(pw).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_generateTotp(
    mut env: JNIEnv,
    _class: JClass,
    secret: JString,
    digits: jint,
    period: jint,
) -> jstring {
    let s = get_string(&mut env, &secret);
    match api_generate_totp(s, digits as u32, period as u32) {
        Ok(code) => env.new_string(code).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_generateTotpDefault(
    mut env: JNIEnv,
    _class: JClass,
    secret: JString,
) -> jstring {
    let s = get_string(&mut env, &secret);
    match api_generate_totp_default(s) {
        Ok(code) => env.new_string(code).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_generateTotpFromValue(
    mut env: JNIEnv,
    _class: JClass,
    value: JString,
) -> jstring {
    let v = get_string(&mut env, &value);
    match api_generate_totp_from_value(v) {
        Ok(code) => env.new_string(code).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_parseTotpPeriod(
    mut env: JNIEnv,
    _class: JClass,
    value: JString,
) -> jlong {
    let v = get_string(&mut env, &value);
    api_parse_totp_period(v) as jlong
}

// ============================================================================
// Version
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_getVersion(
    mut env: JNIEnv,
    _class: JClass,
) -> jstring {
    let version = api_get_version();
    env.new_string(version).unwrap().into_raw()
}

// ============================================================================
// Sync Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_mergeRemoteVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    remote_bytes: JByteArray,
    remote_etag: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let bytes = get_byte_array(&mut env, &remote_bytes);
    let etag = get_string(&mut env, &remote_etag);
    if let Err(e) = with_manager(&vid, |m| m.api_merge_remote_vault(bytes, etag)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_updateEtag(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    etag: JString,
) {
    let vid = get_string(&mut env, &vault_id);
    let etag_str = get_string(&mut env, &etag);
    if let Err(e) = with_manager(&vid, |m| m.api_update_etag(etag_str)) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_getEtag(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jstring {
    let vid = get_string(&mut env, &vault_id);
    match with_manager(&vid, |m| m.api_get_etag()) {
        Some(etag) => env.new_string(etag).unwrap().into_raw(),
        None => std::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_getLastSyncTime(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jlong {
    let vid = get_string(&mut env, &vault_id);
    with_manager(&vid, |m| m.api_get_last_sync_time()).unwrap_or(-1)
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_restoreLastSyncTime(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    ts: jlong,
) {
    let vid = get_string(&mut env, &vault_id);
    with_manager(&vid, |m| m.api_restore_last_sync_time(ts));
}
