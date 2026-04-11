pub mod bitwarden;

use crate::models::{Entry, Label};

use bitwarden::mapper;
use bitwarden::types::BitwardenExport;

/// Export all entries and labels as a Bitwarden JSON string.
pub fn export_bitwarden_json(entries: &[Entry], labels: &[Label]) -> Result<String, String> {
    let folders = mapper::map_labels_to_folders(labels);

    let items: Vec<_> = entries
        .iter()
        .map(|entry| {
            let folder_id = mapper::resolve_folder_id(entry, &entry.labels);
            mapper::map_entry(entry, folder_id)
        })
        .collect();

    let export = BitwardenExport {
        encrypted: false,
        folders,
        items,
    };

    serde_json::to_string_pretty(&export).map_err(|e| format!("Serialization error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::EntryData;

    #[test]
    fn test_export_bitwarden_json_empty() {
        let json = export_bitwarden_json(&[], &[]).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();
        assert_eq!(parsed["encrypted"], false);
        assert_eq!(parsed["folders"].as_array().unwrap().len(), 0);
        assert_eq!(parsed["items"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn test_export_bitwarden_json_with_entries() {
        let entries = vec![
            Entry {
                id: "e1".to_string(),
                name: "Login".to_string(),
                entry_type: "login".to_string(),
                is_favorite: true,
                created_at: 1700000000,
                updated_at: 1700000000,
                deleted_at: None,
                data: EntryData::new_login(
                    Some("https://example.com".into()),
                    "user".into(),
                    "pass".into(),
                    None,
                ),
                labels: vec!["l1".to_string()],
            },
            Entry {
                id: "e2".to_string(),
                name: "Note".to_string(),
                entry_type: "secure_note".to_string(),
                is_favorite: false,
                created_at: 1700000000,
                updated_at: 1700000000,
                deleted_at: None,
                data: EntryData::new_secure_note("content".into(), None),
                labels: vec![],
            },
        ];
        let labels = vec![Label {
            id: "l1".to_string(),
            name: "Work".to_string(),
            created_at: 1000,
        }];

        let json = export_bitwarden_json(&entries, &labels).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&json).unwrap();

        assert_eq!(parsed["folders"].as_array().unwrap().len(), 1);
        assert_eq!(parsed["items"].as_array().unwrap().len(), 2);

        let item0 = &parsed["items"][0];
        assert_eq!(item0["type"], 1);
        assert_eq!(item0["folderId"], "l1");
        assert_eq!(item0["favorite"], true);

        let item1 = &parsed["items"][1];
        assert_eq!(item1["type"], 2);
        assert!(item1["folderId"].is_null());
    }
}
