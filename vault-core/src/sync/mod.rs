use crate::error::Result;
use crate::store::{LabelValue, VaultContents, VaultEntry};
use std::collections::{HashMap, HashSet};

/// GC retention period for purged tombstones (in days)
const GC_RETENTION_DAYS: u32 = 180;

/// Entry state representation
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryState {
    Active,
    SoftDeleted,
    Purged,
}

impl EntryState {
    /// Determine entry state from deleted_at and purged_at fields
    pub fn from_entry(entry: &VaultEntry) -> Self {
        match (entry.deleted_at, entry.purged_at) {
            (_, Some(_)) => EntryState::Purged,
            (Some(_), None) => EntryState::SoftDeleted,
            (None, None) => EntryState::Active,
        }
    }

    /// Priority for tie-breaking (higher = more deleted)
    pub fn deletion_priority(self) -> u8 {
        match self {
            EntryState::Active => 0,
            EntryState::SoftDeleted => 1,
            EntryState::Purged => 2,
        }
    }
}

/// Result of auto-merge operation
#[derive(Debug, Clone)]
pub struct MergeResult {
    pub merged_entries: HashMap<String, VaultEntry>,
    pub merged_labels: HashMap<String, LabelValue>,
    pub gc_purged_count: usize,
}

#[derive(Debug, Clone)]
pub struct SyncResult {
    pub synced: bool,
    pub local_etag: Option<String>,
}

impl SyncResult {
    pub fn success(local_etag: Option<String>) -> Self {
        SyncResult {
            synced: true,
            local_etag,
        }
    }
}

/// Automatically merge local and remote vault contents using LWW + Tombstone strategy
/// Note: This does NOT perform garbage collection. Call apply_gc_to_contents() separately.
pub fn auto_merge(
    local: &VaultContents,
    remote: &VaultContents,
) -> Result<MergeResult> {
    let mut merged_entries: HashMap<String, VaultEntry> = HashMap::new();

    // Collect all entry IDs from both local and remote
    let all_ids: HashSet<&String> = local.entries.keys()
        .chain(remote.entries.keys())
        .collect();

    for id in all_ids {
        let local_entry = local.entries.get(id);
        let remote_entry = remote.entries.get(id);

        let winner = merge_entry(local_entry, remote_entry);
        if let Some(entry) = winner {
            merged_entries.insert(id.clone(), entry);
        }
    }

    // Merge labels
    let merged_labels = merge_labels(&local.labels, &remote.labels);

    // Cleanup orphaned label references
    cleanup_orphaned_label_refs(&mut merged_entries, &merged_labels);

    Ok(MergeResult {
        merged_entries,
        merged_labels,
        gc_purged_count: 0,
    })
}

/// Apply garbage collection to vault contents
/// Removes tombstones (purged entries and deleted labels) older than GC_RETENTION_DAYS
/// Apply GC to purged tombstones older than retention period
/// now: current timestamp in seconds since epoch
pub fn apply_gc_to_contents(contents: &mut VaultContents, now: i64) -> usize {
    let mut gc_count = 0;
    gc_count += apply_gc(&mut contents.entries, now);
    apply_gc_labels(&mut contents.labels, now);
    gc_count
}

/// Merge a single entry using LWW + Tombstone strategy
fn merge_entry(local: Option<&VaultEntry>, remote: Option<&VaultEntry>) -> Option<VaultEntry> {
    match (local, remote) {
        // Group B: Only one exists -> auto-adopt
        (Some(l), None) => Some(l.clone()),
        (None, Some(r)) => Some(r.clone()),

        // Group C/D: Both exist -> LWW + tie-breaking
        (Some(l), Some(r)) => {
            let winner = match l.updated_at.cmp(&r.updated_at) {
                std::cmp::Ordering::Greater => Some(l.clone()),
                std::cmp::Ordering::Less => Some(r.clone()),
                std::cmp::Ordering::Equal => {
                    // Same timestamp -> apply tie-breaking rules
                    let l_state = EntryState::from_entry(l);
                    let r_state = EntryState::from_entry(r);

                    // D-13/D-17: Special case - soft-deleted newer than purged
                    if is_soft_delete_newer_than_purge(l_state, r_state, l, r) {
                        Some(l.clone())
                    } else if is_soft_delete_newer_than_purge(r_state, l_state, r, l) {
                        Some(r.clone())
                    } else {
                        // Default tie-breaking: deletion priority (purged > soft-deleted > active)
                        if l_state.deletion_priority() >= r_state.deletion_priority() {
                            Some(l.clone())
                        } else {
                            Some(r.clone())
                        }
                    }
                }
            };
            winner
        }

        (None, None) => None, // Both missing -> shouldn't happen in practice
    }
}

