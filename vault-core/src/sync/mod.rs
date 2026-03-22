pub mod conflict;

use crate::error::Result;
use crate::store::VaultEntry;
use std::collections::HashMap;

pub use conflict::{ConflictedEntry, ConflictResolution};

#[derive(Debug, Clone)]
pub struct SyncResult {
    pub synced: bool,
    pub conflicts: Vec<ConflictedEntry>,
    pub local_etag: Option<String>,
}

impl SyncResult {
    pub fn success(local_etag: Option<String>) -> Self {
        SyncResult {
            synced: true,
            conflicts: Vec::new(),
            local_etag,
        }
    }

    pub fn with_conflicts(conflicts: Vec<ConflictedEntry>) -> Self {
        SyncResult {
            synced: false,
            conflicts,
            local_etag: None,
        }
    }
}

/// Compare two entry sets and detect conflicts
pub fn detect_conflicts(
    local_entries: &HashMap<String, VaultEntry>,
    remote_entries: &HashMap<String, VaultEntry>,
) -> Result<Vec<ConflictedEntry>> {
    let mut conflicts = Vec::new();

    // Find entries that exist in both but differ
    for (id, local) in local_entries {
        if let Some(remote) = remote_entries.get(id) {
            if entries_differ(local, remote) {
                conflicts.push(ConflictedEntry {
                    id: id.clone(),
                    local: Some(local.clone()),
                    remote: Some(remote.clone()),
                });
            }
        }
    }

    // Find entries only in local (deleted remotely)
    for (id, local) in local_entries {
        if !remote_entries.contains_key(id) {
            conflicts.push(ConflictedEntry {
                id: id.clone(),
                local: Some(local.clone()),
                remote: None,
            });
        }
    }

    // Find entries only in remote (deleted locally)
    for (id, remote) in remote_entries {
        if !local_entries.contains_key(id) {
            conflicts.push(ConflictedEntry {
                id: id.clone(),
                local: None,
                remote: Some(remote.clone()),
            });
        }
    }

    Ok(conflicts)
}

