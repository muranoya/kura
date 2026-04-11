use crate::models::{Entry, Label};

use super::types::*;

/// Convert a Unix timestamp (seconds) to ISO 8601 UTC string.
fn unix_to_iso8601(ts: i64) -> String {
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
        .unwrap_or_default()
}

/// Map kura custom field type string to Bitwarden field type.
fn map_custom_field_type(kura_type: &str) -> u8 {
    match kura_type {
        "password" | "totp" => BITWARDEN_FIELD_HIDDEN,
        _ => BITWARDEN_FIELD_TEXT,
    }
}

/// Convert kura custom fields to Bitwarden fields.
fn map_custom_fields(entry: &Entry) -> Vec<BitwardenField> {
    entry
        .data
        .custom_fields
        .as_ref()
        .map(|fields| {
            fields
                .iter()
                .map(|f| BitwardenField {
                    name: f.name.clone(),
                    value: f.value.clone(),
                    field_type: map_custom_field_type(&f.field_type),
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Get an optional string field from typed_value JSON.
fn get_opt_str(value: &serde_json::Value, key: &str) -> Option<String> {
    value
        .get(key)
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// Extract TOTP value from custom fields, removing it from the fields list.
/// Returns (totp_value, remaining_fields).
fn extract_totp(entry: &Entry) -> (Option<String>, Vec<BitwardenField>) {
    let mut totp = None;
    let mut fields = Vec::new();

    if let Some(custom_fields) = &entry.data.custom_fields {
        for f in custom_fields {
            if f.field_type == "totp" && totp.is_none() {
                totp = Some(f.value.clone());
            } else {
                fields.push(BitwardenField {
                    name: f.name.clone(),
                    value: f.value.clone(),
                    field_type: map_custom_field_type(&f.field_type),
                });
            }
        }
    }

    (totp, fields)
}

/// Map a kura login entry to a Bitwarden login item.
fn map_login(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    let tv = &entry.data.typed_value;
    let (totp, fields) = extract_totp(entry);

    let uris = get_opt_str(tv, "url").map(|url| {
        vec![BitwardenUri {
            uri: url,
            match_type: None,
        }]
    });

    BitwardenItem {
        id: entry.id.clone(),
        folder_id,
        item_type: BITWARDEN_TYPE_LOGIN,
        name: entry.name.clone(),
        notes: entry.data.notes.clone(),
        favorite: entry.is_favorite,
        login: Some(BitwardenLogin {
            uris,
            username: get_opt_str(tv, "username"),
            password: get_opt_str(tv, "password"),
            totp,
        }),
        secure_note: None,
        card: None,
        fields: if fields.is_empty() {
            None
        } else {
            Some(fields)
        },
        creation_date: unix_to_iso8601(entry.created_at),
        revision_date: unix_to_iso8601(entry.updated_at),
    }
}

/// Map a kura password entry to a Bitwarden login item (no URI).
fn map_password(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    let tv = &entry.data.typed_value;
    let fields = map_custom_fields(entry);

    BitwardenItem {
        id: entry.id.clone(),
        folder_id,
        item_type: BITWARDEN_TYPE_LOGIN,
        name: entry.name.clone(),
        notes: entry.data.notes.clone(),
        favorite: entry.is_favorite,
        login: Some(BitwardenLogin {
            uris: None,
            username: get_opt_str(tv, "username"),
            password: get_opt_str(tv, "password"),
            totp: None,
        }),
        secure_note: None,
        card: None,
        fields: if fields.is_empty() {
            None
        } else {
            Some(fields)
        },
        creation_date: unix_to_iso8601(entry.created_at),
        revision_date: unix_to_iso8601(entry.updated_at),
    }
}

/// Map a kura credit_card entry to a Bitwarden card item.
fn map_credit_card(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    let tv = &entry.data.typed_value;
    let mut fields = map_custom_fields(entry);

    // PIN goes into a hidden custom field
    if let Some(pin) = get_opt_str(tv, "pin") {
        fields.push(BitwardenField {
            name: "PIN".to_string(),
            value: pin,
            field_type: BITWARDEN_FIELD_HIDDEN,
        });
    }

    // Parse expiry "MM/YY" or "MM/YYYY" into separate month/year
    let (exp_month, exp_year) = get_opt_str(tv, "expiry")
        .and_then(|expiry| {
            let parts: Vec<&str> = expiry.split('/').collect();
            if parts.len() == 2 {
                let month = parts[0].to_string();
                let year = if parts[1].len() == 2 {
                    format!("20{}", parts[1])
                } else {
                    parts[1].to_string()
                };
                Some((Some(month), Some(year)))
            } else {
                None
            }
        })
        .unwrap_or((None, None));

    BitwardenItem {
        id: entry.id.clone(),
        folder_id,
        item_type: BITWARDEN_TYPE_CARD,
        name: entry.name.clone(),
        notes: entry.data.notes.clone(),
        favorite: entry.is_favorite,
        login: None,
        secure_note: None,
        card: Some(BitwardenCard {
            cardholder_name: get_opt_str(tv, "cardholder"),
            brand: None,
            number: get_opt_str(tv, "number"),
            exp_month,
            exp_year,
            code: get_opt_str(tv, "cvv"),
        }),
        fields: if fields.is_empty() {
            None
        } else {
            Some(fields)
        },
        creation_date: unix_to_iso8601(entry.created_at),
        revision_date: unix_to_iso8601(entry.updated_at),
    }
}

/// Map a kura secure_note entry to a Bitwarden secure note item.
fn map_secure_note(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    let tv = &entry.data.typed_value;
    let fields = map_custom_fields(entry);

    // SecureNote: content goes into notes. If entry already has notes, combine them.
    let content = get_opt_str(tv, "content");
    let notes = match (&entry.data.notes, &content) {
        (Some(n), Some(c)) => Some(format!("{}\n\n{}", c, n)),
        (None, Some(c)) => Some(c.clone()),
        (Some(n), None) => Some(n.clone()),
        (None, None) => None,
    };

    BitwardenItem {
        id: entry.id.clone(),
        folder_id,
        item_type: BITWARDEN_TYPE_SECURE_NOTE,
        name: entry.name.clone(),
        notes,
        favorite: entry.is_favorite,
        login: None,
        secure_note: Some(BitwardenSecureNote {
            note_type: BITWARDEN_SECURE_NOTE_GENERIC,
        }),
        card: None,
        fields: if fields.is_empty() {
            None
        } else {
            Some(fields)
        },
        creation_date: unix_to_iso8601(entry.created_at),
        revision_date: unix_to_iso8601(entry.updated_at),
    }
}

/// Map a kura bank entry to a Bitwarden secure note with typed fields as custom fields.
fn map_bank(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    let tv = &entry.data.typed_value;
    let mut fields = Vec::new();

    // Add bank-specific fields as Bitwarden custom fields
    let text_fields = [
        ("bank_name", "Bank Name"),
        ("account_holder", "Account Holder"),
        ("branch_code", "Branch Code"),
        ("account_type", "Account Type"),
        ("account_number", "Account Number"),
    ];
    for (key, name) in &text_fields {
        if let Some(val) = get_opt_str(tv, key) {
            fields.push(BitwardenField {
                name: name.to_string(),
                value: val,
                field_type: BITWARDEN_FIELD_TEXT,
            });
        }
    }

    // PIN as hidden field
    if let Some(pin) = get_opt_str(tv, "pin") {
        fields.push(BitwardenField {
            name: "PIN".to_string(),
            value: pin,
            field_type: BITWARDEN_FIELD_HIDDEN,
        });
    }

    // Append original custom fields
    fields.extend(map_custom_fields(entry));

    BitwardenItem {
        id: entry.id.clone(),
        folder_id,
        item_type: BITWARDEN_TYPE_SECURE_NOTE,
        name: entry.name.clone(),
        notes: entry.data.notes.clone(),
        favorite: entry.is_favorite,
        login: None,
        secure_note: Some(BitwardenSecureNote {
            note_type: BITWARDEN_SECURE_NOTE_GENERIC,
        }),
        card: None,
        fields: if fields.is_empty() {
            None
        } else {
            Some(fields)
        },
        creation_date: unix_to_iso8601(entry.created_at),
        revision_date: unix_to_iso8601(entry.updated_at),
    }
}

/// Map a kura ssh_key entry to a Bitwarden secure note with private_key as hidden field.
fn map_ssh_key(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    let tv = &entry.data.typed_value;
    let mut fields = Vec::new();

    if let Some(key) = get_opt_str(tv, "private_key") {
        fields.push(BitwardenField {
            name: "Private Key".to_string(),
            value: key,
            field_type: BITWARDEN_FIELD_HIDDEN,
        });
    }

    fields.extend(map_custom_fields(entry));

    BitwardenItem {
        id: entry.id.clone(),
        folder_id,
        item_type: BITWARDEN_TYPE_SECURE_NOTE,
        name: entry.name.clone(),
        notes: entry.data.notes.clone(),
        favorite: entry.is_favorite,
        login: None,
        secure_note: Some(BitwardenSecureNote {
            note_type: BITWARDEN_SECURE_NOTE_GENERIC,
        }),
        card: None,
        fields: if fields.is_empty() {
            None
        } else {
            Some(fields)
        },
        creation_date: unix_to_iso8601(entry.created_at),
        revision_date: unix_to_iso8601(entry.updated_at),
    }
}

/// Map a kura software_license entry to a Bitwarden secure note.
fn map_software_license(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    let tv = &entry.data.typed_value;
    let mut fields = Vec::new();

    if let Some(key) = get_opt_str(tv, "license_key") {
        fields.push(BitwardenField {
            name: "License Key".to_string(),
            value: key,
            field_type: BITWARDEN_FIELD_TEXT,
        });
    }

    fields.extend(map_custom_fields(entry));

    BitwardenItem {
        id: entry.id.clone(),
        folder_id,
        item_type: BITWARDEN_TYPE_SECURE_NOTE,
        name: entry.name.clone(),
        notes: entry.data.notes.clone(),
        favorite: entry.is_favorite,
        login: None,
        secure_note: Some(BitwardenSecureNote {
            note_type: BITWARDEN_SECURE_NOTE_GENERIC,
        }),
        card: None,
        fields: if fields.is_empty() {
            None
        } else {
            Some(fields)
        },
        creation_date: unix_to_iso8601(entry.created_at),
        revision_date: unix_to_iso8601(entry.updated_at),
    }
}

/// Map an unknown entry type to a Bitwarden secure note.
/// All typed_value fields become custom fields for data preservation.
fn map_unknown(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    let tv = &entry.data.typed_value;
    let mut fields = Vec::new();

    // Serialize all typed_value fields as text custom fields
    if let Some(obj) = tv.as_object() {
        for (key, val) in obj {
            let value_str = match val {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            if !value_str.is_empty() {
                fields.push(BitwardenField {
                    name: key.clone(),
                    value: value_str,
                    field_type: BITWARDEN_FIELD_TEXT,
                });
            }
        }
    }

    fields.extend(map_custom_fields(entry));

    BitwardenItem {
        id: entry.id.clone(),
        folder_id,
        item_type: BITWARDEN_TYPE_SECURE_NOTE,
        name: entry.name.clone(),
        notes: entry.data.notes.clone(),
        favorite: entry.is_favorite,
        login: None,
        secure_note: Some(BitwardenSecureNote {
            note_type: BITWARDEN_SECURE_NOTE_GENERIC,
        }),
        card: None,
        fields: if fields.is_empty() {
            None
        } else {
            Some(fields)
        },
        creation_date: unix_to_iso8601(entry.created_at),
        revision_date: unix_to_iso8601(entry.updated_at),
    }
}

/// Convert a kura Entry to a Bitwarden Item.
pub fn map_entry(entry: &Entry, folder_id: Option<String>) -> BitwardenItem {
    match entry.entry_type.as_str() {
        "login" => map_login(entry, folder_id),
        "password" => map_password(entry, folder_id),
        "credit_card" => map_credit_card(entry, folder_id),
        "secure_note" => map_secure_note(entry, folder_id),
        "bank" => map_bank(entry, folder_id),
        "ssh_key" => map_ssh_key(entry, folder_id),
        "software_license" => map_software_license(entry, folder_id),
        _ => map_unknown(entry, folder_id),
    }
}

/// Convert kura Labels to Bitwarden Folders.
pub fn map_labels_to_folders(labels: &[Label]) -> Vec<BitwardenFolder> {
    labels
        .iter()
        .map(|label| BitwardenFolder {
            id: label.id.clone(),
            name: label.name.clone(),
        })
        .collect()
}

/// Resolve the folder ID for an entry based on its label IDs.
/// Returns the first label ID if the entry has labels, None otherwise.
pub fn resolve_folder_id(_entry: &Entry, label_ids: &[String]) -> Option<String> {
    label_ids.first().cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{entry_data::CustomField, EntryData};

    fn make_entry(entry_type: &str, name: &str, data: EntryData, labels: Vec<String>) -> Entry {
        Entry {
            id: "test-id".to_string(),
            name: name.to_string(),
            entry_type: entry_type.to_string(),
            is_favorite: false,
            created_at: 1700000000,
            updated_at: 1700000000,
            deleted_at: None,
            data,
            labels,
        }
    }

    #[test]
    fn test_map_login_basic() {
        let data = EntryData::new_login(
            Some("https://example.com".into()),
            "user@example.com".into(),
            "secret123".into(),
            Some("my notes".into()),
        );
        let entry = make_entry("login", "Example Login", data, vec![]);
        let item = map_entry(&entry, None);

        assert_eq!(item.item_type, BITWARDEN_TYPE_LOGIN);
        assert_eq!(item.name, "Example Login");
        assert_eq!(item.notes, Some("my notes".to_string()));

        let login = item.login.unwrap();
        assert_eq!(login.username, Some("user@example.com".to_string()));
        assert_eq!(login.password, Some("secret123".to_string()));
        assert_eq!(login.uris.as_ref().unwrap()[0].uri, "https://example.com");
        assert!(login.totp.is_none());
    }

    #[test]
    fn test_map_login_with_totp() {
        let mut data = EntryData::new_login(
            Some("https://example.com".into()),
            "user".into(),
            "pass".into(),
            None,
        );
        data.custom_fields = Some(vec![
            CustomField {
                id: "cf1".to_string(),
                name: "TOTP".to_string(),
                field_type: "totp".to_string(),
                value: "otpauth://totp/test?secret=ABC".to_string(),
            },
            CustomField {
                id: "cf2".to_string(),
                name: "Extra".to_string(),
                field_type: "text".to_string(),
                value: "some value".to_string(),
            },
        ]);
        let entry = make_entry("login", "With TOTP", data, vec![]);
        let item = map_entry(&entry, None);

        let login = item.login.unwrap();
        assert_eq!(
            login.totp,
            Some("otpauth://totp/test?secret=ABC".to_string())
        );
        // TOTP should be extracted, remaining fields kept
        let fields = item.fields.unwrap();
        assert_eq!(fields.len(), 1);
        assert_eq!(fields[0].name, "Extra");
    }

    #[test]
    fn test_map_password() {
        let data = EntryData::new_password("admin".into(), "p@ssw0rd".into(), None);
        let entry = make_entry("password", "Server Password", data, vec![]);
        let item = map_entry(&entry, None);

        assert_eq!(item.item_type, BITWARDEN_TYPE_LOGIN);
        let login = item.login.unwrap();
        assert!(login.uris.is_none());
        assert_eq!(login.username, Some("admin".to_string()));
        assert_eq!(login.password, Some("p@ssw0rd".to_string()));
    }

    #[test]
    fn test_map_credit_card() {
        let data = EntryData::new_credit_card(
            "Taro Tanaka".into(),
            "4111111111111111".into(),
            "12/25".into(),
            "123".into(),
            "0000".into(),
            None,
        );
        let entry = make_entry("credit_card", "My Card", data, vec![]);
        let item = map_entry(&entry, None);

        assert_eq!(item.item_type, BITWARDEN_TYPE_CARD);
        let card = item.card.unwrap();
        assert_eq!(card.cardholder_name, Some("Taro Tanaka".to_string()));
        assert_eq!(card.number, Some("4111111111111111".to_string()));
        assert_eq!(card.exp_month, Some("12".to_string()));
        assert_eq!(card.exp_year, Some("2025".to_string()));
        assert_eq!(card.code, Some("123".to_string()));

        // PIN should be in custom fields
        let fields = item.fields.unwrap();
        assert_eq!(fields.len(), 1);
        assert_eq!(fields[0].name, "PIN");
        assert_eq!(fields[0].value, "0000");
        assert_eq!(fields[0].field_type, BITWARDEN_FIELD_HIDDEN);
    }

    #[test]
    fn test_map_credit_card_four_digit_year() {
        let data = EntryData::new_credit_card(
            "Test".into(),
            "1234".into(),
            "03/2030".into(),
            "".into(),
            "".into(),
            None,
        );
        let entry = make_entry("credit_card", "Card", data, vec![]);
        let item = map_entry(&entry, None);

        let card = item.card.unwrap();
        assert_eq!(card.exp_month, Some("03".to_string()));
        assert_eq!(card.exp_year, Some("2030".to_string()));
    }

    #[test]
    fn test_map_secure_note() {
        let data =
            EntryData::new_secure_note("Important content".into(), Some("extra notes".into()));
        let entry = make_entry("secure_note", "My Note", data, vec![]);
        let item = map_entry(&entry, None);

        assert_eq!(item.item_type, BITWARDEN_TYPE_SECURE_NOTE);
        // content + notes are combined
        assert_eq!(
            item.notes,
            Some("Important content\n\nextra notes".to_string())
        );
        assert!(item.secure_note.is_some());
    }

    #[test]
    fn test_map_bank() {
        let data = EntryData::new_bank(
            "みずほ銀行".into(),
            "田中太郎".into(),
            "001".into(),
            "普通".into(),
            "1234567".into(),
            "9999".into(),
            None,
        );
        let entry = make_entry("bank", "Bank Account", data, vec![]);
        let item = map_entry(&entry, None);

        assert_eq!(item.item_type, BITWARDEN_TYPE_SECURE_NOTE);
        let fields = item.fields.unwrap();
        assert_eq!(fields.len(), 6);

        // Check bank fields
        assert_eq!(fields[0].name, "Bank Name");
        assert_eq!(fields[0].value, "みずほ銀行");
        assert_eq!(fields[0].field_type, BITWARDEN_FIELD_TEXT);

        // Check PIN is hidden
        let pin_field = fields.iter().find(|f| f.name == "PIN").unwrap();
        assert_eq!(pin_field.value, "9999");
        assert_eq!(pin_field.field_type, BITWARDEN_FIELD_HIDDEN);
    }

    #[test]
    fn test_map_ssh_key() {
        let data = EntryData::new_ssh_key(
            "-----BEGIN RSA-----\nkey data\n-----END RSA-----".into(),
            None,
        );
        let entry = make_entry("ssh_key", "My SSH Key", data, vec![]);
        let item = map_entry(&entry, None);

        assert_eq!(item.item_type, BITWARDEN_TYPE_SECURE_NOTE);
        let fields = item.fields.unwrap();
        assert_eq!(fields[0].name, "Private Key");
        assert_eq!(fields[0].field_type, BITWARDEN_FIELD_HIDDEN);
    }

    #[test]
    fn test_map_software_license() {
        let data = EntryData::new_software_license("ABCD-EFGH-1234".into(), None);
        let entry = make_entry("software_license", "My License", data, vec![]);
        let item = map_entry(&entry, None);

        assert_eq!(item.item_type, BITWARDEN_TYPE_SECURE_NOTE);
        let fields = item.fields.unwrap();
        assert_eq!(fields[0].name, "License Key");
        assert_eq!(fields[0].value, "ABCD-EFGH-1234");
        assert_eq!(fields[0].field_type, BITWARDEN_FIELD_TEXT);
    }

    #[test]
    fn test_map_unknown_type() {
        let data = EntryData {
            entry_type: "wifi_password".to_string(),
            notes: None,
            typed_value: serde_json::json!({
                "ssid": "MyNetwork",
                "password": "wifipass"
            }),
            custom_fields: None,
        };
        let entry = make_entry("wifi_password", "WiFi", data, vec![]);
        let item = map_entry(&entry, None);

        assert_eq!(item.item_type, BITWARDEN_TYPE_SECURE_NOTE);
        let fields = item.fields.unwrap();
        assert!(fields
            .iter()
            .any(|f| f.name == "ssid" && f.value == "MyNetwork"));
        assert!(fields
            .iter()
            .any(|f| f.name == "password" && f.value == "wifipass"));
    }

    #[test]
    fn test_map_labels_to_folders() {
        let labels = vec![
            Label {
                id: "l1".to_string(),
                name: "Work".to_string(),
                created_at: 1000,
            },
            Label {
                id: "l2".to_string(),
                name: "Personal".to_string(),
                created_at: 2000,
            },
        ];
        let folders = map_labels_to_folders(&labels);
        assert_eq!(folders.len(), 2);
        assert_eq!(folders[0].id, "l1");
        assert_eq!(folders[0].name, "Work");
    }

    #[test]
    fn test_resolve_folder_id() {
        let data = EntryData::new_login(None, "u".into(), "p".into(), None);
        let entry = make_entry("login", "Test", data, vec!["l1".into(), "l2".into()]);
        assert_eq!(
            resolve_folder_id(&entry, &entry.labels),
            Some("l1".to_string())
        );

        let data2 = EntryData::new_login(None, "u".into(), "p".into(), None);
        let entry_no_labels = make_entry("login", "Test", data2, vec![]);
        assert_eq!(
            resolve_folder_id(&entry_no_labels, &entry_no_labels.labels),
            None
        );
    }

    #[test]
    fn test_unix_to_iso8601() {
        assert_eq!(unix_to_iso8601(1700000000), "2023-11-14T22:13:20.000Z");
    }

    #[test]
    fn test_favorite_preserved() {
        let data = EntryData::new_login(None, "u".into(), "p".into(), None);
        let mut entry = make_entry("login", "Fav", data, vec![]);
        entry.is_favorite = true;

        let item = map_entry(&entry, None);
        assert!(item.favorite);
    }
}
