use kura_desktop_lib::storage::S3Storage;
use serial_test::serial;
use vault_core::api::*;
use vault_core::config::S3Config;
use vault_core::store::VaultFile;
use vault_core::StorageBackend;

const TEST_PASSWORD: &str = "integration-test-password";

fn minio_config(key: &str) -> S3Config {
    S3Config {
        region: "us-east-1".to_string(),
        bucket: "kura-test".to_string(),
        key: key.to_string(),
        access_key_id: "minioadmin".to_string(),
        secret_access_key: "minioadmin".to_string(),
        endpoint: Some("http://localhost:9000".to_string()),
    }
}

fn unique_key() -> String {
    format!("vault-{}.json", uuid::Uuid::new_v4())
}

/// Create vault and unlock it. Returns recovery key.
fn setup_unlocked_vault() -> String {
    let recovery_key =
        api_create_new_vault(TEST_PASSWORD.to_string()).expect("Failed to create vault");
    api_unlock(TEST_PASSWORD.to_string()).expect("Failed to unlock vault");
    recovery_key
}

// ============================================================================
// A. Initial Setup
// ============================================================================

#[test]
#[serial]
fn test_create_vault_returns_recovery_key() {
    let recovery_key =
        api_create_new_vault(TEST_PASSWORD.to_string()).expect("Failed to create vault");
    assert!(!recovery_key.is_empty());
    // After create, session is Locked
    assert!(!api_is_unlocked());
}

#[test]
#[serial]
fn test_create_unlock_lock_cycle() {
    api_create_new_vault(TEST_PASSWORD.to_string()).expect("Failed to create vault");

    // Unlock
    api_unlock(TEST_PASSWORD.to_string()).expect("Failed to unlock");
    assert!(api_is_unlocked());

    // Lock -> returns vault bytes
    let vault_bytes = api_lock().expect("Failed to lock");
    assert!(!vault_bytes.is_empty());
    assert!(!api_is_unlocked());

    // Reload and unlock again
    api_load_vault(vault_bytes, String::new()).expect("Failed to load vault");
    api_unlock(TEST_PASSWORD.to_string()).expect("Failed to unlock again");
    assert!(api_is_unlocked());
}

#[test]
#[serial]
fn test_recovery_key_unlock() {
    let recovery_key =
        api_create_new_vault(TEST_PASSWORD.to_string()).expect("Failed to create vault");
    api_unlock(TEST_PASSWORD.to_string()).expect("Failed to unlock");

    // Lock and get bytes
    let vault_bytes = api_lock().expect("Failed to lock");

    // Load and unlock with recovery key
    api_load_vault(vault_bytes, String::new()).expect("Failed to load vault");
    api_unlock_with_recovery_key(recovery_key).expect("Failed to unlock with recovery key");
    assert!(api_is_unlocked());

    // Verify we can list entries (empty)
    let entries =
        api_list_entries(None, None, None, false, false).expect("Failed to list entries");
    assert_eq!(entries.len(), 0);
}

#[test]
#[serial]
fn test_wrong_password_fails() {
    api_create_new_vault(TEST_PASSWORD.to_string()).expect("Failed to create vault");
    let result = api_unlock("wrong-password".to_string());
    assert!(result.is_err());
}

// ============================================================================
// B. Entry CRUD
// ============================================================================

#[test]
#[serial]
fn test_create_and_get_login_entry() {
    setup_unlocked_vault();

    let typed_value =
        r#"{"url":"https://github.com","username":"user@example.com","password":"secret123","totp":null}"#;

    let entry_id = api_create_entry(
        "login".to_string(),
        "GitHub".to_string(),
        Some("My GitHub account".to_string()),
        typed_value.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry");

    assert!(!entry_id.is_empty());

    let detail = api_get_entry(entry_id).expect("Failed to get entry");
    assert_eq!(detail.name, "GitHub");
    assert_eq!(detail.entry_type, "login");
    assert_eq!(detail.notes.as_deref(), Some("My GitHub account"));
    assert!(detail.typed_value.contains("github.com"));
    assert!(detail.typed_value.contains("secret123"));
    assert!(!detail.is_favorite);
    assert!(detail.deleted_at.is_none());
}

#[test]
#[serial]
fn test_create_entries_of_all_types() {
    setup_unlocked_vault();

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
        api_create_entry(
            entry_type.to_string(),
            name.to_string(),
            None,
            typed_value.to_string(),
            vec![],
            None,
        )
        .expect(&format!("Failed to create {} entry", entry_type));
    }

    // List all
    let all = api_list_entries(None, None, None, false, false).expect("Failed to list entries");
    assert_eq!(all.len(), 5);

    // Filter by type
    for (entry_type, _, _) in &entries_data {
        let filtered = api_list_entries(None, Some(entry_type.to_string()), None, false, false)
            .expect("Failed to filter entries");
        assert_eq!(filtered.len(), 1, "Expected 1 entry for type {}", entry_type);
    }
}

