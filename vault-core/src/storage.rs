use crate::error::Result;
use async_trait::async_trait;

#[cfg(not(target_arch = "wasm32"))]
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

#[cfg(target_arch = "wasm32")]
#[async_trait(?Send)]
pub trait StorageBackend {
    /// Download vault file from storage
    /// Returns (file_bytes, etag) if file exists, or None if not found
    async fn download(&self) -> Result<Option<(Vec<u8>, String)>>;

    /// Upload vault file to storage with conditional write
    /// etag = None → first upload (no If-Match)
    /// Returns new etag on success, or ConflictDetected if conditions don't match
    async fn upload(&self, data: &[u8], etag: Option<&str>) -> Result<String>;
}
