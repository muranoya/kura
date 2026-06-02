use crate::models::{
    BankData, CreditCardData, LoginData, PasswordData, SecureNoteData, SoftwareLicenseData,
    SshKeyData,
};
use crate::{error::Result, models::TypedValue, secret::SecretString, VaultError};
use serde::{ser::SerializeMap, Deserialize, Serialize};

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
    pub value: SecretString,
}

/// Entry data container for the API/domain layer - sensitive fields are automatically zeroized on drop.
///
/// `notes` and `custom_fields[].value` are stored as `SecretString`, which wraps `Zeroizing<String>`.
/// `typed_value` is `TypedValue` enum with all fields as `SecretString` for machine-enforced zeroization.
/// In the storage layer (`VaultEntry`), the same data is stored as `EntrySecretJson` and raw JSON strings
/// to ensure zeroization during serialization.
/// Conversion between the two happens in `vault_entry_to_entry`.
#[derive(Clone, Debug)]
pub struct EntryData {
    pub entry_type: String,
    pub notes: Option<SecretString>,
    pub typed_value: TypedValue,
    pub custom_fields: Option<Vec<CustomField>>,
}

impl EntryData {
    pub fn new_login(
        url: Option<String>,
        username: String,
        password: String,
        notes: Option<SecretString>,
    ) -> Self {
        EntryData {
            entry_type: "login".to_string(),
            notes,
            typed_value: TypedValue::Login(LoginData {
                url: url.map(SecretString::from_string),
                username: SecretString::from_string(username),
                password: SecretString::from_string(password),
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
        notes: Option<SecretString>,
    ) -> Self {
        EntryData {
            entry_type: "bank".to_string(),
            notes,
            typed_value: TypedValue::Bank(BankData {
                bank_name: SecretString::from_string(bank_name),
                account_holder: SecretString::from_string(account_holder),
                branch_code: SecretString::from_string(branch_code),
                account_type: SecretString::from_string(account_type),
                account_number: SecretString::from_string(account_number),
                pin: SecretString::from_string(pin),
            }),
            custom_fields: None,
        }
    }

    pub fn new_ssh_key(private_key: String, notes: Option<SecretString>) -> Self {
        EntryData {
            entry_type: "ssh_key".to_string(),
            notes,
            typed_value: TypedValue::SshKey(SshKeyData {
                private_key: SecretString::from_string(private_key),
            }),
            custom_fields: None,
        }
    }

    pub fn new_secure_note(content: String, notes: Option<SecretString>) -> Self {
        EntryData {
            entry_type: "secure_note".to_string(),
            notes,
            typed_value: TypedValue::SecureNote(SecureNoteData {
                content: SecretString::from_string(content),
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
        notes: Option<SecretString>,
    ) -> Self {
        EntryData {
            entry_type: "credit_card".to_string(),
            notes,
            typed_value: TypedValue::CreditCard(CreditCardData {
                cardholder: SecretString::from_string(cardholder),
                number: SecretString::from_string(number),
                expiry: SecretString::from_string(expiry),
                cvv: SecretString::from_string(cvv),
                pin: SecretString::from_string(pin),
            }),
            custom_fields: None,
        }
    }

    pub fn new_password(username: String, password: String, notes: Option<SecretString>) -> Self {
        EntryData {
            entry_type: "password".to_string(),
            notes,
            typed_value: TypedValue::Password(PasswordData {
                username: SecretString::from_string(username),
                password: SecretString::from_string(password),
            }),
            custom_fields: None,
        }
    }

    pub fn new_software_license(license_key: String, notes: Option<SecretString>) -> Self {
        EntryData {
            entry_type: "software_license".to_string(),
            notes,
            typed_value: TypedValue::SoftwareLicense(SoftwareLicenseData {
                license_key: SecretString::from_string(license_key),
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

impl Serialize for EntryData {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        let mut map = serializer.serialize_map(Some(4))?;
        map.serialize_entry("type", &self.entry_type)?;
        map.serialize_entry("notes", &self.notes)?;
        map.serialize_entry("typed_value", &self.typed_value)?;
        map.serialize_entry("custom_fields", &self.custom_fields)?;
        map.end()
    }
}

impl<'de> Deserialize<'de> for EntryData {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        #[derive(Deserialize)]
        struct Raw {
            #[serde(rename = "type")]
            entry_type: String,
            notes: Option<SecretString>,
            typed_value: serde_json::Value,
            #[serde(default)]
            custom_fields: Option<Vec<CustomField>>,
        }
        let raw = Raw::deserialize(deserializer)?;
        let typed_value = TypedValue::parse(&raw.entry_type, &raw.typed_value.to_string())
            .map_err(serde::de::Error::custom)?;
        Ok(EntryData {
            entry_type: raw.entry_type,
            notes: raw.notes,
            typed_value,
            custom_fields: raw.custom_fields,
        })
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
            Some(SecretString::from_string("my notes".to_string())),
        );

        let json = data.to_json_string().unwrap();
        let deserialized = EntryData::from_json_string(&json).unwrap();

        assert_eq!(deserialized.entry_type, "login".to_string());
    }
}
