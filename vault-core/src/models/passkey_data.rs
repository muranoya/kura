use crate::error::{Result, VaultError};
use serde::{Deserialize, Serialize};
use std::fmt;

/// Passkey (WebAuthn discoverable credential) data stored inside a `CustomField`
/// (`field_type == "passkey"`) as a JSON string in `CustomField.value`.
///
/// `public_key` and `sign_count` are intentionally omitted: the public key can be
/// re-derived from `private_key` whenever it is needed, and synced passkeys use a
/// fixed sign_count of 0 by convention (a real counter can't be kept monotonic
/// across independently-synced devices, and bumping it on every use would touch
/// `updated_at` and create spurious LWW sync conflicts).
#[derive(Clone, Serialize, Deserialize)]
pub struct PasskeyFieldData {
    pub rp_id: String,
    #[serde(default)]
    pub rp_name: Option<String>,
    pub user_handle: String,
    pub user_name: String,
    pub user_display_name: String,
    pub credential_id: String,
    /// P-256 private key, base64-encoded. Opaque at this layer; interpreted by
    /// whichever code performs the actual WebAuthn signing.
    pub private_key: String,
}

impl PasskeyFieldData {
    pub fn to_json_string(&self) -> Result<String> {
        serde_json::to_string(self).map_err(VaultError::JsonError)
    }

    pub fn from_json_string(json_str: &str) -> Result<Self> {
        serde_json::from_str(json_str).map_err(VaultError::JsonError)
    }
}

impl fmt::Debug for PasskeyFieldData {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("PasskeyFieldData")
            .field("rp_id", &self.rp_id)
            .field("rp_name", &self.rp_name)
            .field("user_handle", &self.user_handle)
            .field("user_name", &self.user_name)
            .field("user_display_name", &self.user_display_name)
            .field("credential_id", &self.credential_id)
            .field("private_key", &"[REDACTED]")
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> PasskeyFieldData {
        PasskeyFieldData {
            rp_id: "example.com".to_string(),
            rp_name: Some("Example".to_string()),
            user_handle: "dXNlci1oYW5kbGU".to_string(),
            user_name: "user@example.com".to_string(),
            user_display_name: "Example User".to_string(),
            credential_id: "Y3JlZGVudGlhbC1pZA".to_string(),
            private_key: "c3VwZXItc2VjcmV0LWtleQ".to_string(),
        }
    }

    #[test]
    fn test_roundtrip() {
        let data = sample();
        let json = data.to_json_string().unwrap();
        let parsed = PasskeyFieldData::from_json_string(&json).unwrap();

        assert_eq!(parsed.rp_id, data.rp_id);
        assert_eq!(parsed.rp_name, data.rp_name);
        assert_eq!(parsed.user_handle, data.user_handle);
        assert_eq!(parsed.user_name, data.user_name);
        assert_eq!(parsed.user_display_name, data.user_display_name);
        assert_eq!(parsed.credential_id, data.credential_id);
        assert_eq!(parsed.private_key, data.private_key);
    }

    #[test]
    fn test_missing_optional_rp_name_defaults_to_none() {
        let json = r#"{
            "rp_id": "example.com",
            "user_handle": "dXNlci1oYW5kbGU",
            "user_name": "user@example.com",
            "user_display_name": "Example User",
            "credential_id": "Y3JlZGVudGlhbC1pZA",
            "private_key": "c3VwZXItc2VjcmV0LWtleQ"
        }"#;

        let parsed = PasskeyFieldData::from_json_string(json).unwrap();
        assert_eq!(parsed.rp_name, None);
    }

    #[test]
    fn test_invalid_json_returns_error() {
        let result = PasskeyFieldData::from_json_string("not json");
        assert!(result.is_err());
    }

    #[test]
    fn test_debug_output_redacts_private_key() {
        let data = sample();
        let debug_str = format!("{:?}", data);

        assert!(!debug_str.contains(&data.private_key));
        assert!(debug_str.contains("[REDACTED]"));
        assert!(debug_str.contains("example.com"));
    }
}
