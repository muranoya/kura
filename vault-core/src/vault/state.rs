use crate::error::Result;
use crate::storage::StorageBackend;
use crate::store::VaultFile;

use super::{LockedVault, UnlockedVault, CURRENT_SCHEMA_VERSION};

impl UnlockedVault {
    /// Push changes to storage
    pub async fn push(&self, storage: &dyn StorageBackend) -> Result<String> {
        let vault_file = self.to_vault_file()?;
        let file_bytes = vault_file.to_bytes()?;
        storage.upload(&file_bytes, self.etag.as_deref()).await
    }

    /// Sync with remote storage (auto-merge using LWW + Tombstone strategy)
    pub async fn sync(&mut self, storage: &dyn StorageBackend) -> Result<crate::sync::SyncResult> {
        // Download remote version
        let (remote_bytes, remote_etag) = match storage.download().await? {
            Some((bytes, etag)) => (bytes, etag),
            None => {
                // No remote version - push current state
                let new_etag = self.push(storage).await?;
                self.etag = Some(new_etag.clone());
                return Ok(crate::sync::SyncResult::success(Some(new_etag)));
            }
        };

        // Open remote vault file
        let remote_vault_file = VaultFile::from_bytes(&remote_bytes)?;
        let remote_contents = crate::crypto::encryption::decrypt_vault(&remote_vault_file.encrypted_vault, &self.dek)?;

        // Auto-merge local and remote using LWW + Tombstone strategy
        let merge_result = crate::sync::auto_merge(&self.contents, &remote_contents)?;

        // Apply merged state to current vault
        self.contents.entries = merge_result.merged_entries;
        self.contents.labels = merge_result.merged_labels;
        self.etag = Some(remote_etag.clone());

        // Apply garbage collection to remove old tombstones
        let now = crate::get_timestamp();
        crate::sync::apply_gc_to_contents(&mut self.contents, now);

        // Push merged state back to remote
        let new_etag = self.push(storage).await?;
        self.etag = Some(new_etag.clone());

        Ok(crate::sync::SyncResult::success(Some(new_etag)))
    }

    /// Get current ETag
    pub fn get_etag(&self) -> Option<&String> {
        self.etag.as_ref()
    }

    /// Set ETag (for after successful upload)
    pub fn set_etag(&mut self, etag: String) {
        self.etag = Some(etag);
    }

    /// Lock vault (DEK is zeroized)
    pub fn lock(self) -> Result<LockedVault> {
        let vault_file = VaultFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            meta: self.meta,
            encrypted_vault: crate::crypto::encryption::encrypt_vault(&self.contents, &self.dek)?,
        };

        Ok(LockedVault {
            vault_file,
            etag: self.etag,
        })
    }

    /// Get vault as JSON bytes (for storage)
    pub fn to_vault_bytes(&self) -> Result<Vec<u8>> {
        let vault_file = self.to_vault_file()?;
        vault_file.to_bytes()
    }

    pub(crate) fn to_vault_file(&self) -> Result<VaultFile> {
        let encrypted_vault = crate::crypto::encryption::encrypt_vault(&self.contents, &self.dek)?;
        Ok(VaultFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            meta: self.meta.clone(),
            encrypted_vault,
        })
    }
}
