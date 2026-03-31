use crate::{
    models::{EntryType, EntryFilter},
    totp::{generate_totp, generate_totp_default}, vault::LockedVault,
    password_gen::{PasswordOptions, generate_password},
    storage::StorageBackend,
    sync::engine::SessionState,
};
use once_cell::sync::Lazy;
use serde_json::Value;
use std::sync::Mutex;

/// エントリ行データ
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EntryRow {
    pub id: String,
    pub entry_type: String,
    pub name: String,
    pub is_favorite: bool,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
}

/// 詳細エントリデータ
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct EntryDetail {
    pub id: String,
    pub entry_type: String,
    pub name: String,
    pub is_favorite: bool,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub notes: Option<String>,
    pub typed_value: String, // JSON文字列
    pub labels: Vec<String>,
    #[serde(default)]
    pub custom_fields: Option<String>, // JSON文字列
}

/// ラベルデータ
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct LabelRow {
    pub id: String,
    pub name: String,
}

/// 同期結果
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SyncApiResult {
    pub synced: bool,
    pub last_synced_at: Option<i64>,
}

/// グローバルセッション管理
static VAULT_SESSION: Lazy<Mutex<Option<SessionState>>> = Lazy::new(|| Mutex::new(None));

/// 最終同期時刻（UNIXタイムスタンプ、秒）
static LAST_SYNC_TIME: Lazy<Mutex<Option<i64>>> = Lazy::new(|| Mutex::new(None));

fn unix_now() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

// ============================================================================
// セッション管理API
// ============================================================================

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

// ============================================================================
// エントリ操作API
// ============================================================================

/// エントリ一覧（フィルター付き）
pub fn api_list_entries(
    search_query: Option<String>,
    entry_type: Option<String>,
    label_id: Option<String>,
    include_trash: bool,
    only_favorites: bool,
) -> Result<Vec<EntryRow>, String> {
    let session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());
    let unlocked = match session.as_ref() {
        Some(SessionState::Unlocked(v)) => v,
        _ => return Err("Vault not unlocked".to_string()),
    };

    let mut filter = EntryFilter::new()
        .with_trash(include_trash)
        .with_search(search_query.unwrap_or_default());

    if let Some(t) = entry_type {
        if let Some(entry_type) = EntryType::from_str(&t) {
            filter = filter.with_type(entry_type);
        }
    }

    if let Some(l) = label_id {
        filter = filter.with_label(l);
    }

    if only_favorites {
        filter = filter.favorites_only();
    }

    let entries = unlocked.list_entries(&filter)
        .map_err(|e| format!("Failed to list entries: {}", e))?;

    Ok(entries.into_iter().map(|entry| EntryRow {
        id: entry.id,
        entry_type: entry.entry_type.as_str().to_string(),
        name: entry.name,
        is_favorite: entry.is_favorite,
        updated_at: entry.updated_at,
        deleted_at: entry.deleted_at,
    }).collect())
}

/// エントリ詳細（復号済み）
pub fn api_get_entry(id: String) -> Result<EntryDetail, String> {
    let session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());
    let unlocked = match session.as_ref() {
        Some(SessionState::Unlocked(v)) => v,
        _ => return Err("Vault not unlocked".to_string()),
    };

    let entry = unlocked.get_entry(&id)
        .map_err(|e| format!("Failed to get entry: {}", e))?
        .ok_or_else(|| format!("Entry not found: {}", id))?;

    let custom_fields = entry.data.custom_fields.as_ref().map(|fields| {
        serde_json::to_string(fields).unwrap_or_else(|_| "[]".to_string())
    });

    Ok(EntryDetail {
        id: entry.id,
        entry_type: entry.entry_type.as_str().to_string(),
        name: entry.name,
        is_favorite: entry.is_favorite,
        updated_at: entry.updated_at,
        deleted_at: entry.deleted_at,
        notes: entry.data.notes.clone(),
        typed_value: serde_json::to_string(&entry.data.typed_value)
            .unwrap_or_else(|_| "{}".to_string()),
        labels: entry.labels,
        custom_fields,
    })
}