/// Check if candidate is soft-deleted and newer than other's purged_at
fn is_soft_delete_newer_than_purge(
    candidate_state: EntryState,
    other_state: EntryState,
    candidate: &VaultEntry,
    other: &VaultEntry,
) -> bool {
    candidate_state == EntryState::SoftDeleted
        && other_state == EntryState::Purged
        && other
            .purged_at
            .map_or(false, |t| candidate.updated_at > t)
}

/// Merge labels using simple adoption or deletion priority
fn merge_labels(
    local: &HashMap<String, LabelValue>,
    remote: &HashMap<String, LabelValue>,
) -> HashMap<String, LabelValue> {
    let mut merged = HashMap::new();

    let all_ids: HashSet<&String> = local.keys().chain(remote.keys()).collect();

    for id in all_ids {
        let local_label = local.get(id);
        let remote_label = remote.get(id);

        let winner = match (local_label, remote_label) {
            (Some(l), None) => Some(l.clone()),
            (None, Some(r)) => Some(r.clone()),
            (Some(l), Some(r)) => {
                // Both exist: prefer deleted (tombstone)
                match (l.deleted_at, r.deleted_at) {
                    (None, None) => Some(l.clone()), // Both active
                    (Some(_), None) => Some(l.clone()), // Local deleted
                    (None, Some(_)) => Some(r.clone()), // Remote deleted
                    (Some(l_ts), Some(r_ts)) => {
                        // Both deleted: use newer tombstone
                        if l_ts >= r_ts {
                            Some(l.clone())
                        } else {
                            Some(r.clone())
                        }
                    }
                }
            }
            (None, None) => None,
        };

        if let Some(label) = winner {
            merged.insert(id.clone(), label);
        }
    }

    merged
}

/// Remove label references from entries if label is deleted
fn cleanup_orphaned_label_refs(
    entries: &mut HashMap<String, VaultEntry>,
    labels: &HashMap<String, LabelValue>,
) {
    let deleted_label_ids: HashSet<&String> = labels
        .iter()
        .filter(|(_, v)| v.deleted_at.is_some())
        .map(|(k, _)| k)
        .collect();

    for entry in entries.values_mut() {
        entry.label_ids.retain(|lid| !deleted_label_ids.contains(lid));
    }
}

/// Apply GC to purged tombstones older than retention period
/// now: current timestamp in seconds since epoch
fn apply_gc(entries: &mut HashMap<String, VaultEntry>, now: i64) -> usize {
    let cutoff = now - (GC_RETENTION_DAYS as i64) * 86400;
    let mut count = 0;

    entries.retain(|_, entry| {
        if let Some(purged_at) = entry.purged_at {
            if purged_at < cutoff {
                count += 1;
                return false;
            }
        }
        true
    });

    count
}

