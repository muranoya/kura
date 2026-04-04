use crate::models::{CustomField, EntryData};

use super::types::{ParsedFieldValue, ParsedItem};

/// Mapping result from a 1pux item to a kura entry.
pub struct MappedEntry {
    pub entry_type: String,
    pub name: String,
    pub data: EntryData,
    pub is_favorite: bool,
    pub tags: Vec<String>,
}

/// Category info for UI display.
pub struct CategoryInfo {
    pub category_uuid: String,
    pub category_name: String,
    pub is_direct_mapping: bool,
    pub default_entry_type: String,
}

/// Get category info for a 1pux category UUID.
pub fn get_category_info(category_uuid: &str) -> CategoryInfo {
    let (name, is_direct, entry_type) = match category_uuid {
        "001" => ("Login", true, "login"),
        "002" => ("Credit Card", true, "credit_card"),
        "004" => ("Secure Note", true, "secure_note"),
        "005" => ("Password", true, "password"),
        "100" => ("Software License", true, "software_license"),
        "101" => ("Bank Account", true, "bank"),
        "105" => ("SSH Key", true, "ssh_key"),
        // Indirect mappings
        "003" => ("Identity", false, "secure_note"),
        "006" => ("Document", false, "secure_note"),
        "107" => ("API Credential", false, "login"),
        "102" => ("Database", false, "login"),
        "104" => ("Email Account", false, "login"),
        "112" => ("Server", false, "login"),
        "114" => ("Wireless Router", false, "login"),
        "111" => ("Social Security Number", false, "password"),
        "108" => ("Crypto Wallet", false, "secure_note"),
        "103" => ("Driver License", false, "secure_note"),
        "113" => ("Medical Record", false, "secure_note"),
        "106" => ("Membership", false, "secure_note"),
        "109" => ("Outdoor License", false, "secure_note"),
        "110" => ("Passport", false, "secure_note"),
        "115" => ("Reward Program", false, "secure_note"),
        _ => ("Unknown", false, "secure_note"),
    };

    CategoryInfo {
        category_uuid: category_uuid.to_string(),
        category_name: name.to_string(),
        is_direct_mapping: is_direct,
        default_entry_type: entry_type.to_string(),
    }
}

/// Map a parsed 1pux item to a kura entry with a specific target type.
pub fn map_item(item: &ParsedItem, target_entry_type: &str) -> MappedEntry {
    let (data, name) = match target_entry_type {
        "login" => map_to_login(item),
        "credit_card" => map_to_credit_card(item),
        "secure_note" => map_to_secure_note(item),
        "password" => map_to_password(item),
        "software_license" => map_to_software_license(item),
        "bank" => map_to_bank(item),
        "ssh_key" => map_to_ssh_key(item),
        _ => map_to_secure_note(item),
    };

    MappedEntry {
        entry_type: target_entry_type.to_string(),
        name: name.unwrap_or_else(|| item.title.clone()),
        data,
        is_favorite: item.is_favorite,
        tags: item.tags.clone(),
    }
}

