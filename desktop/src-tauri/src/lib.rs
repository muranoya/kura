mod commands;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|_app| {
            // Future setup for system tray, autolock timer, etc.
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Session
            commands::session::create_vault,
            commands::session::load_vault,
            commands::session::unlock,
            commands::session::unlock_with_recovery_key,
            commands::session::lock,
            commands::session::get_vault_bytes,
            commands::session::is_unlocked,
            // Entries
            commands::entries::list_entries,
            commands::entries::get_entry,
            commands::entries::create_entry,
            commands::entries::update_entry,
            commands::entries::delete_entry,
            commands::entries::restore_entry,
            commands::entries::purge_entry,
            commands::entries::set_favorite,
            // Labels
            commands::labels::list_labels,
            commands::labels::create_label,
            commands::labels::delete_label,
            commands::labels::set_entry_labels,
            // Security
            commands::security::change_master_password,
            commands::security::upgrade_argon2_params,
            commands::security::rotate_dek,
            commands::security::regenerate_recovery_key,
            // Utils
            commands::utils::generate_password,
            commands::utils::generate_totp,
            commands::utils::generate_totp_default,
            // Sync
            commands::sync::sync_vault,
            commands::sync::push_vault,
            commands::sync::download_vault,
            commands::sync::resolve_conflict,
            // Storage
            commands::storage::read_vault_file,
            commands::storage::write_vault_file,
            commands::storage::vault_file_exists,
            commands::storage::delete_vault_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
