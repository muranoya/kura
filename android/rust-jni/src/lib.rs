use jni::objects::{JByteArray, JClass, JString};
use jni::sys::{jboolean, jbyteArray, jint, jlong, jstring, JNI_FALSE, JNI_TRUE};
use jni::JNIEnv;
use std::sync::OnceLock;

use vault_core::api::*;

static TOKIO_RT: OnceLock<tokio::runtime::Runtime> = OnceLock::new();

fn runtime() -> &'static tokio::runtime::Runtime {
    TOKIO_RT.get_or_init(|| {
        tokio::runtime::Builder::new_multi_thread()
            .enable_all()
            .build()
            .expect("Failed to create Tokio runtime")
    })
}

// ============================================================================
// Helper macros
// ============================================================================

/// Get a Rust String from a JString (nullable). Returns None for null.
fn get_optional_string(env: &mut JNIEnv, s: &JString) -> Option<String> {
    if s.is_null() {
        None
    } else {
        Some(
            env.get_string(s)
                .expect("Failed to get string")
                .into(),
        )
    }
}

/// Get a Rust String from a JString (non-null).
fn get_string(env: &mut JNIEnv, s: &JString) -> String {
    env.get_string(s)
        .expect("Failed to get string")
        .into()
}

/// Throw a RuntimeException and return a default value.
fn throw_err<T: Default>(env: &mut JNIEnv, msg: &str) -> T {
    let _ = env.throw_new("java/lang/RuntimeException", msg);
    T::default()
}

/// Convert a byte[] to Vec<u8>.
fn get_byte_array(env: &mut JNIEnv, arr: &JByteArray) -> Vec<u8> {
    env.convert_byte_array(arr).expect("Failed to convert byte array")
}

