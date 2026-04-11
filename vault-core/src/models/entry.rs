use serde::{Deserialize, Serialize};

use crate::EntryData;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum SortField {
    #[serde(rename = "name")]
    Name,
    #[default]
    #[serde(rename = "created_at")]
    CreatedAt,
    #[serde(rename = "updated_at")]
    UpdatedAt,
}

impl SortField {
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "name" => Some(SortField::Name),
            "created_at" => Some(SortField::CreatedAt),
            "updated_at" => Some(SortField::UpdatedAt),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum SortOrder {
    #[serde(rename = "asc")]
    Asc,
    #[default]
    #[serde(rename = "desc")]
    Desc,
}

impl SortOrder {
    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "asc" => Some(SortOrder::Asc),
            "desc" => Some(SortOrder::Desc),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum EntryType {
    #[serde(rename = "login")]
    Login,
    #[serde(rename = "bank")]
    Bank,
    #[serde(rename = "ssh_key")]
    SshKey,
    #[serde(rename = "secure_note")]
    SecureNote,
    #[serde(rename = "credit_card")]
    CreditCard,
    #[serde(rename = "password")]
    Password,
    #[serde(rename = "software_license")]
    SoftwareLicense,
}

impl EntryType {
    pub fn as_str(&self) -> &str {
        match self {
            EntryType::Login => "login",
            EntryType::Bank => "bank",
            EntryType::SshKey => "ssh_key",
            EntryType::SecureNote => "secure_note",
            EntryType::CreditCard => "credit_card",
            EntryType::Password => "password",
            EntryType::SoftwareLicense => "software_license",
        }
    }

    #[allow(clippy::should_implement_trait)]
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "login" => Some(EntryType::Login),
            "bank" => Some(EntryType::Bank),
            "ssh_key" => Some(EntryType::SshKey),
            "secure_note" => Some(EntryType::SecureNote),
            "credit_card" => Some(EntryType::CreditCard),
            "password" => Some(EntryType::Password),
            "software_license" => Some(EntryType::SoftwareLicense),
            _ => None,
        }
    }
}

/// Decrypted entry with full data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub entry_type: String,
    pub is_favorite: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub data: EntryData,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct EntryFilter {
    pub include_trash: bool,
    pub entry_type: Option<String>,
    pub label_id: Option<String>,
    pub favorites_only: bool,
    pub search_query: Option<String>,
    pub sort_field: SortField,
    pub sort_order: SortOrder,
}

impl EntryFilter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_trash(mut self, include: bool) -> Self {
        self.include_trash = include;
        self
    }

    pub fn with_type(mut self, entry_type: impl Into<String>) -> Self {
        self.entry_type = Some(entry_type.into());
        self
    }

    pub fn with_label(mut self, label_id: String) -> Self {
        self.label_id = Some(label_id);
        self
    }

    pub fn favorites_only(mut self) -> Self {
        self.favorites_only = true;
        self
    }

    pub fn with_favorites(mut self, favorites_only: bool) -> Self {
        self.favorites_only = favorites_only;
        self
    }

    pub fn with_search(mut self, query: String) -> Self {
        self.search_query = Some(query);
        self
    }

    pub fn with_sort(mut self, field: SortField, order: SortOrder) -> Self {
        self.sort_field = field;
        self.sort_order = order;
        self
    }

    pub fn matches(&self, entry: &crate::store::VaultEntry) -> bool {
        if !self.include_trash && entry.deleted_at.is_some() {
            return false;
        }
        if let Some(ref entry_type) = self.entry_type {
            if entry.entry_type != *entry_type {
                return false;
            }
        }
        if self.favorites_only && !entry.is_favorite {
            return false;
        }
        if let Some(label_id) = &self.label_id {
            if !entry.label_ids.contains(label_id) {
                return false;
            }
        }
        if let Some(query) = &self.search_query {
            let q = query.to_lowercase();
            let name_match = entry.name.to_lowercase().contains(&q);
            let notes_match = entry
                .notes
                .as_deref()
                .map(|n| n.to_lowercase().contains(&q))
                .unwrap_or(false);
            let custom_match = entry
                .custom_fields
                .as_ref()
                .map(|fields| {
                    fields.iter().any(|f| {
                        if f.name.to_lowercase().contains(&q) {
                            return true;
                        }
                        match f.field_type.as_str() {
                            "text" | "email" | "url" | "phone" => {
                                f.value.to_lowercase().contains(&q)
                            }
                            _ => false,
                        }
                    })
                })
                .unwrap_or(false);
            let typed_value_match = searchable_typed_value_keys(&entry.entry_type)
                .and_then(|keys| {
                    serde_json::from_str::<serde_json::Value>(&entry.typed_value)
                        .ok()
                        .map(|v| {
                            keys.iter().any(|key| {
                                v.get(key)
                                    .and_then(|val| val.as_str())
                                    .map(|s| s.to_lowercase().contains(&q))
                                    .unwrap_or(false)
                            })
                        })
                })
                .unwrap_or(false);
            if !name_match && !notes_match && !custom_match && !typed_value_match {
                return false;
            }
        }
        true
    }
}

