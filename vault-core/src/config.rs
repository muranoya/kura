use crate::error::{Result, VaultError};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone)]
pub struct VaultConfig {
    pub storage: S3Config,
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
    pub fn new(storage: S3Config) -> Self {
        VaultConfig { storage }
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
        if self.key.is_empty() {
            return Err(VaultError::InvalidConfiguration(
                "S3 object key is empty".to_string(),
            ));
        }
        Ok(())
    }
}