/// エントリ作成
pub fn api_create_entry(
    entry_type: String,
    name: String,
    notes: Option<String>,
    typed_value_json: String,
    label_ids: Vec<String>,
    custom_fields_json: Option<String>,
) -> Result<String, String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    let typed_value: Value = serde_json::from_str(&typed_value_json)
        .map_err(|e| format!("Invalid typed_value JSON: {}", e))?;

    let et = EntryType::from_str(&entry_type)
        .ok_or_else(|| format!("Invalid entry type: {}", entry_type))?;

    let custom_fields = if let Some(json) = custom_fields_json {
        Some(serde_json::from_str(&json)
            .map_err(|e| format!("Invalid custom_fields JSON: {}", e))?)
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
        let entry = unlocked.create_entry(name, et, data, label_ids)
            .map_err(|e| format!("Failed to create entry: {}", e))?;
        Ok(entry.id)
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// エントリ更新
pub fn api_update_entry(
    id: String,
    name: Option<String>,
    notes: Option<String>,
    typed_value_json: Option<String>,
    label_ids: Option<Vec<String>>,
    custom_fields_json: Option<String>,
) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        // Get current entry to preserve typed_value if not provided
        let current = unlocked.get_entry(&id)
            .map_err(|e| format!("Failed to get entry: {}", e))?
            .ok_or_else(|| format!("Entry not found: {}", id))?;

        let typed_value = if let Some(json) = typed_value_json {
            serde_json::from_str(&json)
                .map_err(|e| format!("Invalid typed_value JSON: {}", e))?
        } else {
            current.data.typed_value.clone()
        };

        let custom_fields = if let Some(json) = custom_fields_json {
            Some(serde_json::from_str(&json)
                .map_err(|e| format!("Invalid custom_fields JSON: {}", e))?)
        } else {
            current.data.custom_fields.clone()
        };

        let data = crate::models::EntryData {
            entry_type: current.entry_type,
            typed_value,
            notes: notes.or_else(|| current.data.notes.clone()),
            custom_fields,
        };

        unlocked.update_entry(&id, name.unwrap_or(current.name), data)
            .map_err(|e| format!("Failed to update entry: {}", e))?;

        if let Some(label_ids) = label_ids {
            unlocked.set_entry_labels(&id, label_ids)
                .map_err(|e| format!("Failed to set labels: {}", e))?;
        }

        Ok(())
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// エントリをゴミ箱へ移動
pub fn api_delete_entry(id: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.delete_entry(&id)
            .map_err(|e| format!("Failed to delete entry: {}", e))
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// ゴミ箱から復元
pub fn api_restore_entry(id: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.restore_entry(&id)
            .map_err(|e| format!("Failed to restore entry: {}", e))
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// 完全削除
pub fn api_purge_entry(id: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.purge_entry(&id)
            .map_err(|e| format!("Failed to purge entry: {}", e))
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// お気に入り設定
pub fn api_set_favorite(id: String, is_favorite: bool) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.set_favorite(&id, is_favorite)
            .map_err(|e| format!("Failed to set favorite: {}", e))
    } else {
        Err("Vault not unlocked".to_string())
    }
}

// ============================================================================
// ラベル操作API
// ============================================================================

/// ラベル一覧
pub fn api_list_labels() -> Result<Vec<LabelRow>, String> {
    let session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());
    let unlocked = match session.as_ref() {
        Some(SessionState::Unlocked(v)) => v,
        _ => return Err("Vault not unlocked".to_string()),
    };

    let labels = unlocked.list_labels()
        .map_err(|e| format!("Failed to list labels: {}", e))?;

    Ok(labels.into_iter().map(|l| LabelRow {
        id: l.id,
        name: l.name,
    }).collect())
}

/// ラベル作成
pub fn api_create_label(name: String) -> Result<String, String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        let label = unlocked.create_label(name)
            .map_err(|e| format!("Failed to create label: {}", e))?;
        Ok(label.id)
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// ラベル削除
pub fn api_delete_label(id: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.delete_label(&id)
            .map_err(|e| format!("Failed to delete label: {}", e))
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// ラベル名変更
pub fn api_rename_label(id: String, new_name: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.rename_label(&id, new_name)
            .map_err(|e| format!("Failed to rename label: {}", e))
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// エントリにラベルを紐付け
pub fn api_set_entry_labels(entry_id: String, label_ids: Vec<String>) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.set_entry_labels(&entry_id, label_ids)
            .map_err(|e| format!("Failed to set entry labels: {}", e))
    } else {
        Err("Vault not unlocked".to_string())
    }
}

// ============================================================================
// セキュリティ関連API
// ============================================================================

/// マスターパスワード変更
pub fn api_change_master_password(old_password: String, new_password: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.change_master_password(&old_password, &new_password)
            .map_err(|e| format!("Failed to change master password: {}", e))
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// Argon2パラメータアップグレード
pub fn api_upgrade_argon2_params(password: String, iterations: u32, memory: u32, parallelism: u32) -> Result<String, String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    let new_params = crate::models::Argon2Params {
        salt: crate::codec::base32::encode(&rand::random::<[u8; 16]>()),
        iterations,
        memory,
        parallelism,
    };

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        unlocked.upgrade_argon2_params(&password, new_params)
            .map_err(|e| format!("Failed to upgrade argon2 params: {}", e))
            .map(|recovery_key| recovery_key.to_display_string())
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// DEK ローテーション（新しいリカバリーキーを返す）
pub fn api_rotate_dek(password: String) -> Result<String, String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        let recovery_key = unlocked.rotate_dek(&password)
            .map_err(|e| format!("Failed to rotate DEK: {}", e))?;
        Ok(recovery_key.to_display_string())
    } else {
        Err("Vault not unlocked".to_string())
    }
}

