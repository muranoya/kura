use thiserror::Error;

#[derive(Error, Debug)]
pub enum VaultError {
    #[error("Invalid master password")]
    InvalidMasterPassword,

    #[error("Invalid recovery key")]
    InvalidRecoveryKey,

    #[error("Entry not found: {0}")]
    EntryNotFound(String),

    #[error("Label not found: {0}")]
    LabelNotFound(String),

    #[error("Encryption error: {0}")]
    EncryptionError(String),

    #[error("Decryption error: {0}")]
    DecryptionError(String),

    #[error("Storage error: {0}")]
    StorageError(String),

    #[error("Sync conflict detected - remote was modified")]
    ConflictDetected,

    #[error("Sync conflict resolution failed")]
    ConflictResolutionFailed,

    #[error("Invalid configuration")]
    InvalidConfiguration(String),

    #[error("JSON serialization error: {0}")]
    JsonError(#[from] serde_json::Error),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Vault is locked")]
    VaultLocked,

    #[error("Invalid UUID format")]
    InvalidUuid,

    #[error("Invalid base32 encoding")]
    InvalidBase32,

    #[error("Invalid input: {0}")]
    InvalidInput(String),

    #[error("Unsupported schema version: {0}")]
    UnsupportedSchemaVersion(u32),
}

pub type Result<T> = std::result::Result<T, VaultError>;
