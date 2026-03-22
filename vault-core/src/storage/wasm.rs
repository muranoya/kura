//! WASM用S3ストレージ実装
//!
//! web-sys の fetch API を使って S3 互換ストレージに直接アクセス。
//! 初期実装では基本的な GET/PUT のみ。署名はサーバーサイドで行うか、
//! 別途認証メカニズムが必要。

use crate::config::S3Config;
use crate::error::VaultError;
use crate::storage::StorageBackend;
use async_trait::async_trait;
use js_sys::Uint8Array;
use wasm_bindgen::JsCast;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, RequestMode, Response};

/// WASM環境用S3ストレージバックエンド
pub struct WasmS3Storage {
    config: S3Config,
}

impl WasmS3Storage {
    pub fn new(config: S3Config) -> Self {
        Self { config }
    }
}

// WASM環境では async-trait の Send 制約が問題になるため、
// 手動で Future を返す実装にしている
// （実装が複雑なため、初期版では同期的な fetch API を使用）
#[async_trait]
impl StorageBackend for WasmS3Storage {
    async fn download(&self) -> Result<Option<(Vec<u8>, String)>, VaultError> {
        let window = web_sys::window()
            .ok_or_else(|| VaultError::InvalidConfiguration("No window object".to_string()))?;

        // S3 URL を構築（endpoint が指定されている場合は S3 互換）
        let endpoint = self.config.endpoint.as_deref().unwrap_or("s3.amazonaws.com");
        let url = format!(
            "https://{}.{}/{}",
            self.config.bucket, endpoint, self.config.key
        );

        let mut init = RequestInit::new();
        init.set_method("GET");
        init.set_mode(RequestMode::Cors);

        let request = Request::new_with_str_and_init(&url, &init)
            .map_err(|_| VaultError::StorageError("Failed to create request".to_string()))?;

        let resp_value = JsFuture::from(window.fetch_with_request(&request))
            .await
            .map_err(|_| VaultError::StorageError("Fetch failed".to_string()))?;

        let resp: Response = resp_value
            .dyn_into()
            .map_err(|_| VaultError::StorageError("Invalid response".to_string()))?;

        // 404: ファイル未存在
        if resp.status() == 404 {
            return Ok(None);
        }

        if !resp.ok() {
            let status = resp.status();
            return Err(VaultError::StorageError(format!("HTTP error: {}", status)));
        }

        // ETag を取得
        let etag = resp
            .headers()
            .get("etag")
            .map_err(|_| VaultError::StorageError("Failed to get ETag".to_string()))?
            .unwrap_or_else(|| "".to_string());

        // バイナリデータを取得
        let array_buffer = JsFuture::from(
            resp.array_buffer()
                .map_err(|_| VaultError::StorageError("Failed to read response body".to_string()))?,
        )
        .await
        .map_err(|_| VaultError::StorageError("Failed to read array buffer".to_string()))?;

        let uint8_array = Uint8Array::new(&array_buffer);
        let mut bytes = vec![0; uint8_array.length() as usize];
        uint8_array.copy_to(&mut bytes);

        Ok(Some((bytes, etag)))
    }

    async fn upload(&self, data: &[u8], etag: Option<&str>) -> Result<String, VaultError> {
        let window = web_sys::window()
            .ok_or_else(|| VaultError::InvalidConfiguration("No window object".to_string()))?;

        let endpoint = self.config.endpoint.as_deref().unwrap_or("s3.amazonaws.com");
        let url = format!(
            "https://{}.{}/{}",
            self.config.bucket, endpoint, self.config.key
        );

        let mut init = RequestInit::new();
        init.set_method("PUT");
        init.set_mode(RequestMode::Cors);

        // ペイロードを Uint8Array に変換して設定
        let uint8_array = Uint8Array::from(data);
        init.set_body(&uint8_array);

        let request = Request::new_with_str_and_init(&url, &init)
            .map_err(|_| VaultError::StorageError("Failed to create request".to_string()))?;

        // If-Match ヘッダーを付与（Conditional Write）
        if let Some(e) = etag {
            request
                .headers()
                .set("If-Match", e)
                .ok();
        }

        let resp_value = JsFuture::from(window.fetch_with_request(&request))
            .await
            .map_err(|_| VaultError::StorageError("Fetch failed".to_string()))?;

        let resp: Response = resp_value
            .dyn_into()
            .map_err(|_| VaultError::StorageError("Invalid response".to_string()))?;

        // 409: Conflict（ETag不一致）
        if resp.status() == 409 {
            return Err(VaultError::ConflictDetected);
        }

        if !resp.ok() {
            let status = resp.status();
            return Err(VaultError::StorageError(format!("HTTP error: {}", status)));
        }

        // 新しい ETag を取得
        let new_etag = resp
            .headers()
            .get("etag")
            .map_err(|_| VaultError::StorageError("Failed to get ETag".to_string()))?
            .unwrap_or_else(|| "".to_string());

        Ok(new_etag)
    }
}