/// リカバリーキー再発行
pub fn api_regenerate_recovery_key(password: String) -> Result<String, String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
        let recovery_key = unlocked.regenerate_recovery_key(&password)
            .map_err(|e| format!("Failed to regenerate recovery key: {}", e))?;
        Ok(recovery_key.to_display_string())
    } else {
        Err("Vault not unlocked".to_string())
    }
}

// ============================================================================
// ユーティリティAPI
// ============================================================================

/// パスワード生成
pub fn api_generate_password(
    length: i32,
    include_uppercase: bool,
    include_lowercase: bool,
    include_numbers: bool,
    include_symbols: bool,
) -> Result<String, String> {
    let length = length.try_into().map_err(|_| "Invalid length".to_string())?;

    let options = PasswordOptions {
        length,
        include_uppercase,
        include_lowercase,
        include_numbers,
        include_symbols,
    };

    generate_password(&options)
        .map_err(|e| format!("Failed to generate password: {}", e))
}

/// TOTP生成
pub fn api_generate_totp(secret: String, digits: u32, period: u32) -> Result<String, String> {
    generate_totp(&secret, digits, period as u64)
        .map_err(|e| format!("Failed to generate TOTP: {}", e))
}

/// TOTP生成（デフォルト）
pub fn api_generate_totp_default(secret: String) -> Result<String, String> {
    generate_totp_default(&secret)
        .map_err(|e| format!("Failed to generate TOTP: {}", e))
}

// ============================================================================
// マージ・ETag操作API（プラットフォーム側の同期オーケストレーション用）
// ============================================================================

/// リモートvaultをローカルとマージしてセッションを更新
///
/// プラットフォーム側がS3からダウンロードしたバイト列とETagを受け取り、
/// DEKで復号 → auto_merge → GC → セッション更新を行う。
pub fn api_merge_remote_vault(remote_bytes: Vec<u8>, remote_etag: String) -> Result<(), String> {
    use crate::store::{VaultFile, VaultContents};

    let remote_vault_file = VaultFile::from_bytes(&remote_bytes)
        .map_err(|e| format!("Failed to parse remote vault: {}", e))?;

    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    let unlocked = match session.as_mut() {
        Some(SessionState::Unlocked(ref mut u)) => u,
        _ => return Err("Vault not unlocked".to_string()),
    };

    // ローカルcontentsを取得
    let local_contents = unlocked.contents.clone();

    // リモートvaultを復号
    let remote_contents = crate::crypto::encryption::decrypt_vault(
        &remote_vault_file.encrypted_vault,
        &unlocked.dek,
    )
    .map_err(|e| format!("Failed to decrypt remote vault: {}", e))?;

    // マージ
    let merge_result = crate::sync::auto_merge(&local_contents, &remote_contents)
        .map_err(|e| format!("Merge failed: {}", e))?;

    // GC
    let mut merged_contents = VaultContents {
        entries: merge_result.merged_entries,
        labels: merge_result.merged_labels,
    };
    let now = crate::get_timestamp();
    crate::sync::apply_gc_to_contents(&mut merged_contents, now);

    // セッション更新
    unlocked.contents.entries = merged_contents.entries;
    unlocked.contents.labels = merged_contents.labels;
    unlocked.set_etag(remote_etag);

    Ok(())
}