fn map_to_login(item: &ParsedItem) -> (EntryData, Option<String>) {
    let extra_fields = build_extra_custom_fields(item, &["username", "password", "url"]);

    let mut data = EntryData::new_login(
        item.url.clone(),
        item.username.clone().unwrap_or_default(),
        item.password.clone().unwrap_or_default(),
        build_notes(item),
    );
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_credit_card(item: &ParsedItem) -> (EntryData, Option<String>) {
    let cardholder = find_field_value(item, &["cardholder name", "cardholder"]).unwrap_or_default();
    let number = find_field_value(item, &["card number", "number", "ccnum"]).unwrap_or_default();
    let expiry = find_field_value(item, &["expiry date", "expiry", "expdate"]).unwrap_or_default();
    let cvv = find_field_value(item, &["verification number", "cvv"]).unwrap_or_default();
    let pin = find_field_value(item, &["pin"]).unwrap_or_default();

    let skip = ["cardholder name", "cardholder", "card number", "number", "ccnum",
                 "expiry date", "expiry", "expdate", "verification number", "cvv", "pin",
                 "type", "valid from"];
    let extra_fields = build_filtered_custom_fields(item, &skip);

    let mut data = EntryData::new_credit_card(cardholder, number, expiry, cvv, pin, build_notes(item));
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_secure_note(item: &ParsedItem) -> (EntryData, Option<String>) {
    let category_info = get_category_info(&item.category_uuid);

    let content = if category_info.is_direct_mapping {
        // Direct SecureNote: use notesPlain as content
        item.notes.clone().unwrap_or_default()
    } else {
        // Indirect: build structured content
        build_secure_note_content(item, &category_info.category_name)
    };

    let notes = if category_info.is_direct_mapping {
        None
    } else {
        // For indirect mapping, notesPlain goes to notes field
        item.notes.clone()
    };

    let custom_fields = build_all_custom_fields(item);

    let mut data = EntryData::new_secure_note(content, notes);
    if !custom_fields.is_empty() {
        data.custom_fields = Some(custom_fields);
    }

    // Add attachment warning to notes
    if item.has_attachments {
        let attachment_note = format!(
            "\n\n[添付ファイル: {} - kuraは添付ファイルをサポートしていません]",
            item.attachment_file_name.as_deref().unwrap_or("unknown")
        );
        if let Some(ref mut n) = data.notes {
            n.push_str(&attachment_note);
        } else {
            data.notes = Some(attachment_note);
        }
    }

    (data, None)
}

fn map_to_password(item: &ParsedItem) -> (EntryData, Option<String>) {
    let password = item.password.clone()
        .or_else(|| find_field_value(item, &["password", "ssn"]))
        .unwrap_or_default();
    let username = item.username.clone().unwrap_or_default();

    let extra_fields = build_extra_custom_fields(item, &["password", "username", "ssn"]);

    let mut data = EntryData::new_password(username, password, build_notes(item));
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_software_license(item: &ParsedItem) -> (EntryData, Option<String>) {
    let license_key = find_field_value(item, &["license key", "reg code", "product key", "key"])
        .unwrap_or_default();

    let skip = ["license key", "reg code", "product key", "key"];
    let extra_fields = build_filtered_custom_fields(item, &skip);

    let mut data = EntryData::new_software_license(license_key, build_notes(item));
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_bank(item: &ParsedItem) -> (EntryData, Option<String>) {
    let bank_name = find_field_value(item, &["bank name", "bank"]).unwrap_or_default();
    let account_holder = find_field_value(item, &["owner", "name on account", "account holder"]).unwrap_or_default();
    let branch_code = find_field_value(item, &["routing number", "branch code", "sort code"]).unwrap_or_default();
    let account_type = find_field_value(item, &["type", "account type"]).unwrap_or_default();
    let account_number = find_field_value(item, &["account number"]).unwrap_or_default();
    let pin = find_field_value(item, &["pin"]).unwrap_or_default();

    let skip = ["bank name", "bank", "owner", "name on account", "account holder",
                 "routing number", "branch code", "sort code", "type", "account type",
                 "account number", "pin"];
    let extra_fields = build_filtered_custom_fields(item, &skip);

    let mut data = EntryData::new_bank(bank_name, account_holder, branch_code, account_type, account_number, pin, build_notes(item));
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_ssh_key(item: &ParsedItem) -> (EntryData, Option<String>) {
    let private_key = find_field_value(item, &["private key"])
        .or_else(|| find_concealed_field(item))
        .unwrap_or_default();

    let skip = ["private key"];
    let extra_fields = build_filtered_custom_fields(item, &skip);

    let mut data = EntryData::new_ssh_key(private_key, build_notes(item));
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

// ============================================================================
// Helper functions
// ============================================================================

fn build_notes(item: &ParsedItem) -> Option<String> {
    item.notes.clone()
}

fn find_field_value(item: &ParsedItem, names: &[&str]) -> Option<String> {
    for field in &item.fields {
        let title_lower = field.field_title.to_lowercase();
        for name in names {
            if title_lower == *name {
                let val = field.value.to_string_value();
                if !val.is_empty() {
                    return Some(val);
                }
            }
        }
    }
    None
}

fn find_concealed_field(item: &ParsedItem) -> Option<String> {
    for field in &item.fields {
        if matches!(field.value, ParsedFieldValue::Concealed(_)) {
            let val = field.value.to_string_value();
            if !val.is_empty() {
                return Some(val);
            }
        }
    }
    None
}

fn build_all_custom_fields(item: &ParsedItem) -> Vec<CustomField> {
    item.fields.iter().map(|f| {
        CustomField {
            id: uuid::Uuid::new_v4().to_string(),
            name: f.field_title.clone(),
            field_type: f.value.custom_field_type().to_string(),
            value: f.value.to_string_value(),
        }
    }).collect()
}

fn build_extra_custom_fields(item: &ParsedItem, skip_typed: &[&str]) -> Vec<CustomField> {
    build_filtered_custom_fields(item, skip_typed)
}

fn build_filtered_custom_fields(item: &ParsedItem, skip_names: &[&str]) -> Vec<CustomField> {
    item.fields.iter()
        .filter(|f| {
            let title_lower = f.field_title.to_lowercase();
            !skip_names.iter().any(|s| title_lower == *s)
        })
        .map(|f| {
            CustomField {
                id: uuid::Uuid::new_v4().to_string(),
                name: f.field_title.clone(),
                field_type: f.value.custom_field_type().to_string(),
                value: f.value.to_string_value(),
            }
        })
        .collect()
}

fn build_secure_note_content(item: &ParsedItem, category_name: &str) -> String {
    let mut content = format!("[1Password: {}]\n", category_name);

    // Group fields by section
    let mut current_section: Option<&str> = None;
    for field in &item.fields {
        let section = field.section_title.as_deref();
        if section != current_section {
            if let Some(s) = section {
                content.push_str(&format!("\n--- {} ---\n", s));
            }
            current_section = section;
        }
        let value = field.value.to_string_value();
        if !value.is_empty() {
            content.push_str(&format!("{}: {}\n", field.field_title, value));
        }
    }

    content
}

#[cfg(test)]
mod tests {
    use super::*;
    use super::super::types::*;

    fn make_login_item() -> ParsedItem {
        ParsedItem {
            uuid: "test-uuid".into(),
            title: "Example Login".into(),
            category_uuid: "001".into(),
            vault_name: "Personal".into(),
            url: Some("https://example.com".into()),
            urls: vec!["https://example.com".into()],
            username: Some("user@example.com".into()),
            password: Some("secret123".into()),
            notes: Some("My notes".into()),
            tags: vec!["work".into()],
            fields: vec![
                ParsedField {
                    section_title: Some("Extra".into()),
                    field_title: "Recovery Email".into(),
                    value: ParsedFieldValue::Email("recovery@example.com".into()),
                },
            ],
            has_attachments: false,
            attachment_file_name: None,
            is_favorite: true,
            created_at: 1700000000,
            updated_at: 1700000000,
        }
    }

    #[test]
    fn test_map_login() {
        let item = make_login_item();
        let mapped = map_item(&item, "login");

        assert_eq!(mapped.entry_type, "login");
        assert_eq!(mapped.name, "Example Login");
        assert!(mapped.is_favorite);

        let tv = &mapped.data.typed_value;
        assert_eq!(tv["username"], "user@example.com");
        assert_eq!(tv["password"], "secret123");
        assert_eq!(tv["url"], "https://example.com");

        // Extra field should be in custom_fields
        let cf = mapped.data.custom_fields.as_ref().unwrap();
        assert_eq!(cf.len(), 1);
        assert_eq!(cf[0].name, "Recovery Email");
        assert_eq!(cf[0].field_type, "email");
    }

    #[test]
    fn test_map_to_secure_note_fallback() {
        let item = ParsedItem {
            uuid: "id".into(),
            title: "John Doe".into(),
            category_uuid: "003".into(), // Identity
            vault_name: "Personal".into(),
            url: None,
            urls: vec![],
            username: None,
            password: None,
            notes: Some("Original notes".into()),
            tags: vec![],
            fields: vec![
                ParsedField {
                    section_title: Some("Name".into()),
                    field_title: "first name".into(),
                    value: ParsedFieldValue::Text("John".into()),
                },
                ParsedField {
                    section_title: Some("Name".into()),
                    field_title: "last name".into(),
                    value: ParsedFieldValue::Text("Doe".into()),
                },
            ],
            has_attachments: false,
            attachment_file_name: None,
            is_favorite: false,
            created_at: 1700000000,
            updated_at: 1700000000,
        };

        let mapped = map_item(&item, "secure_note");
        assert_eq!(mapped.entry_type, "secure_note");

        let content = mapped.data.typed_value["content"].as_str().unwrap();
        assert!(content.contains("[1Password: Identity]"));
        assert!(content.contains("first name: John"));

        // notes should be preserved separately
        assert_eq!(mapped.data.notes.as_deref(), Some("Original notes"));

        // Fields also in custom_fields
        let cf = mapped.data.custom_fields.as_ref().unwrap();
        assert_eq!(cf.len(), 2);
    }

    #[test]
    fn test_category_info() {
        let info = get_category_info("001");
        assert_eq!(info.category_name, "Login");
        assert!(info.is_direct_mapping);
        assert_eq!(info.default_entry_type, "login");

        let info = get_category_info("003");
        assert_eq!(info.category_name, "Identity");
        assert!(!info.is_direct_mapping);
        assert_eq!(info.default_entry_type, "secure_note");
    }
}
