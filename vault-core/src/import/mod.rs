pub mod onepux;
pub mod duplicate;
pub mod preview;

use serde::{Deserialize, Serialize};

use crate::error::{Result, VaultError};
use crate::vault::UnlockedVault;

// ============================================================================
// Public types (serialized across FFI boundary as JSON)
// ============================================================================

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DuplicateConfidence {
    High,
    Medium,
    Low,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DuplicateCandidate {
    pub existing_entry_id: String,
    pub existing_entry_name: String,
    pub existing_entry_type: String,
    pub confidence: DuplicateConfidence,
    pub reason: String,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ImportAction {
    Import,
    Overwrite { existing_entry_id: String },
    Skip,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SourceCategory {
    pub category_uuid: String,
    pub category_name: String,
    pub is_direct_mapping: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportPreviewItem {
    pub source_id: String,
    pub source_name: String,
    pub source_category: SourceCategory,
    pub source_vault_name: String,
    pub target_entry_type: String,
    pub target_name: String,
    pub duplicates: Vec<DuplicateCandidate>,
    pub default_action: ImportAction,
    pub has_attachments: bool,
    pub is_archived: bool,
    pub tags: Vec<String>,
    pub field_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportPreviewStats {
    pub total_items: usize,
    pub by_target_type: Vec<(String, usize)>,
    pub duplicate_count: usize,
    pub attachment_warning_count: usize,
    pub indirect_mapping_count: usize,
    pub archived_count: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportPreview {
    pub stats: ImportPreviewStats,
    pub items: Vec<ImportPreviewItem>,
    pub source_account_name: String,
    pub source_vault_names: Vec<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportItemAction {
    pub source_id: String,
    pub action: ImportAction,
    pub target_entry_type: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportItemResult {
    pub source_id: String,
    pub source_name: String,
    pub success: bool,
    pub action_taken: String,
    pub created_entry_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub created_count: usize,
    pub overwritten_count: usize,
    pub skipped_count: usize,
    pub error_count: usize,
    pub labels_created: Vec<String>,
    pub items: Vec<ImportItemResult>,
}

// ============================================================================
// Execute import
// ============================================================================

/// Execute import with user-chosen actions.
pub fn execute_import(
    parsed_items: &[onepux::ParsedItem],
    actions: &[ImportItemAction],
    unlocked: &mut UnlockedVault,
) -> Result<ImportResult> {
    // Build action lookup: source_id -> action
    let action_map: std::collections::HashMap<&str, &ImportItemAction> = actions.iter()
        .map(|a| (a.source_id.as_str(), a))
        .collect();

    // Collect existing labels for tag→label resolution
    let existing_labels = unlocked.list_labels()
        .map_err(|e| VaultError::InvalidInput(format!("Failed to list labels: {}", e)))?;

    let mut label_name_to_id: std::collections::HashMap<String, String> = existing_labels.iter()
        .map(|l| (l.name.to_lowercase(), l.id.clone()))
        .collect();

    let mut labels_created = Vec::new();
    let mut results = Vec::new();
    let mut created_count = 0;
    let mut overwritten_count = 0;
    let mut skipped_count = 0;
    let mut error_count = 0;

    for parsed in parsed_items {
        let action_info = action_map.get(parsed.uuid.as_str());

        // Determine the action and target type
        let (action, target_type) = match action_info {
            Some(info) => {
                let default_type = onepux::get_category_info(&parsed.category_uuid).default_entry_type;
                let target = info.target_entry_type.as_deref().unwrap_or(&default_type);
                (&info.action, target.to_string())
            }
            None => {
                // No action specified = skip
                skipped_count += 1;
                results.push(ImportItemResult {
                    source_id: parsed.uuid.clone(),
                    source_name: parsed.title.clone(),
                    success: true,
                    action_taken: "skipped".to_string(),
                    created_entry_id: None,
                    error: None,
                });
                continue;
            }
        };

        match action {
            ImportAction::Skip => {
                skipped_count += 1;
                results.push(ImportItemResult {
                    source_id: parsed.uuid.clone(),
                    source_name: parsed.title.clone(),
                    success: true,
                    action_taken: "skipped".to_string(),
                    created_entry_id: None,
                    error: None,
                });
            }
            ImportAction::Import => {
                match create_entry_from_parsed(parsed, &target_type, &mut label_name_to_id, &mut labels_created, unlocked) {
                    Ok(entry_id) => {
                        created_count += 1;
                        results.push(ImportItemResult {
                            source_id: parsed.uuid.clone(),
                            source_name: parsed.title.clone(),
                            success: true,
                            action_taken: "created".to_string(),
                            created_entry_id: Some(entry_id),
                            error: None,
                        });
                    }
                    Err(e) => {
                        error_count += 1;
                        results.push(ImportItemResult {
                            source_id: parsed.uuid.clone(),
                            source_name: parsed.title.clone(),
                            success: false,
                            action_taken: "error".to_string(),
                            created_entry_id: None,
                            error: Some(e.to_string()),
                        });
                    }
                }
            }
            ImportAction::Overwrite { existing_entry_id } => {
                match overwrite_entry_from_parsed(parsed, &target_type, existing_entry_id, &mut label_name_to_id, &mut labels_created, unlocked) {
                    Ok(()) => {
                        overwritten_count += 1;
                        results.push(ImportItemResult {
                            source_id: parsed.uuid.clone(),
                            source_name: parsed.title.clone(),
                            success: true,
                            action_taken: "overwritten".to_string(),
                            created_entry_id: Some(existing_entry_id.clone()),
                            error: None,
                        });
                    }
                    Err(e) => {
                        error_count += 1;
                        results.push(ImportItemResult {
                            source_id: parsed.uuid.clone(),
                            source_name: parsed.title.clone(),
                            success: false,
                            action_taken: "error".to_string(),
                            created_entry_id: None,
                            error: Some(e.to_string()),
                        });
                    }
                }
            }
        }
    }

    Ok(ImportResult {
        created_count,
        overwritten_count,
        skipped_count,
        error_count,
        labels_created,
        items: results,
    })
}

fn create_entry_from_parsed(
    parsed: &onepux::ParsedItem,
    target_type: &str,
    label_map: &mut std::collections::HashMap<String, String>,
    labels_created: &mut Vec<String>,
    unlocked: &mut UnlockedVault,
) -> Result<String> {
    let mapped = onepux::map_item(parsed, target_type);

    // Resolve tags to label IDs
    let label_ids = resolve_labels(&mapped.tags, label_map, labels_created, unlocked)?;

    let entry = unlocked.create_entry(
        mapped.name,
        mapped.entry_type,
        mapped.data,
        label_ids,
    )?;

    // Overwrite timestamps with original 1pux values
    if let Some(ve) = unlocked.contents.entries.get_mut(&entry.id) {
        ve.created_at = mapped.created_at;
        ve.updated_at = mapped.updated_at;
    }

    // Set favorite if needed
    if mapped.is_favorite {
        unlocked.set_favorite(&entry.id, true)?;
    }

    Ok(entry.id)
}

fn overwrite_entry_from_parsed(
    parsed: &onepux::ParsedItem,
    target_type: &str,
    existing_id: &str,
    label_map: &mut std::collections::HashMap<String, String>,
    labels_created: &mut Vec<String>,
    unlocked: &mut UnlockedVault,
) -> Result<()> {
    let mapped = onepux::map_item(parsed, target_type);
    let label_ids = resolve_labels(&mapped.tags, label_map, labels_created, unlocked)?;

    unlocked.update_entry(existing_id, mapped.name, mapped.data)?;
    unlocked.set_entry_labels(existing_id, label_ids)?;

    // Overwrite timestamps with original 1pux values
    if let Some(ve) = unlocked.contents.entries.get_mut(existing_id) {
        ve.created_at = mapped.created_at;
        ve.updated_at = mapped.updated_at;
    }

    if mapped.is_favorite {
        unlocked.set_favorite(existing_id, true)?;
    }

    Ok(())
}

fn resolve_labels(
    tags: &[String],
    label_map: &mut std::collections::HashMap<String, String>,
    labels_created: &mut Vec<String>,
    unlocked: &mut UnlockedVault,
) -> Result<Vec<String>> {
    let mut label_ids = Vec::new();

    for tag in tags {
        let tag_lower = tag.to_lowercase();
        if let Some(id) = label_map.get(&tag_lower) {
            label_ids.push(id.clone());
        } else {
            // Create new label
            let label = unlocked.create_label(tag.clone())?;
            label_map.insert(tag_lower, label.id.clone());
            labels_created.push(tag.clone());
            label_ids.push(label.id);
        }
    }

    Ok(label_ids)
}
