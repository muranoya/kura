use std::path::Path;
use vault_core::crypto::transfer::encrypt_transfer;
use vault_core::models::CustomField;
use vault_core::{EntryData, LockedVault};

/// Generate test vault fixture for manual testing of the browser extension.
///
/// Run with: cargo test -p vault-core --test generate_test_vault -- --ignored
///
/// Master password: kura-test
/// Output: extension/test-pages/fixtures/vault.json
#[test]
#[ignore]
fn generate_test_vault_fixture() {
    let master_password = "kura-test";

    // Create new vault and unlock
    let locked = LockedVault::create_new(master_password).expect("Failed to create vault");
    let mut unlocked = locked
        .unlock(master_password)
        .expect("Failed to unlock vault");

    // Entry 1: Test Login 1
    unlocked
        .create_entry(
            "Test Login 1".to_string(),
            "login".to_string(),
            EntryData::new_login(
                Some("http://localhost:3333".to_string()),
                "user1@example.com".to_string(),
                "password123".to_string(),
                None,
            ),
            vec![],
        )
        .expect("Failed to create Test Login 1");

    // Entry 2: Test Login 2
    unlocked
        .create_entry(
            "Test Login 2".to_string(),
            "login".to_string(),
            EntryData::new_login(
                Some("http://localhost:3333".to_string()),
                "user2@example.com".to_string(),
                "hunter42".to_string(),
                None,
            ),
            vec![],
        )
        .expect("Failed to create Test Login 2");

    // Entry 3: TOTP Login (with TOTP custom field)
    let mut totp_data = EntryData::new_login(
        Some("http://localhost:3333".to_string()),
        "totp-user@example.com".to_string(),
        "totp-password".to_string(),
        None,
    );
    totp_data.custom_fields = Some(vec![CustomField {
        id: "totp-field-1".to_string(),
        name: "TOTP".to_string(),
        field_type: "totp".to_string(),
        value: "JBSWY3DPEHPK3PXP".to_string(),
    }]);
    unlocked
        .create_entry(
            "TOTP Login".to_string(),
            "login".to_string(),
            totp_data,
            vec![],
        )
        .expect("Failed to create TOTP Login");

    // Entry 4: Test Credit Card
    unlocked
        .create_entry(
            "Test Credit Card".to_string(),
            "credit_card".to_string(),
            EntryData::new_credit_card(
                "Test User".to_string(),
                "4111111111111111".to_string(),
                "12/28".to_string(),
                "123".to_string(),
                "0000".to_string(),
                None,
            ),
            vec![],
        )
        .expect("Failed to create Test Credit Card");

    // Entry 5: Other Site Login (should NOT match localhost pages)
    unlocked
        .create_entry(
            "Other Site Login".to_string(),
            "login".to_string(),
            EntryData::new_login(
                Some("https://other-site.example.com".to_string()),
                "other@example.com".to_string(),
                "other-pass".to_string(),
                None,
            ),
            vec![],
        )
        .expect("Failed to create Other Site Login");

    // Lock and serialize
    let locked = unlocked.lock().expect("Failed to lock vault");
    let vault_bytes = locked.to_vault_bytes().expect("Failed to serialize vault");

    // Write to fixture file
    let output_path =
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../extension/test-pages/fixtures/vault.json");
    std::fs::create_dir_all(output_path.parent().unwrap())
        .expect("Failed to create fixtures directory");
    std::fs::write(&output_path, vault_bytes).expect("Failed to write vault.json fixture");

    println!("Generated test vault fixture at: {}", output_path.display());

    // Generate transfer config string for easy setup
    let config_json = r#"{"region":"ap-northeast-1","bucket":"kura-test","key":"vault.json","accessKeyId":"minioadmin","secretAccessKey":"minioadmin","endpoint":"http://localhost:9000"}"#;
    let transfer_string = encrypt_transfer(master_password, config_json.as_bytes())
        .expect("Failed to encrypt transfer config");

    let transfer_path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../extension/test-pages/fixtures/transfer-config.txt");
    std::fs::write(&transfer_path, &transfer_string).expect("Failed to write transfer config");

    println!("Generated transfer config at: {}", transfer_path.display());
}
