/// WASM-compatible S3 backend using web-sys fetch API
/// Uses manual AWS Signature V4 signing
///
/// Note: WasmS3Storage does NOT implement StorageBackend trait
/// because web-sys types (!Send) are incompatible with the trait's Send requirement.
/// Instead, it's called directly from wasm_api.rs.

#[cfg(all(feature = "storage-s3-wasm", target_arch = "wasm32"))]
mod wasm_impl {
    use crate::config::S3Config;
    use crate::error::{Result, VaultError};
    use wasm_bindgen::JsCast;

    pub struct WasmS3Storage {
        config: S3Config,
    }

    impl WasmS3Storage {
        pub fn new(config: S3Config) -> Result<Self> {
            config.validate()?;
            Ok(WasmS3Storage { config })
        }

        fn object_url(&self) -> String {
            let key = if self.config.key.is_empty() {
                "vault.json"
            } else {
                &self.config.key
            };
            match &self.config.endpoint {
                Some(ep) => {
                    format!(
                        "{}/{}/{}",
                        ep.trim_end_matches('/'),
                        self.config.bucket,
                        key
                    )
                }
                None => format!(
                    "https://{}.s3.{}.amazonaws.com/{}",
                    self.config.bucket, self.config.region, key
                ),
            }
        }

        /// Download vault file from S3 with conditional read
        pub async fn download(&self) -> Result<Option<(Vec<u8>, String)>> {
            let url = self.object_url();
            let datetime = chrono::Utc::now()
                .format("%Y%m%dT%H%M%SZ")
                .to_string();

            let signed = super::super::s3_sigv4::sign_get_request(
                &url,
                &self.config.region,
                &self.config.access_key_id,
                &self.config.secret_access_key,
                &datetime,
            );

            // Build headers
            let headers = web_sys::Headers::new()
                .map_err(|_| VaultError::StorageError("Failed to create Headers".into()))?;

            headers
                .set("Authorization", &signed.authorization)
                .map_err(|_| {
                    VaultError::StorageError("Failed to set Authorization header".into())
                })?;
            headers
                .set("x-amz-date", &signed.x_amz_date)
                .map_err(|_| {
                    VaultError::StorageError("Failed to set x-amz-date header".into())
                })?;
            headers
                .set("x-amz-content-sha256", &signed.x_amz_content_sha256)
                .map_err(|_| {
                    VaultError::StorageError("Failed to set x-amz-content-sha256 header".into())
                })?;

            // Build request
            let mut init = web_sys::RequestInit::new();
            init.method("GET");
            init.headers(&headers);
            init.mode(web_sys::RequestMode::Cors);

            let request = web_sys::Request::new_with_str_and_init(&url, &init)
                .map_err(|_| VaultError::StorageError("Failed to create request".into()))?;

            // Fetch
            let window = web_sys::window()
                .ok_or_else(|| VaultError::StorageError("No window object".into()))?;

            let resp_promise = window.fetch_with_request(&request);
            let resp_val = wasm_bindgen_futures::JsFuture::from(resp_promise)
                .await
                .map_err(|e| {
                    VaultError::StorageError(format!("Fetch failed: {:?}", e))
                })?;

            let response: web_sys::Response = resp_val
                .dyn_into()
                .map_err(|_| VaultError::StorageError("Response cast failed".into()))?;

            let status = response.status();
            if status == 404 {
                return Ok(None);
            }
            if status != 200 {
                return Err(VaultError::StorageError(format!(
                    "GET failed with status {}",
                    status
                )));
            }

            // Extract ETag (trim quotes)
            let etag = response
                .headers()
                .get("etag")
                .map_err(|_| VaultError::StorageError("Failed to read ETag header".into()))?
                .unwrap_or_default()
                .trim_matches('"')
                .to_string();

            // Read body as ArrayBuffer
            let array_buffer_promise = response
                .array_buffer()
                .map_err(|_| VaultError::StorageError("Failed to get array_buffer".into()))?;

            let buf_val = wasm_bindgen_futures::JsFuture::from(array_buffer_promise)
                .await
                .map_err(|e| {
                    VaultError::StorageError(format!("Reading array_buffer failed: {:?}", e))
                })?;

            let array_buffer = js_sys::ArrayBuffer::from(buf_val);
            let uint8_array = js_sys::Uint8Array::new(&array_buffer);
            let data = uint8_array.to_vec();

            Ok(Some((data, etag)))
        }

