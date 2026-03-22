use async_trait::async_trait;
use std::path::{Path, PathBuf};
use sha2::{Sha256, Digest};
use crate::error::{Result, VaultError};
use super::StorageBackend;

pub struct LocalFileStorage {
    vault_path: PathBuf,
    etag_path: PathBuf,
}

impl LocalFileStorage {
    pub fn new(dir: &Path) -> Result<Self> {
        let vault_path = dir.join("vault.db");
        let etag_path = dir.join("vault.db.etag");

        Ok(LocalFileStorage {
            vault_path,
            etag_path,
        })
    }

    fn compute_etag(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }

    fn read_etag(&self) -> Result<Option<String>> {
        match std::fs::read_to_string(&self.etag_path) {
            Ok(etag) => Ok(Some(etag.trim().to_string())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(VaultError::StorageError(format!("Failed to read etag: {}", e))),
        }
    }

    fn write_etag(&self, etag: &str) -> Result<()> {
        std::fs::write(&self.etag_path, etag)
            .map_err(|e| VaultError::StorageError(format!("Failed to write etag: {}", e)))
    }
}

#[async_trait]
impl StorageBackend for LocalFileStorage {
    async fn download(&self) -> Result<Option<(Vec<u8>, String)>> {
        match std::fs::read(&self.vault_path) {
            Ok(data) => {
                let etag = Self::compute_etag(&data);
                // Store etag for future uploads
                let _ = self.write_etag(&etag);
                Ok(Some((data, etag)))
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(VaultError::StorageError(format!("Failed to read vault: {}", e))),
        }
    }

    async fn upload(&self, data: &[u8], etag: Option<&str>) -> Result<String> {
        // Check conditional write if etag is provided
        if let Some(expected_etag) = etag {
            match self.read_etag()? {
                Some(current_etag) if current_etag != expected_etag => {
                    return Err(VaultError::ConflictDetected);
                }
                None => {
                    // File doesn't exist but etag is provided - conflict
                    return Err(VaultError::ConflictDetected);
                }
                _ => {}
            }
        }

        // Write file
        std::fs::write(&self.vault_path, data)
            .map_err(|e| VaultError::StorageError(format!("Failed to write vault: {}", e)))?;

        let new_etag = Self::compute_etag(data);
        self.write_etag(&new_etag)?;

        Ok(new_etag)
    }
}
