use crate::error::{Result, VaultError};
use crate::crypto::Dek;
use crate::models::{Argon2Params, EntryData, Label, Entry, EntryFilter};
use crate::store::{VaultFile, VaultContents, VaultEntry, LabelValue};
use crate::storage::StorageBackend;

/// Current schema version for vault.json
const CURRENT_SCHEMA_VERSION: u32 = 1;

/// Locked vault - encrypted data in memory, DEK not available
pub struct LockedVault {
    vault_file: VaultFile,
    etag: Option<String>,
}

/// Unlocked vault - plaintext JSON in memory with DEK available
pub struct UnlockedVault {
    meta: crate::models::VaultMeta,
    pub contents: VaultContents,
    pub dek: Dek,
    etag: Option<String>,
}

impl LockedVault {
    /// Create new vault with master password
    pub fn create_new(master_password: &str) -> Result<Self> {
        let argon2_params = Argon2Params::default();
        let dek = Dek::generate();
        let recovery_key = crate::crypto::RecoveryKey::generate();

        // Derive KEKs
        let kek_master = crate::crypto::kdf::derive_kek(master_password, &argon2_params)?;
        let kek_recovery = recovery_key.derive_kek(&argon2_params)?;

        // Wrap DEK with both KEKs
        let encrypted_dek_master = dek.wrap(&kek_master)?;
        let encrypted_dek_recovery = dek.wrap(&kek_recovery)?;

        // Create vault_meta
        let vault_meta = crate::models::VaultMeta::new(
            encrypted_dek_master,
            encrypted_dek_recovery,
            argon2_params,
        );

        // Create empty vault contents
        let contents = VaultContents::new();
        let encrypted_vault = crate::crypto::encryption::encrypt_vault(&contents, &dek)?;

        let vault_file = VaultFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            meta: vault_meta,
            encrypted_vault,
        };

        Ok(LockedVault {
            vault_file,
            etag: None,
        })
    }

    /// Open existing vault from JSON bytes
    pub fn open(bytes: Vec<u8>, etag: Option<String>) -> Result<Self> {
        let vault_file = VaultFile::from_bytes(&bytes)?;

        // Validate schema version
        if vault_file.schema_version != CURRENT_SCHEMA_VERSION {
            return Err(VaultError::UnsupportedSchemaVersion(vault_file.schema_version));
        }

        Ok(LockedVault {
            vault_file,
            etag,
        })
    }

    /// Unlock vault with master password
    pub fn unlock(self, master_password: &str) -> Result<UnlockedVault> {
        use base64::Engine;

        // Derive KEK from password
        let kek = crate::crypto::kdf::derive_kek(master_password, &self.vault_file.meta.argon2_params)?;

        // Decode and unwrap DEK
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(&self.vault_file.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64 in encrypted_dek_master".to_string()))?;
        let dek = Dek::unwrap(&encrypted_dek_bytes, &kek)?;

        // Decrypt vault contents
        let contents = crate::crypto::encryption::decrypt_vault(&self.vault_file.encrypted_vault, &dek)?;

        Ok(UnlockedVault {
            meta: self.vault_file.meta,
            contents,
            dek,
            etag: self.etag,
        })
    }

    /// Get vault bytes (for storage)
    pub fn to_vault_bytes(&self) -> Result<Vec<u8>> {
        self.vault_file.to_bytes()
    }

    /// Get current ETag
    pub fn get_etag(&self) -> Option<&String> {
        self.etag.as_ref()
    }

    /// Set ETag (for after successful upload)
    pub fn set_etag(&mut self, etag: String) {
        self.etag = Some(etag);
    }

    /// Unlock vault with recovery key
    pub fn unlock_with_recovery_key(self, recovery_key: &str) -> Result<UnlockedVault> {
        use base64::Engine;

        let recovery_key = crate::crypto::RecoveryKey::from_display_string(recovery_key)?;
        let kek = recovery_key.derive_kek(&self.vault_file.meta.argon2_params)?;

        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(&self.vault_file.meta.encrypted_dek_recovery)
            .map_err(|_| VaultError::DecryptionError("Invalid base64 in encrypted_dek_recovery".to_string()))?;
        let dek = Dek::unwrap(&encrypted_dek_bytes, &kek)?;

        let contents = crate::crypto::encryption::decrypt_vault(&self.vault_file.encrypted_vault, &dek)?;

        Ok(UnlockedVault {
            meta: self.vault_file.meta,
            contents,
            dek,
            etag: self.etag,
        })
    }
}

impl UnlockedVault {

    /// List entries
    pub fn list_entries(&self, filter: &EntryFilter) -> Result<Vec<Entry>> {
        let mut result = Vec::new();
        for (id, vault_entry) in &self.contents.entries {
            if filter.matches(vault_entry) {
                result.push(vault_entry_to_entry(id.clone(), vault_entry));
            }
        }
        Ok(result)
    }

    /// Get single entry (decrypted)
    pub fn get_entry(&self, id: &str) -> Result<Option<Entry>> {
        Ok(self.contents.entries.get(id).map(|e| vault_entry_to_entry(id.to_string(), e)))
    }

