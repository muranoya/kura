use crate::storage::StorageBackend;
use crate::store::StoredVault;
use crate::vault::{LockedVault, UnlockedVault};
use std::sync::Mutex;

/// セッション状態（各クライアントが共通で使用する）
// vault ごとに 1 つだけ存在する長寿命の値なので、バリアント間のサイズ差は問題にならない
#[allow(clippy::large_enum_variant)]
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
/// 通常のデータ変更（エントリ追加・編集・削除・purge等）後に使用する標準の同期操作。
/// リモートの変更とローカルの変更をauto_mergeでマージし、GCを適用してからアップロードする。
///
/// `StorageBackend`の実装はアプリ側が提供する。
/// タイムアウトは`StorageBackend`実装側の責務。
///
/// セッションMutexはネットワークI/O中にロックを保持しないよう、意図的に複数回
/// acquire/releaseしている。これにより長時間のネットワーク操作中も他スレッドから
/// セッション状態を参照できる。マージはダウンロード後にロックを取ってから行うため、
/// ダウンロード中に行われたローカルの変更もマージ対象に含まれる。
pub async fn sync_with_storage(
    storage: &dyn StorageBackend,
    vault_session: &Mutex<Option<SessionState>>,
    max_retries: usize,
) -> Result<SyncOutcome, String> {
    for attempt in 0..max_retries {
        // リモートをダウンロード
        let remote_option = storage
            .download()
            .await
            .map_err(|e| format!("S3 download failed: {}", e))?;

        // ローカルへマージ（リモートが存在しなければローカル状態をそのまま使う）し、
        // アップロードするバイト列を作る
        let (vault_bytes, etag) = {
            let remote = match remote_option {
                Some((remote_bytes, remote_etag)) => Some((
                    StoredVault::from_bytes(&remote_bytes)
                        .map_err(|e| format!("Failed to parse remote vault: {}", e))?,
                    remote_etag,
                )),
                None => None,
            };

            let mut session = vault_session
                .lock()
                .map_err(|_| "Session lock poisoned".to_string())?;
            let Some(SessionState::Unlocked(u)) = session.as_mut() else {
                return Err("Vault not unlocked".to_string());
            };
            if let Some((remote, remote_etag)) = remote {
                // index だけを復号してマージし、secret は勝った側の暗号文を採用する
                u.merge_remote(&remote)
                    .map_err(|e| format!("Failed to merge remote vault: {}", e))?;
                u.set_etag(remote_etag);
            }
            (
                u.to_vault_bytes()
                    .map_err(|e| format!("Failed to serialize vault: {}", e))?,
                u.get_etag().cloned(),
            )
        };

        // Conditional Writeでアップロード
        match storage.upload(&vault_bytes, etag.as_deref()).await {
            Ok(new_etag) => {
                let mut session = vault_session
                    .lock()
                    .map_err(|_| "Session lock poisoned".to_string())?;
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

    Err("Sync failed after maximum retries".to_string())
}

/// 現在のvault状態をストレージにプッシュ（マージなし）
///
/// 再暗号化操作（マスターパスワード変更・DEKローテーション・リカバリーキー再生成）後の
/// 上書きアップロード専用。暗号化エンベロープが変わるためリモートとのマージは不可能であり、
/// ローカルの状態でリモートを上書きする必要がある。
///
/// 通常のデータ変更には`sync_with_storage`を使用すること。
pub async fn push_to_storage(
    storage: &dyn StorageBackend,
    vault_session: &Mutex<Option<SessionState>>,
) -> Result<String, String> {
    let (vault_bytes, etag) = {
        let session = vault_session
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?;
        match session.as_ref() {
            Some(SessionState::Unlocked(unlocked)) => {
                let bytes = unlocked
                    .to_vault_bytes()
                    .map_err(|e| format!("Failed to serialize vault: {}", e))?;
                let etag = unlocked.get_etag().cloned();
                (bytes, etag)
            }
            _ => return Err("Vault not unlocked".to_string()),
        }
    };

    let new_etag = storage
        .upload(&vault_bytes, etag.as_deref())
        .await
        .map_err(|e| format!("S3 upload failed: {}", e))?;

    {
        let mut session = vault_session
            .lock()
            .map_err(|_| "Session lock poisoned".to_string())?;
        if let Some(SessionState::Unlocked(ref mut unlocked)) = session.as_mut() {
            unlocked.set_etag(new_etag.clone());
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

            let mut session = vault_session
                .lock()
                .map_err(|_| "Session lock poisoned".to_string())?;
            *session = Some(SessionState::Locked(locked_vault));

            Ok(true)
        }
        None => Ok(false),
    }
}
