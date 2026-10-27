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
    /// typed_value のうち秘匿値（secret ブロックに置かれている）のキー。
    /// UI はこれに含まれるフィールドをマスク表示する。
    #[serde(default)]
    pub secret_field_keys: Vec<String>,
}

/// 一覧表示・オートフィル候補抽出に必要な最小限の情報のみを持つエントリサマリ。
/// index だけから作るため、secret ブロックの復号は発生しない。
#[derive(Debug, Clone)]
pub struct EntrySummary {
    pub id: String,
    pub name: String,
    pub entry_type: String,
    pub is_favorite: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    /// login: username, password: username, bank: bank_name, credit_card: cardholderなど、
    /// エントリタイプごとの非秘匿な代表フィールド
    pub subtitle: Option<String>,
    /// entry_type == "login"の場合のみ設定されるURL（オートフィル候補抽出用）
    pub login_url: Option<String>,
    /// カスタムフィールド（field_type == "url"）から抽出したURLのリスト。
    /// オートフィル候補抽出時にlogin_urlとともにマッチ対象となる。
    pub additional_urls: Vec<String>,
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
        // 完全削除済み（tombstone）は同期のために残しているだけなので、ゴミ箱を含めても一覧に出さない
        if entry.purged_at.is_some() {
            return false;
        }
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
            if !matches_search(entry, &query.to_lowercase()) {
                return false;
            }
        }
        true
    }
}

