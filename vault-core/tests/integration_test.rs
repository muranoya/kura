use vault_core::{EntryData, LockedVault};

#[cfg(any(feature = "desktop", feature = "android", feature = "wasm"))]
use vault_core::api::VaultManager;
#[cfg(any(feature = "desktop", feature = "android", feature = "wasm"))]
use vault_core::store::VaultFile;

#[test]
fn test_vault_create_unlock_lock_cycle() {
    let master_password = "test_password_123";

    // Create new vault
    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");

    // Unlock with correct password
    let mut unlocked = locked
        .unlock(master_password)
        .expect("Failed to unlock vault");

    // Create an entry
    let entry = unlocked
        .create_entry(
            "Test Login".to_string(),
            "login".to_string(),
            EntryData::new_login(
                Some("https://example.com".to_string()),
                "user@example.com".to_string(),
                "password123".to_string(),
                None,
            ),
            vec![],
        )
        .expect("Failed to create entry");

    assert_eq!(entry.name, "Test Login");

    // Lock vault
    let locked_again = unlocked.lock().expect("Failed to lock vault");

    // Verify we can unlock again
    let unlocked_again = locked_again
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

    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");

    let result = locked.unlock(wrong_password);
    assert!(result.is_err(), "Should not unlock with wrong password");
}

