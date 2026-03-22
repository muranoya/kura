use vault_core::api::*;

#[tauri::command]
pub fn generate_password(
    length: i32,
    include_uppercase: bool,
    include_lowercase: bool,
    include_numbers: bool,
    include_symbols: bool,
) -> Result<String, String> {
    api_generate_password(length, include_uppercase, include_lowercase, include_numbers, include_symbols)
}

#[tauri::command]
pub fn generate_totp(secret: String, digits: u32, period: u32) -> Result<String, String> {
    api_generate_totp(secret, digits, period)
}

#[tauri::command]
pub fn generate_totp_default(secret: String) -> Result<String, String> {
    api_generate_totp_default(secret)
}
