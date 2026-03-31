pub mod engine;

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
    gc_count += apply_gc_entries(&mut contents.entries, now);
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
fn apply_gc_entries(entries: &mut HashMap<String, VaultEntry>, now: i64) -> usize {
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

    fn create_soft_deleted(id: &str, name: &str, updated_at: i64, deleted_at: i64) -> (String, VaultEntry) {
        let (id, mut entry) = create_entry(id, name, updated_at);
        entry.updated_at = updated_at;
        entry.deleted_at = Some(deleted_at);
        (id, entry)
    }

    fn create_purged(id: &str, updated_at: i64, deleted_at: i64, purged_at: i64) -> (String, VaultEntry) {
        let (id, mut entry) = create_entry(id, "", updated_at);
        entry.updated_at = updated_at;
        entry.deleted_at = Some(deleted_at);
        entry.purged_at = Some(purged_at);
        entry.typed_value = Zeroizing::new(String::new());
        (id, entry)
    }

    fn make_contents(
        entries: Vec<(String, VaultEntry)>,
        labels: Vec<(String, LabelValue)>,
    ) -> VaultContents {
        VaultContents {
            entries: entries.into_iter().collect(),
            labels: labels.into_iter().collect(),
        }
    }

    fn empty_contents() -> VaultContents {
        make_contents(vec![], vec![])
    }

    fn merge(local: &VaultContents, remote: &VaultContents) -> MergeResult {
        auto_merge(local, remote).expect("auto_merge failed")
    }

    // ===== Group B: 片方にのみ存在 =====

    #[test]
    fn test_b1_local_active_only() {
        let (id, entry) = create_entry("id1", "Local", 1000);
        let local = make_contents(vec![(id.clone(), entry)], vec![]);
        let result = merge(&local, &empty_contents());
        assert_eq!(result.merged_entries.len(), 1);
        assert_eq!(result.merged_entries[&id].name, "Local");
        assert!(result.merged_entries[&id].deleted_at.is_none());
    }

    #[test]
    fn test_b2_local_soft_deleted_only() {
        let (id, entry) = create_soft_deleted("id1", "Deleted", 1000, 1000);
        let local = make_contents(vec![(id.clone(), entry)], vec![]);
        let result = merge(&local, &empty_contents());
        assert_eq!(result.merged_entries.len(), 1);
        assert!(result.merged_entries[&id].deleted_at.is_some());
    }

    #[test]
    fn test_b3_local_purged_only() {
        let (id, entry) = create_purged("id1", 1000, 1000, 1000);
        let local = make_contents(vec![(id.clone(), entry)], vec![]);
        let result = merge(&local, &empty_contents());
        assert_eq!(result.merged_entries.len(), 1);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    #[test]
    fn test_b4_remote_active_only() {
        let (id, entry) = create_entry("id1", "Remote", 1000);
        let remote = make_contents(vec![(id.clone(), entry)], vec![]);
        let result = merge(&empty_contents(), &remote);
        assert_eq!(result.merged_entries.len(), 1);
        assert_eq!(result.merged_entries[&id].name, "Remote");
    }

    #[test]
    fn test_b5_remote_soft_deleted_only() {
        let (id, entry) = create_soft_deleted("id1", "Deleted", 1000, 1000);
        let remote = make_contents(vec![(id.clone(), entry)], vec![]);
        let result = merge(&empty_contents(), &remote);
        assert_eq!(result.merged_entries.len(), 1);
        assert!(result.merged_entries[&id].deleted_at.is_some());
    }

    #[test]
    fn test_b6_remote_purged_only() {
        let (id, entry) = create_purged("id1", 1000, 1000, 1000);
        let remote = make_contents(vec![(id.clone(), entry)], vec![]);
        let result = merge(&empty_contents(), &remote);
        assert_eq!(result.merged_entries.len(), 1);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    // ===== Group C: 両方active =====

    #[test]
    fn test_c1_both_active_local_newer() {
        let (id, mut local_entry) = create_entry("id1", "Local", 2000);
        let (_, remote_entry) = create_entry("id1", "Remote", 1000);
        local_entry.updated_at = 2000;

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert_eq!(result.merged_entries[&id].name, "Local");
    }

    #[test]
    fn test_c2_both_active_remote_newer() {
        let (id, local_entry) = create_entry("id1", "Local", 1000);
        let (_, mut remote_entry) = create_entry("id1", "Remote", 2000);
        remote_entry.updated_at = 2000;

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert_eq!(result.merged_entries[&id].name, "Remote");
    }

    #[test]
    fn test_c3_both_active_same_timestamp_same_content() {
        let (id, local_entry) = create_entry("id1", "Same", 1000);
        let (_, remote_entry) = create_entry("id1", "Same", 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert_eq!(result.merged_entries[&id].name, "Same");
    }

    #[test]
    fn test_c4_both_active_same_timestamp_different_content() {
        // 同タイムスタンプ・内容違い → 同state(active)でローカルのdeletion_priority >= リモート → ローカル採用
        let (id, local_entry) = create_entry("id1", "Local", 1000);
        let (_, remote_entry) = create_entry("id1", "Remote", 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        // 実装上はローカルが採用される（deletion_priority同値でlocal >= remote）
        assert_eq!(result.merged_entries[&id].name, "Local");
    }

    // ===== Group D: active vs soft-deleted =====

    #[test]
    fn test_d1_active_vs_soft_deleted_local_newer() {
        let (id, mut local_entry) = create_entry("id1", "Active", 2000);
        local_entry.updated_at = 2000;
        let (_, remote_entry) = create_soft_deleted("id1", "Deleted", 1000, 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert_eq!(result.merged_entries[&id].name, "Active");
        assert!(result.merged_entries[&id].deleted_at.is_none());
    }

    #[test]
    fn test_d2_active_vs_soft_deleted_remote_newer() {
        let (id, local_entry) = create_entry("id1", "Active", 1000);
        let (_, remote_entry) = create_soft_deleted("id1", "Deleted", 2000, 2000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].deleted_at.is_some());
    }

    #[test]
    fn test_d3_active_vs_soft_deleted_same_timestamp() {
        // 同タイムスタンプ → soft-deleted優先
        let (id, local_entry) = create_entry("id1", "Active", 1000);
        let (_, remote_entry) = create_soft_deleted("id1", "Deleted", 1000, 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].deleted_at.is_some());
    }

    #[test]
    fn test_d4_soft_deleted_vs_active_local_newer() {
        let (id, local_entry) = create_soft_deleted("id1", "Deleted", 2000, 2000);
        let (_, remote_entry) = create_entry("id1", "Active", 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].deleted_at.is_some());
    }

    #[test]
    fn test_d5_soft_deleted_vs_active_remote_newer() {
        let (id, local_entry) = create_soft_deleted("id1", "Deleted", 1000, 1000);
        let (_, mut remote_entry) = create_entry("id1", "Active", 2000);
        remote_entry.updated_at = 2000;

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert_eq!(result.merged_entries[&id].name, "Active");
        assert!(result.merged_entries[&id].deleted_at.is_none());
    }

    #[test]
    fn test_d6_soft_deleted_vs_active_same_timestamp() {
        // 同タイムスタンプ → soft-deleted優先
        let (id, local_entry) = create_soft_deleted("id1", "Deleted", 1000, 1000);
        let (_, remote_entry) = create_entry("id1", "Active", 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].deleted_at.is_some());
    }

    // ===== Group D: active vs purged =====

    #[test]
    fn test_d7_active_vs_purged_local_newer() {
        // purge後に復元・再編集 → ローカル(active)採用
        let (id, mut local_entry) = create_entry("id1", "Restored", 2000);
        local_entry.updated_at = 2000;
        let (_, remote_entry) = create_purged("id1", 1000, 1000, 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert_eq!(result.merged_entries[&id].name, "Restored");
        assert!(result.merged_entries[&id].deleted_at.is_none());
        assert!(result.merged_entries[&id].purged_at.is_none());
    }

    #[test]
    fn test_d8_active_vs_purged_remote_newer() {
        let (id, local_entry) = create_entry("id1", "Active", 1000);
        let (_, remote_entry) = create_purged("id1", 2000, 2000, 2000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    #[test]
    fn test_d9_active_vs_purged_same_timestamp() {
        // 同タイムスタンプ → purged優先
        let (id, local_entry) = create_entry("id1", "Active", 1000);
        let (_, remote_entry) = create_purged("id1", 1000, 1000, 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    #[test]
    fn test_d10_purged_vs_active_local_newer() {
        let (id, local_entry) = create_purged("id1", 2000, 2000, 2000);
        let (_, remote_entry) = create_entry("id1", "Active", 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    #[test]
    fn test_d11_purged_vs_active_remote_newer() {
        // purge後に復元・再編集 → リモート(active)採用
        let (id, local_entry) = create_purged("id1", 1000, 1000, 1000);
        let (_, mut remote_entry) = create_entry("id1", "Restored", 2000);
        remote_entry.updated_at = 2000;

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert_eq!(result.merged_entries[&id].name, "Restored");
        assert!(result.merged_entries[&id].purged_at.is_none());
    }

    #[test]
    fn test_d12_purged_vs_active_same_timestamp() {
        // 同タイムスタンプ → purged優先
        let (id, local_entry) = create_purged("id1", 1000, 1000, 1000);
        let (_, remote_entry) = create_entry("id1", "Active", 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    // ===== Group D: soft-deleted vs purged =====

    #[test]
    fn test_d13_soft_deleted_newer_than_purged() {
        // soft-deleted(新) vs purged(古) → soft-deleted採用（不可逆操作を優先しない）
        let (id, local_entry) = create_soft_deleted("id1", "SoftDeleted", 2000, 2000);
        let (_, remote_entry) = create_purged("id1", 1000, 1000, 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].deleted_at.is_some());
        assert!(result.merged_entries[&id].purged_at.is_none());
    }

    #[test]
    fn test_d14_soft_deleted_vs_purged_remote_newer() {
        let (id, local_entry) = create_soft_deleted("id1", "SoftDeleted", 1000, 1000);
        let (_, remote_entry) = create_purged("id1", 2000, 2000, 2000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    #[test]
    fn test_d15_soft_deleted_vs_purged_same_timestamp() {
        // 同タイムスタンプ → purged優先
        let (id, local_entry) = create_soft_deleted("id1", "SoftDeleted", 1000, 1000);
        let (_, remote_entry) = create_purged("id1", 1000, 1000, 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    #[test]
    fn test_d16_purged_newer_vs_soft_deleted() {
        let (id, local_entry) = create_purged("id1", 2000, 2000, 2000);
        let (_, remote_entry) = create_soft_deleted("id1", "SoftDeleted", 1000, 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    #[test]
    fn test_d17_purged_older_vs_soft_deleted_newer() {
        // D-13の逆パターン: リモートのsoft-deletedがローカルのpurgedより新しい → soft-deleted採用
        let (id, local_entry) = create_purged("id1", 1000, 1000, 1000);
        let (_, remote_entry) = create_soft_deleted("id1", "SoftDeleted", 2000, 2000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].deleted_at.is_some());
        assert!(result.merged_entries[&id].purged_at.is_none());
    }

    #[test]
    fn test_d18_purged_vs_soft_deleted_same_timestamp() {
        // 同タイムスタンプ → purged優先
        let (id, local_entry) = create_purged("id1", 1000, 1000, 1000);
        let (_, remote_entry) = create_soft_deleted("id1", "SoftDeleted", 1000, 1000);

        let local = make_contents(vec![(id.clone(), local_entry)], vec![]);
        let remote = make_contents(vec![(id.clone(), remote_entry)], vec![]);
        let result = merge(&local, &remote);
        assert!(result.merged_entries[&id].purged_at.is_some());
    }

    // ===== 複合テスト =====

    #[test]
    fn test_multiple_entries_mixed() {
        let (id1, entry1) = create_entry("id1", "Local Only", 1000);
        let (id2, mut entry2_local) = create_entry("id2", "Edited Local", 2000);
        entry2_local.updated_at = 2000;
        let (_, entry2_remote) = create_entry("id2", "Edited Remote", 1500);
        let (id3, entry3) = create_entry("id3", "Remote Only", 1000);

        let local = make_contents(vec![
            (id1.clone(), entry1),
            (id2.clone(), entry2_local),
        ], vec![]);
        let remote = make_contents(vec![
            (id2.clone(), entry2_remote),
            (id3.clone(), entry3),
        ], vec![]);

        let result = merge(&local, &remote);
        assert_eq!(result.merged_entries.len(), 3);
        assert_eq!(result.merged_entries[&id1].name, "Local Only");
        assert_eq!(result.merged_entries[&id2].name, "Edited Local");
        assert_eq!(result.merged_entries[&id3].name, "Remote Only");
    }

    #[test]
    fn test_empty_vaults() {
        let result = merge(&empty_contents(), &empty_contents());
        assert!(result.merged_entries.is_empty());
        assert!(result.merged_labels.is_empty());
    }

    // ===== ラベルマージ =====

    fn label(name: &str) -> LabelValue {
        LabelValue { name: name.to_string(), created_at: 0, deleted_at: None }
    }

    fn deleted_label(name: &str, deleted_at: i64) -> LabelValue {
        LabelValue { name: name.to_string(), created_at: 0, deleted_at: Some(deleted_at) }
    }

    #[test]
    fn test_label_local_only() {
        let local = make_contents(vec![], vec![("l1".into(), label("Work"))]);
        let result = merge(&local, &empty_contents());
        assert_eq!(result.merged_labels["l1"].name, "Work");
        assert!(result.merged_labels["l1"].deleted_at.is_none());
    }

    #[test]
    fn test_label_remote_only() {
        let remote = make_contents(vec![], vec![("l1".into(), label("Work"))]);
        let result = merge(&empty_contents(), &remote);
        assert_eq!(result.merged_labels["l1"].name, "Work");
    }

    #[test]
    fn test_label_both_active() {
        let local = make_contents(vec![], vec![("l1".into(), label("Work"))]);
        let remote = make_contents(vec![], vec![("l1".into(), label("仕事"))]);
        let result = merge(&local, &remote);
        // 両方activeの場合はローカル採用
        assert_eq!(result.merged_labels["l1"].name, "Work");
    }

    #[test]
    fn test_label_active_vs_deleted() {
        let local = make_contents(vec![], vec![("l1".into(), label("Work"))]);
        let remote = make_contents(vec![], vec![("l1".into(), deleted_label("Work", 2000))]);
        let result = merge(&local, &remote);
        assert!(result.merged_labels["l1"].deleted_at.is_some());
    }

    #[test]
    fn test_label_deleted_vs_active() {
        let local = make_contents(vec![], vec![("l1".into(), deleted_label("Work", 2000))]);
        let remote = make_contents(vec![], vec![("l1".into(), label("Work"))]);
        let result = merge(&local, &remote);
        assert!(result.merged_labels["l1"].deleted_at.is_some());
    }

    #[test]
    fn test_label_both_deleted_newer_wins() {
        let local = make_contents(vec![], vec![("l1".into(), deleted_label("Work", 1000))]);
        let remote = make_contents(vec![], vec![("l1".into(), deleted_label("Work", 2000))]);
        let result = merge(&local, &remote);
        assert_eq!(result.merged_labels["l1"].deleted_at, Some(2000));
    }

    // ===== 孤立ラベル参照のクリーンアップ =====

    #[test]
    fn test_cleanup_orphaned_label_refs() {
        let (id, mut entry) = create_entry("id1", "Entry", 1000);
        entry.label_ids = vec!["l1".into(), "l2".into(), "l3".into()];

        let labels = vec![
            ("l1".into(), label("Active")),
            ("l2".into(), deleted_label("Deleted", 1000)),
            // l3 は存在しないラベル（削除済みではないので残る）
        ];

        let local = make_contents(vec![(id.clone(), entry)], labels.clone());
        let remote = make_contents(vec![], vec![]);
        let result = merge(&local, &remote);

        let merged_entry = &result.merged_entries[&id];
        // l2は削除ラベルなのでクリーンアップされる、l1とl3は残る
        assert!(merged_entry.label_ids.contains(&"l1".to_string()));
        assert!(!merged_entry.label_ids.contains(&"l2".to_string()));
        assert!(merged_entry.label_ids.contains(&"l3".to_string()));
    }

    // ===== GC (Garbage Collection) =====

    #[test]
    fn test_gc_removes_old_purged_entries() {
        let now = 200 * 86400; // 200日目
        let old_purge = 10 * 86400; // 10日目にpurge（190日前 > 180日）
        let recent_purge = 30 * 86400; // 30日目にpurge（170日前 < 180日）

        let (id_old, entry_old) = create_purged("old", old_purge, old_purge, old_purge);
        let (id_recent, entry_recent) = create_purged("recent", recent_purge, recent_purge, recent_purge);
        let (id_active, entry_active) = create_entry("active", "Active", now);

        let mut contents = make_contents(
            vec![
                (id_old.clone(), entry_old),
                (id_recent.clone(), entry_recent),
                (id_active.clone(), entry_active),
            ],
            vec![],
        );

        let gc_count = apply_gc_to_contents(&mut contents, now);
        assert_eq!(gc_count, 1);
        assert!(!contents.entries.contains_key(&id_old));
        assert!(contents.entries.contains_key(&id_recent));
        assert!(contents.entries.contains_key(&id_active));
    }

    #[test]
    fn test_gc_boundary_exactly_180_days() {
        let now = 180 * 86400;
        let exactly_cutoff = 0; // ちょうど180日前

        let (id, entry) = create_purged("edge", exactly_cutoff, exactly_cutoff, exactly_cutoff);
        let mut contents = make_contents(vec![(id.clone(), entry)], vec![]);

        // cutoff = now - 180*86400 = 0, purged_at = 0, 0 < 0 は false なので残る
        let gc_count = apply_gc_to_contents(&mut contents, now);
        assert_eq!(gc_count, 0);
        assert!(contents.entries.contains_key(&id));
    }

    #[test]
    fn test_gc_boundary_one_second_over() {
        let now = 180 * 86400 + 1;
        let purged_at = 0; // 180日+1秒前

        let (id, entry) = create_purged("edge", purged_at, purged_at, purged_at);
        let mut contents = make_contents(vec![(id.clone(), entry)], vec![]);

        // cutoff = 1, purged_at = 0, 0 < 1 なので削除される
        let gc_count = apply_gc_to_contents(&mut contents, now);
        assert_eq!(gc_count, 1);
        assert!(!contents.entries.contains_key(&id));
    }

    #[test]
    fn test_gc_removes_old_deleted_labels() {
        let now = 200 * 86400;
        let old_delete = 10 * 86400;
        let recent_delete = 30 * 86400;

        let mut contents = make_contents(
            vec![],
            vec![
                ("old".into(), deleted_label("Old", old_delete)),
                ("recent".into(), deleted_label("Recent", recent_delete)),
                ("active".into(), label("Active")),
            ],
        );

        apply_gc_to_contents(&mut contents, now);
        assert!(!contents.labels.contains_key("old"));
        assert!(contents.labels.contains_key("recent"));
        assert!(contents.labels.contains_key("active"));
    }

    #[test]
    fn test_gc_no_entries_to_remove() {
        let now = 100 * 86400;
        let (id, entry) = create_entry("active", "Active", now);
        let mut contents = make_contents(vec![(id.clone(), entry)], vec![]);

        let gc_count = apply_gc_to_contents(&mut contents, now);
        assert_eq!(gc_count, 0);
        assert!(contents.entries.contains_key(&id));
    }

    // ===== EntryState =====

    #[test]
    fn test_entry_state_from_entry() {
        let (_, active) = create_entry("id", "Active", 1000);
        assert_eq!(EntryState::from_entry(&active), EntryState::Active);

        let (_, soft_del) = create_soft_deleted("id", "Del", 1000, 1000);
        assert_eq!(EntryState::from_entry(&soft_del), EntryState::SoftDeleted);

        let (_, purged) = create_purged("id", 1000, 1000, 1000);
        assert_eq!(EntryState::from_entry(&purged), EntryState::Purged);
    }

    #[test]
    fn test_deletion_priority_ordering() {
        assert!(EntryState::Purged.deletion_priority() > EntryState::SoftDeleted.deletion_priority());
        assert!(EntryState::SoftDeleted.deletion_priority() > EntryState::Active.deletion_priority());
    }

    // ===== Commutativity tests =====

    /// Helper to compare merge results ignoring HashMap ordering
    fn merge_results_equal(a: &MergeResult, b: &MergeResult) -> bool {
        if a.merged_entries.len() != b.merged_entries.len() {
            return false;
        }
        if a.merged_labels.len() != b.merged_labels.len() {
            return false;
        }
        for (id, entry_a) in &a.merged_entries {
            match b.merged_entries.get(id) {
                None => return false,
                Some(entry_b) => {
                    if entry_a.name != entry_b.name
                        || entry_a.updated_at != entry_b.updated_at
                        || entry_a.deleted_at != entry_b.deleted_at
                        || entry_a.purged_at != entry_b.purged_at
                    {
                        return false;
                    }
                }
            }
        }
        for (id, label_a) in &a.merged_labels {
            match b.merged_labels.get(id) {
                None => return false,
                Some(label_b) => {
                    if label_a.name != label_b.name || label_a.deleted_at != label_b.deleted_at {
                        return false;
                    }
                }
            }
        }
        true
    }

    #[test]
    fn test_merge_commutativity_active_entries() {
        let (id, entry_a) = create_entry("id1", "A", 1000);
        let (_, mut entry_b) = create_entry("id1", "B", 2000);
        entry_b.updated_at = 2000;

        let a = make_contents(vec![(id.clone(), entry_a.clone())], vec![]);
        let b = make_contents(vec![(id.clone(), entry_b.clone())], vec![]);

        let ab = merge(&a, &b);
        let ba = merge(&b, &a);
        assert!(merge_results_equal(&ab, &ba));
    }

    #[test]
    fn test_merge_commutativity_mixed_states() {
        let (id1, entry1) = create_entry("id1", "Active", 2000);
        let (id2, entry2) = create_soft_deleted("id2", "SoftDel", 1500, 1500);
        let (id3, entry3) = create_purged("id3", 1000, 1000, 1000);
        let (_, entry1r) = create_soft_deleted("id1", "Deleted", 1800, 1800);
        let (_, mut entry2r) = create_entry("id2", "Restored", 2000);
        entry2r.updated_at = 2000;

        let a = make_contents(
            vec![(id1.clone(), entry1), (id2.clone(), entry2), (id3.clone(), entry3.clone())],
            vec![("l1".into(), label("Work")), ("l2".into(), deleted_label("Old", 500))],
        );
        let b = make_contents(
            vec![(id1.clone(), entry1r), (id2.clone(), entry2r), (id3.clone(), entry3)],
            vec![("l1".into(), deleted_label("Work", 1000)), ("l2".into(), label("Old"))],
        );

        let ab = merge(&a, &b);
        let ba = merge(&b, &a);
        assert!(merge_results_equal(&ab, &ba));
    }

    #[test]
    fn test_merge_commutativity_soft_deleted_vs_purged() {
        // D-13/D-17 special case
        let (id, entry_sd) = create_soft_deleted("id1", "SoftDeleted", 2000, 2000);
        let (_, entry_p) = create_purged("id1", 1000, 1000, 1000);

        let a = make_contents(vec![(id.clone(), entry_sd)], vec![]);
        let b = make_contents(vec![(id.clone(), entry_p)], vec![]);

        let ab = merge(&a, &b);
        let ba = merge(&b, &a);
        assert!(merge_results_equal(&ab, &ba));
    }
}