/// Check if two entries differ (name, typed_value, notes, or updated_at)
fn entries_differ(local: &VaultEntry, remote: &VaultEntry) -> bool {
    local.name != remote.name
        || local.typed_value != remote.typed_value
        || local.notes != remote.notes
        || local.updated_at != remote.updated_at
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::EntryType;

    fn create_entry(id: &str, name: &str, timestamp: i64) -> (String, VaultEntry) {
        (
            id.to_string(),
            VaultEntry {
                entry_type: EntryType::Login,
                name: name.to_string(),
                created_at: timestamp,
                updated_at: timestamp,
                deleted_at: None,
                is_favorite: false,
                label_ids: vec![],
                typed_value: serde_json::json!({}),
                notes: None,
            },
        )
    }

    fn make_map(entries: Vec<(String, VaultEntry)>) -> HashMap<String, VaultEntry> {
        entries.into_iter().collect()
    }

    #[test]
    fn test_detect_conflicts_no_changes() {
        let local = make_map(vec![create_entry("id1", "Entry 1", 1000)]);
        let remote = make_map(vec![create_entry("id1", "Entry 1", 1000)]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 0);
    }

    #[test]
    fn test_detect_conflicts_no_entries() {
        let local = make_map(vec![]);
        let remote = make_map(vec![]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 0);
    }

    #[test]
    fn test_detect_conflicts_identical_data() {
        let local = make_map(vec![
            create_entry("id1", "Entry 1", 1000),
            create_entry("id2", "Entry 2", 2000),
        ]);
        let remote = make_map(vec![
            create_entry("id1", "Entry 1", 1000),
            create_entry("id2", "Entry 2", 2000),
        ]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 0);
    }

    #[test]
    fn test_detect_conflicts_both_modified() {
        let local = make_map(vec![create_entry("id1", "Local Name", 1000)]);
        let remote = make_map(vec![create_entry("id1", "Remote Name", 1000)]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflict_type(), "both_modified");
        assert!(conflicts[0].local.is_some());
        assert!(conflicts[0].remote.is_some());
    }

    #[test]
    fn test_detect_conflicts_deleted_remote() {
        let local = make_map(vec![create_entry("id1", "Entry 1", 1000)]);
        let remote = make_map(vec![]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflict_type(), "deleted_remote");
        assert!(conflicts[0].local.is_some());
        assert!(conflicts[0].remote.is_none());
    }

    #[test]
    fn test_detect_conflicts_deleted_local() {
        let local = make_map(vec![]);
        let remote = make_map(vec![create_entry("id1", "Entry 1", 1000)]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflict_type(), "deleted_local");
        assert!(conflicts[0].local.is_none());
        assert!(conflicts[0].remote.is_some());
    }

    #[test]
    fn test_detect_conflicts_multiple_entries_mixed() {
        let local = make_map(vec![
            create_entry("id1", "Unchanged", 1000),
            create_entry("id2", "Local Only", 2000),
            create_entry("id3", "Local Modified", 3000),
        ]);

        let remote = make_map(vec![
            create_entry("id1", "Unchanged", 1000),
            create_entry("id3", "Remote Modified", 3000),
            create_entry("id4", "Remote Only", 4000),
        ]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();

        // Should have 3 conflicts: id2 deleted_remote, id3 both_modified, id4 deleted_local
        assert_eq!(conflicts.len(), 3);

        let ids: Vec<String> = conflicts.iter().map(|c| c.id.clone()).collect();
        assert!(ids.contains(&"id2".to_string()));
        assert!(ids.contains(&"id3".to_string()));
        assert!(ids.contains(&"id4".to_string()));
    }

    #[test]
    fn test_detect_conflicts_only_name_differs() {
        let local = make_map(vec![create_entry("id1", "Old Name", 1000)]);
        let remote = make_map(vec![create_entry("id1", "New Name", 1000)]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 1);
        assert_eq!(conflicts[0].conflict_type(), "both_modified");
    }

    #[test]
    fn test_detect_conflicts_deleted_at_field_differs() {
        // Note: deleted_at changes are NOT considered conflicts by the current implementation
        // Only name, typed_value, notes, and updated_at changes trigger conflict detection
        let (id, mut local_entry) = create_entry("id1", "Entry 1", 1000);
        local_entry.deleted_at = None;

        let (_, mut remote_entry) = create_entry("id1", "Entry 1", 1000);
        remote_entry.deleted_at = Some(1500);

        let local = make_map(vec![(id.clone(), local_entry)]);
        let remote = make_map(vec![(id, remote_entry)]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        // deleted_at differences alone don't create conflicts
        assert_eq!(conflicts.len(), 0);
    }

    #[test]
    fn test_sync_result_success() {
        let result = SyncResult::success(Some("etag123".to_string()));
        assert!(result.synced);
        assert_eq!(result.conflicts.len(), 0);
        assert_eq!(result.local_etag, Some("etag123".to_string()));
    }

    #[test]
    fn test_sync_result_success_no_etag() {
        let result = SyncResult::success(None);
        assert!(result.synced);
        assert_eq!(result.conflicts.len(), 0);
        assert!(result.local_etag.is_none());
    }

    #[test]
    fn test_sync_result_with_conflicts() {
        let (id, entry) = create_entry("id1", "Local", 1000);
        let conflicts = vec![ConflictedEntry {
            id: id.clone(),
            local: Some(entry),
            remote: None,
        }];

        let result = SyncResult::with_conflicts(conflicts.clone());
        assert!(!result.synced);
        assert_eq!(result.conflicts.len(), 1);
        assert!(result.local_etag.is_none());
    }

    #[test]
    fn test_detect_conflicts_large_dataset() {
        let mut local_vec = vec![];
        let mut remote_vec = vec![];

        // Create 100 entries in local
        for i in 0..100 {
            local_vec.push(create_entry(&format!("id{}", i), &format!("Entry {}", i), 1000 + i as i64));
        }

        // Create 100 entries in remote with some overlaps and differences
        for i in 0..100 {
            if i % 2 == 0 {
                // Even indices: same as local
                remote_vec.push(create_entry(&format!("id{}", i), &format!("Entry {}", i), 1000 + i as i64));
            } else {
                // Odd indices: modified name
                remote_vec.push(create_entry(&format!("id{}", i), &format!("Modified {}", i), 1000 + i as i64));
            }
        }

        // Add extra entries in remote
        for i in 100..110 {
            remote_vec.push(create_entry(&format!("id{}", i), &format!("Remote Only {}", i), 2000 + i as i64));
        }

        let local = make_map(local_vec);
        let remote = make_map(remote_vec);

        let conflicts = detect_conflicts(&local, &remote).unwrap();

        // Should have conflicts for odd indices (50) + remote-only entries (10) = 60
        assert_eq!(conflicts.len(), 60);
    }

    #[test]
    fn test_detect_conflicts_same_data_different_updated_at() {
        let (id, local_entry) = create_entry("id1", "Entry 1", 1000);
        let (_, remote_entry_with_different_time) = create_entry("id1", "Entry 1", 2000);

        let local = make_map(vec![(id.clone(), local_entry)]);
        let remote = make_map(vec![(id, remote_entry_with_different_time)]);

        // Timestamp differences ARE detected as conflicts now
        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 1);
    }

    #[test]
    fn test_detect_conflicts_many_deleted_remote() {
        let local = make_map(vec![
            create_entry("id1", "Entry 1", 1000),
            create_entry("id2", "Entry 2", 2000),
            create_entry("id3", "Entry 3", 3000),
        ]);
        let remote = make_map(vec![]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 3);
        for conflict in &conflicts {
            assert_eq!(conflict.conflict_type(), "deleted_remote");
        }
    }

    #[test]
    fn test_detect_conflicts_many_deleted_local() {
        let local = make_map(vec![]);
        let remote = make_map(vec![
            create_entry("id1", "Entry 1", 1000),
            create_entry("id2", "Entry 2", 2000),
            create_entry("id3", "Entry 3", 3000),
        ]);

        let conflicts = detect_conflicts(&local, &remote).unwrap();
        assert_eq!(conflicts.len(), 3);
        for conflict in &conflicts {
            assert_eq!(conflict.conflict_type(), "deleted_local");
        }
    }
}
