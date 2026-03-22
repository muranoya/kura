use crate::store::VaultEntry;

#[derive(Debug, Clone)]
pub struct ConflictedEntry {
    pub id: String,
    pub local: Option<VaultEntry>,
    pub remote: Option<VaultEntry>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictResolution {
    UseLocal,
    UseRemote,
    DeleteEntry,
}

impl ConflictedEntry {
    /// Determine conflict type for display
    pub fn conflict_type(&self) -> &'static str {
        match (&self.local, &self.remote) {
            (Some(_), Some(_)) => "both_modified",
            (Some(_), None) => "deleted_remote",
            (None, Some(_)) => "deleted_local",
            (None, None) => "invalid",
        }
    }

    /// Apply resolution strategy
    pub fn apply_resolution(&self, resolution: ConflictResolution) -> Option<VaultEntry> {
        match resolution {
            ConflictResolution::UseLocal => self.local.clone(),
            ConflictResolution::UseRemote => self.remote.clone(),
            ConflictResolution::DeleteEntry => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::EntryType;

    fn create_test_entry(_id: &str) -> VaultEntry {
        VaultEntry {
            entry_type: EntryType::Login,
            name: "Test Entry".to_string(),
            created_at: 1000,
            updated_at: 1000,
            deleted_at: None,
            is_favorite: false,
            label_ids: vec![],
            typed_value: serde_json::json!({}),
            notes: None,
        }
    }

    #[test]
    fn test_conflict_type_both_modified() {
        let local = create_test_entry("entry1");
        let remote = create_test_entry("entry1");
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: Some(local),
            remote: Some(remote),
        };

        assert_eq!(conflict.conflict_type(), "both_modified");
    }

    #[test]
    fn test_conflict_type_deleted_remote() {
        let local = create_test_entry("entry1");
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: Some(local),
            remote: None,
        };

        assert_eq!(conflict.conflict_type(), "deleted_remote");
    }

    #[test]
    fn test_conflict_type_deleted_local() {
        let remote = create_test_entry("entry1");
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: None,
            remote: Some(remote),
        };

        assert_eq!(conflict.conflict_type(), "deleted_local");
    }

    #[test]
    fn test_conflict_type_invalid() {
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: None,
            remote: None,
        };

        assert_eq!(conflict.conflict_type(), "invalid");
    }

    #[test]
    fn test_apply_resolution_use_local_with_both_present() {
        let local = create_test_entry("entry1");
        let remote = create_test_entry("entry1");
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: Some(local.clone()),
            remote: Some(remote),
        };

        let result = conflict.apply_resolution(ConflictResolution::UseLocal);
        assert!(result.is_some());
        let entry = result.unwrap();
        assert_eq!(entry.name, "Test Entry");
    }

    #[test]
    fn test_apply_resolution_use_remote_with_both_present() {
        let local = create_test_entry("entry1");
        let mut remote = create_test_entry("entry1");
        remote.name = "Remote Entry".to_string();
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: Some(local),
            remote: Some(remote.clone()),
        };

        let result = conflict.apply_resolution(ConflictResolution::UseRemote);
        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "Remote Entry");
    }

    #[test]
    fn test_apply_resolution_delete_entry() {
        let local = create_test_entry("entry1");
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: Some(local),
            remote: None,
        };

        let result = conflict.apply_resolution(ConflictResolution::DeleteEntry);
        assert!(result.is_none());
    }

    #[test]
    fn test_apply_resolution_use_local_when_only_local_exists() {
        let local = create_test_entry("entry1");
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: Some(local.clone()),
            remote: None,
        };

        let result = conflict.apply_resolution(ConflictResolution::UseLocal);
        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "Test Entry");
    }

    #[test]
    fn test_apply_resolution_use_remote_when_only_remote_exists() {
        let remote = create_test_entry("entry1");
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: None,
            remote: Some(remote.clone()),
        };

        let result = conflict.apply_resolution(ConflictResolution::UseRemote);
        assert!(result.is_some());
        assert_eq!(result.unwrap().name, "Test Entry");
    }

    #[test]
    fn test_apply_resolution_all_resolutions_return_none_for_invalid_conflict() {
        let conflict = ConflictedEntry {
            id: "entry1".to_string(),
            local: None,
            remote: None,
        };

        assert!(conflict
            .apply_resolution(ConflictResolution::UseLocal)
            .is_none());
        assert!(conflict
            .apply_resolution(ConflictResolution::UseRemote)
            .is_none());
        assert!(conflict
            .apply_resolution(ConflictResolution::DeleteEntry)
            .is_none());
    }

    #[test]
    fn test_conflict_resolution_equality() {
        assert_eq!(ConflictResolution::UseLocal, ConflictResolution::UseLocal);
        assert_ne!(ConflictResolution::UseLocal, ConflictResolution::UseRemote);
        assert_ne!(ConflictResolution::UseRemote, ConflictResolution::DeleteEntry);
    }
}
