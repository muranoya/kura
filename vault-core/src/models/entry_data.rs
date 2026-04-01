use super::EntryType;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use zeroize::Zeroize;
use crate::{VaultError, error::Result};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum CustomFieldType {
    Text,
    Password,
    Email,
    Url,
    Phone,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CustomField {
    pub id: String,
    pub name: String,
    pub field_type: CustomFieldType,
    pub value: String,
}

/// Encrypted entry data container - automatically zeroized on drop
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct EntryData {
    #[serde(rename = "type")]
    pub entry_type: EntryType,
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
    pub fn new_login(url: Option<String>, username: String, password: String, notes: Option<String>) -> Self {
        EntryData {
            entry_type: EntryType::Login,
            notes,
            typed_value: json!({
                "url": url,
                "username": username,
                "password": password
            }),
            custom_fields: None,
        }
    }

    pub fn new_bank(bank_name: String, account_holder: String, branch_code: String, account_type: String, account_number: String, pin: String, notes: Option<String>) -> Self {
        EntryData {
            entry_type: EntryType::Bank,
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
            entry_type: EntryType::SshKey,
            notes,
            typed_value: json!({
                "private_key": private_key
            }),
            custom_fields: None,
        }
    }

    pub fn new_secure_note(content: String, notes: Option<String>) -> Self {
        EntryData {
            entry_type: EntryType::SecureNote,
            notes,
            typed_value: json!({
                "content": content
            }),
            custom_fields: None,
        }
    }

    pub fn new_credit_card(cardholder: String, number: String, expiry: String, cvv: String, pin: String, notes: Option<String>) -> Self {
        EntryData {
            entry_type: EntryType::CreditCard,
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
            entry_type: EntryType::Password,
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
            entry_type: EntryType::SoftwareLicense,
            notes,
            typed_value: json!({
                "license_key": license_key
            }),
            custom_fields: None,
        }
    }

    pub fn new_passkey(notes: Option<String>) -> Self {
        EntryData {
            entry_type: EntryType::Passkey,
            notes,
            typed_value: json!({}),
            custom_fields: None,
        }
    }

    pub fn to_json_string(&self) -> Result<String> {
        serde_json::to_string(self).map_err(|e| VaultError::JsonError(e))
    }

    pub fn from_json_string(json_str: &str) -> Result<Self> {
        serde_json::from_str(json_str).map_err(|e| VaultError::JsonError(e))
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

        assert_eq!(deserialized.entry_type, EntryType::Login);
    }
}