/// アップロード成功後にETagを更新
pub fn api_update_etag(etag: String) -> Result<(), String> {
    let mut session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    match session.as_mut() {
        Some(SessionState::Locked(ref mut locked)) => {
            locked.set_etag(etag);
            Ok(())
        }
        Some(SessionState::Unlocked(ref mut unlocked)) => {
            unlocked.set_etag(etag);
            Ok(())
        }
        None => Err("No vault loaded".to_string()),
    }
}

/// 現在のセッションのETagを取得
pub fn api_get_etag() -> Option<String> {
    let session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    match session.as_ref() {
        Some(SessionState::Locked(locked)) => locked.get_etag().cloned(),
        Some(SessionState::Unlocked(unlocked)) => unlocked.get_etag().cloned(),
        None => None,
    }
}

// ============================================================================
// S3操作API（非同期）
// ============================================================================

/// 現在のvault_bytesを取得
pub fn api_get_vault_bytes() -> Result<Vec<u8>, String> {
    let session = VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner());

    match session.as_ref() {
        Some(SessionState::Locked(locked)) => {
            locked.to_vault_bytes()
                .map_err(|e| format!("Failed to serialize vault: {}", e))
        }
        Some(SessionState::Unlocked(unlocked)) => {
            unlocked.to_vault_bytes()
                .map_err(|e| format!("Failed to serialize vault: {}", e))
        }
        None => Err("No vault loaded".to_string()),
    }
}

/// ストレージから同期（ローカルとリモートをマージ）
pub async fn api_sync(storage: &dyn StorageBackend) -> Result<SyncApiResult, String> {
    const MAX_RETRIES: usize = 5;

    let _outcome = crate::sync::engine::sync_with_storage(
        storage,
        &VAULT_SESSION,
        MAX_RETRIES,
    ).await?;

    let ts = unix_now();
    *LAST_SYNC_TIME.lock().unwrap_or_else(|p| p.into_inner()) = Some(ts);

    Ok(SyncApiResult { synced: true, last_synced_at: Some(ts) })
}

/// ストレージへプッシュ
pub async fn api_push(storage: &dyn StorageBackend) -> Result<i64, String> {
    crate::sync::engine::push_to_storage(storage, &VAULT_SESSION).await?;

    let ts = unix_now();
    *LAST_SYNC_TIME.lock().unwrap_or_else(|p| p.into_inner()) = Some(ts);

    Ok(ts)
}

/// ストレージからVaultをダウンロードしてセッションにロード
pub async fn api_download(storage: &dyn StorageBackend) -> Result<bool, String> {
    crate::sync::engine::download_from_storage(storage, &VAULT_SESSION).await
}

/// Vaultがアンロック状態かチェック
pub fn api_is_unlocked() -> bool {
    VAULT_SESSION.lock().unwrap_or_else(|p| p.into_inner()).as_ref()
        .map_or(false, |s| matches!(s, SessionState::Unlocked(_)))
}

/// 最終同期時刻を取得（UNIXタイムスタンプ、秒）
pub fn api_get_last_sync_time() -> Option<i64> {
    *LAST_SYNC_TIME.lock().unwrap_or_else(|p| p.into_inner())
}

/// 最終同期時刻を復元（プラットフォーム側の永続ストレージから復元時に使用）
pub fn api_restore_last_sync_time(ts: i64) {
    *LAST_SYNC_TIME.lock().unwrap_or_else(|p| p.into_inner()) = Some(ts);
}
