mod commands;
pub mod storage;

use std::sync::Mutex;

use commands::session::S3ConfigSession;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(S3ConfigSession(Mutex::new(None)))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/locked.png"))
                .expect("Failed to load app icon");
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_icon(icon.clone());
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // S3 Config Session (in-process memory instead of WebView sessionStorage)
            commands::session::set_s3_config_session,
            commands::session::get_s3_config_session,
            commands::session::clear_s3_config_session,
            // Session
            commands::session::create_vault,
            commands::session::load_vault,
            commands::session::unlock,
            commands::session::unlock_with_recovery_key,
            commands::session::lock,
            commands::session::get_vault_bytes,
            commands::session::is_unlocked,
            commands::session::set_tray_icon,
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
            commands::labels::rename_label,
            commands::labels::set_entry_labels,
            // Security
            commands::security::change_master_password,
            commands::security::upgrade_argon2_params,
            commands::security::rotate_dek,
            commands::security::regenerate_recovery_key,
            commands::security::encrypt_config,
            commands::security::decrypt_config,
            commands::security::encrypt_transfer_config,
            commands::security::decrypt_transfer_config,
            // Utils
            commands::utils::generate_password,
            commands::utils::generate_totp,
            commands::utils::generate_totp_default,
            commands::utils::generate_totp_from_value,
            commands::utils::parse_totp_period,
            commands::utils::get_version,
            // Sync
            commands::sync::sync_vault,
            commands::sync::push_vault,
            commands::sync::download_vault,
            commands::sync::get_last_sync_time,
            // Storage
            commands::storage::read_vault_file,
            commands::storage::write_vault_file,
            commands::storage::vault_file_exists,
            commands::storage::delete_vault_file,
            // Import
            commands::import::import_1pux_preview,
            commands::import::import_1pux_execute,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
