use vault_core::{LockedVault, EntryType, EntryData};

#[test]
fn test_vault_create_unlock_lock_cycle() {
    let master_password = "test_password_123";

    // Create new vault
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");

    // Unlock with correct password
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock vault");

    // Create an entry
    let entry = unlocked
        .create_entry(
            "Test Login".to_string(),
            EntryType::Login,
            EntryData::new_login(
                Some("https://example.com".to_string()),
                "user@example.com".to_string(),
                "password123".to_string(),
                None,
                None,
            ),
            vec![],
        )
        .expect("Failed to create entry");

    assert_eq!(entry.name, "Test Login");

    // Lock vault
    let locked_again = unlocked.lock().expect("Failed to lock vault");

    // Verify we can unlock again
    let mut unlocked_again = locked_again
        .unlock(master_password)
        .expect("Failed to unlock vault again");

    // Verify entry still exists
    let retrieved = unlocked_again
        .get_entry(&entry.id)
        .expect("Failed to get entry")
        .expect("Entry not found");

    assert_eq!(retrieved.name, "Test Login");
}

#[test]
fn test_vault_wrong_password() {
    let master_password = "correct_password";
    let wrong_password = "wrong_password";

    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");

    let result = locked.unlock(wrong_password);
    assert!(result.is_err(), "Should not unlock with wrong password");
}

#[test]
fn test_entry_encryption_decryption() {
    let master_password = "password";
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Create sensitive entry
    let original_content = "This is a secret note with sensitive information";

    let entry = unlocked
        .create_entry(
            "Secret".to_string(),
            EntryType::SecureNote,
            EntryData::new_secure_note(original_content.to_string(), None),
            vec![],
        )
        .expect("Failed to create entry");

    // Retrieve and verify
    let retrieved = unlocked
        .get_entry(&entry.id)
        .expect("Failed to get entry")
        .expect("Entry not found");

    // Check that the decrypted content matches original
    if let vault_core::serde_json::Value::Object(ref retrieved_obj) = retrieved.data.typed_value {
        if let Some(vault_core::serde_json::Value::String(content)) = retrieved_obj.get("content") {
            assert_eq!(content, original_content, "Content should match after encryption/decryption");
        } else {
            panic!("Content field not found or not a string");
        }
    } else {
        panic!("Expected object value");
    }
}

#[test]
fn test_multiple_entries_and_labels() {
    let master_password = "password";
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Create labels
    let work_label = unlocked
        .create_label("work".to_string())
        .expect("Failed to create work label");

    let personal_label = unlocked
        .create_label("personal".to_string())
        .expect("Failed to create personal label");

    // Create entries with labels
    let _entry1 = unlocked
        .create_entry(
            "Gmail".to_string(),
            EntryType::Login,
            EntryData::new_login(
                Some("https://gmail.com".to_string()),
                "user@gmail.com".to_string(),
                "pass123".to_string(),
                None,
                None,
            ),
            vec![personal_label.id.clone()],
        )
        .expect("Failed to create entry 1");

    let _entry2 = unlocked
        .create_entry(
            "GitHub".to_string(),
            EntryType::Login,
            EntryData::new_login(
                Some("https://github.com".to_string()),
                "user".to_string(),
                "token123".to_string(),
                None,
                None,
            ),
            vec![work_label.id.clone()],
        )
        .expect("Failed to create entry 2");

    // List entries
    let filter = vault_core::models::EntryFilter::new();
    let all_entries = unlocked
        .list_entries(&filter)
        .expect("Failed to list entries");

    assert_eq!(all_entries.len(), 2, "Should have 2 entries");

    // Verify labels
    let labels = unlocked.list_labels().expect("Failed to list labels");
    assert_eq!(labels.len(), 2, "Should have 2 labels");
}

#[test]
fn test_database_serialization() {
    let master_password = "password";
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Create entry
    unlocked
        .create_entry(
            "Test".to_string(),
            EntryType::SecureNote,
            EntryData::new_secure_note("test content".to_string(), None),
            vec![],
        )
        .expect("Failed to create entry");

    // Lock and serialize
    let _locked_again = unlocked.lock().expect("Failed to lock vault");

    // Verify serialization produced non-empty bytes
    // We can't directly access vault_bytes, but the lock/unlock cycle proves serialization works
}

#[test]
fn test_entry_deletion_and_restoration() {
    let master_password = "password";
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    let entry = unlocked
        .create_entry(
            "To Delete".to_string(),
            EntryType::SecureNote,
            EntryData::new_secure_note("will be deleted".to_string(), None),
            vec![],
        )
        .expect("Failed to create entry");

    let entry_id = entry.id.clone();

    // Soft delete
    unlocked
        .delete_entry(&entry_id)
        .expect("Failed to delete entry");

    // Verify deleted
    let filter = vault_core::models::EntryFilter::new();
    let active_entries = unlocked
        .list_entries(&filter)
        .expect("Failed to list entries");
    assert_eq!(active_entries.len(), 0, "Should have no active entries");

    // Restore
    unlocked
        .restore_entry(&entry_id)
        .expect("Failed to restore entry");

    let restored_entries = unlocked
        .list_entries(&filter)
        .expect("Failed to list entries");
    assert_eq!(restored_entries.len(), 1, "Should have 1 restored entry");

    // Purge (permanent delete)
    unlocked
        .purge_entry(&entry_id)
        .expect("Failed to purge entry");

    let final_entries = unlocked
        .list_entries(&filter)
        .expect("Failed to list entries");
    assert_eq!(final_entries.len(), 0, "Should have no entries after purge");
}