/// 検索対象は index にある値だけ（`docs/vault-format-v2.md` 4-3）。
/// - `name`
/// - `public_fields` の全値（文字列のもの）
/// - カスタムフィールドの名前（全フィールド）
/// - カスタムフィールドの値（`secret == false` かつ text / email / url / phone のもの）
///
/// secret ブロックにある値（password・notes 等）は検索対象外で、検索のために復号もしない。
fn matches_search(entry: &crate::store::VaultEntry, query_lower: &str) -> bool {
    let contains = |s: &str| s.to_lowercase().contains(query_lower);

    if contains(&entry.name) {
        return true;
    }
    if entry
        .public_fields
        .values()
        .filter_map(|v| v.as_str())
        .any(contains)
    {
        return true;
    }
    entry.custom_fields.iter().any(|f| {
        if contains(&f.name) {
            return true;
        }
        !f.secret
            && crate::store::layout::is_searchable_custom_field_type(&f.field_type)
            && f.value.as_deref().is_some_and(contains)
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::entry_data::CustomField;
    use crate::secret::SecretString;
    use crate::store::layout::{split_custom_fields, split_typed_value};
    use crate::store::VaultEntry;

    fn make_entry(entry_type: &str, typed_value_json: &str) -> VaultEntry {
        let mut entry = VaultEntry::new(entry_type, "Test Entry", 1000);
        let (public_fields, _) = split_typed_value(entry_type, typed_value_json, None).unwrap();
        entry.public_fields = public_fields;
        entry
    }

    fn set_custom_field(entry: &mut VaultEntry, name: &str, field_type: &str, value: &str) {
        let field = CustomField {
            id: "cf1".to_string(),
            name: name.to_string(),
            field_type: field_type.to_string(),
            value: SecretString::from_string(value.to_string()),
            secret: false,
            autofill_selector: None,
        };
        entry.custom_fields = split_custom_fields(&[field], &[]).0;
    }

    fn search_filter(query: &str) -> EntryFilter {
        EntryFilter::new().with_search(query.to_string())
    }

    fn empty_login() -> VaultEntry {
        let mut entry = make_entry("login", r#"{"url":"","username":"","password":""}"#);
        entry.name = "Something".into();
        entry
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
                                                         // v2 から account_number は秘匿値（検索対象外）
        assert!(!search_filter("1234567").matches(&entry));
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
        assert!(!search_filter("123").matches(&entry)); // cvv excluded
        assert!(!search_filter("0000").matches(&entry)); // pin excluded
    }

    #[test]
    fn test_search_ssh_key_private_key_excluded() {
        let entry = make_entry("ssh_key", r#"{"private_key":"-----BEGIN RSA-----"}"#);
        assert!(!search_filter("RSA").matches(&entry));
    }

    #[test]
    fn test_search_secure_note_content_excluded() {
        // v2 から secure_note.content は秘匿値（検索対象外）
        let entry = make_entry("secure_note", r#"{"content":"important memo here"}"#);
        assert!(!search_filter("memo").matches(&entry));
    }

    #[test]
    fn test_search_software_license_key_excluded() {
        // v2 から license_key は秘匿値（検索対象外）
        let entry = make_entry("software_license", r#"{"license_key":"ABCD-EFGH-1234"}"#);
        assert!(!search_filter("EFGH").matches(&entry));
    }

    #[test]
    fn test_search_unknown_type_typed_value_not_searched() {
        // 未知タイプは書き込み時に全フィールドが secret に置かれる
        let entry = make_entry(
            "wifi_password",
            r#"{"ssid":"MyNetwork","password":"wifipass"}"#,
        );
        assert!(!search_filter("MyNetwork").matches(&entry));
    }

    #[test]
    fn test_search_unknown_type_public_fields_searched() {
        // 未知タイプでも、書き込んだクライアントが index に置いた値は検索できる
        let mut entry = make_entry("wifi_password", r#"{"password":"wifipass"}"#);
        entry.public_fields.insert(
            "ssid".to_string(),
            crate::secret::PublicJson::from_value(serde_json::json!("MyNetwork")),
        );
        assert!(search_filter("MyNetwork").matches(&entry));
        assert!(!search_filter("wifipass").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_value_text() {
        let mut entry = empty_login();
        set_custom_field(
            &mut entry,
            "Security Question",
            "text",
            "My pet name is Max",
        );
        assert!(search_filter("Max").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_value_secret_text_excluded() {
        let mut entry = empty_login();
        let field = CustomField {
            id: "cf1".to_string(),
            name: "PIN".to_string(),
            field_type: "text".to_string(),
            value: SecretString::from_string("4321".to_string()),
            secret: true,
            autofill_selector: None,
        };
        entry.custom_fields = split_custom_fields(&[field], &[]).0;
        assert!(!search_filter("4321").matches(&entry));
        assert!(search_filter("PIN").matches(&entry)); // name is still searchable
    }

    #[test]
    fn test_search_custom_field_value_password_excluded() {
        let mut entry = empty_login();
        set_custom_field(&mut entry, "API Key", "password", "sk-abc123secret");
        assert!(!search_filter("abc123secret").matches(&entry));
        assert!(search_filter("API Key").matches(&entry)); // name is still searchable
    }

    #[test]
    fn test_search_custom_field_value_email() {
        let mut entry = empty_login();
        set_custom_field(
            &mut entry,
            "Recovery Email",
            "email",
            "recovery@example.com",
        );
        assert!(search_filter("recovery@example").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_value_totp_excluded() {
        let mut entry = empty_login();
        set_custom_field(&mut entry, "TOTP", "totp", "JBSWY3DPEHPK3PXP");
        assert!(!search_filter("JBSWY3DPEHPK3PXP").matches(&entry));
        // 公開部（周期）も検索対象外
        assert!(!search_filter("period").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_value_passkey_excluded() {
        let mut entry = empty_login();
        set_custom_field(
            &mut entry,
            "Passkey",
            "passkey",
            r#"{"rp_id":"example.com","user_handle":"h","user_name":"u","user_display_name":"U","credential_id":"c","private_key":"secret"}"#,
        );
        assert!(!search_filter("example.com").matches(&entry));
    }

    #[test]
    fn test_search_custom_field_unknown_type_excluded() {
        let mut entry = empty_login();
        set_custom_field(&mut entry, "Custom", "future_type", "some value");
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
}
