use vault_core::api::{api_generate_password, api_generate_totp, api_generate_totp_default, api_generate_totp_from_value, api_parse_totp_period};

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

#[tauri::command]
pub fn generate_totp_from_value(value: String) -> Result<String, String> {
    api_generate_totp_from_value(value)
}

#[tauri::command]
pub fn parse_totp_period(value: String) -> u64 {
    api_parse_totp_period(value)
}
