use std::io::Read;

use crate::error::{Result, VaultError};

use super::types::*;

/// Parse a .1pux file (ZIP archive) and extract all items as ParsedItems.
pub fn parse_1pux(file_bytes: &[u8]) -> Result<Vec<ParsedItem>> {
    let cursor = std::io::Cursor::new(file_bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| VaultError::InvalidInput(format!("Invalid 1pux file (not a valid ZIP): {}", e)))?;

    // Read export.data from the ZIP
    let mut export_data = String::new();
    {
        let mut file = archive.by_name("export.data")
            .map_err(|_| VaultError::InvalidInput("1pux file does not contain export.data".to_string()))?;
        file.read_to_string(&mut export_data)
            .map_err(|e| VaultError::InvalidInput(format!("Failed to read export.data: {}", e)))?;
    }

    let export: OnePuxExport = serde_json::from_str(&export_data)
        .map_err(|e| VaultError::InvalidInput(format!("Invalid export.data JSON: {}", e)))?;

    // Check if there are attachment files in the ZIP
    let has_files_dir = (0..archive.len()).any(|i| {
        archive.by_index(i)
            .map(|f| f.name().starts_with("files/"))
            .unwrap_or(false)
    });

    let mut items = Vec::new();

    for account in &export.accounts {
        for vault in &account.vaults {
            for item in &vault.items {
                items.push(convert_item(item, &vault.attrs.name, has_files_dir));
            }
        }
    }

    Ok(items)
}

/// Extract account name from the 1pux export for display.
pub fn extract_metadata(file_bytes: &[u8]) -> Result<(String, Vec<String>)> {
    let cursor = std::io::Cursor::new(file_bytes);
    let mut archive = zip::ZipArchive::new(cursor)
        .map_err(|e| VaultError::InvalidInput(format!("Invalid 1pux file: {}", e)))?;

    let mut export_data = String::new();
    {
        let mut file = archive.by_name("export.data")
            .map_err(|_| VaultError::InvalidInput("No export.data".to_string()))?;
        file.read_to_string(&mut export_data)
            .map_err(|e| VaultError::InvalidInput(format!("Read error: {}", e)))?;
    }

    let export: OnePuxExport = serde_json::from_str(&export_data)
        .map_err(|e| VaultError::InvalidInput(format!("JSON error: {}", e)))?;

    let account_name = export.accounts.first()
        .map(|a| a.attrs.account_name.clone())
        .unwrap_or_default();

    let vault_names: Vec<String> = export.accounts.iter()
        .flat_map(|a| a.vaults.iter().map(|v| v.attrs.name.clone()))
        .collect();

    Ok((account_name, vault_names))
}

fn convert_item(item: &OnePuxItem, vault_name: &str, _has_files_dir: bool) -> ParsedItem {
    let mut username = None;
    let mut password = None;

    // Extract username/password from loginFields
    for lf in &item.details.login_fields {
        if let Some(ref designation) = lf.designation {
            match designation.as_str() {
                "username" => {
                    if let Some(ref v) = lf.value {
                        if !v.is_empty() {
                            username = Some(v.clone());
                        }
                    }
                }
                "password" => {
                    if let Some(ref v) = lf.value {
                        if !v.is_empty() {
                            password = Some(v.clone());
                        }
                    }
                }
                _ => {}
            }
        }
    }

    // Extract fields from sections
    let mut fields = Vec::new();
    for section in &item.details.sections {
        for field in &section.fields {
            let field_title = field.title.clone().unwrap_or_default();
            if field_title.is_empty() && field.value.is_null() {
                continue;
            }

            if let Some(parsed) = parse_section_field_value(&field.value) {
                // Skip empty values
                if parsed.as_str().is_empty() && !matches!(parsed, ParsedFieldValue::Date(_) | ParsedFieldValue::MonthYear(_)) {
                    continue;
                }
                fields.push(ParsedField {
                    section_title: section.title.clone(),
                    field_title,
                    value: parsed,
                });
            }
        }
    }

    let url = item.overview.url.clone()
        .or_else(|| item.overview.urls.first().map(|u| u.url.clone()));

    let urls: Vec<String> = item.overview.urls.iter().map(|u| u.url.clone()).collect();

    let has_attachments = item.details.document_attributes.is_some();
    let attachment_file_name = item.details.document_attributes.as_ref()
        .and_then(|da| da.file_name.clone());

    ParsedItem {
        uuid: item.uuid.clone(),
        title: item.overview.title.clone(),
        category_uuid: item.category_uuid.clone(),
        vault_name: vault_name.to_string(),
        url,
        urls,
        username,
        password,
        notes: item.details.notes_plain.clone(),
        tags: item.overview.tags.clone(),
        fields,
        has_attachments,
        attachment_file_name,
        is_favorite: item.fav_index.map(|i| i > 0).unwrap_or(false),
        created_at: item.created_at,
        updated_at: item.updated_at,
    }
}

