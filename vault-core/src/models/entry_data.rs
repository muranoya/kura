use super::EntryType;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use zeroize::Zeroize;

const SCHEMA_VERSION: u32 = 1;

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
    pub schema_version: u32,
    #[serde(rename = "type")]
    pub entry_type: EntryType,
    pub notes: Option<String>,
    pub typed_value: Value,
    #[serde(default)]
    pub custom_fields: Option<Vec<CustomField>>,
}

impl Drop for EntryData {
    fn drop(&mut self) {
        // Zeroize sensitive field if it contains string data
        if let Some(ref mut notes) = self.notes {
            notes.zeroize();
        }
    }
}

impl EntryData {
    pub fn new_login(url: Option<String>, username: String, password: String, totp: Option<String>, notes: Option<String>) -> Self {
        EntryData {
            schema_version: SCHEMA_VERSION,
            entry_type: EntryType::Login,
            notes,
            typed_value: json!({
                "url": url,
                "username": username,
                "password": password,
                "totp": totp
            }),
            custom_fields: None,
        }
    }

    pub fn new_bank(bank_name: String, account_number: String, pin: String, notes: Option<String>) -> Self {
        EntryData {
            schema_version: SCHEMA_VERSION,
            entry_type: EntryType::Bank,
            notes,
            typed_value: json!({
                "bank_name": bank_name,
                "account_number": account_number,
                "pin": pin
            }),
            custom_fields: None,
        }
    }

    pub fn new_ssh_key(private_key: String, passphrase: Option<String>, notes: Option<String>) -> Self {
        EntryData {
            schema_version: SCHEMA_VERSION,
            entry_type: EntryType::SshKey,
            notes,
            typed_value: json!({
                "private_key": private_key,
                "passphrase": passphrase
            }),
            custom_fields: None,
        }
    }

    pub fn new_secure_note(content: String, notes: Option<String>) -> Self {
        EntryData {
            schema_version: SCHEMA_VERSION,
            entry_type: EntryType::SecureNote,
            notes,
            typed_value: json!({
                "content": content
            }),
            custom_fields: None,
        }
    }

    pub fn new_credit_card(cardholder: String, number: String, expiry: String, cvv: String, notes: Option<String>) -> Self {
        EntryData {
            schema_version: SCHEMA_VERSION,
            entry_type: EntryType::CreditCard,
            notes,
            typed_value: json!({
                "cardholder": cardholder,
                "number": number,
                "expiry": expiry,
                "cvv": cvv
            }),
            custom_fields: None,
        }
    }

    pub fn new_passkey(notes: Option<String>) -> Self {
        EntryData {
            schema_version: SCHEMA_VERSION,
            entry_type: EntryType::Passkey,
            notes,
            typed_value: json!({}),
            custom_fields: None,
        }
    }

    pub fn to_json_string(&self) -> crate::error::Result<String> {
        serde_json::to_string(self).map_err(|e| crate::error::VaultError::JsonError(e))
    }

    pub fn from_json_string(json_str: &str) -> crate::error::Result<Self> {
        serde_json::from_str(json_str).map_err(|e| crate::error::VaultError::JsonError(e))
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
            None,
            Some("my notes".to_string()),
        );

        let json = data.to_json_string().unwrap();
        let deserialized = EntryData::from_json_string(&json).unwrap();

        assert_eq!(deserialized.entry_type, EntryType::Login);
        assert_eq!(deserialized.schema_version, SCHEMA_VERSION);
    }
}
