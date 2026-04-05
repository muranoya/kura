use std::collections::HashMap;

use crate::error::Result;
use crate::vault::UnlockedVault;

use super::{
    ImportAction, ImportPreview, ImportPreviewItem, ImportPreviewStats, SourceCategory,
    DuplicateConfidence,
};
use super::duplicate::detect_duplicates;
use super::onepux::{get_category_info, ParsedItem};
use super::onepux::parser::extract_metadata;

/// Generate an import preview from parsed items and the current vault state.
pub fn generate_preview(
    parsed_items: &[ParsedItem],
    file_bytes: &[u8],
    unlocked: &UnlockedVault,
) -> Result<ImportPreview> {
    let (account_name, vault_names) = extract_metadata(file_bytes)?;

    // Collect existing active entries for duplicate detection
    let existing: Vec<(&str, &crate::store::VaultEntry)> = unlocked.contents.entries.iter()
        .filter(|(_, e)| e.deleted_at.is_none())
        .map(|(id, e)| (id.as_str(), e))
        .collect();

    let mut items = Vec::new();
    let mut type_counts: HashMap<String, usize> = HashMap::new();
    let mut duplicate_count = 0;
    let mut attachment_warning_count = 0;
    let mut indirect_mapping_count = 0;
    let mut archived_count = 0;

    for parsed in parsed_items {
        let cat_info = get_category_info(&parsed.category_uuid);
        let target_type = cat_info.default_entry_type.clone();

        let duplicates = detect_duplicates(parsed, &target_type, &existing);

        let is_archived = parsed.is_archived || parsed.is_trashed;

        let default_action = if is_archived {
            ImportAction::Skip
        } else if duplicates.iter().any(|d| d.confidence == DuplicateConfidence::High) {
            ImportAction::Skip
        } else {
            ImportAction::Import
        };

        if !duplicates.is_empty() {
            duplicate_count += 1;
        }
        if parsed.has_attachments {
            attachment_warning_count += 1;
        }
        if !cat_info.is_direct_mapping {
            indirect_mapping_count += 1;
        }
        if is_archived {
            archived_count += 1;
        }

        *type_counts.entry(target_type.clone()).or_insert(0) += 1;

        items.push(ImportPreviewItem {
            source_id: parsed.uuid.clone(),
            source_name: parsed.title.clone(),
            source_category: SourceCategory {
                category_uuid: cat_info.category_uuid,
                category_name: cat_info.category_name,
                is_direct_mapping: cat_info.is_direct_mapping,
            },
            source_vault_name: parsed.vault_name.clone(),
            target_entry_type: target_type,
            target_name: parsed.title.clone(),
            duplicates,
            default_action,
            has_attachments: parsed.has_attachments,
            is_archived,
            tags: parsed.tags.clone(),
            field_count: parsed.fields.len(),
        });
    }

    let mut by_target_type: Vec<(String, usize)> = type_counts.into_iter().collect();
    by_target_type.sort_by(|a, b| b.1.cmp(&a.1));

    Ok(ImportPreview {
        stats: ImportPreviewStats {
            total_items: items.len(),
            by_target_type,
            duplicate_count,
            attachment_warning_count,
            indirect_mapping_count,
            archived_count,
        },
        items,
        source_account_name: account_name,
        source_vault_names: vault_names,
    })
}
