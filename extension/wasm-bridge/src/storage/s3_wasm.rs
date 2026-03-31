use async_trait::async_trait;
use vault_core::config::S3Config;
use vault_core::error::{Result, VaultError};
use vault_core::StorageBackend;
use wasm_bindgen::JsCast;

fn get_wasm_datetime() -> String {
    let now_ms = js_sys::Date::now() as i64;
    let now_secs = now_ms / 1000;
    let nanos = ((now_ms % 1000) * 1_000_000) as u32;

    match chrono::DateTime::<chrono::Utc>::from_timestamp(now_secs, nanos) {
        Some(dt) => dt.format("%Y%m%dT%H%M%SZ").to_string(),
        None => {
            format!("{}T000000Z", now_secs / 86400 + 719162)
        }
    }
}

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
                let ep_trimmed = ep.trim_end_matches('/');
                let full_endpoint = if ep_trimmed.starts_with("http://") || ep_trimmed.starts_with("https://") {
                    ep_trimmed.to_string()
                } else {
                    format!("https://{}", ep_trimmed)
                };
                format!(
                    "{}/{}/{}",
                    full_endpoint,
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
}

#[async_trait(?Send)]
impl StorageBackend for WasmS3Storage {
    async fn download(&self) -> Result<Option<(Vec<u8>, String)>> {
        let url = self.object_url();
        let datetime = get_wasm_datetime();

        let signed = super::s3_sigv4::sign_get_request(
            &url,
            &self.config.region,
            &self.config.access_key_id,
            &self.config.secret_access_key,
            &datetime,
        );

        let headers = web_sys::Headers::new()
            .map_err(|_| VaultError::StorageError("Failed to create Headers".into()))?;

        headers
            .set("Authorization", &signed.authorization)
            .map_err(|_| VaultError::StorageError("Failed to set Authorization header".into()))?;
        headers
            .set("x-amz-date", &signed.x_amz_date)
            .map_err(|_| VaultError::StorageError("Failed to set x-amz-date header".into()))?;
        headers
            .set("x-amz-content-sha256", &signed.x_amz_content_sha256)
            .map_err(|_| VaultError::StorageError("Failed to set x-amz-content-sha256 header".into()))?;

        let abort_controller = web_sys::AbortController::new()
            .map_err(|_| VaultError::StorageError("AbortController creation failed".into()))?;
        let signal = abort_controller.signal();

        let mut init = web_sys::RequestInit::new();
        init.set_method("GET");
        init.set_headers(&headers);
        init.set_mode(web_sys::RequestMode::Cors);
        init.set_signal(Some(&signal));

        let request = web_sys::Request::new_with_str_and_init(&url, &init)
            .map_err(|_| VaultError::StorageError("Failed to create request".into()))?;

        let closure = wasm_bindgen::closure::Closure::once(move || {
            abort_controller.abort();
        });
        let global = js_sys::global();
        let set_timeout = js_sys::Reflect::get(&global, &"setTimeout".into())
            .and_then(|v| v.dyn_into::<js_sys::Function>())
            .map_err(|_| VaultError::StorageError("setTimeout not available".into()))?;
        set_timeout
            .call2(&global, closure.as_ref().unchecked_ref(), &wasm_bindgen::JsValue::from(3000u32))
            .map_err(|_| VaultError::StorageError("Failed to set timeout".into()))?;
        closure.forget();

        let fetch_fn = js_sys::Reflect::get(&global, &wasm_bindgen::JsValue::from_str("fetch"))
            .map_err(|_| VaultError::StorageError("Failed to get fetch from global".into()))?
            .dyn_into::<js_sys::Function>()
            .map_err(|_| VaultError::StorageError("fetch is not a function".into()))?;
        let fetch_result = fetch_fn
            .call1(&global, &request)
            .map_err(|_| VaultError::StorageError("Failed to call fetch".into()))?;
        let promise: js_sys::Promise = fetch_result
            .dyn_into()
            .map_err(|_| VaultError::StorageError("Fetch result is not a Promise".into()))?;
        let resp_val = wasm_bindgen_futures::JsFuture::from(promise)
            .await
            .map_err(|e| VaultError::StorageError(format!("Fetch failed: {:?}", e)))?;

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

        let etag = response
            .headers()
            .get("etag")
            .map_err(|_| VaultError::StorageError("Failed to read ETag header".into()))?
            .unwrap_or_default()
            .trim_matches('"')
            .to_string();

        let array_buffer_promise = response
            .array_buffer()
            .map_err(|_| VaultError::StorageError("Failed to get array_buffer".into()))?;

        let buf_val = wasm_bindgen_futures::JsFuture::from(array_buffer_promise)
            .await
            .map_err(|e| VaultError::StorageError(format!("Reading array_buffer failed: {:?}", e)))?;

        let array_buffer = js_sys::ArrayBuffer::from(buf_val);
        let uint8_array = js_sys::Uint8Array::new(&array_buffer);
        let data = uint8_array.to_vec();

        Ok(Some((data, etag)))
    }