/// Returns the list of searchable (non-sensitive) typed_value field keys for known entry types.
/// Returns None for unknown types (typed_value is not searched).
fn searchable_typed_value_keys(entry_type: &str) -> Option<&'static [&'static str]> {
    match entry_type {
        "login" => Some(&["url", "username"]),
        "bank" => Some(&[
            "bank_name",
            "branch_code",
            "account_type",
            "account_holder",
            "account_number",
        ]),
        "ssh_key" => Some(&[]),
        "secure_note" => Some(&["content"]),
        "credit_card" => Some(&["cardholder", "expiry"]),
        "password" => Some(&["username"]),
        "software_license" => Some(&["license_key"]),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::entry_data::CustomField;
    use crate::store::VaultEntry;
    use zeroize::Zeroizing;

    fn make_entry(entry_type: &str, typed_value_json: &str) -> VaultEntry {
        VaultEntry {
            entry_type: entry_type.to_string(),
            name: "Test Entry".to_string(),
            created_at: 1000,
            updated_at: 1000,
            deleted_at: None,
            purged_at: None,
            is_favorite: false,
            label_ids: vec![],
            typed_value: Zeroizing::new(typed_value_json.to_string()),
            notes: None,
            custom_fields: None,
        }
    }

    fn search_filter(query: &str) -> EntryFilter {
        EntryFilter::new().with_search(query.to_string())
    }

    #[test]
    fn test_search_login_url() {
        let entry = make_entry(
            "login",
            r#"{"url":"https://example.com","username":"user","password":"secret"}"#,
        );
        assert!(search_filter("example").matches(&entry));
    }

    #[test]
    fn test_search_login_username() {
        let entry = make_entry(
            "login",
            r#"{"url":"https://example.com","username":"john@example.com","password":"secret"}"#,
        );
        assert!(search_filter("john").matches(&entry));
    }

    #[test]
    fn test_search_login_password_excluded() {
        let entry = make_entry(
            "login",
            r#"{"url":"https://example.com","username":"user","password":"supersecret"}"#,
        );
        assert!(!search_filter("supersecret").matches(&entry));
    }

    #[test]
    fn test_search_bank_searchable_fields() {
        let entry = make_entry(
            "bank",
            r#"{"bank_name":"みずほ銀行","account_holder":"田中太郎","branch_code":"001","account_type":"普通","account_number":"1234567","pin":"9999"}"#,
        );
        assert!(search_filter("みずほ").matches(&entry));
        assert!(search_filter("田中").matches(&entry));
        assert!(search_filter("001").matches(&entry));
        assert!(!search_filter("9999").matches(&entry)); // pin excluded
    }

    #[test]
    fn test_search_credit_card_excludes_sensitive() {
        let entry = make_entry(
            "credit_card",
            r#"{"cardholder":"Taro Tanaka","number":"4111111111111111","expiry":"12/25","cvv":"123","pin":"0000"}"#,
        );
        assert!(search_filter("Taro").matches(&entry));
        assert!(search_filter("12/25").matches(&entry));
        assert!(!search_filter("4111").matches(&entry)); // number excluded
        assert!(!search_filter("123").matches(&entry)); // cvv excluded - but "123" could match elsewhere
        assert!(!search_filter("0000").matches(&entry)); // pin excluded
    }

    #[test]
    fn test_search_ssh_key_private_key_excluded() {
        let entry = make_entry("ssh_key", r#"{"private_key":"-----BEGIN RSA-----"}"#);
        assert!(!search_filter("RSA").matches(&entry));
    }

    #[test]
    fn test_search_secure_note_content() {
        let entry = make_entry("secure_note", r#"{"content":"important memo here"}"#);
        assert!(search_filter("memo").matches(&entry));
    }

    #[test]
    fn test_search_software_license_key() {
        let entry = make_entry("software_license", r#"{"license_key":"ABCD-EFGH-1234"}"#);
        assert!(search_filter("EFGH").matches(&entry));
    }

    #[test]
    fn test_search_unknown_type_typed_value_not_searched() {
        let entry = make_entry(
            "wifi_password",
            r#"{"ssid":"MyNetwork","password":"wifipass"}"#,
        );
        assert!(!search_filter("MyNetwork").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_value_text() {
        let mut entry = make_entry("login", r#"{"url":"","username":"","password":""}"#);
        entry.name = "Something".to_string();
        entry.custom_fields = Some(vec![CustomField {
            id: "cf1".to_string(),
            name: "Security Question".to_string(),
            field_type: "text".to_string(),
            value: "My pet name is Max".to_string(),
        }]);
        assert!(search_filter("Max").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_value_password_excluded() {
        let mut entry = make_entry("login", r#"{"url":"","username":"","password":""}"#);
        entry.name = "Something".to_string();
        entry.custom_fields = Some(vec![CustomField {
            id: "cf1".to_string(),
            name: "API Key".to_string(),
            field_type: "password".to_string(),
            value: "sk-abc123secret".to_string(),
        }]);
        assert!(!search_filter("abc123secret").matches(&entry));
        assert!(search_filter("API Key").matches(&entry)); // name is still searchable
    }

    #[test]
    fn test_search_custom_field_value_email() {
        let mut entry = make_entry("login", r#"{"url":"","username":"","password":""}"#);
        entry.name = "Something".to_string();
        entry.custom_fields = Some(vec![CustomField {
            id: "cf1".to_string(),
            name: "Recovery Email".to_string(),
            field_type: "email".to_string(),
            value: "recovery@example.com".to_string(),
        }]);
        assert!(search_filter("recovery@example").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_value_totp_excluded() {
        let mut entry = make_entry("login", r#"{"url":"","username":"","password":""}"#);
        entry.name = "Something".to_string();
        entry.custom_fields = Some(vec![CustomField {
            id: "cf1".to_string(),
            name: "TOTP".to_string(),
            field_type: "totp".to_string(),
            value: "JBSWY3DPEHPK3PXP".to_string(),
        }]);
        assert!(!search_filter("JBSWY3DPEHPK3PXP").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_unknown_type_excluded() {
        let mut entry = make_entry("login", r#"{"url":"","username":"","password":""}"#);
        entry.name = "Something".to_string();
        entry.custom_fields = Some(vec![CustomField {
            id: "cf1".to_string(),
            name: "Custom".to_string(),
            field_type: "future_type".to_string(),
            value: "some value".to_string(),
        }]);
        assert!(!search_filter("some value").matches(&entry));
    }

    #[test]
    fn test_search_case_insensitive() {
        let entry = make_entry(
            "login",
            r#"{"url":"https://GitHub.com","username":"User","password":"pass"}"#,
        );
        assert!(search_filter("github").matches(&entry));
        assert!(search_filter("GITHUB").matches(&entry));
    }

    #[test]
    fn test_search_name_still_works() {
        let entry = make_entry("login", r#"{"url":"","username":"","password":""}"#);
        assert!(search_filter("Test Entry").matches(&entry));
    }

    #[test]
    fn test_search_notes_still_works() {
        let mut entry = make_entry("login", r#"{"url":"","username":"","password":""}"#);
        entry.notes = Some("Remember to update quarterly".to_string());
        assert!(search_filter("quarterly").matches(&entry));
    }
}