fn parse_section_field_value(value: &serde_json::Value) -> Option<ParsedFieldValue> {
    let obj = value.as_object()?;

    if let Some(v) = obj.get("concealed").and_then(|v| v.as_str()) {
        return Some(ParsedFieldValue::Concealed(v.to_string()));
    }
    if let Some(v) = obj.get("totp").and_then(|v| v.as_str()) {
        return Some(ParsedFieldValue::Totp(v.to_string()));
    }
    if let Some(v) = obj.get("email") {
        // email can be an object with {email_address, provider} or a string
        if let Some(s) = v.as_str() {
            return Some(ParsedFieldValue::Email(s.to_string()));
        }
        if let Some(obj) = v.as_object() {
            if let Some(addr) = obj.get("email_address").and_then(|a| a.as_str()) {
                return Some(ParsedFieldValue::Email(addr.to_string()));
            }
        }
    }
    if let Some(v) = obj.get("phone").and_then(|v| v.as_str()) {
        return Some(ParsedFieldValue::Phone(v.to_string()));
    }
    if let Some(v) = obj.get("url").and_then(|v| v.as_str()) {
        return Some(ParsedFieldValue::Url(v.to_string()));
    }
    if let Some(v) = obj.get("date").and_then(|v| v.as_i64()) {
        return Some(ParsedFieldValue::Date(v));
    }
    if let Some(v) = obj.get("monthYear").and_then(|v| v.as_i64()) {
        return Some(ParsedFieldValue::MonthYear(v));
    }
    if let Some(v) = obj.get("address") {
        if let Ok(addr) = serde_json::from_value::<OnePuxAddress>(v.clone()) {
            let parts: Vec<&str> = [
                addr.street.as_deref(),
                addr.city.as_deref(),
                addr.state.as_deref(),
                addr.zip.as_deref(),
                addr.country.as_deref(),
            ]
            .iter()
            .filter_map(|p| *p)
            .filter(|p| !p.is_empty())
            .collect();
            return Some(ParsedFieldValue::Address(parts.join(", ")));
        }
    }
    if let Some(v) = obj.get("string").and_then(|v| v.as_str()) {
        return Some(ParsedFieldValue::Text(v.to_string()));
    }

    // Fallback: try to get any string value
    for (_key, val) in obj {
        if let Some(s) = val.as_str() {
            return Some(ParsedFieldValue::Text(s.to_string()));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_1pux() -> Vec<u8> {
        let export_json = r#"{
            "accounts": [{
                "attrs": { "accountName": "Test Account", "email": "test@example.com" },
                "vaults": [{
                    "attrs": { "uuid": "vault1", "name": "Personal" },
                    "items": [{
                        "uuid": "item1",
                        "favIndex": 1,
                        "createdAt": 1700000000,
                        "updatedAt": 1700000000,
                        "categoryUuid": "001",
                        "overview": {
                            "title": "Example Login",
                            "url": "https://example.com",
                            "urls": [{"url": "https://example.com"}],
                            "tags": ["work"]
                        },
                        "details": {
                            "loginFields": [
                                {"designation": "username", "value": "user@example.com"},
                                {"designation": "password", "value": "secret123"}
                            ],
                            "notesPlain": "Some notes",
                            "sections": [{
                                "title": "Extra",
                                "fields": [{
                                    "title": "Recovery Email",
                                    "value": {"email": {"email_address": "recovery@example.com", "provider": ""}}
                                }]
                            }]
                        }
                    },
                    {
                        "uuid": "item2",
                        "createdAt": 1700000000,
                        "updatedAt": 1700000000,
                        "categoryUuid": "004",
                        "overview": {
                            "title": "My Note",
                            "tags": []
                        },
                        "details": {
                            "notesPlain": "Secret note content",
                            "sections": []
                        }
                    }]
                }]
            }]
        }"#;

        let mut buf = Vec::new();
        {
            let cursor = std::io::Cursor::new(&mut buf);
            let mut zip = zip::ZipWriter::new(cursor);
            let options = zip::write::SimpleFileOptions::default();
            zip.start_file("export.data", options).unwrap();
            std::io::Write::write_all(&mut zip, export_json.as_bytes()).unwrap();
            zip.finish().unwrap();
        }
        buf
    }

    #[test]
    fn test_parse_1pux_basic() {
        let bytes = make_test_1pux();
        let items = parse_1pux(&bytes).unwrap();
        assert_eq!(items.len(), 2);

        let login = &items[0];
        assert_eq!(login.title, "Example Login");
        assert_eq!(login.category_uuid, "001");
        assert_eq!(login.username.as_deref(), Some("user@example.com"));
        assert_eq!(login.password.as_deref(), Some("secret123"));
        assert_eq!(login.url.as_deref(), Some("https://example.com"));
        assert!(login.is_favorite);
        assert_eq!(login.tags, vec!["work"]);
        assert_eq!(login.fields.len(), 1);
        assert!(matches!(login.fields[0].value, ParsedFieldValue::Email(_)));

        let note = &items[1];
        assert_eq!(note.title, "My Note");
        assert_eq!(note.category_uuid, "004");
        assert_eq!(note.notes.as_deref(), Some("Secret note content"));
    }

    #[test]
    fn test_extract_metadata() {
        let bytes = make_test_1pux();
        let (account, vaults) = extract_metadata(&bytes).unwrap();
        assert_eq!(account, "Test Account");
        assert_eq!(vaults, vec!["Personal"]);
    }
}
