use crate::{error::Result, VaultError};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use zeroize::Zeroize;

/// Known custom field types for validation at creation/edit time.
/// Unknown types from newer clients are preserved as-is (stored as String).
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CustomFieldType {
    Text,
    Password,
    Email,
    Url,
    Phone,
    Totp,
}

impl CustomFieldType {
    pub fn as_str(&self) -> &str {
        match self {
            CustomFieldType::Text => "text",
            CustomFieldType::Password => "password",
            CustomFieldType::Email => "email",
            CustomFieldType::Url => "url",
            CustomFieldType::Phone => "phone",
            CustomFieldType::Totp => "totp",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "text" => Some(CustomFieldType::Text),
            "password" => Some(CustomFieldType::Password),
            "email" => Some(CustomFieldType::Email),
            "url" => Some(CustomFieldType::Url),
            "phone" => Some(CustomFieldType::Phone),
            "totp" => Some(CustomFieldType::Totp),
            _ => None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CustomField {
    pub id: String,
    pub name: String,
    pub field_type: String,
    pub value: String,
}

/// Entry data container for the API/domain layer - automatically zeroized on drop.
///
/// `typed_value` is `serde_json::Value` for ergonomic access in business logic.
/// In the storage layer (`VaultEntry`), the same data is stored as `Zeroizing<String>`
/// (raw JSON string) to ensure zeroization during serialization.
/// Conversion between the two happens in `vault_entry_to_entry`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntryData {
    #[serde(rename = "type")]
    pub entry_type: String,
    pub notes: Option<String>,
    pub typed_value: Value,
    #[serde(default)]
    pub custom_fields: Option<Vec<CustomField>>,
}

impl Drop for EntryData {
    fn drop(&mut self) {
        // Zeroize sensitive fields
        if let Some(ref mut notes) = self.notes {
            notes.zeroize();
        }
        // Zeroize custom_fields, especially those marked as password
        if let Some(ref mut fields) = self.custom_fields {
            for field in fields.iter_mut() {
                field.value.zeroize();
            }
        }
    }
}

impl EntryData {
    pub fn new_login(
        url: Option<String>,
        username: String,
        password: String,
        notes: Option<String>,
    ) -> Self {
        EntryData {
            entry_type: "login".to_string(),
            notes,
            typed_value: json!({
                "url": url,
                "username": username,
                "password": password
            }),
            custom_fields: None,
        }
    }

    pub fn new_bank(
        bank_name: String,
        account_holder: String,
        branch_code: String,
        account_type: String,
        account_number: String,
        pin: String,
        notes: Option<String>,
    ) -> Self {
        EntryData {
            entry_type: "bank".to_string(),
            notes,
            typed_value: json!({
                "bank_name": bank_name,
                "account_holder": account_holder,
                "branch_code": branch_code,
                "account_type": account_type,
                "account_number": account_number,
                "pin": pin
            }),
            custom_fields: None,
        }
    }

    pub fn new_ssh_key(private_key: String, notes: Option<String>) -> Self {
        EntryData {
            entry_type: "ssh_key".to_string(),
            notes,
            typed_value: json!({
                "private_key": private_key
            }),
            custom_fields: None,
        }
    }

    pub fn new_secure_note(content: String, notes: Option<String>) -> Self {
        EntryData {
            entry_type: "secure_note".to_string(),
            notes,
            typed_value: json!({
                "content": content
            }),
            custom_fields: None,
        }
    }

    pub fn new_credit_card(
        cardholder: String,
        number: String,
        expiry: String,
        cvv: String,
        pin: String,
        notes: Option<String>,
    ) -> Self {
        EntryData {
            entry_type: "credit_card".to_string(),
            notes,
            typed_value: json!({
                "cardholder": cardholder,
                "number": number,
                "expiry": expiry,
                "cvv": cvv,
                "pin": pin
            }),
            custom_fields: None,
        }
    }

    pub fn new_password(username: String, password: String, notes: Option<String>) -> Self {
        EntryData {
            entry_type: "password".to_string(),
            notes,
            typed_value: json!({
                "username": username,
                "password": password
            }),
            custom_fields: None,
        }
    }

    pub fn new_software_license(license_key: String, notes: Option<String>) -> Self {
        EntryData {
            entry_type: "software_license".to_string(),
            notes,
            typed_value: json!({
                "license_key": license_key
            }),
            custom_fields: None,
        }
    }

    pub fn to_json_string(&self) -> Result<String> {
        serde_json::to_string(self).map_err(VaultError::JsonError)
    }

    pub fn from_json_string(json_str: &str) -> Result<Self> {
        serde_json::from_str(json_str).map_err(VaultError::JsonError)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_login_serialization() {
        let data = EntryData::new_login(
            Some("https://example.com".to_string()),
            "user@example.com".to_string(),
            "password123".to_string(),
            Some("my notes".to_string()),
        );

        let json = data.to_json_string().unwrap();
        let deserialized = EntryData::from_json_string(&json).unwrap();

        assert_eq!(deserialized.entry_type, "login".to_string());
    }
}
