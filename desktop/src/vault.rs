//! vault.bin のローカル保存と S3 との同期（旧 commands/storage.rs・commands/sync.rs）

use vault_core::api::{parse_s3_config, SyncApiResult};

use crate::ctx::shared;
use crate::paths;
use crate::s3::S3Storage;
use crate::store;

pub fn vault_file_exists() -> bool {
    paths::vault_file().exists()
}

pub fn read_vault_file() -> Result<Option<Vec<u8>>, String> {
    let path = paths::vault_file();
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read(&path).map(Some).map_err(|e| e.to_string())
}

pub fn write_vault_file(bytes: &[u8]) -> Result<(), String> {
    store::write_atomic(&paths::vault_file(), bytes)
}

pub fn delete_vault_file() -> Result<(), String> {
    let path = paths::vault_file();
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

async fn storage(storage_config: &str) -> Result<S3Storage, String> {
    let config = parse_s3_config(storage_config)?;
    S3Storage::new(config)
        .await
        .map_err(|e| format!("Failed to create S3 storage: {}", e))
}

pub async fn sync(storage_config: &str) -> Result<SyncApiResult, String> {
    let storage = storage(storage_config).await?;
    shared().vault.api_sync(&storage).await
}

/// 再暗号化操作（マスターパスワード変更・DEK ローテーション・リカバリーキー再生成）後の上書きアップロード。
/// マージできない変更なので sync ではなく push を使う
pub async fn push(storage_config: &str) -> Result<i64, String> {
    let storage = storage(storage_config).await?;
    shared().vault.api_push(&storage).await
}

pub async fn download(storage_config: &str) -> Result<bool, String> {
    let storage = storage(storage_config).await?;
    shared().vault.api_download(&storage).await
}