    async fn upload(&self, data: &[u8], etag: Option<&str>) -> Result<String> {
        let url = self.object_url();
        let datetime = get_wasm_datetime();

        let signed = super::s3_sigv4::sign_put_request(
            &url,
            &self.config.region,
            &self.config.access_key_id,
            &self.config.secret_access_key,
            &datetime,
            data,
            etag,
        );

        let headers = web_sys::Headers::new()
            .map_err(|_| VaultError::StorageError("Failed to create Headers".into()))?;

        headers
            .set("Authorization", &signed.authorization)
            .map_err(|_| VaultError::StorageError("Failed to set Authorization header".into()))?;
        headers
            .set("x-amz-date", &signed.x_amz_date)
            .map_err(|_| VaultError::StorageError("Failed to set x-amz-date header".into()))?;
        headers
            .set("x-amz-content-sha256", &signed.x_amz_content_sha256)
            .map_err(|_| VaultError::StorageError("Failed to set x-amz-content-sha256 header".into()))?;
        headers
            .set("Content-Type", "application/json")
            .map_err(|_| VaultError::StorageError("Failed to set Content-Type header".into()))?;

        if let Some(if_match_val) = &signed.if_match {
            headers.set("If-Match", if_match_val).map_err(|_| {
                VaultError::StorageError("Failed to set If-Match header".into())
            })?;
        }

        let uint8_array = js_sys::Uint8Array::from(data);
        let body_val: wasm_bindgen::JsValue = uint8_array.into();

        let abort_controller = web_sys::AbortController::new()
            .map_err(|_| VaultError::StorageError("AbortController creation failed".into()))?;
        let signal = abort_controller.signal();

        let mut init = web_sys::RequestInit::new();
        init.set_method("PUT");
        init.set_headers(&headers);
        init.set_body(&body_val);
        init.set_mode(web_sys::RequestMode::Cors);
        init.set_signal(Some(&signal));

        let request = web_sys::Request::new_with_str_and_init(&url, &init)
            .map_err(|_| VaultError::StorageError("Failed to create request".into()))?;

        let closure = wasm_bindgen::closure::Closure::once(move || {
            abort_controller.abort();
        });
        let global = js_sys::global();
        let set_timeout = js_sys::Reflect::get(&global, &"setTimeout".into())
            .and_then(|v| v.dyn_into::<js_sys::Function>())
            .map_err(|_| VaultError::StorageError("setTimeout not available".into()))?;
        set_timeout
            .call2(&global, closure.as_ref().unchecked_ref(), &wasm_bindgen::JsValue::from(3000u32))
            .map_err(|_| VaultError::StorageError("Failed to set timeout".into()))?;
        closure.forget();

        let fetch_fn = js_sys::Reflect::get(&global, &wasm_bindgen::JsValue::from_str("fetch"))
            .map_err(|_| VaultError::StorageError("Failed to get fetch from global".into()))?
            .dyn_into::<js_sys::Function>()
            .map_err(|_| VaultError::StorageError("fetch is not a function".into()))?;
        let fetch_result = fetch_fn
            .call1(&global, &request)
            .map_err(|_| VaultError::StorageError("Failed to call fetch".into()))?;
        let promise: js_sys::Promise = fetch_result
            .dyn_into()
            .map_err(|_| VaultError::StorageError("Fetch result is not a Promise".into()))?;
        let resp_val = wasm_bindgen_futures::JsFuture::from(promise)
            .await
            .map_err(|e| VaultError::StorageError(format!("Fetch failed: {:?}", e)))?;

        let response: web_sys::Response = resp_val
            .dyn_into()
            .map_err(|_| VaultError::StorageError("Response cast failed".into()))?;

        let status = response.status();

        if status == 412 {
            return Err(VaultError::ConflictDetected);
        }

        if status != 200 && status != 204 {
            return Err(VaultError::StorageError(format!(
                "PUT failed with status {}",
                status
            )));
        }

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
