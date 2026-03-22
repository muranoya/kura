use serde::{Deserialize, Serialize};

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
    #[serde(rename = "passkey")]
    Passkey,
}

impl EntryType {
    pub fn as_str(&self) -> &str {
        match self {
            EntryType::Login => "login",
            EntryType::Bank => "bank",
            EntryType::SshKey => "ssh_key",
            EntryType::SecureNote => "secure_note",
            EntryType::CreditCard => "credit_card",
            EntryType::Passkey => "passkey",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "login" => Some(EntryType::Login),
            "bank" => Some(EntryType::Bank),
            "ssh_key" => Some(EntryType::SshKey),
            "secure_note" => Some(EntryType::SecureNote),
            "credit_card" => Some(EntryType::CreditCard),
            "passkey" => Some(EntryType::Passkey),
            _ => None,
        }
    }
}

/// Decrypted entry with full data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub entry_type: EntryType,
    pub is_favorite: bool,
    pub updated_at: i64,
    pub deleted_at: Option<i64>,
    pub data: crate::models::EntryData,
    pub labels: Vec<String>,
}

#[derive(Debug, Clone, Default)]
pub struct EntryFilter {
    pub include_trash: bool,
    pub entry_type: Option<EntryType>,
    pub label_id: Option<String>,
    pub favorites_only: bool,
    pub search_query: Option<String>, // Simple substring search on name
}

impl EntryFilter {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_trash(mut self, include: bool) -> Self {
        self.include_trash = include;
        self
    }

    pub fn with_type(mut self, entry_type: EntryType) -> Self {
        self.entry_type = Some(entry_type);
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

    pub fn with_search(mut self, query: String) -> Self {
        self.search_query = Some(query);
        self
    }

    pub fn matches(&self, entry: &crate::store::VaultEntry) -> bool {
        if !self.include_trash && entry.deleted_at.is_some() {
            return false;
        }
        if let Some(entry_type) = self.entry_type {
            if entry.entry_type != entry_type {
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
            if !entry.name.to_lowercase().contains(&query.to_lowercase()) {
                return false;
            }
        }
        true
    }
}
