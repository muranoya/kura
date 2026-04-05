use crate::models::{CustomField, EntryData};

use super::types::{ParsedFieldValue, ParsedItem};

/// Mapping result from a 1pux item to a kura entry.
pub struct MappedEntry {
    pub entry_type: String,
    pub name: String,
    pub data: EntryData,
    pub is_favorite: bool,
    pub tags: Vec<String>,
    pub created_at: i64,
    pub updated_at: i64,
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
        created_at: item.created_at,
        updated_at: item.updated_at,
    }
}

fn map_to_login(item: &ParsedItem) -> (EntryData, Option<String>) {
    let skip_ids = &["username", "password"];
    let skip_titles = &["username", "password", "url"];
    let extra_fields = build_filtered_fields(item, skip_ids, skip_titles);

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
    let cardholder =
        find_field(item, &["cardholder"], &["cardholder name", "cardholder"]).unwrap_or_default();
    let number =
        find_field(item, &["ccnum"], &["card number", "number", "ccnum"]).unwrap_or_default();
    let expiry =
        find_field(item, &["expiry"], &["expiry date", "expiry", "expdate"]).unwrap_or_default();
    let cvv = find_field(item, &["cvv"], &["verification number", "cvv"]).unwrap_or_default();
    let pin = find_field(item, &["pin"], &["pin"]).unwrap_or_default();

    let skip_ids = &[
        "cardholder",
        "ccnum",
        "expiry",
        "cvv",
        "pin",
        "type",
        "validFrom",
    ];
    let skip_titles = &[
        "cardholder name",
        "cardholder",
        "card number",
        "number",
        "ccnum",
        "expiry date",
        "expiry",
        "expdate",
        "verification number",
        "cvv",
        "pin",
        "type",
        "valid from",
    ];
    let extra_fields = build_filtered_fields(item, skip_ids, skip_titles);

    let mut data =
        EntryData::new_credit_card(cardholder, number, expiry, cvv, pin, build_notes(item));
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_secure_note(item: &ParsedItem) -> (EntryData, Option<String>) {
    let content = item.notes.clone().unwrap_or_default();
    let notes: Option<String> = None;

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
    let password = item
        .password
        .clone()
        .or_else(|| find_field(item, &["password"], &["password", "ssn"]))
        .unwrap_or_default();
    let username = item.username.clone().unwrap_or_default();

    let skip_ids = &["password", "username"];
    let skip_titles = &["password", "username", "ssn"];
    let extra_fields = build_filtered_fields(item, skip_ids, skip_titles);

    let mut data = EntryData::new_password(username, password, build_notes(item));
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_software_license(item: &ParsedItem) -> (EntryData, Option<String>) {
    let license_key_titles = [
        "license key",
        "reg code",
        "product key",
        "key",
        "ライセンスキー",
        "登録コード",
        "プロダクトキー",
    ];
    let license_key = find_field(item, &["reg_code"], &license_key_titles).unwrap_or_default();

    let skip_ids = &["reg_code"];
    let extra_fields = build_filtered_fields(item, skip_ids, &license_key_titles);

    let mut data = EntryData::new_software_license(license_key, build_notes(item));
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_bank(item: &ParsedItem) -> (EntryData, Option<String>) {
    let bank_name = find_field(item, &["bankName"], &["bank name", "bank"]).unwrap_or_default();
    let account_holder = find_field(
        item,
        &["owner"],
        &["owner", "name on account", "account holder"],
    )
    .unwrap_or_default();
    let branch_code = find_field(
        item,
        &["routingNo"],
        &["routing number", "branch code", "sort code"],
    )
    .unwrap_or_default();
    let account_type =
        find_field(item, &["accountType"], &["type", "account type"]).unwrap_or_default();
    let account_number = find_field(item, &["accountNo"], &["account number"]).unwrap_or_default();
    let pin = find_field(item, &["PIN"], &["pin"]).unwrap_or_default();

    let skip_ids = &[
        "bankName",
        "owner",
        "routingNo",
        "accountType",
        "accountNo",
        "PIN",
    ];
    let skip_titles = &[
        "bank name",
        "bank",
        "owner",
        "name on account",
        "account holder",
        "routing number",
        "branch code",
        "sort code",
        "type",
        "account type",
        "account number",
        "pin",
    ];
    let extra_fields = build_filtered_fields(item, skip_ids, skip_titles);

    let mut data = EntryData::new_bank(
        bank_name,
        account_holder,
        branch_code,
        account_type,
        account_number,
        pin,
        build_notes(item),
    );
    if !extra_fields.is_empty() {
        data.custom_fields = Some(extra_fields);
    }
    (data, None)
}

fn map_to_ssh_key(item: &ParsedItem) -> (EntryData, Option<String>) {
    let private_key = find_field(item, &["privateKey"], &["private key"])
        .or_else(|| find_concealed_field(item))
        .unwrap_or_default();

    let skip_ids = &["privateKey"];
    let skip_titles = &["private key"];
    let extra_fields = build_filtered_fields(item, skip_ids, skip_titles);

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

/// Search by field ID first, then fall back to title matching.
fn find_field(item: &ParsedItem, ids: &[&str], title_fallbacks: &[&str]) -> Option<String> {
    // Primary: match by 1Password field ID (locale-independent)
    for field in &item.fields {
        if let Some(ref fid) = field.field_id {
            if ids.iter().any(|id| fid == id) {
                let val = field.value.to_string_value();
                if !val.is_empty() {
                    return Some(val);
                }
            }
        }
    }
    // Fallback: match by title (case-insensitive)
    find_field_by_title(item, title_fallbacks)
}

fn find_field_by_title(item: &ParsedItem, names: &[&str]) -> Option<String> {
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
    item.fields
        .iter()
        .map(|f| CustomField {
            id: uuid::Uuid::new_v4().to_string(),
            name: f.field_title.clone(),
            field_type: f.value.custom_field_type().to_string(),
            value: f.value.to_string_value(),
        })
        .collect()
}

/// Filter out fields that match known IDs or title fallbacks, returning the rest as custom fields.
fn build_filtered_fields(
    item: &ParsedItem,
    skip_ids: &[&str],
    skip_titles: &[&str],
) -> Vec<CustomField> {
    item.fields
        .iter()
        .filter(|f| {
            // Skip if field ID matches
            if let Some(ref fid) = f.field_id {
                if skip_ids.iter().any(|id| fid == id) {
                    return false;
                }
            }
            // Skip if title matches (case-insensitive)
            let title_lower = f.field_title.to_lowercase();
            !skip_titles.iter().any(|s| title_lower == *s)
        })
        .map(|f| CustomField {
            id: uuid::Uuid::new_v4().to_string(),
            name: f.field_title.clone(),
            field_type: f.value.custom_field_type().to_string(),
            value: f.value.to_string_value(),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::types::*;
    use super::*;

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
            fields: vec![ParsedField {
                field_id: Some("extra_email".into()),
                section_title: Some("Extra".into()),
                field_title: "Recovery Email".into(),
                value: ParsedFieldValue::Email("recovery@example.com".into()),
            }],
            has_attachments: false,
            attachment_file_name: None,
            is_favorite: true,
            is_archived: false,
            is_trashed: false,
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
                    field_id: Some("firstname".into()),
                    section_title: Some("Name".into()),
                    field_title: "first name".into(),
                    value: ParsedFieldValue::Text("John".into()),
                },
                ParsedField {
                    field_id: Some("lastname".into()),
                    section_title: Some("Name".into()),
                    field_title: "last name".into(),
                    value: ParsedFieldValue::Text("Doe".into()),
                },
            ],
            has_attachments: false,
            attachment_file_name: None,
            is_favorite: false,
            is_archived: false,
            is_trashed: false,
            created_at: 1700000000,
            updated_at: 1700000000,
        };

        let mapped = map_item(&item, "secure_note");
        assert_eq!(mapped.entry_type, "secure_note");

        let content = mapped.data.typed_value["content"].as_str().unwrap();
        assert_eq!(content, "Original notes");

        // notes should be None (content has the notes)
        assert!(mapped.data.notes.is_none());

        // Fields also in custom_fields
        let cf = mapped.data.custom_fields.as_ref().unwrap();
        assert_eq!(cf.len(), 2);
    }

    #[test]
    fn test_map_bank_with_japanese_titles() {
        let item = ParsedItem {
            uuid: "bank-uuid".into(),
            title: "ソニー銀行".into(),
            category_uuid: "101".into(),
            vault_name: "Personal".into(),
            url: None,
            urls: vec![],
            username: None,
            password: None,
            notes: None,
            tags: vec![],
            fields: vec![
                ParsedField {
                    field_id: Some("bankName".into()),
                    section_title: Some("".into()),
                    field_title: "銀行名".into(),
                    value: ParsedFieldValue::Text("ソニー銀行".into()),
                },
                ParsedField {
                    field_id: Some("owner".into()),
                    section_title: Some("".into()),
                    field_title: "口座名義".into(),
                    value: ParsedFieldValue::Text("山田太郎".into()),
                },
                ParsedField {
                    field_id: Some("accountType".into()),
                    section_title: Some("".into()),
                    field_title: "種類".into(),
                    value: ParsedFieldValue::Text("savings".into()),
                },
                ParsedField {
                    field_id: Some("routingNo".into()),
                    section_title: Some("".into()),
                    field_title: "銀行支店コード".into(),
                    value: ParsedFieldValue::Text("001".into()),
                },
                ParsedField {
                    field_id: Some("accountNo".into()),
                    section_title: Some("".into()),
                    field_title: "口座番号".into(),
                    value: ParsedFieldValue::Text("5880798".into()),
                },
                // User-added custom field (UUID-like ID)
                ParsedField {
                    field_id: Some("ormiknn2oth6tueuf2vj2ab354".into()),
                    section_title: Some("".into()),
                    field_title: "銀行支店名".into(),
                    value: ParsedFieldValue::Text("本店営業部".into()),
                },
            ],
            has_attachments: false,
            attachment_file_name: None,
            is_favorite: false,
            is_archived: false,
            is_trashed: false,
            created_at: 1728902631,
            updated_at: 1728902706,
        };

        let mapped = map_item(&item, "bank");
        assert_eq!(mapped.entry_type, "bank");
        assert_eq!(mapped.name, "ソニー銀行");

        let tv = &mapped.data.typed_value;
        assert_eq!(tv["bank_name"], "ソニー銀行");
        assert_eq!(tv["account_holder"], "山田太郎");
        assert_eq!(tv["account_type"], "savings");
        assert_eq!(tv["branch_code"], "001");
        assert_eq!(tv["account_number"], "5880798");

        // User-added field should be in custom_fields
        let cf = mapped.data.custom_fields.as_ref().unwrap();
        assert_eq!(cf.len(), 1);
        assert_eq!(cf[0].name, "銀行支店名");
        assert_eq!(cf[0].value, "本店営業部");
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
