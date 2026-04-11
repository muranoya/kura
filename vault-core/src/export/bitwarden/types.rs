use serde::Serialize;

// ============================================================================
// Bitwarden JSON export format types
// ============================================================================

#[derive(Debug, Serialize)]
pub struct BitwardenExport {
    pub encrypted: bool,
    pub folders: Vec<BitwardenFolder>,
    pub items: Vec<BitwardenItem>,
}

#[derive(Debug, Serialize)]
pub struct BitwardenFolder {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BitwardenItem {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(rename = "type")]
    pub item_type: u8,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
    pub favorite: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub login: Option<BitwardenLogin>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub secure_note: Option<BitwardenSecureNote>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card: Option<BitwardenCard>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<BitwardenField>>,
    pub creation_date: String,
    pub revision_date: String,
}

#[derive(Debug, Serialize)]
pub struct BitwardenLogin {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uris: Option<Vec<BitwardenUri>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub username: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub password: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub totp: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BitwardenUri {
    pub uri: String,
    #[serde(rename = "match")]
    pub match_type: Option<u8>,
}

#[derive(Debug, Serialize)]
pub struct BitwardenSecureNote {
    #[serde(rename = "type")]
    pub note_type: u8,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BitwardenCard {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cardholder_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brand: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub number: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exp_month: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exp_year: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BitwardenField {
    pub name: String,
    pub value: String,
    #[serde(rename = "type")]
    pub field_type: u8,
}

// Bitwarden item type constants
pub const BITWARDEN_TYPE_LOGIN: u8 = 1;
pub const BITWARDEN_TYPE_SECURE_NOTE: u8 = 2;
pub const BITWARDEN_TYPE_CARD: u8 = 3;

// Bitwarden field type constants
pub const BITWARDEN_FIELD_TEXT: u8 = 0;
pub const BITWARDEN_FIELD_HIDDEN: u8 = 1;

// Bitwarden secure note type
pub const BITWARDEN_SECURE_NOTE_GENERIC: u8 = 0;
