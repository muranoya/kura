use crate::error::{Result, VaultError};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone)]
pub struct VaultConfig {
    pub storage: StorageConfig,
}

#[derive(Debug, Clone)]
pub enum StorageConfig {
    Local { dir: PathBuf },
    S3(S3Config),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3Config {
    pub region: String,
    pub bucket: String,
    pub key: String,
    #[serde(alias = "accessKeyId")]
    pub access_key_id: String,
    #[serde(alias = "secretAccessKey")]
    pub secret_access_key: String,
    pub endpoint: Option<String>, // For S3-compatible services like MinIO
}

impl VaultConfig {
    pub fn new_local(dir: PathBuf) -> Self {
        VaultConfig {
            storage: StorageConfig::Local { dir },
        }
    }

    pub fn new_s3(config: S3Config) -> Self {
        VaultConfig {
            storage: StorageConfig::S3(config),
        }
    }
}

impl S3Config {
    pub fn validate(&self) -> Result<()> {
        if self.region.is_empty() {
            return Err(VaultError::InvalidConfiguration(
                "S3 region is empty".to_string(),
            ));
        }
        if self.bucket.is_empty() {
            return Err(VaultError::InvalidConfiguration(
                "S3 bucket is empty".to_string(),
            ));
        }
        if self.access_key_id.is_empty() {
            return Err(VaultError::InvalidConfiguration(
                "S3 access key ID is empty".to_string(),
            ));
        }
        if self.secret_access_key.is_empty() {
            return Err(VaultError::InvalidConfiguration(
                "S3 secret access key is empty".to_string(),
            ));
        }
        Ok(())
    }
}
