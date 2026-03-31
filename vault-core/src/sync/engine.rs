use crate::crypto;
use crate::storage::StorageBackend;
use crate::store::{VaultContents, VaultFile};
use crate::vault::{LockedVault, UnlockedVault};
use std::sync::Mutex;

/// セッション状態（各クライアントが共通で使用する）
pub enum SessionState {
    Locked(LockedVault),
    Unlocked(UnlockedVault),
}

/// sync結果
pub struct SyncOutcome {
    /// 新しいETag
    pub new_etag: String,
}

/// ストレージからダウンロード → マージ → アップロード（リトライ付き）
///
/// `StorageBackend`の実装はアプリ側が提供する。
/// タイムアウトは`StorageBackend`実装側の責務。
pub async fn sync_with_storage(
    storage: &dyn StorageBackend,
    vault_session: &Mutex<Option<SessionState>>,
    max_retries: usize,
) -> Result<SyncOutcome, String> {
    for attempt in 0..max_retries {
        // ローカルのcontentsを取得
        let local_contents = {
            let session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
            match session.as_ref() {
                Some(SessionState::Unlocked(u)) => u.contents.clone(),
                _ => return Err("Vault not unlocked".to_string()),
            }
        };

        // リモートをダウンロード
        let remote_option = storage
            .download()
            .await
            .map_err(|e| format!("S3 download failed: {}", e))?;

        match remote_option {
            None => {
                // リモートに存在しない → ローカル状態をそのままアップロード
                let (vault_bytes, etag) = {
                    let session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
                    match session.as_ref() {
                        Some(SessionState::Unlocked(u)) => (
                            u.to_vault_bytes()
                                .map_err(|e| format!("Failed to serialize vault: {}", e))?,
                            u.get_etag().cloned(),
                        ),
                        _ => return Err("Vault not unlocked".to_string()),
                    }
                };

                let new_etag = storage
                    .upload(&vault_bytes, etag.as_deref())
                    .await
                    .map_err(|e| format!("S3 upload failed: {}", e))?;

                {
                    let mut session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
                    if let Some(SessionState::Unlocked(ref mut u)) = session.as_mut() {
                        u.set_etag(new_etag.clone());
                    }
                }

                return Ok(SyncOutcome { new_etag });
            }
            Some((remote_bytes, remote_etag)) => {
                // リモート存在 → 復号してマージ
                let remote_contents = {
                    let remote_vault_file = VaultFile::from_bytes(&remote_bytes)
                        .map_err(|e| format!("Failed to parse remote vault: {}", e))?;
                    let session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
                    match session.as_ref() {
                        Some(SessionState::Unlocked(u)) => {
                            crypto::encryption::decrypt_vault(
                                &remote_vault_file.encrypted_vault,
                                &u.dek,
                            )
                            .map_err(|e| format!("Failed to decrypt remote vault: {}", e))?
                        }
                        _ => return Err("Vault not unlocked".to_string()),
                    }
                };

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
                {
                    let mut session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
                    if let Some(SessionState::Unlocked(ref mut u)) = session.as_mut() {
                        u.contents.entries = merged_contents.entries.clone();
                        u.contents.labels = merged_contents.labels.clone();
                        u.set_etag(remote_etag.clone());
                    }
                }

                // マージ済みvaultをシリアライズ
                let (merged_vault_bytes, merged_etag) = {
                    let session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
                    match session.as_ref() {
                        Some(SessionState::Unlocked(u)) => (
                            u.to_vault_bytes()
                                .map_err(|e| format!("Failed to serialize vault: {}", e))?,
                            u.get_etag().cloned(),
                        ),
                        _ => return Err("Vault not unlocked".to_string()),
                    }
                };

                // Conditional Writeでアップロード
                match storage
                    .upload(&merged_vault_bytes, merged_etag.as_deref())
                    .await
                {
                    Ok(new_etag) => {
                        let mut session =
                            vault_session.lock().unwrap_or_else(|p| p.into_inner());
                        if let Some(SessionState::Unlocked(ref mut u)) = session.as_mut() {
                            u.set_etag(new_etag.clone());
                        }
                        return Ok(SyncOutcome { new_etag });
                    }
                    Err(crate::error::VaultError::ConflictDetected) => {
                        if attempt + 1 == max_retries {
                            return Err("Sync failed after maximum retries".to_string());
                        }
                        continue;
                    }
                    Err(e) => return Err(format!("S3 upload failed: {}", e)),
                }
            }
        }
    }

    Err("Sync failed after maximum retries".to_string())
}

/// 現在のvault状態をストレージにプッシュ（マージなし）
pub async fn push_to_storage(
    storage: &dyn StorageBackend,
    vault_session: &Mutex<Option<SessionState>>,
) -> Result<String, String> {
    let (vault_bytes, etag) = {
        let session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
        match session.as_ref() {
            Some(SessionState::Locked(locked)) => {
                let bytes = locked
                    .to_vault_bytes()
                    .map_err(|e| format!("Failed to serialize vault: {}", e))?;
                let etag = locked.get_etag().cloned();
                (bytes, etag)
            }
            Some(SessionState::Unlocked(unlocked)) => {
                let bytes = unlocked
                    .to_vault_bytes()
                    .map_err(|e| format!("Failed to serialize vault: {}", e))?;
                let etag = unlocked.get_etag().cloned();
                (bytes, etag)
            }
            None => return Err("No vault loaded".to_string()),
        }
    };

    let new_etag = storage
        .upload(&vault_bytes, etag.as_deref())
        .await
        .map_err(|e| format!("S3 upload failed: {}", e))?;

    {
        let mut session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
        match session.as_mut() {
            Some(SessionState::Locked(ref mut locked)) => {
                locked.set_etag(new_etag.clone());
            }
            Some(SessionState::Unlocked(ref mut unlocked)) => {
                unlocked.set_etag(new_etag.clone());
            }
            None => {}
        }
    }

    Ok(new_etag)
}

/// ストレージからvaultをダウンロードしてセッションにロード
pub async fn download_from_storage(
    storage: &dyn StorageBackend,
    vault_session: &Mutex<Option<SessionState>>,
) -> Result<bool, String> {
    match storage
        .download()
        .await
        .map_err(|e| format!("S3 download failed: {}", e))?
    {
        Some((vault_bytes, etag)) => {
            let locked_vault = LockedVault::open(vault_bytes, Some(etag))
                .map_err(|e| format!("Failed to open vault: {}", e))?;

            let mut session = vault_session.lock().unwrap_or_else(|p| p.into_inner());
            *session = Some(SessionState::Locked(locked_vault));

            Ok(true)
        }
        None => Ok(false),
    }
}
