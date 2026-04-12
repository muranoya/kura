use std::collections::HashMap;
use std::panic;
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
// Helpers
// ============================================================================

fn get_optional_string(env: &mut JNIEnv, s: &JString) -> Result<Option<String>, String> {
    if s.is_null() {
        Ok(None)
    } else {
        env.get_string(s)
            .map(|js| Some(js.into()))
            .map_err(|e| format!("Failed to get string: {}", e))
    }
}

fn get_string(env: &mut JNIEnv, s: &JString) -> Result<String, String> {
    env.get_string(s)
        .map(|js| js.into())
        .map_err(|e| format!("Failed to get string: {}", e))
}

fn throw_err<T: Default>(env: &mut JNIEnv, msg: &str) -> T {
    let _ = env.throw_new("java/lang/RuntimeException", msg);
    T::default()
}

fn get_byte_array(env: &mut JNIEnv, arr: &JByteArray) -> Result<Vec<u8>, String> {
    env.convert_byte_array(arr)
        .map_err(|e| format!("Failed to convert byte array: {}", e))
}

fn new_jstring(env: &mut JNIEnv, s: &str) -> Result<jstring, String> {
    env.new_string(s)
        .map(|js| js.into_raw())
        .map_err(|e| format!("Failed to create Java string: {}", e))
}

fn new_jbyte_array(env: &mut JNIEnv, bytes: &[u8]) -> Result<jbyteArray, String> {
    env.byte_array_from_slice(bytes)
        .map(|ba| ba.into_raw())
        .map_err(|e| format!("Failed to create byte array: {}", e))
}

/// Wraps a closure with catch_unwind to prevent panics from crossing the FFI boundary.
/// On panic, throws a Java RuntimeException and returns the default value.
fn jni_catch<T: Default, F: FnOnce(&mut JNIEnv) -> Result<T, String> + panic::UnwindSafe>(
    env: &mut JNIEnv,
    f: F,
) -> T {
    // SAFETY: We need to pass env through catch_unwind. JNIEnv is !UnwindSafe
    // but we only use it to throw an exception on the error path after catch_unwind.
    let env_ptr = env as *mut JNIEnv;
    match panic::catch_unwind(|| {
        let env_ref = unsafe { &mut *env_ptr };
        f(env_ref)
    }) {
        Ok(Ok(val)) => val,
        Ok(Err(e)) => throw_err(env, &e),
        Err(panic_info) => {
            let msg = if let Some(s) = panic_info.downcast_ref::<&str>() {
                format!("Rust panic: {}", s)
            } else if let Some(s) = panic_info.downcast_ref::<String>() {
                format!("Rust panic: {}", s)
            } else {
                "Rust panic: unknown".to_string()
            };
            throw_err(env, &msg)
        }
    }
}

/// Same as jni_catch but for void-returning JNI functions.
fn jni_catch_void<F: FnOnce(&mut JNIEnv) -> Result<(), String> + panic::UnwindSafe>(
    env: &mut JNIEnv,
    f: F,
) {
    let env_ptr = env as *mut JNIEnv;
    match panic::catch_unwind(|| {
        let env_ref = unsafe { &mut *env_ptr };
        f(env_ref)
    }) {
        Ok(Ok(())) => {}
        Ok(Err(e)) => {
            let _ = env.throw_new("java/lang/RuntimeException", &e);
        }
        Err(panic_info) => {
            let msg = if let Some(s) = panic_info.downcast_ref::<&str>() {
                format!("Rust panic: {}", s)
            } else if let Some(s) = panic_info.downcast_ref::<String>() {
                format!("Rust panic: {}", s)
            } else {
                "Rust panic: unknown".to_string()
            };
            let _ = env.throw_new("java/lang/RuntimeException", &msg);
        }
    }
}

// ============================================================================
// インスタンス管理
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_destroyVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let mut map = MANAGERS
            .lock()
            .unwrap_or_else(|p: PoisonError<_>| p.into_inner());
        map.remove(&vid);
        Ok(())
    });
}