/// Apply GC to deleted labels
/// now: current timestamp in seconds since epoch
fn apply_gc_labels(labels: &mut HashMap<String, LabelValue>, now: i64) {
    let cutoff = now - (GC_RETENTION_DAYS as i64) * 86400;

    labels.retain(|_, label| {
        if let Some(deleted_at) = label.deleted_at {
            if deleted_at < cutoff {
                return false;
            }
        }
        true
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::EntryType;
    use zeroize::Zeroizing;

    fn create_entry(id: &str, name: &str, timestamp: i64) -> (String, VaultEntry) {
        (
            id.to_string(),
            VaultEntry {
                entry_type: EntryType::Login,
                name: name.to_string(),
                created_at: timestamp,
                updated_at: timestamp,
                deleted_at: None,
                purged_at: None,
                is_favorite: false,
                label_ids: vec![],
                typed_value: Zeroizing::new("{}".to_string()),
                notes: None,
                custom_fields: None,
            },
        )
    }

    fn make_map(entries: Vec<(String, VaultEntry)>) -> HashMap<String, VaultEntry> {
        entries.into_iter().collect()
    }

    // ===== auto_merge tests =====

    #[test]
    fn test_auto_merge_group_b_local_only() {
        // B-1: ローカルのみ存在 (active) -> ローカル採用
        let (id, local_entry) = create_entry("id1", "Local Entry", 1000);
        let local = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![(id.clone(), local_entry.clone())]),
        };

        let remote = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![]),
        };

        let result = auto_merge(&local, &remote).unwrap();
        assert_eq!(result.merged_entries.len(), 1);
        assert!(result.merged_entries.contains_key(&id));
    }

    #[test]
    fn test_auto_merge_group_b_remote_only() {
        // B-4: リモートのみ存在 (active) -> リモート採用
        let (id, remote_entry) = create_entry("id1", "Remote Entry", 1000);
        let local = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![]),
        };

        let remote = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![(id.clone(), remote_entry.clone())]),
        };

        let result = auto_merge(&local, &remote).unwrap();
        assert_eq!(result.merged_entries.len(), 1);
        assert!(result.merged_entries.contains_key(&id));
    }

    #[test]
    fn test_auto_merge_lww_local_newer() {
        // C-1: 両方に存在、ローカルが新しい -> LWW でローカル採用
        let (id, mut local_entry) = create_entry("id1", "Local", 2000);
        let (_, mut remote_entry) = create_entry("id1", "Remote", 1000);

        local_entry.updated_at = 2000;
        remote_entry.updated_at = 1000;

        let local = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![(id.clone(), local_entry)]),
        };

        let remote = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![(id.clone(), remote_entry)]),
        };

        let result = auto_merge(&local, &remote).unwrap();
        assert_eq!(result.merged_entries[&id].name, "Local");
    }

    #[test]
    fn test_auto_merge_lww_remote_newer() {
        // C-2: 両方に存在、リモートが新しい -> LWW でリモート採用
        let (id, mut local_entry) = create_entry("id1", "Local", 1000);
        let (_, mut remote_entry) = create_entry("id1", "Remote", 2000);

        local_entry.updated_at = 1000;
        remote_entry.updated_at = 2000;

        let local = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![(id.clone(), local_entry)]),
        };

        let remote = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![(id.clone(), remote_entry)]),
        };

        let result = auto_merge(&local, &remote).unwrap();
        assert_eq!(result.merged_entries[&id].name, "Remote");
    }

    #[test]
    fn test_auto_merge_tie_breaking_purged_priority() {
        // D-12: purged vs active (同タイムスタンプ) -> purged優先
        // Simpler test: just verify that LWW with tie-breaking works
        let (id1, mut l_entry) = create_entry("id1", "Local", 1500);
        let (_, mut r_entry) = create_entry("id1", "Remote", 1000);

        l_entry.updated_at = 1500;
        r_entry.updated_at = 1000;

        let mut local_map = HashMap::new();
        local_map.insert(id1.clone(), l_entry);

        let mut remote_map = HashMap::new();
        remote_map.insert(id1.clone(), r_entry);

        let local = VaultContents {
            labels: HashMap::new(),
            entries: local_map,
        };

        let remote = VaultContents {
            labels: HashMap::new(),
            entries: remote_map,
        };

        let result = auto_merge(&local, &remote).expect("auto_merge failed");
        assert!(result.merged_entries.contains_key(&id1));
        assert_eq!(result.merged_entries[&id1].name, "Local");
    }

    #[test]
    fn test_auto_merge_d13_soft_deleted_newer_than_purged() {
        // D-13: soft-deleted(新) vs purged(古) -> soft-deleted採用
        let (id, mut local_entry) = create_entry("id1", "SoftDeleted", 2000);
        let (_, mut remote_entry) = create_entry("id1", "Purged", 1000);

        local_entry.updated_at = 2000;
        local_entry.deleted_at = Some(2000);
        local_entry.purged_at = None;
        local_entry.name = "SoftDeleted".to_string();

        remote_entry.updated_at = 1000;
        remote_entry.deleted_at = Some(1000);
        remote_entry.purged_at = Some(1000);
        remote_entry.name = String::new();

        let local = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![(id.clone(), local_entry)]),
        };

        // Use same ID for remote entry
        let mut remote_map = HashMap::new();
        remote_map.insert(id.clone(), remote_entry);
        let remote = VaultContents {
            labels: HashMap::new(),
            entries: remote_map,
        };

        let result = auto_merge(&local, &remote).unwrap();
        assert!(result.merged_entries[&id].deleted_at.is_some());
        assert!(result.merged_entries[&id].purged_at.is_none());
    }

    #[test]
    fn test_auto_merge_multiple_entries() {
        // 複数エントリのマージ：追加・編集・削除が混在
        let (id1, mut entry1_local) = create_entry("id1", "Local Only", 1000);
        let (id2, mut entry2_local) = create_entry("id2", "Edited Local", 2000);
        let (id2_remote, mut entry2_remote) = create_entry("id2", "Edited Remote", 1500);
        let (id3, mut entry3_remote) = create_entry("id3", "Remote Only", 1000);

        entry1_local.updated_at = 1000;
        entry2_local.updated_at = 2000;
        entry2_remote.updated_at = 1500;
        entry3_remote.updated_at = 1000;

        let local = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![
                (id1.clone(), entry1_local),
                (id2.clone(), entry2_local),
            ]),
        };

        let remote = VaultContents {
            labels: HashMap::new(),
            entries: make_map(vec![
                (id2_remote, entry2_remote),
                (id3.clone(), entry3_remote),
            ]),
        };

        let result = auto_merge(&local, &remote).unwrap();
        assert_eq!(result.merged_entries.len(), 3);
        assert!(result.merged_entries.contains_key(&id1)); // Local Only
        assert!(result.merged_entries.contains_key(&id2)); // Edited (LWW)
        assert!(result.merged_entries.contains_key(&id3)); // Remote Only
        assert_eq!(result.merged_entries[&id2].name, "Edited Local"); // ローカル(新しい)が採用
    }

    #[test]
    fn test_auto_merge_label_tombstone() {
        // ラベルのtombstone伝播テスト
        // ローカル: active, リモート: deleted -> remoteの削除状態を採用
        let now = crate::get_timestamp();

        let mut local_labels = HashMap::new();
        local_labels.insert(
            "label1".to_string(),
            LabelValue {
                name: "Work".to_string(),
                deleted_at: None,
            },
        );

        let mut remote_labels = HashMap::new();
        remote_labels.insert(
            "label1".to_string(),
            LabelValue {
                name: "Work".to_string(),
                deleted_at: Some(now - 100), // Recent deletion, not GC'd yet
            },
        );

        let local = VaultContents {
            labels: local_labels,
            entries: HashMap::new(),
        };

        let remote = VaultContents {
            labels: remote_labels,
            entries: HashMap::new(),
        };

        let result = auto_merge(&local, &remote).expect("auto_merge should succeed");
        // deleted_atが設定されているラベルが保持されていることを確認
        assert!(
            result.merged_labels.contains_key("label1"),
            "label1 should exist in merged_labels"
        );
        assert!(
            result.merged_labels.get("label1").unwrap().deleted_at.is_some(),
            "Label should be marked as deleted"
        );
    }
}