        /// Upload vault file to S3 with conditional write (If-Match)
        pub async fn upload(&self, data: &[u8], etag: Option<&str>) -> Result<String> {
            let url = self.object_url();
            let datetime = chrono::Utc::now()
                .format("%Y%m%dT%H%M%SZ")
                .to_string();

            let signed = super::super::s3_sigv4::sign_put_request(
                &url,
                &self.config.region,
                &self.config.access_key_id,
                &self.config.secret_access_key,
                &datetime,
                data,
                etag,
            );

            // Build headers
            let headers = web_sys::Headers::new()
                .map_err(|_| VaultError::StorageError("Failed to create Headers".into()))?;

            headers
                .set("Authorization", &signed.authorization)
                .map_err(|_| {
                    VaultError::StorageError("Failed to set Authorization header".into())
                })?;
            headers
                .set("x-amz-date", &signed.x_amz_date)
                .map_err(|_| {
                    VaultError::StorageError("Failed to set x-amz-date header".into())
                })?;
            headers
                .set("x-amz-content-sha256", &signed.x_amz_content_sha256)
                .map_err(|_| {
                    VaultError::StorageError("Failed to set x-amz-content-sha256 header".into())
                })?;
            headers
                .set("Content-Type", "application/json")
                .map_err(|_| {
                    VaultError::StorageError("Failed to set Content-Type header".into())
                })?;

            if let Some(if_match_val) = &signed.if_match {
                headers.set("If-Match", if_match_val).map_err(|_| {
                    VaultError::StorageError("Failed to set If-Match header".into())
                })?;
            }

            // Convert body to Uint8Array
            let uint8_array = js_sys::Uint8Array::from(data);
            let body_val: wasm_bindgen::JsValue = uint8_array.into();

            // Build request
            let mut init = web_sys::RequestInit::new();
            init.method("PUT");
            init.headers(&headers);
            init.body(Some(&body_val));
            init.mode(web_sys::RequestMode::Cors);

            let request = web_sys::Request::new_with_str_and_init(&url, &init)
                .map_err(|_| VaultError::StorageError("Failed to create request".into()))?;

            // Fetch
            let window = web_sys::window()
                .ok_or_else(|| VaultError::StorageError("No window object".into()))?;

            let resp_promise = window.fetch_with_request(&request);
            let resp_val = wasm_bindgen_futures::JsFuture::from(resp_promise)
                .await
                .map_err(|e| {
                    VaultError::StorageError(format!("Fetch failed: {:?}", e))
                })?;

            let response: web_sys::Response = resp_val
                .dyn_into()
                .map_err(|_| VaultError::StorageError("Response cast failed".into()))?;

            let status = response.status();

            // 412 Precondition Failed = ConflictDetected
            if status == 412 {
                return Err(VaultError::ConflictDetected);
            }

            // Accept 200 or 204 (some S3-compatible services return 204 for PUT)
            if status != 200 && status != 204 {
                return Err(VaultError::StorageError(format!(
                    "PUT failed with status {}",
                    status
                )));
            }

            // Extract new ETag (trim quotes)
            let new_etag = response
                .headers()
                .get("etag")
                .map_err(|_| VaultError::StorageError("Failed to read ETag header".into()))?
                .unwrap_or_default()
                .trim_matches('"')
                .to_string();

            Ok(new_etag)
        }
    }
}

#[cfg(all(feature = "storage-s3-wasm", target_arch = "wasm32"))]
pub use wasm_impl::WasmS3Storage;

// Provide a stub export for non-WASM targets to avoid compilation errors
#[cfg(not(all(feature = "storage-s3-wasm", target_arch = "wasm32")))]
pub struct WasmS3Storage;