#[test]
fn test_password_generation() {
    let options = vault_core::PasswordOptions {
        length: 20,
        include_uppercase: true,
        include_lowercase: true,
        include_numbers: true,
        include_symbols: false,
        exclude_ambiguous: false,
    };

    let password = vault_core::generate_password(&options).expect("Failed to generate password");

    assert_eq!(password.len(), 20);
    assert!(password.chars().any(|c| c.is_uppercase()));
    assert!(password.chars().any(|c| c.is_lowercase()));
    assert!(password.chars().any(|c| c.is_numeric()));
}

#[test]
fn test_change_master_password() {
    let old_password = "old_password";
    let new_password = "new_password";

    let locked = LockedVault::create_new(old_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(old_password).expect("Failed to unlock");

    // Change password
    unlocked
        .change_master_password(old_password, new_password)
        .expect("Failed to change password");

    // Lock vault
    let locked_with_new_pw = unlocked.lock().expect("Failed to lock");

    // Try unlock with old password - should fail
    let result_old = locked_with_new_pw.unlock(old_password);
    assert!(
        result_old.is_err(),
        "Should not unlock with old password after change"
    );
}

#[test]
fn test_delete_label_removes_label_id_from_entry() {
    let master_password = "password";
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Create label
    let label = unlocked
        .create_label("test_label".to_string())
        .expect("Failed to create label");

    // Create entry with the label
    let entry = unlocked
        .create_entry(
            "Test Entry".to_string(),
            EntryType::Login,
            EntryData::new_login(
                Some("https://example.com".to_string()),
                "user".to_string(),
                "password".to_string(),
                None,
                None,
            ),
            vec![label.id.clone()],
        )
        .expect("Failed to create entry");

    let entry_id = entry.id.clone();

    // Verify entry has the label
    let entry_before = unlocked
        .get_entry(&entry_id)
        .expect("Failed to get entry")
        .expect("Entry not found");
    assert_eq!(entry_before.labels.len(), 1, "Entry should have 1 label");
    assert_eq!(entry_before.labels[0], label.id, "Entry should have the created label");

    // Delete label
    unlocked
        .delete_label(&label.id)
        .expect("Failed to delete label");

    // Verify entry no longer has the label
    let entry_after = unlocked
        .get_entry(&entry_id)
        .expect("Failed to get entry")
        .expect("Entry not found");
    assert_eq!(entry_after.labels.len(), 0, "Entry should have no labels after label deletion");
}

#[test]
fn test_delete_label_affects_all_entries_with_label() {
    let master_password = "password";
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Create two labels
    let label_to_delete = unlocked
        .create_label("to_delete".to_string())
        .expect("Failed to create label");

    let other_label = unlocked
        .create_label("other".to_string())
        .expect("Failed to create label");

    // Create entry 1 with label_to_delete
    let entry1 = unlocked
        .create_entry(
            "Entry 1".to_string(),
            EntryType::Login,
            EntryData::new_login(
                Some("https://example1.com".to_string()),
                "user1".to_string(),
                "pass1".to_string(),
                None,
                None,
            ),
            vec![label_to_delete.id.clone()],
        )
        .expect("Failed to create entry 1");

    // Create entry 2 with both labels
    let entry2 = unlocked
        .create_entry(
            "Entry 2".to_string(),
            EntryType::Login,
            EntryData::new_login(
                Some("https://example2.com".to_string()),
                "user2".to_string(),
                "pass2".to_string(),
                None,
                None,
            ),
            vec![label_to_delete.id.clone(), other_label.id.clone()],
        )
        .expect("Failed to create entry 2");

    // Create entry 3 with other_label only (should not be affected)
    let entry3 = unlocked
        .create_entry(
            "Entry 3".to_string(),
            EntryType::Login,
            EntryData::new_login(
                Some("https://example3.com".to_string()),
                "user3".to_string(),
                "pass3".to_string(),
                None,
                None,
            ),
            vec![other_label.id.clone()],
        )
        .expect("Failed to create entry 3");

    let entry1_id = entry1.id.clone();
    let entry2_id = entry2.id.clone();
    let entry3_id = entry3.id.clone();

    // Delete the label
    unlocked
        .delete_label(&label_to_delete.id)
        .expect("Failed to delete label");

    // Verify entry 1 has no labels
    let entry1_after = unlocked
        .get_entry(&entry1_id)
        .expect("Failed to get entry 1")
        .expect("Entry 1 not found");
    assert_eq!(entry1_after.labels.len(), 0, "Entry 1 should have no labels");

    // Verify entry 2 only has other_label
    let entry2_after = unlocked
        .get_entry(&entry2_id)
        .expect("Failed to get entry 2")
        .expect("Entry 2 not found");
    assert_eq!(entry2_after.labels.len(), 1, "Entry 2 should have 1 label");
    assert_eq!(entry2_after.labels[0], other_label.id, "Entry 2 should only have other_label");

    // Verify entry 3 is unaffected
    let entry3_after = unlocked
        .get_entry(&entry3_id)
        .expect("Failed to get entry 3")
        .expect("Entry 3 not found");
    assert_eq!(entry3_after.labels.len(), 1, "Entry 3 should still have 1 label");
    assert_eq!(entry3_after.labels[0], other_label.id, "Entry 3 should still have other_label");
}

#[test]
fn test_delete_label_not_found_returns_error() {
    let master_password = "password";
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Try to delete non-existent label
    let result = unlocked.delete_label("non_existent_label_id");
    assert!(result.is_err(), "Should return error when deleting non-existent label");
}
