use async_trait::async_trait;
use crate::error::{Result, VaultError};
use crate::config::S3Config;
use super::StorageBackend;

#[cfg(feature = "storage-s3")]
mod native {
    use super::*;
    use aws_sdk_s3::error::ProvideErrorMetadata;

    pub struct S3Storage {
        client: aws_sdk_s3::Client,
        bucket: String,
        key: String,
    }

    impl S3Storage {
        pub async fn new(config: S3Config) -> Result<Self> {
            config.validate()?;

            // Create AWS config with explicit credentials
            let credentials = aws_sdk_s3::config::Credentials::new(
                config.access_key_id.clone(),
                config.secret_access_key.clone(),
                None,
                None,
                "static",
            );

            let mut sdk_config_builder = aws_config::defaults(aws_config::BehaviorVersion::latest())
                .credentials_provider(credentials)
                .region(aws_config::Region::new(config.region.clone()));

            // Set endpoint if provided (for S3-compatible services)
            if let Some(endpoint) = &config.endpoint {
                sdk_config_builder = sdk_config_builder.endpoint_url(endpoint);
            }

            let sdk_config = sdk_config_builder.load().await;
            let client = aws_sdk_s3::Client::new(&sdk_config);

            Ok(S3Storage {
                client,
                bucket: config.bucket,
                key: config.key,
            })
        }
    }

    #[async_trait]
    impl StorageBackend for S3Storage {
        async fn download(&self) -> Result<Option<(Vec<u8>, String)>> {
            match self.client
                .get_object()
                .bucket(&self.bucket)
                .key(&self.key)
                .send()
                .await
            {
                Ok(response) => {
                    // Extract ETag
                    let etag = response.e_tag()
                        .unwrap_or(&String::new())
                        .trim_matches('"')
                        .to_string();

                    // Read object body
                    let data = response.body
                        .collect()
                        .await
                        .map_err(|e| VaultError::StorageError(format!("Failed to read S3 object: {}", e)))?
                        .into_bytes()
                        .to_vec();

                    Ok(Some((data, etag)))
                }
                Err(aws_sdk_s3::error::SdkError::ServiceError(ref e))
                    if e.err().is_no_such_key() => {
                    Ok(None)
                }
                Err(e) => {
                    let error_msg = match &e {
                        aws_sdk_s3::error::SdkError::ServiceError(service_err) => {
                            let code = service_err.err().code().unwrap_or("Unknown");
                            format!("S3 GetObject failed: {} - {}", code, e)
                        }
                        _ => format!("S3 GetObject failed: {}", e)
                    };
                    Err(VaultError::StorageError(error_msg))
                }
            }
        }

        async fn upload(&self, data: &[u8], etag: Option<&str>) -> Result<String> {
            // Build PutObject request
            let mut put_request = self.client
                .put_object()
                .bucket(&self.bucket)
                .key(&self.key)
                .body(aws_sdk_s3::primitives::ByteStream::from(data.to_vec()));

            // Add If-Match condition if provided and not empty
            if let Some(expected_etag) = etag {
                if !expected_etag.is_empty() {
                    put_request = put_request.if_match(expected_etag);
                }
            }

            // Send request
            match put_request.send().await {
                Ok(response) => {
                    let new_etag = response.e_tag()
                        .unwrap_or(&String::new())
                        .trim_matches('"')
                        .to_string();

                    Ok(new_etag)
                }
                Err(e) => {
                    // Check for precondition failed (If-Match mismatch) by error code
                    if let aws_sdk_s3::error::SdkError::ServiceError(service_err) = &e {
                        if let Some("PreconditionFailed") = service_err.err().code() {
                            return Err(VaultError::ConflictDetected);
                        }
                    }

                    // Generic error message
                    let error_msg = match &e {
                        aws_sdk_s3::error::SdkError::ServiceError(service_err) => {
                            let code = service_err.err().code().unwrap_or("Unknown");
                            format!("S3 PutObject failed: {} - {}", code, e)
                        }
                        _ => format!("S3 PutObject failed: {}", e)
                    };
                    Err(VaultError::StorageError(error_msg))
                }
            }
        }
    }
}


// Re-export the native S3 implementation (storage-s3 feature, native-only)
#[cfg(feature = "storage-s3")]
pub use native::S3Storage;