// ============================================================================
// Session Management
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_createVault(
    mut env: JNIEnv,
    _class: JClass,
    master_password: JString,
) -> jstring {
    let mp = get_string(&mut env, &master_password);
    match api_create_new_vault(mp) {
        Ok(recovery_key) => env.new_string(recovery_key).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_loadVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_bytes: JByteArray,
    etag: JString,
) {
    let bytes = get_byte_array(&mut env, &vault_bytes);
    let etag_str = get_string(&mut env, &etag);
    if let Err(e) = api_load_vault(bytes, etag_str) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_unlock(
    mut env: JNIEnv,
    _class: JClass,
    master_password: JString,
) {
    let mp = get_string(&mut env, &master_password);
    if let Err(e) = api_unlock(mp) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_unlockWithRecoveryKey(
    mut env: JNIEnv,
    _class: JClass,
    recovery_key: JString,
) {
    let rk = get_string(&mut env, &recovery_key);
    if let Err(e) = api_unlock_with_recovery_key(rk) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_lock(
    mut env: JNIEnv,
    _class: JClass,
) -> jbyteArray {
    match api_lock() {
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
) -> jbyteArray {
    match api_get_vault_bytes() {
        Ok(bytes) => env
            .byte_array_from_slice(&bytes)
            .expect("Failed to create byte array")
            .into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_isUnlocked(
    _env: JNIEnv,
    _class: JClass,
) -> jboolean {
    if api_is_unlocked() {
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
    search_query: JString,
    entry_type: JString,
    label_id: JString,
    include_trash: jboolean,
    only_favorites: jboolean,
) -> jstring {
    let sq = get_optional_string(&mut env, &search_query);
    let et = get_optional_string(&mut env, &entry_type);
    let li = get_optional_string(&mut env, &label_id);
    let it = include_trash != JNI_FALSE;
    let of = only_favorites != JNI_FALSE;

    match api_list_entries(sq, et, li, it, of) {
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
    id: JString,
) -> jstring {
    let entry_id = get_string(&mut env, &id);
    match api_get_entry(entry_id) {
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
    entry_type: JString,
    name: JString,
    notes: JString,
    typed_value_json: JString,
    label_ids_json: JString,
    custom_fields_json: JString,
) -> jstring {
    let et = get_string(&mut env, &entry_type);
    let n = get_string(&mut env, &name);
    let no = get_optional_string(&mut env, &notes);
    let tv = get_string(&mut env, &typed_value_json);
    let li_json = get_string(&mut env, &label_ids_json);
    let cf = get_optional_string(&mut env, &custom_fields_json);

    let label_ids: Vec<String> =
        serde_json::from_str(&li_json).unwrap_or_default();

    match api_create_entry(et, n, no, tv, label_ids, cf) {
        Ok(id) => env.new_string(id).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_updateEntry(
    mut env: JNIEnv,
    _class: JClass,
    id: JString,
    name: JString,
    typed_value_json: JString,
    notes: JString,
    label_ids_json: JString,
    custom_fields_json: JString,
) {
    let entry_id = get_string(&mut env, &id);
    let n = Some(get_string(&mut env, &name));
    let tv = get_optional_string(&mut env, &typed_value_json);
    let no = get_optional_string(&mut env, &notes);
    let cf = get_optional_string(&mut env, &custom_fields_json);

    let li: Option<Vec<String>> = get_optional_string(&mut env, &label_ids_json)
        .and_then(|s| serde_json::from_str(&s).ok());

    if let Err(e) = api_update_entry(entry_id, n, no, tv, li, cf) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_deleteEntry(
    mut env: JNIEnv,
    _class: JClass,
    id: JString,
) {
    let entry_id = get_string(&mut env, &id);
    if let Err(e) = api_delete_entry(entry_id) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_restoreEntry(
    mut env: JNIEnv,
    _class: JClass,
    id: JString,
) {
    let entry_id = get_string(&mut env, &id);
    if let Err(e) = api_restore_entry(entry_id) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_purgeEntry(
    mut env: JNIEnv,
    _class: JClass,
    id: JString,
) {
    let entry_id = get_string(&mut env, &id);
    if let Err(e) = api_purge_entry(entry_id) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_setFavorite(
    mut env: JNIEnv,
    _class: JClass,
    id: JString,
    is_favorite: jboolean,
) {
    let entry_id = get_string(&mut env, &id);
    let fav = is_favorite != JNI_FALSE;
    if let Err(e) = api_set_favorite(entry_id, fav) {
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
) -> jstring {
    match api_list_labels() {
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
    name: JString,
) -> jstring {
    let n = get_string(&mut env, &name);
    match api_create_label(n) {
        Ok(id) => env.new_string(id).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_deleteLabel(
    mut env: JNIEnv,
    _class: JClass,
    id: JString,
) {
    let label_id = get_string(&mut env, &id);
    if let Err(e) = api_delete_label(label_id) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_renameLabel(
    mut env: JNIEnv,
    _class: JClass,
    id: JString,
    new_name: JString,
) {
    let label_id = get_string(&mut env, &id);
    let nn = get_string(&mut env, &new_name);
    if let Err(e) = api_rename_label(label_id, nn) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_setEntryLabels(
    mut env: JNIEnv,
    _class: JClass,
    entry_id: JString,
    label_ids_json: JString,
) {
    let eid = get_string(&mut env, &entry_id);
    let li_json = get_string(&mut env, &label_ids_json);
    let label_ids: Vec<String> =
        serde_json::from_str(&li_json).unwrap_or_default();
    if let Err(e) = api_set_entry_labels(eid, label_ids) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

// ============================================================================
// Security Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_changeMasterPassword(
    mut env: JNIEnv,
    _class: JClass,
    old_password: JString,
    new_password: JString,
) {
    let op = get_string(&mut env, &old_password);
    let np = get_string(&mut env, &new_password);
    if let Err(e) = api_change_master_password(op, np) {
        let _ = env.throw_new("java/lang/RuntimeException", &e);
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_rotateDek(
    mut env: JNIEnv,
    _class: JClass,
    password: JString,
) -> jstring {
    let pw = get_string(&mut env, &password);
    match api_rotate_dek(pw) {
        Ok(recovery_key) => env.new_string(recovery_key).unwrap().into_raw(),
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_regenerateRecoveryKey(
    mut env: JNIEnv,
    _class: JClass,
    password: JString,
) -> jstring {
    let pw = get_string(&mut env, &password);
    match api_regenerate_recovery_key(pw) {
        Ok(recovery_key) => env.new_string(recovery_key).unwrap().into_raw(),
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
    uppercase: jboolean,
    lowercase: jboolean,
    numbers: jboolean,
    symbols: jboolean,
) -> jstring {
    match api_generate_password(
        length,
        uppercase != JNI_FALSE,
        lowercase != JNI_FALSE,
        numbers != JNI_FALSE,
        symbols != JNI_FALSE,
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

// ============================================================================
// Sync Operations (async - uses tokio runtime)
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_syncVault(
    mut env: JNIEnv,
    _class: JClass,
    storage_config_json: JString,
) -> jstring {
    let config = get_string(&mut env, &storage_config_json);
    let rt = runtime();
    match rt.block_on(api_sync(config)) {
        Ok(result) => {
            let json = serde_json::to_string(&result).unwrap_or_else(|_| "{}".to_string());
            env.new_string(json).unwrap().into_raw()
        }
        Err(e) => throw_err(&mut env, &e),
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_pushVault(
    mut env: JNIEnv,
    _class: JClass,
    storage_config_json: JString,
) -> jlong {
    let config = get_string(&mut env, &storage_config_json);
    let rt = runtime();
    match rt.block_on(api_push(config)) {
        Ok(ts) => ts,
        Err(e) => {
            let _ = env.throw_new("java/lang/RuntimeException", &e);
            -1
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_downloadVault(
    mut env: JNIEnv,
    _class: JClass,
    storage_config_json: JString,
) -> jboolean {
    let config = get_string(&mut env, &storage_config_json);
    let rt = runtime();
    match rt.block_on(api_download(config)) {
        Ok(exists) => {
            if exists {
                JNI_TRUE
            } else {
                JNI_FALSE
            }
        }
        Err(e) => {
            let _ = env.throw_new("java/lang/RuntimeException", &e);
            JNI_FALSE
        }
    }
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_getLastSyncTime(
    _env: JNIEnv,
    _class: JClass,
) -> jlong {
    api_get_last_sync_time().unwrap_or(-1)
}

#[no_mangle]
pub extern "system" fn Java_com_kura_app_bridge_VaultBridge_restoreLastSyncTime(
    _env: JNIEnv,
    _class: JClass,
    ts: jlong,
) {
    api_restore_last_sync_time(ts);
}