    /// Create entry
    pub fn create_entry(
        &mut self,
        name: String,
        entry_type: crate::models::EntryType,
        data: EntryData,
        label_ids: Vec<String>,
    ) -> Result<Entry> {
        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();

        let vault_entry = VaultEntry {
            entry_type,
            name: name.clone(),
            created_at: now,
            updated_at: now,
            deleted_at: None,
            purged_at: None,
            is_favorite: false,
            label_ids: label_ids.clone(),
            typed_value: zeroize::Zeroizing::new(data.typed_value.to_string()),
            notes: data.notes.clone(),
            custom_fields: data.custom_fields.clone(),
        };

        self.contents.entries.insert(id.clone(), vault_entry.clone());

        Ok(Entry {
            id,
            name,
            entry_type,
            is_favorite: false,
            updated_at: now,
            deleted_at: None,
            data,
            labels: label_ids,
        })
    }

    /// Update entry
    pub fn update_entry(&mut self, id: &str, name: String, data: EntryData) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        entry.name = name;
        entry.typed_value = zeroize::Zeroizing::new(data.typed_value.to_string());
        entry.notes = data.notes.clone();
        entry.custom_fields = data.custom_fields.clone();
        entry.updated_at = chrono::Utc::now().timestamp();

        Ok(())
    }

    /// Delete entry (soft delete to trash)
    pub fn delete_entry(&mut self, id: &str) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;
        let now = chrono::Utc::now().timestamp();
        entry.deleted_at = Some(now);
        entry.updated_at = now;
        Ok(())
    }

    /// Restore entry from trash
    pub fn restore_entry(&mut self, id: &str) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;
        entry.deleted_at = None;
        Ok(())
    }

    /// Permanently delete entry (converts to tombstone)
    /// Clears sensitive data and marks as purged for sync-safe deletion
    pub fn purge_entry(&mut self, id: &str) -> Result<()> {
        use chrono::Utc;

        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;

        let now = Utc::now().timestamp();

        // Ensure entry is marked as deleted first
        if entry.deleted_at.is_none() {
            entry.deleted_at = Some(now);
        }

        // Convert to tombstone: clear sensitive data and mark as purged
        entry.purged_at = Some(now);
        entry.updated_at = now;
        entry.name = String::new();
        entry.typed_value = zeroize::Zeroizing::new("{}".to_string());
        entry.notes = None;
        entry.custom_fields = None;
        entry.label_ids.clear();

        Ok(())
    }

    /// Set entry favorite
    pub fn set_favorite(&mut self, id: &str, is_favorite: bool) -> Result<()> {
        let entry = self.contents.entries.get_mut(id)
            .ok_or_else(|| VaultError::EntryNotFound(id.to_string()))?;
        entry.is_favorite = is_favorite;
        Ok(())
    }

    /// List labels
    pub fn list_labels(&self) -> Result<Vec<Label>> {
        let mut result = Vec::new();
        for (id, label) in &self.contents.labels {
            result.push(Label {
                id: id.clone(),
                name: label.name.clone(),
            });
        }
        Ok(result)
    }

    /// Create label
    pub fn create_label(&mut self, name: String) -> Result<Label> {
        let id = uuid::Uuid::new_v4().to_string();
        self.contents.labels.insert(id.clone(), LabelValue {
            name: name.clone(),
            deleted_at: None,
        });
        Ok(Label { id, name })
    }

    /// Delete label (converts to tombstone)
    /// Marks label as deleted for sync-safe deletion, removes from entries
    pub fn delete_label(&mut self, id: &str) -> Result<()> {
        use chrono::Utc;

        let label = self.contents.labels.get_mut(id)
            .ok_or_else(|| VaultError::LabelNotFound(id.to_string()))?;

        let now = Utc::now().timestamp();
        label.deleted_at = Some(now);

        // Remove label_id from all entries
        for entry in self.contents.entries.values_mut() {
            entry.label_ids.retain(|label_id| label_id != id);
        }

        Ok(())
    }

    /// Rename label
    pub fn rename_label(&mut self, id: &str, new_name: String) -> Result<()> {
        let label = self.contents.labels.get_mut(id)
            .ok_or_else(|| VaultError::LabelNotFound(id.to_string()))?;
        label.name = new_name;
        Ok(())
    }

    /// Set entry labels
    pub fn set_entry_labels(&mut self, entry_id: &str, label_ids: Vec<String>) -> Result<()> {
        let entry = self.contents.entries.get_mut(entry_id)
            .ok_or_else(|| VaultError::EntryNotFound(entry_id.to_string()))?;
        entry.label_ids = label_ids;
        Ok(())
    }

    /// Change master password
    pub fn change_master_password(&mut self, old_password: &str, new_password: &str) -> Result<()> {
        use base64::Engine;

        // Verify old password
        let old_kek = crate::crypto::kdf::derive_kek(old_password, &self.meta.argon2_params)?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _old_dek = Dek::unwrap(&encrypted_dek_bytes, &old_kek)?;

        // Derive new KEK from new password
        let new_kek = crate::crypto::kdf::derive_kek(new_password, &self.meta.argon2_params)?;
        let encrypted_dek_master = self.dek.wrap(&new_kek)?;

        // Update vault_meta
        let engine = base64::engine::general_purpose::STANDARD;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);

        Ok(())
    }

    /// Rotate DEK and regenerate recovery key
    /// Returns the new recovery key for user to save
    pub fn rotate_dek(&mut self, master_password: &str) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify master password first
        let kek_master = crate::crypto::kdf::derive_kek(master_password, &self.meta.argon2_params)?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _verified_dek = Dek::unwrap(&encrypted_dek_bytes, &kek_master)?;

        // Generate new DEK
        let new_dek = Dek::generate();
        let encrypted_dek_master = new_dek.wrap(&kek_master)?;

        // Generate new recovery key
        let new_recovery_key = crate::crypto::RecoveryKey::generate();
        let kek_recovery = new_recovery_key.derive_kek(&self.meta.argon2_params)?;
        let encrypted_dek_recovery = new_dek.wrap(&kek_recovery)?;

        // Update vault state
        self.dek = new_dek;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);
        self.meta.encrypted_dek_recovery = engine.encode(&encrypted_dek_recovery);

        Ok(new_recovery_key)
    }

    /// Upgrade Argon2 parameters for stronger key derivation
    pub fn upgrade_argon2_params(&mut self, master_password: &str, new_params: Argon2Params) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify password with old params
        let old_kek = crate::crypto::kdf::derive_kek(master_password, &self.meta.argon2_params)?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _old_dek = Dek::unwrap(&encrypted_dek_bytes, &old_kek)?;

        // Derive new KEK with new params
        let new_kek = crate::crypto::kdf::derive_kek(master_password, &new_params)?;
        let encrypted_dek_master = self.dek.wrap(&new_kek)?;

        // Generate new recovery key with new params
        let new_recovery_key = crate::crypto::RecoveryKey::generate();
        let kek_recovery = new_recovery_key.derive_kek(&new_params)?;
        let encrypted_dek_recovery = self.dek.wrap(&kek_recovery)?;

        // Update vault_meta
        self.meta.argon2_params = new_params;
        self.meta.encrypted_dek_master = engine.encode(&encrypted_dek_master);
        self.meta.encrypted_dek_recovery = engine.encode(&encrypted_dek_recovery);

        Ok(new_recovery_key)
    }

    /// Regenerate recovery key
    pub fn regenerate_recovery_key(&mut self, master_password: &str) -> Result<crate::crypto::RecoveryKey> {
        use base64::Engine;

        // Verify master password
        let kek_master = crate::crypto::kdf::derive_kek(master_password, &self.meta.argon2_params)?;
        let engine = base64::engine::general_purpose::STANDARD;
        let encrypted_dek_bytes = engine.decode(&self.meta.encrypted_dek_master)
            .map_err(|_| VaultError::DecryptionError("Invalid base64".to_string()))?;
        let _verified_dek = Dek::unwrap(&encrypted_dek_bytes, &kek_master)?;

        // Generate new recovery key
        let new_recovery_key = crate::crypto::RecoveryKey::generate();
        let kek_recovery = new_recovery_key.derive_kek(&self.meta.argon2_params)?;
        let encrypted_dek_recovery = self.dek.wrap(&kek_recovery)?;

        // Update vault_meta
        self.meta.encrypted_dek_recovery = engine.encode(&encrypted_dek_recovery);

        Ok(new_recovery_key)
    }

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
        crate::sync::apply_gc_to_contents(&mut self.contents);

        // Push merged state back to remote
        let new_etag = self.push(storage).await?;
        self.etag = Some(new_etag.clone());

        Ok(crate::sync::SyncResult::success(Some(new_etag)))
    }

    /// Resolve sync conflicts
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

    fn to_vault_file(&self) -> Result<VaultFile> {
        let encrypted_vault = crate::crypto::encryption::encrypt_vault(&self.contents, &self.dek)?;
        Ok(VaultFile {
            schema_version: CURRENT_SCHEMA_VERSION,
            meta: self.meta.clone(),
            encrypted_vault,
        })
    }
}

/// Helper function to convert VaultEntry to Entry
fn vault_entry_to_entry(id: String, e: &VaultEntry) -> Entry {
    // Convert typed_value back to EntryData
    // Zeroizing<String> contains JSON that needs to be parsed
    let typed_value = serde_json::from_str(e.typed_value.as_ref())
        .unwrap_or_else(|_| serde_json::json!({}));

    let data = EntryData {
        entry_type: e.entry_type,
        typed_value,
        notes: e.notes.clone(),
        custom_fields: e.custom_fields.clone(),
    };

    Entry {
        id,
        name: e.name.clone(),
        entry_type: e.entry_type,
        is_favorite: e.is_favorite,
        updated_at: e.updated_at,
        deleted_at: e.deleted_at,
        data,
        labels: e.label_ids.clone(),
    }
}
