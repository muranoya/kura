/// AWS Signature Version 4 signing for S3
/// Pure computation module - no I/O, no async, works on all targets

use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Clone)]
pub struct SignedHeaders {
    pub authorization: String,
    pub x_amz_date: String,
    pub x_amz_content_sha256: String,
    pub if_match: Option<String>,
}

/// Sign a GET request (for download)
/// url: full URL including path (e.g., "https://bucket.s3.region.amazonaws.com/vault.json")
/// datetime: ISO8601 format "20240101T120000Z"
pub fn sign_get_request(
    url: &str,
    region: &str,
    access_key_id: &str,
    secret_access_key: &str,
    datetime: &str,
) -> SignedHeaders {
    let date = &datetime[..8];

    // Empty body SHA256
    let payload_hash = sha256_hex(b"");

    // Extract host from URL
    let host = extract_host(url);
    let uri = extract_path(url);

    // Canonical headers (alphabetically sorted lowercase names)
    let canonical_headers = format!(
        "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        host, payload_hash, datetime
    );

    // Signed headers list (alphabetically sorted, semicolon-separated)
    let signed_headers = "host;x-amz-content-sha256;x-amz-date";

    // Canonical request
    let canonical_request = format!(
        "GET\n{}\n\n{}\n{}",
        uri, canonical_headers, signed_headers
    );

    // Canonical request hash
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());

    // Credential scope
    let credential_scope = format!("{}/{}/s3/aws4_request", date, region);

    // String to sign
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        datetime, credential_scope, canonical_request_hash
    );

    // Derive signing key
    let signing_key = derive_signing_key(secret_access_key, date, region);

    // Calculate signature
    let signature = {
        let mut mac = HmacSha256::new_from_slice(&signing_key).unwrap();
        mac.update(string_to_sign.as_bytes());
        to_hex(&mac.finalize().into_bytes())
    };

    // Build Authorization header
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key_id, credential_scope, signed_headers, signature
    );

    SignedHeaders {
        authorization,
        x_amz_date: datetime.to_string(),
        x_amz_content_sha256: payload_hash,
        if_match: None,
    }
}

/// Sign a PUT request (for upload)
/// body: raw bytes being uploaded
/// etag: If-Match value for conditional write (None for first upload)
pub fn sign_put_request(
    url: &str,
    region: &str,
    access_key_id: &str,
    secret_access_key: &str,
    datetime: &str,
    body: &[u8],
    etag: Option<&str>,
) -> SignedHeaders {
    let date = &datetime[..8];

    // Body SHA256
    let payload_hash = sha256_hex(body);

    // Extract host from URL
    let host = extract_host(url);
    let uri = extract_path(url);

    // Build canonical headers (must be alphabetically sorted by lowercase name)
    let mut canonical_headers = format!(
        "host:{}\nx-amz-content-sha256:{}\nx-amz-date:{}\n",
        host, payload_hash, datetime
    );

    // If-Match header (if provided)
    if let Some(if_match_val) = etag {
        canonical_headers.insert_str(0, &format!("if-match:{}\n", if_match_val));
    }

    // Signed headers list (alphabetically sorted, semicolon-separated)
    let mut signed_headers_vec = vec!["host", "x-amz-content-sha256", "x-amz-date"];
    if etag.is_some() {
        signed_headers_vec.insert(0, "if-match");
    }
    signed_headers_vec.sort();
    let signed_headers = signed_headers_vec.join(";");

    // Canonical request
    let canonical_request = format!(
        "PUT\n{}\n\n{}\n{}",
        uri, canonical_headers, signed_headers
    );

    // Canonical request hash
    let canonical_request_hash = sha256_hex(canonical_request.as_bytes());

    // Credential scope
    let credential_scope = format!("{}/{}/s3/aws4_request", date, region);

    // String to sign
    let string_to_sign = format!(
        "AWS4-HMAC-SHA256\n{}\n{}\n{}",
        datetime, credential_scope, canonical_request_hash
    );

    // Derive signing key
    let signing_key = derive_signing_key(secret_access_key, date, region);

    // Calculate signature
    let signature = {
        let mut mac = HmacSha256::new_from_slice(&signing_key).unwrap();
        mac.update(string_to_sign.as_bytes());
        to_hex(&mac.finalize().into_bytes())
    };

    // Build Authorization header
    let authorization = format!(
        "AWS4-HMAC-SHA256 Credential={}/{}, SignedHeaders={}, Signature={}",
        access_key_id, credential_scope, signed_headers, signature
    );

    SignedHeaders {
        authorization,
        x_amz_date: datetime.to_string(),
        x_amz_content_sha256: payload_hash,
        if_match: etag.map(|s| s.to_string()),
    }
}

