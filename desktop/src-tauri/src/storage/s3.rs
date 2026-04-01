use async_trait::async_trait;
use aws_sdk_s3::error::ProvideErrorMetadata;
use tokio::time::{timeout, Duration};
use vault_core::error::{Result, VaultError};
use vault_core::config::S3Config;
use vault_core::StorageBackend;

const S3_TIMEOUT: Duration = Duration::from_secs(3);

pub struct S3Storage {
    client: aws_sdk_s3::Client,
    bucket: String,
    key: String,
}

impl S3Storage {
    pub async fn new(config: S3Config) -> Result<Self> {
        config.validate()?;

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

        if let Some(endpoint) = &config.endpoint {
            sdk_config_builder = sdk_config_builder.endpoint_url(endpoint);
        }

        let sdk_config = sdk_config_builder.load().await;

        let mut s3_config_builder = aws_sdk_s3::config::Builder::from(&sdk_config);
        if config.endpoint.is_some() {
            s3_config_builder = s3_config_builder.force_path_style(true);
        }
        let client = aws_sdk_s3::Client::from_conf(s3_config_builder.build());

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
        let result = timeout(S3_TIMEOUT, async {
            match self.client
                .get_object()
                .bucket(&self.bucket)
                .key(&self.key)
                .send()
                .await
            {
                Ok(response) => {
                    let etag = response.e_tag()
                        .unwrap_or(&String::new())
                        .trim_matches('"')
                        .to_string();

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
        }).await
        .map_err(|_| VaultError::StorageError("S3 operation timed out".to_string()))?;

        result
    }

    async fn upload(&self, data: &[u8], etag: Option<&str>) -> Result<String> {
        let result = timeout(S3_TIMEOUT, async {
            let mut put_request = self.client
                .put_object()
                .bucket(&self.bucket)
                .key(&self.key)
                .body(aws_sdk_s3::primitives::ByteStream::from(data.to_vec()));

            if let Some(expected_etag) = etag {
                if !expected_etag.is_empty() {
                    put_request = put_request.if_match(expected_etag);
                }
            }

            match put_request.send().await {
                Ok(response) => {
                    let new_etag = response.e_tag()
                        .unwrap_or(&String::new())
                        .trim_matches('"')
                        .to_string();

                    Ok(new_etag)
                }
                Err(e) => {
                    if let aws_sdk_s3::error::SdkError::ServiceError(service_err) = &e {
                        if let Some("PreconditionFailed") = service_err.err().code() {
                            return Err(VaultError::ConflictDetected);
                        }
                    }

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
        }).await
        .map_err(|_| VaultError::StorageError("S3 operation timed out".to_string()))?;

        result
    }
}