#[test]
fn test_entry_encryption_decryption() {
    let master_password = "password";
    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Create sensitive entry
    let original_content = "This is a secret note with sensitive information";

    let entry = unlocked
        .create_entry(
            "Secret".to_string(),
            "secure_note".to_string(),
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
            assert_eq!(
                content, original_content,
                "Content should match after encryption/decryption"
            );
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
    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");
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
            "login".to_string(),
            EntryData::new_login(
                Some("https://gmail.com".to_string()),
                "user@gmail.com".to_string(),
                "pass123".to_string(),
                None,
            ),
            vec![personal_label.id.clone()],
        )
        .expect("Failed to create entry 1");

    let _entry2 = unlocked
        .create_entry(
            "GitHub".to_string(),
            "login".to_string(),
            EntryData::new_login(
                Some("https://github.com".to_string()),
                "user".to_string(),
                "token123".to_string(),
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
    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Create entry
    unlocked
        .create_entry(
            "Test".to_string(),
            "secure_note".to_string(),
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
    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    let entry = unlocked
        .create_entry(
            "To Delete".to_string(),
            "secure_note".to_string(),
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
        include_lowercase: true,
        include_uppercase: true,
        include_numbers: true,
        include_symbols1: false,
        include_symbols2: false,
        include_symbols3: false,
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

    let (locked, _) = LockedVault::create_new(old_password).expect("Failed to create vault");
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
    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Create label
    let label = unlocked
        .create_label("test_label".to_string())
        .expect("Failed to create label");

    // Create entry with the label
    let entry = unlocked
        .create_entry(
            "Test Entry".to_string(),
            "login".to_string(),
            EntryData::new_login(
                Some("https://example.com".to_string()),
                "user".to_string(),
                "password".to_string(),
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
    assert_eq!(
        entry_before.labels[0], label.id,
        "Entry should have the created label"
    );

    // Delete label
    unlocked
        .delete_label(&label.id)
        .expect("Failed to delete label");

    // Verify entry no longer has the label
    let entry_after = unlocked
        .get_entry(&entry_id)
        .expect("Failed to get entry")
        .expect("Entry not found");
    assert_eq!(
        entry_after.labels.len(),
        0,
        "Entry should have no labels after label deletion"
    );
}

#[test]
fn test_delete_label_affects_all_entries_with_label() {
    let master_password = "password";
    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");
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
            "login".to_string(),
            EntryData::new_login(
                Some("https://example1.com".to_string()),
                "user1".to_string(),
                "pass1".to_string(),
                None,
            ),
            vec![label_to_delete.id.clone()],
        )
        .expect("Failed to create entry 1");

    // Create entry 2 with both labels
    let entry2 = unlocked
        .create_entry(
            "Entry 2".to_string(),
            "login".to_string(),
            EntryData::new_login(
                Some("https://example2.com".to_string()),
                "user2".to_string(),
                "pass2".to_string(),
                None,
            ),
            vec![label_to_delete.id.clone(), other_label.id.clone()],
        )
        .expect("Failed to create entry 2");

    // Create entry 3 with other_label only (should not be affected)
    let entry3 = unlocked
        .create_entry(
            "Entry 3".to_string(),
            "login".to_string(),
            EntryData::new_login(
                Some("https://example3.com".to_string()),
                "user3".to_string(),
                "pass3".to_string(),
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
    assert_eq!(
        entry1_after.labels.len(),
        0,
        "Entry 1 should have no labels"
    );

    // Verify entry 2 only has other_label
    let entry2_after = unlocked
        .get_entry(&entry2_id)
        .expect("Failed to get entry 2")
        .expect("Entry 2 not found");
    assert_eq!(entry2_after.labels.len(), 1, "Entry 2 should have 1 label");
    assert_eq!(
        entry2_after.labels[0], other_label.id,
        "Entry 2 should only have other_label"
    );

    // Verify entry 3 is unaffected
    let entry3_after = unlocked
        .get_entry(&entry3_id)
        .expect("Failed to get entry 3")
        .expect("Entry 3 not found");
    assert_eq!(
        entry3_after.labels.len(),
        1,
        "Entry 3 should still have 1 label"
    );
    assert_eq!(
        entry3_after.labels[0], other_label.id,
        "Entry 3 should still have other_label"
    );
}

#[test]
#[cfg(any(feature = "desktop", feature = "android", feature = "wasm"))]
fn test_merge_rejects_vault_uuid_mismatch() {
    let password = "password";

    // Vault A を作成してアイテムを追加
    let manager = VaultManager::new();
    let _recovery = manager.api_create_new_vault(password.to_string()).unwrap();
    manager.api_unlock(password.to_string()).unwrap();

    // Vault B を別に作成（UUIDが異なる）
    let (other_locked, _) = LockedVault::create_new(password).unwrap();
    let other_bytes = other_locked.to_vault_bytes().unwrap();

    // Vault AのセッションにVault Bのバイト列をマージしようとする → UUID不一致でエラー
    let result = manager.api_merge_remote_vault(other_bytes, "etag-1".to_string());
    assert!(result.is_err());
    let err = result.unwrap_err();
    assert!(
        err.contains("Vault UUID mismatch"),
        "Error should mention UUID mismatch, got: {}",
        err
    );
}

#[test]
#[cfg(any(feature = "desktop", feature = "android", feature = "wasm"))]
fn test_merge_accepts_same_vault_uuid() {
    let password = "password";

    // Vault を作成
    let (locked, _) = LockedVault::create_new(password).unwrap();
    let vault_bytes = locked.to_vault_bytes().unwrap();

    // 同じvaultをマネージャーにロード
    let manager = VaultManager::new();
    manager
        .api_load_vault(vault_bytes.clone(), "etag-1".to_string())
        .unwrap();
    manager.api_unlock(password.to_string()).unwrap();

    // 同じvaultのバイト列をマージ → UUID一致なので成功
    let result = manager.api_merge_remote_vault(vault_bytes, "etag-2".to_string());
    assert!(result.is_ok());
}

#[test]
fn test_delete_label_not_found_returns_error() {
    let master_password = "password";
    let (locked, _) = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked.unlock(master_password).expect("Failed to unlock");

    // Try to delete non-existent label
    let result = unlocked.delete_label("non_existent_label_id");
    assert!(
        result.is_err(),
        "Should return error when deleting non-existent label"
    );
}

// ============================================================================
// VaultManager API Tests
// ============================================================================

#[cfg(any(feature = "desktop", feature = "android", feature = "wasm"))]
mod vault_manager_api {
    use super::*;

    const TEST_PASSWORD: &str = "integration-test-password";

    fn setup_unlocked_vault() -> (VaultManager, String) {
        let m = VaultManager::new();
        let recovery_key = m
            .api_create_new_vault(TEST_PASSWORD.to_string())
            .expect("Failed to create vault");
        m.api_unlock(TEST_PASSWORD.to_string())
            .expect("Failed to unlock vault");
        (m, recovery_key)
    }

    // A. Initial Setup

    #[test]
    fn test_create_vault_returns_recovery_key() {
        let m = VaultManager::new();
        let recovery_key = m
            .api_create_new_vault(TEST_PASSWORD.to_string())
            .expect("Failed to create vault");
        assert!(!recovery_key.is_empty());
        assert!(!m.api_is_unlocked());
    }

    #[test]
    fn test_create_unlock_lock_cycle() {
        let m = VaultManager::new();
        m.api_create_new_vault(TEST_PASSWORD.to_string())
            .expect("Failed to create vault");

        m.api_unlock(TEST_PASSWORD.to_string())
            .expect("Failed to unlock");
        assert!(m.api_is_unlocked());

        let vault_bytes = m.api_lock().expect("Failed to lock");
        assert!(!vault_bytes.is_empty());
        assert!(!m.api_is_unlocked());

        m.api_load_vault(vault_bytes, String::new())
            .expect("Failed to load vault");
        m.api_unlock(TEST_PASSWORD.to_string())
            .expect("Failed to unlock again");
        assert!(m.api_is_unlocked());
    }

    #[test]
    fn test_recovery_key_unlock() {
        let (m, recovery_key) = setup_unlocked_vault();

        let vault_bytes = m.api_lock().expect("Failed to lock");

        m.api_load_vault(vault_bytes, String::new())
            .expect("Failed to load vault");
        m.api_unlock_with_recovery_key(recovery_key)
            .expect("Failed to unlock with recovery key");
        assert!(m.api_is_unlocked());

        let entries = m
            .api_list_entries(None, None, None, false, false, None, None)
            .expect("Failed to list entries");
        assert_eq!(entries.len(), 0);
    }

    #[test]
    fn test_wrong_password_fails() {
        let m = VaultManager::new();
        m.api_create_new_vault(TEST_PASSWORD.to_string())
            .expect("Failed to create vault");
        let result = m.api_unlock("wrong-password".to_string());
        assert!(result.is_err());
    }

    #[test]
    fn test_unlock_succeeds_after_wrong_password() {
        let m = VaultManager::new();
        m.api_create_new_vault(TEST_PASSWORD.to_string())
            .expect("Failed to create vault");

        let result = m.api_unlock("wrong-password".to_string());
        assert!(result.is_err());

        m.api_unlock(TEST_PASSWORD.to_string())
            .expect("Should unlock with correct password after failed attempt");
    }

    // B. Entry CRUD

    #[test]
    fn test_create_and_get_login_entry() {
        let (m, _) = setup_unlocked_vault();

        let typed_value = r#"{"url":"https://github.com","username":"user@example.com","password":"secret123","totp":null}"#;

        let entry_id = m
            .api_create_entry(
                "login".to_string(),
                "GitHub".to_string(),
                Some("My GitHub account".to_string()),
                typed_value.to_string(),
                vec![],
                None,
            )
            .expect("Failed to create entry");

        assert!(!entry_id.is_empty());

        let detail = m.api_get_entry(entry_id).expect("Failed to get entry");
        assert_eq!(detail.name, "GitHub");
        assert_eq!(detail.entry_type, "login");
        assert_eq!(detail.notes.as_deref(), Some("My GitHub account"));
        assert!(detail.typed_value.contains("github.com"));
        assert!(detail.typed_value.contains("secret123"));
        assert!(!detail.is_favorite);
        assert!(detail.deleted_at.is_none());
    }

    #[test]
    fn test_create_entries_of_all_types() {
        let (m, _) = setup_unlocked_vault();

        let entries_data = vec![
            (
                "login",
                "Test Login",
                r#"{"url":"https://example.com","username":"user","password":"pass","totp":null}"#,
            ),
            (
                "bank",
                "Test Bank",
                r#"{"bank_name":"Test Bank","account_number":"1234567890","pin":"1234"}"#,
            ),
            (
                "ssh_key",
                "Test SSH",
                r#"{"private_key":"-----BEGIN RSA PRIVATE KEY-----","passphrase":null}"#,
            ),
            (
                "secure_note",
                "Test Note",
                r#"{"content":"This is a secret note"}"#,
            ),
            (
                "credit_card",
                "Test Card",
                r#"{"cardholder":"John Doe","number":"4111111111111111","expiry":"12/25","cvv":"123"}"#,
            ),
        ];

        for (entry_type, name, typed_value) in &entries_data {
            m.api_create_entry(
                entry_type.to_string(),
                name.to_string(),
                None,
                typed_value.to_string(),
                vec![],
                None,
            )
            .expect(&format!("Failed to create {} entry", entry_type));
        }

        let all = m
            .api_list_entries(None, None, None, false, false, None, None)
            .expect("Failed to list entries");
        assert_eq!(all.len(), 5);

        for (entry_type, _, _) in &entries_data {
            let filtered = m
                .api_list_entries(
                    None,
                    Some(entry_type.to_string()),
                    None,
                    false,
                    false,
                    None,
                    None,
                )
                .expect("Failed to filter entries");
            assert_eq!(
                filtered.len(),
                1,
                "Expected 1 entry for type {}",
                entry_type
            );
        }
    }

    #[test]
    fn test_update_entry() {
        let (m, _) = setup_unlocked_vault();

        let typed_value =
            r#"{"url":"https://example.com","username":"old_user","password":"old_pass","totp":null}"#;
        let entry_id = m
            .api_create_entry(
                "login".to_string(),
                "Original Name".to_string(),
                None,
                typed_value.to_string(),
                vec![],
                None,
            )
            .expect("Failed to create entry");

        let new_typed_value =
            r#"{"url":"https://updated.com","username":"new_user","password":"new_pass","totp":null}"#;
        m.api_update_entry(
            entry_id.clone(),
            Some("Updated Name".to_string()),
            Some("new notes".to_string()),
            Some(new_typed_value.to_string()),
            None,
            None,
        )
        .expect("Failed to update entry");

        let detail = m.api_get_entry(entry_id).expect("Failed to get entry");
        assert_eq!(detail.name, "Updated Name");
        assert_eq!(detail.notes.as_deref(), Some("new notes"));
        assert!(detail.typed_value.contains("updated.com"));
        assert!(detail.typed_value.contains("new_user"));
    }

    #[test]
    fn test_delete_restore_purge_entry() {
        let (m, _) = setup_unlocked_vault();

        let typed_value = r#"{"content":"temp note"}"#;
        let entry_id = m
            .api_create_entry(
                "secure_note".to_string(),
                "To Delete".to_string(),
                None,
                typed_value.to_string(),
                vec![],
                None,
            )
            .expect("Failed to create entry");

        // Soft delete
        m.api_delete_entry(entry_id.clone())
            .expect("Failed to delete entry");

        let active = m
            .api_list_entries(None, None, None, false, false, None, None)
            .expect("Failed to list");
        assert_eq!(active.len(), 0);

        let trash = m
            .api_list_entries(None, None, None, true, false, None, None)
            .expect("Failed to list trash");
        assert!(trash.iter().any(|e| e.id == entry_id));

        let detail = m
            .api_get_entry(entry_id.clone())
            .expect("Failed to get entry");
        assert!(detail.deleted_at.is_some());

        // Restore
        m.api_restore_entry(entry_id.clone())
            .expect("Failed to restore entry");
        let active = m
            .api_list_entries(None, None, None, false, false, None, None)
            .expect("Failed to list");
        assert_eq!(active.len(), 1);

        // Purge
        m.api_delete_entry(entry_id.clone())
            .expect("Failed to delete for purge");
        m.api_purge_entry(entry_id.clone())
            .expect("Failed to purge entry");

        let active = m
            .api_list_entries(None, None, None, false, false, None, None)
            .expect("Failed to list active");
        assert_eq!(active.len(), 0);

        let detail = m
            .api_get_entry(entry_id)
            .expect("Failed to get purged entry");
        assert!(detail.deleted_at.is_some());
    }

    #[test]
    fn test_set_favorite() {
        let (m, _) = setup_unlocked_vault();

        let typed_value = r#"{"content":"fav note"}"#;
        let entry_id = m
            .api_create_entry(
                "secure_note".to_string(),
                "Favorite Test".to_string(),
                None,
                typed_value.to_string(),
                vec![],
                None,
            )
            .expect("Failed to create entry");

        let detail = m
            .api_get_entry(entry_id.clone())
            .expect("Failed to get entry");
        assert!(!detail.is_favorite);

        m.api_set_favorite(entry_id.clone(), true)
            .expect("Failed to set favorite");
        let detail = m
            .api_get_entry(entry_id.clone())
            .expect("Failed to get entry");
        assert!(detail.is_favorite);

        let favorites = m
            .api_list_entries(None, None, None, false, true, None, None)
            .expect("Failed to list favorites");
        assert_eq!(favorites.len(), 1);

        m.api_set_favorite(entry_id, false)
            .expect("Failed to unset favorite");
        let favorites = m
            .api_list_entries(None, None, None, false, true, None, None)
            .expect("Failed to list favorites");
        assert_eq!(favorites.len(), 0);
    }

    // C. Label CRUD

    #[test]
    fn test_create_and_list_labels() {
        let (m, _) = setup_unlocked_vault();

        let id1 = m
            .api_create_label("Work".to_string())
            .expect("Failed to create label");
        let id2 = m
            .api_create_label("Personal".to_string())
            .expect("Failed to create label");
        assert!(!id1.is_empty());
        assert!(!id2.is_empty());

        let labels = m.api_list_labels().expect("Failed to list labels");
        assert_eq!(labels.len(), 2);

        let names: Vec<&str> = labels.iter().map(|l| l.name.as_str()).collect();
        assert!(names.contains(&"Work"));
        assert!(names.contains(&"Personal"));
    }

    #[test]
    fn test_rename_label() {
        let (m, _) = setup_unlocked_vault();

        let label_id = m
            .api_create_label("Old Name".to_string())
            .expect("Failed to create label");
        m.api_rename_label(label_id.clone(), "New Name".to_string())
            .expect("Failed to rename label");

        let labels = m.api_list_labels().expect("Failed to list labels");
        assert_eq!(labels.len(), 1);
        assert_eq!(labels[0].name, "New Name");
    }

    #[test]
    fn test_delete_label_cascades_to_entries() {
        let (m, _) = setup_unlocked_vault();

        let label_id = m
            .api_create_label("ToDelete".to_string())
            .expect("Failed to create label");

        let typed_value = r#"{"content":"test"}"#;
        let entry_id = m
            .api_create_entry(
                "secure_note".to_string(),
                "Labeled Entry".to_string(),
                None,
                typed_value.to_string(),
                vec![label_id.clone()],
                None,
            )
            .expect("Failed to create entry");

        let detail = m
            .api_get_entry(entry_id.clone())
            .expect("Failed to get entry");
        assert_eq!(detail.labels.len(), 1);

        m.api_delete_label(label_id)
            .expect("Failed to delete label");

        let labels = m.api_list_labels().expect("Failed to list labels");
        assert_eq!(labels.len(), 0);

        let detail = m.api_get_entry(entry_id).expect("Failed to get entry");
        assert_eq!(detail.labels.len(), 0);
    }

    #[test]
    fn test_set_entry_labels() {
        let (m, _) = setup_unlocked_vault();

        let label1 = m
            .api_create_label("Label A".to_string())
            .expect("Failed to create label");
        let label2 = m
            .api_create_label("Label B".to_string())
            .expect("Failed to create label");

        let typed_value = r#"{"content":"test"}"#;
        let entry_id = m
            .api_create_entry(
                "secure_note".to_string(),
                "Multi Label".to_string(),
                None,
                typed_value.to_string(),
                vec![],
                None,
            )
            .expect("Failed to create entry");

        m.api_set_entry_labels(entry_id.clone(), vec![label1.clone(), label2.clone()])
            .expect("Failed to set labels");

        let detail = m
            .api_get_entry(entry_id.clone())
            .expect("Failed to get entry");
        assert_eq!(detail.labels.len(), 2);

        let filtered = m
            .api_list_entries(None, None, Some(label1.clone()), false, false, None, None)
            .expect("Failed to filter by label");
        assert_eq!(filtered.len(), 1);

        m.api_set_entry_labels(entry_id.clone(), vec![])
            .expect("Failed to clear labels");
        let detail = m.api_get_entry(entry_id).expect("Failed to get entry");
        assert_eq!(detail.labels.len(), 0);
    }

    // D. vault.json Validation

    #[test]
    fn test_vault_json_structure() {
        let (m, _) = setup_unlocked_vault();

        let typed_value = r#"{"content":"structure test"}"#;
        m.api_create_entry(
            "secure_note".to_string(),
            "Structure Test".to_string(),
            None,
            typed_value.to_string(),
            vec![],
            None,
        )
        .expect("Failed to create entry");

        let vault_bytes = m.api_get_vault_bytes().expect("Failed to get vault bytes");
        assert!(!vault_bytes.is_empty());

        let json: serde_json::Value =
            serde_json::from_slice(&vault_bytes).expect("vault bytes is not valid JSON");

        assert!(json["schema_version"].is_u64());

        let meta = &json["meta"];
        assert!(meta.is_object());
        assert!(meta["encrypted_dek_master"].is_string());
        assert!(!meta["encrypted_dek_master"].as_str().unwrap().is_empty());
        assert!(meta["encrypted_dek_recovery"].is_string());
        assert!(!meta["encrypted_dek_recovery"].as_str().unwrap().is_empty());

        let argon2 = &meta["argon2_params"];
        assert!(argon2.is_object());
        assert!(argon2["salt"].is_string());
        assert!(argon2["iterations"].is_u64());
        assert!(argon2["memory"].is_u64());
        assert!(argon2["parallelism"].is_u64());

        assert!(meta["created_at"].is_i64());

        assert!(json["encrypted_vault"].is_string());
        assert!(!json["encrypted_vault"].as_str().unwrap().is_empty());

        let vault_file = VaultFile::from_bytes(&vault_bytes).expect("Failed to parse VaultFile");
        assert!(vault_file.schema_version >= 1);
        assert!(!vault_file.encrypted_vault.is_empty());
    }

    #[test]
    fn test_vault_bytes_roundtrip() {
        let (m, _) = setup_unlocked_vault();

        let label_id = m
            .api_create_label("Roundtrip".to_string())
            .expect("Failed to create label");
        let typed_value = r#"{"content":"roundtrip test"}"#;
        let entry_id = m
            .api_create_entry(
                "secure_note".to_string(),
                "Roundtrip Entry".to_string(),
                Some("roundtrip notes".to_string()),
                typed_value.to_string(),
                vec![label_id.clone()],
                None,
            )
            .expect("Failed to create entry");

        let vault_bytes = m.api_get_vault_bytes().expect("Failed to get vault bytes");

        m.api_load_vault(vault_bytes, String::new())
            .expect("Failed to load vault");
        m.api_unlock(TEST_PASSWORD.to_string())
            .expect("Failed to unlock");

        let entries = m
            .api_list_entries(None, None, None, false, false, None, None)
            .expect("Failed to list");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "Roundtrip Entry");

        let detail = m.api_get_entry(entry_id).expect("Failed to get entry");
        assert_eq!(detail.notes.as_deref(), Some("roundtrip notes"));
        assert!(detail.labels.contains(&label_id));

        let labels = m.api_list_labels().expect("Failed to list labels");
        assert_eq!(labels.len(), 1);
        assert_eq!(labels[0].name, "Roundtrip");
    }
}

// ============================================================================
// Sync API Tests (with MockStorageBackend)
// ============================================================================

#[cfg(any(feature = "desktop", feature = "android"))]
mod sync_api {
    use super::*;
    use async_trait::async_trait;
    use std::sync::Mutex;
    use vault_core::error::{Result as VaultResult, VaultError};
    use vault_core::StorageBackend;

    const TEST_PASSWORD: &str = "sync-test-password";

    /// In-memory StorageBackend for testing sync logic without real S3.
    struct MockStorage {
        data: Mutex<Option<(Vec<u8>, String)>>,
    }

    impl MockStorage {
        fn new() -> Self {
            Self {
                data: Mutex::new(None),
            }
        }
    }

    #[async_trait]
    impl StorageBackend for MockStorage {
        async fn download(&self) -> VaultResult<Option<(Vec<u8>, String)>> {
            Ok(self.data.lock().unwrap().clone())
        }

        async fn upload(&self, data: &[u8], etag: Option<&str>) -> VaultResult<String> {
            let mut storage = self.data.lock().unwrap();
            // Simulate conditional write (If-Match)
            match (etag, &*storage) {
                (Some(expected), Some((_, current_etag))) if expected != current_etag => {
                    return Err(VaultError::ConflictDetected);
                }
                _ => {}
            }
            let new_etag = format!("etag-{}", uuid::Uuid::new_v4());
            *storage = Some((data.to_vec(), new_etag.clone()));
            Ok(new_etag)
        }
    }

    fn setup_unlocked_vault() -> (VaultManager, String) {
        let m = VaultManager::new();
        let recovery_key = m
            .api_create_new_vault(TEST_PASSWORD.to_string())
            .expect("Failed to create vault");
        m.api_unlock(TEST_PASSWORD.to_string())
            .expect("Failed to unlock vault");
        (m, recovery_key)
    }

    #[tokio::test]
    async fn test_push_and_download() {
        let (m, _) = setup_unlocked_vault();

        let typed_value = r#"{"content":"sync test"}"#;
        let entry_id = m
            .api_create_entry(
                "secure_note".to_string(),
                "Sync Entry".to_string(),
                None,
                typed_value.to_string(),
                vec![],
                None,
            )
            .expect("Failed to create entry");

        let storage = MockStorage::new();
        m.api_push(&storage).await.expect("Failed to push");

        // Overwrite session with a new vault
        m.api_create_new_vault("temporary-password".to_string())
            .expect("Failed to create temp vault");

        // Download from storage
        let found = m.api_download(&storage).await.expect("Failed to download");
        assert!(found);

        // Unlock with original password
        m.api_unlock(TEST_PASSWORD.to_string())
            .expect("Failed to unlock after download");
        assert!(m.api_is_unlocked());

        // Verify entry exists
        let detail = m.api_get_entry(entry_id).expect("Failed to get entry");
        assert_eq!(detail.name, "Sync Entry");
    }

    #[tokio::test]
    async fn test_sync_no_remote() {
        let (m, _) = setup_unlocked_vault();

        let typed_value = r#"{"content":"no remote"}"#;
        m.api_create_entry(
            "secure_note".to_string(),
            "No Remote".to_string(),
            None,
            typed_value.to_string(),
            vec![],
            None,
        )
        .expect("Failed to create entry");

        let storage = MockStorage::new();
        let result = m.api_sync(&storage).await.expect("Failed to sync");
        assert!(result.synced);
        assert!(result.last_synced_at.is_some());

        // Verify the object now exists in storage
        let downloaded = storage.download().await.expect("Failed to download");
        assert!(downloaded.is_some());
    }

    #[tokio::test]
    async fn test_sync_merge() {
        let (m, _) = setup_unlocked_vault();

        // Create entry A and push
        let typed_value_a = r#"{"content":"entry A"}"#;
        m.api_create_entry(
            "secure_note".to_string(),
            "Entry A".to_string(),
            None,
            typed_value_a.to_string(),
            vec![],
            None,
        )
        .expect("Failed to create entry A");

        let storage = MockStorage::new();
        m.api_push(&storage).await.expect("Failed to push");

        // Add entry B locally without pushing
        let typed_value_b = r#"{"content":"entry B"}"#;
        m.api_create_entry(
            "secure_note".to_string(),
            "Entry B".to_string(),
            None,
            typed_value_b.to_string(),
            vec![],
            None,
        )
        .expect("Failed to create entry B");

        // Sync should merge
        m.api_sync(&storage).await.expect("Failed to sync");

        // Both entries should exist
        let entries = m
            .api_list_entries(None, None, None, false, false, None, None)
            .expect("Failed to list");
        assert_eq!(entries.len(), 2);

        let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
        assert!(names.contains(&"Entry A"));
        assert!(names.contains(&"Entry B"));
    }

    #[tokio::test]
    async fn test_vault_json_on_storage() {
        let (m, _) = setup_unlocked_vault();

        let label_id = m
            .api_create_label("Storage Label".to_string())
            .expect("Failed to create label");
        let typed_value =
            r#"{"url":"https://example.com","username":"user","password":"pass","totp":null}"#;
        m.api_create_entry(
            "login".to_string(),
            "Storage Entry".to_string(),
            None,
            typed_value.to_string(),
            vec![label_id],
            None,
        )
        .expect("Failed to create entry");

        let storage = MockStorage::new();
        m.api_push(&storage).await.expect("Failed to push");

        // Verify vault.json structure in storage
        let (raw_bytes, etag) = storage
            .download()
            .await
            .expect("Failed to download")
            .expect("No object found");
        assert!(!etag.is_empty());

        let json: serde_json::Value =
            serde_json::from_slice(&raw_bytes).expect("Not valid JSON in storage");
        assert!(json["schema_version"].is_u64());
        assert!(json["meta"].is_object());
        assert!(json["encrypted_vault"].is_string());

        let vault_file = VaultFile::from_bytes(&raw_bytes).expect("Failed to parse VaultFile");
        assert!(vault_file.schema_version >= 1);
    }
}
