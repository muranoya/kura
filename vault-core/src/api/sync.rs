use crate::config::S3Config;
use crate::storage::StorageBackend;
use crate::sync::engine::SessionState;

use super::{VaultManager, unix_now, SyncApiResult};

/// S3設定JSONをパースしてS3Configを生成
///
/// `key`が指定されていない場合はデフォルト値 "vault.json" を使用する。
pub fn parse_s3_config(storage_config: &str) -> Result<S3Config, String> {
    let mut map: serde_json::Map<String, serde_json::Value> =
        serde_json::from_str(storage_config)
            .map_err(|e| format!("Failed to parse S3 config: {}", e))?;

    if !map.contains_key("key") {
        map.insert(
            "key".to_string(),
            serde_json::Value::String("vault.json".to_string()),
        );
    }

    let config: S3Config = serde_json::from_value(serde_json::Value::Object(map))
        .map_err(|e| format!("Failed to parse S3 config: {}", e))?;

    config.validate()
        .map_err(|e| format!("Invalid S3 config: {}", e))?;

    Ok(config)
}

impl VaultManager {
    /// リモートvaultをローカルとマージしてセッションを更新
    ///
    /// プラットフォーム側がS3からダウンロードしたバイト列とETagを受け取り、
    /// DEKで復号 → auto_merge → GC → セッション更新を行う。
    pub fn api_merge_remote_vault(&self, remote_bytes: Vec<u8>, remote_etag: String) -> Result<(), String> {
        use crate::store::{VaultFile, VaultContents};

        let remote_vault_file = VaultFile::from_bytes(&remote_bytes)
            .map_err(|e| format!("Failed to parse remote vault: {}", e))?;

        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        let unlocked = match session.as_mut() {
            Some(SessionState::Unlocked(ref mut u)) => u,
            _ => return Err("Vault not unlocked".to_string()),
        };

        // Vault UUIDの一致を検証
        if remote_vault_file.meta.vault_uuid != unlocked.meta.vault_uuid {
            return Err(format!(
                "Vault UUID mismatch: local={}, remote={}",
                unlocked.meta.vault_uuid, remote_vault_file.meta.vault_uuid
            ));
        }

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
    pub fn api_update_etag(&self, etag: String) -> Result<(), String> {
        let mut session = self.session.lock().unwrap_or_else(|p| p.into_inner());

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
    pub fn api_get_etag(&self) -> Option<String> {
        let session = self.session.lock().unwrap_or_else(|p| p.into_inner());

        match session.as_ref() {
            Some(SessionState::Locked(locked)) => locked.get_etag().cloned(),
            Some(SessionState::Unlocked(unlocked)) => unlocked.get_etag().cloned(),
            None => None,
        }
    }

    /// 現在のvault_bytesを取得
    pub fn api_get_vault_bytes(&self) -> Result<Vec<u8>, String> {
        let session = self.session.lock().unwrap_or_else(|p| p.into_inner());

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
    ///
    /// 通常のデータ変更後に使用する標準の同期操作。
    pub async fn api_sync(&self, storage: &dyn StorageBackend) -> Result<SyncApiResult, String> {
        const MAX_RETRIES: usize = 5;

        let _outcome = crate::sync::engine::sync_with_storage(
            storage,
            &self.session,
            MAX_RETRIES,
        ).await?;

        let ts = unix_now();
        *self.last_sync_time.lock().unwrap_or_else(|p| p.into_inner()) = Some(ts);

        Ok(SyncApiResult { synced: true, last_synced_at: Some(ts) })
    }

    /// ストレージへプッシュ（マージなし・上書き）
    ///
    /// 再暗号化操作（マスターパスワード変更・DEKローテーション・リカバリーキー再生成）後専用。
    /// 通常のデータ変更には`api_sync`を使用すること。
    pub async fn api_push(&self, storage: &dyn StorageBackend) -> Result<i64, String> {
        crate::sync::engine::push_to_storage(storage, &self.session).await?;

        let ts = unix_now();
        *self.last_sync_time.lock().unwrap_or_else(|p| p.into_inner()) = Some(ts);

        Ok(ts)
    }

    /// ストレージからVaultをダウンロードしてセッションにロード
    pub async fn api_download(&self, storage: &dyn StorageBackend) -> Result<bool, String> {
        crate::sync::engine::download_from_storage(storage, &self.session).await
    }

    /// Vaultがアンロック状態かチェック
    pub fn api_is_unlocked(&self) -> bool {
        self.session.lock().unwrap_or_else(|p| p.into_inner()).as_ref()
            .map_or(false, |s| matches!(s, SessionState::Unlocked(_)))
    }

    /// 最終同期時刻を取得（UNIXタイムスタンプ、秒）
    pub fn api_get_last_sync_time(&self) -> Option<i64> {
        *self.last_sync_time.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// 最終同期時刻を復元（プラットフォーム側の永続ストレージから復元時に使用）
    pub fn api_restore_last_sync_time(&self, ts: i64) {
        *self.last_sync_time.lock().unwrap_or_else(|p| p.into_inner()) = Some(ts);
    }
}