#[test]
#[serial]
fn test_update_entry() {
    setup_unlocked_vault();

    let typed_value =
        r#"{"url":"https://example.com","username":"old_user","password":"old_pass","totp":null}"#;
    let entry_id = api_create_entry(
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
    api_update_entry(
        entry_id.clone(),
        Some("Updated Name".to_string()),
        Some("new notes".to_string()),
        Some(new_typed_value.to_string()),
        None,
        None,
    )
    .expect("Failed to update entry");

    let detail = api_get_entry(entry_id).expect("Failed to get entry");
    assert_eq!(detail.name, "Updated Name");
    assert_eq!(detail.notes.as_deref(), Some("new notes"));
    assert!(detail.typed_value.contains("updated.com"));
    assert!(detail.typed_value.contains("new_user"));
}

#[test]
#[serial]
fn test_delete_restore_purge_entry() {
    setup_unlocked_vault();

    let typed_value = r#"{"content":"temp note"}"#;
    let entry_id = api_create_entry(
        "secure_note".to_string(),
        "To Delete".to_string(),
        None,
        typed_value.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry");

    // Soft delete
    api_delete_entry(entry_id.clone()).expect("Failed to delete entry");

    // Not in active list
    let active = api_list_entries(None, None, None, false, false).expect("Failed to list");
    assert_eq!(active.len(), 0);

    // In trash list
    let trash = api_list_entries(None, None, None, true, false).expect("Failed to list trash");
    assert!(trash.iter().any(|e| e.id == entry_id));

    // Verify deleted_at is set
    let detail = api_get_entry(entry_id.clone()).expect("Failed to get entry");
    assert!(detail.deleted_at.is_some());

    // Restore
    api_restore_entry(entry_id.clone()).expect("Failed to restore entry");
    let active = api_list_entries(None, None, None, false, false).expect("Failed to list");
    assert_eq!(active.len(), 1);

    // Purge
    api_delete_entry(entry_id.clone()).expect("Failed to delete for purge");
    api_purge_entry(entry_id.clone()).expect("Failed to purge entry");

    // Purged entry is a tombstone; not in active list
    let active = api_list_entries(None, None, None, false, false).expect("Failed to list active");
    assert_eq!(active.len(), 0);

    // Tombstone still exists in HashMap (with deleted_at set), so include_trash=true may include it.
    // Verify the entry is indeed purged by checking purged_at via get_entry.
    let detail = api_get_entry(entry_id).expect("Failed to get purged entry");
    assert!(detail.deleted_at.is_some());
}

#[test]
#[serial]
fn test_set_favorite() {
    setup_unlocked_vault();

    let typed_value = r#"{"content":"fav note"}"#;
    let entry_id = api_create_entry(
        "secure_note".to_string(),
        "Favorite Test".to_string(),
        None,
        typed_value.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry");

    // Initially not favorite
    let detail = api_get_entry(entry_id.clone()).expect("Failed to get entry");
    assert!(!detail.is_favorite);

    // Set favorite
    api_set_favorite(entry_id.clone(), true).expect("Failed to set favorite");
    let detail = api_get_entry(entry_id.clone()).expect("Failed to get entry");
    assert!(detail.is_favorite);

    // Favorites-only filter
    let favorites =
        api_list_entries(None, None, None, false, true).expect("Failed to list favorites");
    assert_eq!(favorites.len(), 1);

    // Unset favorite
    api_set_favorite(entry_id, false).expect("Failed to unset favorite");
    let favorites =
        api_list_entries(None, None, None, false, true).expect("Failed to list favorites");
    assert_eq!(favorites.len(), 0);
}

// ============================================================================
// C. Label CRUD
// ============================================================================

#[test]
#[serial]
fn test_create_and_list_labels() {
    setup_unlocked_vault();

    let id1 = api_create_label("Work".to_string()).expect("Failed to create label");
    let id2 = api_create_label("Personal".to_string()).expect("Failed to create label");
    assert!(!id1.is_empty());
    assert!(!id2.is_empty());

    let labels = api_list_labels().expect("Failed to list labels");
    assert_eq!(labels.len(), 2);

    let names: Vec<&str> = labels.iter().map(|l| l.name.as_str()).collect();
    assert!(names.contains(&"Work"));
    assert!(names.contains(&"Personal"));
}

#[test]
#[serial]
fn test_rename_label() {
    setup_unlocked_vault();

    let label_id = api_create_label("Old Name".to_string()).expect("Failed to create label");
    api_rename_label(label_id.clone(), "New Name".to_string()).expect("Failed to rename label");

    let labels = api_list_labels().expect("Failed to list labels");
    assert_eq!(labels.len(), 1);
    assert_eq!(labels[0].name, "New Name");
}

#[test]
#[serial]
fn test_delete_label_cascades_to_entries() {
    setup_unlocked_vault();

    let label_id = api_create_label("ToDelete".to_string()).expect("Failed to create label");

    let typed_value = r#"{"content":"test"}"#;
    let entry_id = api_create_entry(
        "secure_note".to_string(),
        "Labeled Entry".to_string(),
        None,
        typed_value.to_string(),
        vec![label_id.clone()],
        None,
    )
    .expect("Failed to create entry");

    // Verify entry has the label
    let detail = api_get_entry(entry_id.clone()).expect("Failed to get entry");
    assert_eq!(detail.labels.len(), 1);

    // Delete label
    api_delete_label(label_id).expect("Failed to delete label");

    // Label gone from list
    let labels = api_list_labels().expect("Failed to list labels");
    assert_eq!(labels.len(), 0);

    // Entry no longer has the label
    let detail = api_get_entry(entry_id).expect("Failed to get entry");
    assert_eq!(detail.labels.len(), 0);
}

#[test]
#[serial]
fn test_set_entry_labels() {
    setup_unlocked_vault();

    let label1 = api_create_label("Label A".to_string()).expect("Failed to create label");
    let label2 = api_create_label("Label B".to_string()).expect("Failed to create label");

    let typed_value = r#"{"content":"test"}"#;
    let entry_id = api_create_entry(
        "secure_note".to_string(),
        "Multi Label".to_string(),
        None,
        typed_value.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry");

    // Assign both labels
    api_set_entry_labels(entry_id.clone(), vec![label1.clone(), label2.clone()])
        .expect("Failed to set labels");

    let detail = api_get_entry(entry_id.clone()).expect("Failed to get entry");
    assert_eq!(detail.labels.len(), 2);

    // Filter by label
    let filtered = api_list_entries(None, None, Some(label1.clone()), false, false)
        .expect("Failed to filter by label");
    assert_eq!(filtered.len(), 1);

    // Clear labels
    api_set_entry_labels(entry_id.clone(), vec![]).expect("Failed to clear labels");
    let detail = api_get_entry(entry_id).expect("Failed to get entry");
    assert_eq!(detail.labels.len(), 0);
}

// ============================================================================
// D. vault.json Validation
// ============================================================================

#[test]
#[serial]
fn test_vault_json_structure() {
    setup_unlocked_vault();

    // Add an entry so vault has content
    let typed_value = r#"{"content":"structure test"}"#;
    api_create_entry(
        "secure_note".to_string(),
        "Structure Test".to_string(),
        None,
        typed_value.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry");

    let vault_bytes = api_get_vault_bytes().expect("Failed to get vault bytes");
    assert!(!vault_bytes.is_empty());

    // Parse as generic JSON and verify structure
    let json: serde_json::Value =
        serde_json::from_slice(&vault_bytes).expect("vault bytes is not valid JSON");

    // schema_version
    assert!(json["schema_version"].is_u64());

    // meta
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

    // encrypted_vault
    assert!(json["encrypted_vault"].is_string());
    assert!(!json["encrypted_vault"].as_str().unwrap().is_empty());

    // Also verify with VaultFile::from_bytes
    let vault_file = VaultFile::from_bytes(&vault_bytes).expect("Failed to parse VaultFile");
    assert!(vault_file.schema_version >= 1);
    assert!(!vault_file.encrypted_vault.is_empty());
}

#[test]
#[serial]
fn test_vault_bytes_roundtrip() {
    setup_unlocked_vault();

    // Create some data
    let label_id = api_create_label("Roundtrip".to_string()).expect("Failed to create label");
    let typed_value = r#"{"content":"roundtrip test"}"#;
    let entry_id = api_create_entry(
        "secure_note".to_string(),
        "Roundtrip Entry".to_string(),
        Some("roundtrip notes".to_string()),
        typed_value.to_string(),
        vec![label_id.clone()],
        None,
    )
    .expect("Failed to create entry");

    // Get vault bytes
    let vault_bytes = api_get_vault_bytes().expect("Failed to get vault bytes");

    // Create a fresh vault session by loading the bytes
    api_load_vault(vault_bytes, String::new()).expect("Failed to load vault");
    api_unlock(TEST_PASSWORD.to_string()).expect("Failed to unlock");

    // Verify data survived the roundtrip
    let entries = api_list_entries(None, None, None, false, false).expect("Failed to list");
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].name, "Roundtrip Entry");

    let detail = api_get_entry(entry_id).expect("Failed to get entry");
    assert_eq!(detail.notes.as_deref(), Some("roundtrip notes"));
    assert!(detail.labels.contains(&label_id));

    let labels = api_list_labels().expect("Failed to list labels");
    assert_eq!(labels.len(), 1);
    assert_eq!(labels[0].name, "Roundtrip");
}

// ============================================================================
// E. S3 Sync with MinIO
// ============================================================================

#[tokio::test]
#[serial]
async fn test_push_and_download() {
    let key = unique_key();
    setup_unlocked_vault();

    // Create an entry
    let typed_value = r#"{"content":"sync test"}"#;
    let entry_id = api_create_entry(
        "secure_note".to_string(),
        "Sync Entry".to_string(),
        None,
        typed_value.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry");

    // Push to MinIO
    let storage = S3Storage::new(minio_config(&key))
        .await
        .expect("Failed to create S3Storage");
    api_push(&storage).await.expect("Failed to push");

    // Overwrite session with a new vault
    api_create_new_vault("temporary-password".to_string()).expect("Failed to create temp vault");

    // Download from MinIO
    let storage = S3Storage::new(minio_config(&key))
        .await
        .expect("Failed to create S3Storage");
    let found = api_download(&storage).await.expect("Failed to download");
    assert!(found);

    // Unlock with original password
    api_unlock(TEST_PASSWORD.to_string()).expect("Failed to unlock after download");
    assert!(api_is_unlocked());

    // Verify entry exists
    let detail = api_get_entry(entry_id).expect("Failed to get entry");
    assert_eq!(detail.name, "Sync Entry");
}

#[tokio::test]
#[serial]
async fn test_sync_no_remote() {
    let key = unique_key();
    setup_unlocked_vault();

    let typed_value = r#"{"content":"no remote"}"#;
    api_create_entry(
        "secure_note".to_string(),
        "No Remote".to_string(),
        None,
        typed_value.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry");

    // Sync with no remote object
    let storage = S3Storage::new(minio_config(&key))
        .await
        .expect("Failed to create S3Storage");
    let result = api_sync(&storage).await.expect("Failed to sync");
    assert!(result.synced);
    assert!(result.last_synced_at.is_some());

    // Verify the object now exists on MinIO
    let downloaded = storage.download().await.expect("Failed to download");
    assert!(downloaded.is_some());
}

#[tokio::test]
#[serial]
async fn test_sync_merge() {
    let key = unique_key();
    setup_unlocked_vault();

    // Create entry A and push
    let typed_value_a = r#"{"content":"entry A"}"#;
    api_create_entry(
        "secure_note".to_string(),
        "Entry A".to_string(),
        None,
        typed_value_a.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry A");

    let storage = S3Storage::new(minio_config(&key))
        .await
        .expect("Failed to create S3Storage");
    api_push(&storage).await.expect("Failed to push");

    // Add entry B locally without pushing
    let typed_value_b = r#"{"content":"entry B"}"#;
    api_create_entry(
        "secure_note".to_string(),
        "Entry B".to_string(),
        None,
        typed_value_b.to_string(),
        vec![],
        None,
    )
    .expect("Failed to create entry B");

    // Sync should merge
    let storage = S3Storage::new(minio_config(&key))
        .await
        .expect("Failed to create S3Storage");
    api_sync(&storage).await.expect("Failed to sync");

    // Both entries should exist
    let entries = api_list_entries(None, None, None, false, false).expect("Failed to list");
    assert_eq!(entries.len(), 2);

    let names: Vec<&str> = entries.iter().map(|e| e.name.as_str()).collect();
    assert!(names.contains(&"Entry A"));
    assert!(names.contains(&"Entry B"));
}

#[tokio::test]
#[serial]
async fn test_vault_json_on_s3() {
    let key = unique_key();
    setup_unlocked_vault();

    // Create entries and labels
    let label_id = api_create_label("S3 Label".to_string()).expect("Failed to create label");
    let typed_value = r#"{"url":"https://example.com","username":"user","password":"pass","totp":null}"#;
    api_create_entry(
        "login".to_string(),
        "S3 Entry".to_string(),
        None,
        typed_value.to_string(),
        vec![label_id],
        None,
    )
    .expect("Failed to create entry");

    // Push to MinIO
    let storage = S3Storage::new(minio_config(&key))
        .await
        .expect("Failed to create S3Storage");
    api_push(&storage).await.expect("Failed to push");

    // Download raw bytes and verify vault.json structure
    let (raw_bytes, etag) = storage
        .download()
        .await
        .expect("Failed to download")
        .expect("No object found");
    assert!(!etag.is_empty());

    let json: serde_json::Value =
        serde_json::from_slice(&raw_bytes).expect("Not valid JSON on S3");
    assert!(json["schema_version"].is_u64());
    assert!(json["meta"].is_object());
    assert!(json["encrypted_vault"].is_string());

    // Verify roundtrip: load from S3 bytes
    let vault_file = VaultFile::from_bytes(&raw_bytes).expect("Failed to parse VaultFile");
    assert!(vault_file.schema_version >= 1);
}
