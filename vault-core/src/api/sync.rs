use crate::storage::StorageBackend;
use crate::sync::engine::SessionState;

use super::{VAULT_SESSION, LAST_SYNC_TIME, unix_now, SyncApiResult};

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
