use serde::Deserialize;

// ============================================================================
// 1pux JSON schema types (mirrors export.data structure)
// ============================================================================

#[derive(Debug, Deserialize)]
pub struct OnePuxExport {
    #[serde(default)]
    pub accounts: Vec<OnePuxAccount>,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxAccount {
    #[serde(default)]
    pub attrs: OnePuxAccountAttrs,
    #[serde(default)]
    pub vaults: Vec<OnePuxVault>,
}

#[derive(Debug, Default, Deserialize)]
pub struct OnePuxAccountAttrs {
    #[serde(default, rename = "accountName")]
    pub account_name: String,
    #[serde(default)]
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxVault {
    #[serde(default)]
    pub attrs: OnePuxVaultAttrs,
    #[serde(default)]
    pub items: Vec<OnePuxItem>,
}

#[derive(Debug, Default, Deserialize)]
pub struct OnePuxVaultAttrs {
    #[serde(default)]
    pub uuid: String,
    #[serde(default)]
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxItem {
    #[serde(default)]
    pub uuid: String,
    #[serde(default, rename = "favIndex")]
    pub fav_index: Option<i64>,
    #[serde(default, rename = "createdAt")]
    pub created_at: i64,
    #[serde(default, rename = "updatedAt")]
    pub updated_at: i64,
    #[serde(default, rename = "categoryUuid")]
    pub category_uuid: String,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub overview: OnePuxOverview,
    #[serde(default)]
    pub details: OnePuxDetails,
}

#[derive(Debug, Default, Deserialize)]
pub struct OnePuxOverview {
    #[serde(default)]
    pub title: String,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub urls: Vec<OnePuxUrl>,
    #[serde(default)]
    pub tags: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxUrl {
    #[serde(default)]
    pub url: String,
}

#[derive(Debug, Default, Deserialize)]
pub struct OnePuxDetails {
    #[serde(default, rename = "loginFields")]
    pub login_fields: Vec<OnePuxLoginField>,
    #[serde(default, rename = "notesPlain")]
    pub notes_plain: Option<String>,
    #[serde(default)]
    pub sections: Vec<OnePuxSection>,
    #[serde(default, rename = "documentAttributes")]
    pub document_attributes: Option<OnePuxDocumentAttributes>,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxLoginField {
    #[serde(default)]
    pub designation: Option<String>,
    #[serde(default)]
    pub value: Option<String>,
    #[serde(default, rename = "fieldType")]
    pub field_type: Option<String>,
    #[serde(default)]
    pub name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxSection {
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub fields: Vec<OnePuxSectionField>,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxSectionField {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub value: serde_json::Value,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxDocumentAttributes {
    #[serde(default, rename = "fileName")]
    pub file_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct OnePuxAddress {
    #[serde(default)]
    pub street: Option<String>,
    #[serde(default)]
    pub city: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub zip: Option<String>,
    #[serde(default)]
    pub country: Option<String>,
}

// ============================================================================
// Internal parsed representation
// ============================================================================

#[derive(Debug, Clone)]
pub struct ParsedItem {
    pub uuid: String,
    pub title: String,
    pub category_uuid: String,
    pub vault_name: String,
    pub url: Option<String>,
    pub urls: Vec<String>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub notes: Option<String>,
    pub tags: Vec<String>,
    pub fields: Vec<ParsedField>,
    pub has_attachments: bool,
    pub attachment_file_name: Option<String>,
    pub is_favorite: bool,
    pub is_archived: bool,
    pub is_trashed: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct ParsedField {
    pub field_id: Option<String>,
    pub section_title: Option<String>,
    pub field_title: String,
    pub value: ParsedFieldValue,
}

#[derive(Debug, Clone)]
pub enum ParsedFieldValue {
    Text(String),
    Concealed(String),
    Email(String),
    Url(String),
    Phone(String),
    Totp(String),
    Date(i64),
    MonthYear(i64),
    Address(String),
}

impl ParsedFieldValue {
    pub fn as_str(&self) -> &str {
        match self {
            ParsedFieldValue::Text(s)
            | ParsedFieldValue::Concealed(s)
            | ParsedFieldValue::Email(s)
            | ParsedFieldValue::Url(s)
            | ParsedFieldValue::Phone(s)
            | ParsedFieldValue::Totp(s)
            | ParsedFieldValue::Address(s) => s,
            ParsedFieldValue::Date(_) | ParsedFieldValue::MonthYear(_) => "",
        }
    }

    pub fn to_string_value(&self) -> String {
        match self {
            ParsedFieldValue::Date(ts) => chrono::DateTime::from_timestamp(*ts, 0)
                .map(|dt| dt.format("%Y-%m-%d").to_string())
                .unwrap_or_else(|| ts.to_string()),
            ParsedFieldValue::MonthYear(val) => {
                let year = val / 100;
                let month = val % 100;
                format!("{:04}-{:02}", year, month)
            }
            other => other.as_str().to_string(),
        }
    }

    pub fn custom_field_type(&self) -> &str {
        match self {
            ParsedFieldValue::Text(_)
            | ParsedFieldValue::Date(_)
            | ParsedFieldValue::MonthYear(_)
            | ParsedFieldValue::Address(_) => "text",
            ParsedFieldValue::Concealed(_) => "password",
            ParsedFieldValue::Email(_) => "email",
            ParsedFieldValue::Url(_) => "url",
            ParsedFieldValue::Phone(_) => "phone",
            ParsedFieldValue::Totp(_) => "totp",
        }
    }
}