// ============================================================================
// Session Management
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_createVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    master_password: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let mp = get_string(env, &master_password)?;
        let recovery_key = with_manager(&vid, |m| m.api_create_new_vault(mp))
            .map_err(|e| format!("Failed to create vault: {}", e))?;
        new_jstring(env, &recovery_key)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_loadVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    vault_bytes: JByteArray,
    etag: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let bytes = get_byte_array(env, &vault_bytes)?;
        let etag_str = get_string(env, &etag)?;
        with_manager(&vid, |m| m.api_load_vault(bytes, etag_str))
            .map_err(|e| format!("Failed to load vault: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_unlock(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    master_password: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let mp = get_string(env, &master_password)?;
        with_manager(&vid, |m| m.api_unlock(mp)).map_err(|e| format!("Failed to unlock: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_unlockWithRecoveryKey(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    recovery_key: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let rk = get_string(env, &recovery_key)?;
        with_manager(&vid, |m| m.api_unlock_with_recovery_key(rk))
            .map_err(|e| format!("Failed to unlock with recovery key: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_lock(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jbyteArray {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let bytes =
            with_manager(&vid, |m| m.api_lock()).map_err(|e| format!("Failed to lock: {}", e))?;
        new_jbyte_array(env, &bytes)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_getVaultBytes(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jbyteArray {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let bytes = with_manager(&vid, |m| m.api_get_vault_bytes())
            .map_err(|e| format!("Failed to get vault bytes: {}", e))?;
        new_jbyte_array(env, &bytes)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_isUnlocked(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jboolean {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        Ok(if with_manager(&vid, |m| m.api_is_unlocked()) {
            JNI_TRUE
        } else {
            JNI_FALSE
        })
    })
}

// ============================================================================
// Entry Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_listEntries(
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
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let sq = get_optional_string(env, &search_query)?;
        let et = get_optional_string(env, &entry_type)?;
        let li = get_optional_string(env, &label_id)?;
        let it = include_trash != JNI_FALSE;
        let of = only_favorites != JNI_FALSE;
        let sf = get_optional_string(env, &sort_field)?;
        let so = get_optional_string(env, &sort_order)?;

        let rows = with_manager(&vid, |m| m.api_list_entries(sq, et, li, it, of, sf, so))
            .map_err(|e| format!("Failed to list entries: {}", e))?;
        let json = serde_json::to_string(&rows).unwrap_or_else(|_| "[]".to_string());
        new_jstring(env, &json)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_getEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let entry_id = get_string(env, &id)?;
        let entry = with_manager(&vid, |m| m.api_get_entry(entry_id))
            .map_err(|e| format!("Failed to get entry: {}", e))?;
        let json = serde_json::to_string(&entry).unwrap_or_else(|_| "{}".to_string());
        new_jstring(env, &json)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_createEntry(
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
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let et = get_string(env, &entry_type)?;
        let n = get_string(env, &name)?;
        let no = get_optional_string(env, &notes)?;
        let tv = get_string(env, &typed_value_json)?;
        let li_json = get_string(env, &label_ids_json)?;
        let cf = get_optional_string(env, &custom_fields_json)?;

        let label_ids: Vec<String> = serde_json::from_str(&li_json).unwrap_or_default();

        let id = with_manager(&vid, |m| m.api_create_entry(et, n, no, tv, label_ids, cf))
            .map_err(|e| format!("Failed to create entry: {}", e))?;
        new_jstring(env, &id)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_updateEntry(
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
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let entry_id = get_string(env, &id)?;
        let n = Some(get_string(env, &name)?);
        let tv = get_optional_string(env, &typed_value_json)?;
        let no = get_optional_string(env, &notes)?;
        let cf = get_optional_string(env, &custom_fields_json)?;

        let li: Option<Vec<String>> =
            get_optional_string(env, &label_ids_json)?.and_then(|s| serde_json::from_str(&s).ok());

        with_manager(&vid, |m| m.api_update_entry(entry_id, n, no, tv, li, cf))
            .map_err(|e| format!("Failed to update entry: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_deleteEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let entry_id = get_string(env, &id)?;
        with_manager(&vid, |m| m.api_delete_entry(entry_id))
            .map_err(|e| format!("Failed to delete entry: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_restoreEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let entry_id = get_string(env, &id)?;
        with_manager(&vid, |m| m.api_restore_entry(entry_id))
            .map_err(|e| format!("Failed to restore entry: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_purgeEntry(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let entry_id = get_string(env, &id)?;
        with_manager(&vid, |m| m.api_purge_entry(entry_id))
            .map_err(|e| format!("Failed to purge entry: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_setFavorite(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
    is_favorite: jboolean,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let entry_id = get_string(env, &id)?;
        let fav = is_favorite != JNI_FALSE;
        with_manager(&vid, |m| m.api_set_favorite(entry_id, fav))
            .map_err(|e| format!("Failed to set favorite: {}", e))
    });
}

// ============================================================================
// Label Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_listLabels(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let labels = with_manager(&vid, |m| m.api_list_labels())
            .map_err(|e| format!("Failed to list labels: {}", e))?;
        let json = serde_json::to_string(&labels).unwrap_or_else(|_| "[]".to_string());
        new_jstring(env, &json)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_createLabel(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    name: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let n = get_string(env, &name)?;
        let id = with_manager(&vid, |m| m.api_create_label(n))
            .map_err(|e| format!("Failed to create label: {}", e))?;
        new_jstring(env, &id)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_deleteLabel(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let label_id = get_string(env, &id)?;
        with_manager(&vid, |m| m.api_delete_label(label_id))
            .map_err(|e| format!("Failed to delete label: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_renameLabel(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    id: JString,
    new_name: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let label_id = get_string(env, &id)?;
        let nn = get_string(env, &new_name)?;
        with_manager(&vid, |m| m.api_rename_label(label_id, nn))
            .map_err(|e| format!("Failed to rename label: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_setEntryLabels(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    entry_id: JString,
    label_ids_json: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let eid = get_string(env, &entry_id)?;
        let li_json = get_string(env, &label_ids_json)?;
        let label_ids: Vec<String> = serde_json::from_str(&li_json).unwrap_or_default();
        with_manager(&vid, |m| m.api_set_entry_labels(eid, label_ids))
            .map_err(|e| format!("Failed to set entry labels: {}", e))
    });
}

// ============================================================================
// Security Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_verifyPassword(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    password: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let pw = get_string(env, &password)?;
        with_manager(&vid, |m| m.api_verify_password(pw))
            .map_err(|e| format!("Failed to verify password: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_changeMasterPassword(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    old_password: JString,
    new_password: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let op = get_string(env, &old_password)?;
        let np = get_string(env, &new_password)?;
        with_manager(&vid, |m| m.api_change_master_password(op, np))
            .map_err(|e| format!("Failed to change master password: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_rotateDek(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    password: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let pw = get_string(env, &password)?;
        let recovery_key = with_manager(&vid, |m| m.api_rotate_dek(pw))
            .map_err(|e| format!("Failed to rotate DEK: {}", e))?;
        new_jstring(env, &recovery_key)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_regenerateRecoveryKey(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    password: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let pw = get_string(env, &password)?;
        let recovery_key = with_manager(&vid, |m| m.api_regenerate_recovery_key(pw))
            .map_err(|e| format!("Failed to regenerate recovery key: {}", e))?;
        new_jstring(env, &recovery_key)
    })
}

// ============================================================================
// Transfer Config (VaultManager不要)
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_encryptTransferConfig(
    mut env: JNIEnv,
    _class: JClass,
    password: JString,
    config_json: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let pw = get_string(env, &password)?;
        let cj = get_string(env, &config_json)?;
        let result = api_encrypt_transfer_config(pw, cj)
            .map_err(|e| format!("Failed to encrypt transfer config: {}", e))?;
        new_jstring(env, &result)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_decryptTransferConfig(
    mut env: JNIEnv,
    _class: JClass,
    password: JString,
    transfer_string: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let pw = get_string(env, &password)?;
        let ts = get_string(env, &transfer_string)?;
        let result = api_decrypt_transfer_config(pw, ts)
            .map_err(|e| format!("Failed to decrypt transfer config: {}", e))?;
        new_jstring(env, &result)
    })
}

// ============================================================================
// Utility Functions
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_generatePassword(
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
    jni_catch(&mut env, |env| {
        let pw = api_generate_password(
            length,
            lowercase != JNI_FALSE,
            uppercase != JNI_FALSE,
            numbers != JNI_FALSE,
            symbols1 != JNI_FALSE,
            symbols2 != JNI_FALSE,
            symbols3 != JNI_FALSE,
        )
        .map_err(|e| format!("Failed to generate password: {}", e))?;
        new_jstring(env, &pw)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_generateTotp(
    mut env: JNIEnv,
    _class: JClass,
    secret: JString,
    digits: jint,
    period: jint,
) -> jstring {
    jni_catch(&mut env, |env| {
        let s = get_string(env, &secret)?;
        let code = api_generate_totp(s, digits as u32, period as u32)
            .map_err(|e| format!("Failed to generate TOTP: {}", e))?;
        new_jstring(env, &code)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_generateTotpDefault(
    mut env: JNIEnv,
    _class: JClass,
    secret: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let s = get_string(env, &secret)?;
        let code =
            api_generate_totp_default(s).map_err(|e| format!("Failed to generate TOTP: {}", e))?;
        new_jstring(env, &code)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_generateTotpFromValue(
    mut env: JNIEnv,
    _class: JClass,
    value: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let v = get_string(env, &value)?;
        let code = api_generate_totp_from_value(v)
            .map_err(|e| format!("Failed to generate TOTP from value: {}", e))?;
        new_jstring(env, &code)
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_parseTotpPeriod(
    mut env: JNIEnv,
    _class: JClass,
    value: JString,
) -> jlong {
    jni_catch(&mut env, |env| {
        let v = get_string(env, &value)?;
        Ok(api_parse_totp_period(v) as jlong)
    })
}

// ============================================================================
// Export Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_exportBitwardenJson(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let json_str = with_manager(&vid, |m| m.api_export_bitwarden_json())
            .map_err(|e| format!("Export failed: {}", e))?;
        new_jstring(env, &json_str)
    })
}

// ============================================================================
// Sync Operations
// ============================================================================

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_mergeRemoteVault(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    remote_bytes: JByteArray,
    remote_etag: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let bytes = get_byte_array(env, &remote_bytes)?;
        let etag = get_string(env, &remote_etag)?;
        with_manager(&vid, |m| m.api_merge_remote_vault(bytes, etag))
            .map_err(|e| format!("Failed to merge remote vault: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_updateEtag(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    etag: JString,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        let etag_str = get_string(env, &etag)?;
        with_manager(&vid, |m| m.api_update_etag(etag_str))
            .map_err(|e| format!("Failed to update etag: {}", e))
    });
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_getEtag(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jstring {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        match with_manager(&vid, |m| m.api_get_etag()) {
            Some(etag) => new_jstring(env, &etag),
            None => Ok(std::ptr::null_mut()),
        }
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_getLastSyncTime(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
) -> jlong {
    jni_catch(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        Ok(with_manager(&vid, |m| m.api_get_last_sync_time()).unwrap_or(-1))
    })
}

#[no_mangle]
pub extern "system" fn Java_net_meshpeak_kura_bridge_VaultBridge_restoreLastSyncTime(
    mut env: JNIEnv,
    _class: JClass,
    vault_id: JString,
    ts: jlong,
) {
    jni_catch_void(&mut env, |env| {
        let vid = get_string(env, &vault_id)?;
        with_manager(&vid, |m| m.api_restore_last_sync_time(ts));
        Ok(())
    });
}
