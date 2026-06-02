use crate::error::{Result, VaultError};
use crate::secret::{EntrySecretJson, SecretString};
use serde_json::json;

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct LoginData {
    pub url: Option<SecretString>,
    pub username: SecretString,
    pub password: SecretString,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct BankData {
    pub bank_name: SecretString,
    pub account_holder: SecretString,
    pub branch_code: SecretString,
    pub account_type: SecretString,
    pub account_number: SecretString,
    pub pin: SecretString,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SshKeyData {
    pub private_key: SecretString,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SecureNoteData {
    pub content: SecretString,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct CreditCardData {
    pub cardholder: SecretString,
    pub number: SecretString,
    pub expiry: SecretString,
    pub cvv: SecretString,
    pub pin: SecretString,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct PasswordData {
    pub username: SecretString,
    pub password: SecretString,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct SoftwareLicenseData {
    pub license_key: SecretString,
}

#[derive(Clone, Debug)]
pub enum TypedValue {
    Login(LoginData),
    Bank(BankData),
    SshKey(SshKeyData),
    SecureNote(SecureNoteData),
    CreditCard(CreditCardData),
    Password(PasswordData),
    SoftwareLicense(SoftwareLicenseData),
    Unknown(EntrySecretJson),
}

impl TypedValue {
    pub fn parse(entry_type: &str, raw_json: &str) -> Result<Self> {
        let v: serde_json::Value = serde_json::from_str(raw_json).map_err(VaultError::JsonError)?;

        match entry_type {
            "login" => Ok(TypedValue::Login(LoginData {
                url: v["url"]
                    .as_str()
                    .map(|s| SecretString::from_string(s.to_owned())),
                username: SecretString::from_string(
                    v["username"].as_str().unwrap_or("").to_owned(),
                ),
                password: SecretString::from_string(
                    v["password"].as_str().unwrap_or("").to_owned(),
                ),
            })),
            "bank" => Ok(TypedValue::Bank(BankData {
                bank_name: SecretString::from_string(
                    v["bank_name"].as_str().unwrap_or("").to_owned(),
                ),
                account_holder: SecretString::from_string(
                    v["account_holder"].as_str().unwrap_or("").to_owned(),
                ),
                branch_code: SecretString::from_string(
                    v["branch_code"].as_str().unwrap_or("").to_owned(),
                ),
                account_type: SecretString::from_string(
                    v["account_type"].as_str().unwrap_or("").to_owned(),
                ),
                account_number: SecretString::from_string(
                    v["account_number"].as_str().unwrap_or("").to_owned(),
                ),
                pin: SecretString::from_string(v["pin"].as_str().unwrap_or("").to_owned()),
            })),
            "ssh_key" => Ok(TypedValue::SshKey(SshKeyData {
                private_key: SecretString::from_string(
                    v["private_key"].as_str().unwrap_or("").to_owned(),
                ),
            })),
            "secure_note" => Ok(TypedValue::SecureNote(SecureNoteData {
                content: SecretString::from_string(v["content"].as_str().unwrap_or("").to_owned()),
            })),
            "credit_card" => Ok(TypedValue::CreditCard(CreditCardData {
                cardholder: SecretString::from_string(
                    v["cardholder"].as_str().unwrap_or("").to_owned(),
                ),
                number: SecretString::from_string(v["number"].as_str().unwrap_or("").to_owned()),
                expiry: SecretString::from_string(v["expiry"].as_str().unwrap_or("").to_owned()),
                cvv: SecretString::from_string(v["cvv"].as_str().unwrap_or("").to_owned()),
                pin: SecretString::from_string(v["pin"].as_str().unwrap_or("").to_owned()),
            })),
            "password" => Ok(TypedValue::Password(PasswordData {
                username: SecretString::from_string(
                    v["username"].as_str().unwrap_or("").to_owned(),
                ),
                password: SecretString::from_string(
                    v["password"].as_str().unwrap_or("").to_owned(),
                ),
            })),
            "software_license" => Ok(TypedValue::SoftwareLicense(SoftwareLicenseData {
                license_key: SecretString::from_string(
                    v["license_key"].as_str().unwrap_or("").to_owned(),
                ),
            })),
            _ => Ok(TypedValue::Unknown(EntrySecretJson::from_string(
                raw_json.to_owned(),
            ))),
        }
    }

    pub fn to_json_string(&self) -> String {
        match self {
            TypedValue::Login(d) => json!({
                "url": d.url.as_ref().map(|s| s.as_str()),
                "username": d.username.as_str(),
                "password": d.password.as_str(),
            })
            .to_string(),
            TypedValue::Bank(d) => json!({
                "bank_name": d.bank_name.as_str(),
                "account_holder": d.account_holder.as_str(),
                "branch_code": d.branch_code.as_str(),
                "account_type": d.account_type.as_str(),
                "account_number": d.account_number.as_str(),
                "pin": d.pin.as_str(),
            })
            .to_string(),
            TypedValue::SshKey(d) => json!({
                "private_key": d.private_key.as_str(),
            })
            .to_string(),
            TypedValue::SecureNote(d) => json!({
                "content": d.content.as_str(),
            })
            .to_string(),
            TypedValue::CreditCard(d) => json!({
                "cardholder": d.cardholder.as_str(),
                "number": d.number.as_str(),
                "expiry": d.expiry.as_str(),
                "cvv": d.cvv.as_str(),
                "pin": d.pin.as_str(),
            })
            .to_string(),
            TypedValue::Password(d) => json!({
                "username": d.username.as_str(),
                "password": d.password.as_str(),
            })
            .to_string(),
            TypedValue::SoftwareLicense(d) => json!({
                "license_key": d.license_key.as_str(),
            })
            .to_string(),
            TypedValue::Unknown(raw) => raw.as_str().to_owned(),
        }
    }
}

impl serde::Serialize for TypedValue {
    fn serialize<S: serde::Serializer>(
        &self,
        serializer: S,
    ) -> std::result::Result<S::Ok, S::Error> {
        let json_str = self.to_json_string();
        let v: serde_json::Value =
            serde_json::from_str(&json_str).map_err(serde::ser::Error::custom)?;
        v.serialize(serializer)
    }
}

impl<'de> serde::Deserialize<'de> for TypedValue {
    fn deserialize<D: serde::Deserializer<'de>>(
        deserializer: D,
    ) -> std::result::Result<Self, D::Error> {
        let v = serde_json::Value::deserialize(deserializer)?;
        let json_str = v.to_string();
        Self::parse("unknown", &json_str).map_err(serde::de::Error::custom)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_login() {
        let json = r#"{"url":"https://example.com","username":"user","password":"pass"}"#;
        let tv = TypedValue::parse("login", json).unwrap();
        match tv {
            TypedValue::Login(d) => {
                assert_eq!(
                    d.url.as_ref().map(|s| s.as_str()),
                    Some("https://example.com")
                );
                assert_eq!(d.username.as_str(), "user");
                assert_eq!(d.password.as_str(), "pass");
            }
            _ => panic!("Expected Login"),
        }
    }

    #[test]
    fn test_roundtrip_login() {
        let json = r#"{"url":"https://example.com","username":"user","password":"pass"}"#;
        let tv = TypedValue::parse("login", json).unwrap();
        let json2 = tv.to_json_string();
        let v1: serde_json::Value = serde_json::from_str(json).unwrap();
        let v2: serde_json::Value = serde_json::from_str(&json2).unwrap();
        assert_eq!(v1, v2);
    }

    #[test]
    fn test_parse_unknown_type() {
        let json = r#"{"custom":"field"}"#;
        let tv = TypedValue::parse("unknown_future_type", json).unwrap();
        match tv {
            TypedValue::Unknown(_) => {}
            _ => panic!("Expected Unknown"),
        }
    }

    #[test]
    fn test_roundtrip_unknown() {
        let json = r#"{"custom":"field"}"#;
        let tv = TypedValue::parse("future_type", json).unwrap();
        let json2 = tv.to_json_string();
        let v1: serde_json::Value = serde_json::from_str(json).unwrap();
        let v2: serde_json::Value = serde_json::from_str(&json2).unwrap();
        assert_eq!(v1, v2);
    }
}