// ============================================================================
// Internal helper functions
// ============================================================================

/// SHA256 hash as lowercase hex string
fn sha256_hex(data: &[u8]) -> String {
    to_hex(&Sha256::digest(data))
}

/// Convert bytes to lowercase hex string
fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

/// HMAC-SHA256
fn hmac_sha256(key: &[u8], data: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("HMAC key size");
    mac.update(data);
    mac.finalize().into_bytes().to_vec()
}

/// Derive AWS SigV4 signing key
fn derive_signing_key(secret: &str, date: &str, region: &str) -> Vec<u8> {
    let k_secret = format!("AWS4{}", secret);
    let k_date = hmac_sha256(k_secret.as_bytes(), date.as_bytes());
    let k_region = hmac_sha256(&k_date, region.as_bytes());
    let k_service = hmac_sha256(&k_region, b"s3");
    hmac_sha256(&k_service, b"aws4_request")
}

/// Extract hostname from URL
/// "https://bucket.s3.region.amazonaws.com/key" -> "bucket.s3.region.amazonaws.com"
fn extract_host(url: &str) -> &str {
    url.trim_start_matches("https://")
        .trim_start_matches("http://")
        .split('/')
        .next()
        .unwrap_or("")
}

/// Extract path from URL
/// "https://bucket.s3.region.amazonaws.com/vault.json" -> "/vault.json"
fn extract_path(url: &str) -> String {
    if let Some(idx) = url.find("://") {
        if let Some(slash_idx) = url[idx + 3..].find('/') {
            return url[idx + 3 + slash_idx..].to_string();
        }
    }
    "/".to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sha256_hex() {
        // Empty string SHA256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
        let hash = sha256_hex(b"");
        assert_eq!(
            hash,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn test_to_hex() {
        assert_eq!(to_hex(&[0x00, 0x0f, 0xff]), "000fff");
        assert_eq!(to_hex(&[255, 128, 0]), "ff8000");
    }

    #[test]
    fn test_extract_host() {
        assert_eq!(
            extract_host("https://bucket.s3.us-east-1.amazonaws.com/key"),
            "bucket.s3.us-east-1.amazonaws.com"
        );
        assert_eq!(
            extract_host("https://example.com:9000/path"),
            "example.com:9000"
        );
    }

    #[test]
    fn test_extract_path() {
        assert_eq!(
            extract_path("https://bucket.s3.region.amazonaws.com/vault.json"),
            "/vault.json"
        );
        assert_eq!(
            extract_path("https://bucket.s3.region.amazonaws.com/"),
            "/"
        );
    }

    #[test]
    fn test_sign_get_request_produces_auth_header() {
        let signed = sign_get_request(
            "https://mybucket.s3.us-east-1.amazonaws.com/vault.json",
            "us-east-1",
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "20240101T120000Z",
        );

        assert!(!signed.authorization.is_empty());
        assert!(signed.authorization.starts_with("AWS4-HMAC-SHA256"));
        assert!(signed.authorization.contains("Credential="));
        assert!(signed.authorization.contains("SignedHeaders="));
        assert!(signed.authorization.contains("Signature="));
        assert_eq!(signed.x_amz_date, "20240101T120000Z");
        assert!(signed.if_match.is_none());
    }

    #[test]
    fn test_sign_put_request_with_etag() {
        let signed = sign_put_request(
            "https://mybucket.s3.us-east-1.amazonaws.com/vault.json",
            "us-east-1",
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "20240101T120000Z",
            b"test data",
            Some("abc123"),
        );

        assert!(!signed.authorization.is_empty());
        assert!(signed.authorization.starts_with("AWS4-HMAC-SHA256"));
        assert_eq!(signed.if_match, Some("abc123".to_string()));
    }

    #[test]
    fn test_sign_put_request_without_etag() {
        let signed = sign_put_request(
            "https://mybucket.s3.us-east-1.amazonaws.com/vault.json",
            "us-east-1",
            "AKIAIOSFODNN7EXAMPLE",
            "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
            "20240101T120000Z",
            b"test data",
            None,
        );

        assert!(!signed.authorization.is_empty());
        assert!(signed.if_match.is_none());
    }

    #[test]
    fn test_hmac_sha256_deterministic() {
        let result1 = hmac_sha256(b"key", b"data");
        let result2 = hmac_sha256(b"key", b"data");
        assert_eq!(result1, result2);

        let result_different = hmac_sha256(b"different_key", b"data");
        assert_ne!(result1, result_different);
    }
}
