pub mod local;
#[cfg(feature = "storage-s3")]
pub mod s3;
#[cfg(all(feature = "storage-s3-wasm", target_arch = "wasm32"))]
pub mod s3_sigv4;
#[cfg(all(feature = "storage-s3-wasm", target_arch = "wasm32"))]
pub mod s3_wasm;

use async_trait::async_trait;
use crate::error::Result;

#[async_trait]
pub trait StorageBackend: Send + Sync {
    /// Download vault file from storage
    /// Returns (file_bytes, etag) if file exists, or None if not found
    async fn download(&self) -> Result<Option<(Vec<u8>, String)>>;

    /// Upload vault file to storage with conditional write
    /// etag = None → first upload (no If-Match)
    /// Returns new etag on success, or ConflictDetected if conditions don't match
    async fn upload(&self, data: &[u8], etag: Option<&str>) -> Result<String>;
}

#[cfg(all(feature = "storage-s3-wasm", target_arch = "wasm32"))]
pub use s3_wasm::WasmS3Storage;
