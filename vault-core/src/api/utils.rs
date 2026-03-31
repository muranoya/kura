use crate::totp::{generate_totp, generate_totp_default};
use crate::password_gen::{PasswordOptions, generate_password};

/// パスワード生成
pub fn api_generate_password(
    length: i32,
    include_uppercase: bool,
    include_lowercase: bool,
    include_numbers: bool,
    include_symbols: bool,
) -> Result<String, String> {
    let length = length.try_into().map_err(|_| "Invalid length".to_string())?;

    let options = PasswordOptions {
        length,
        include_uppercase,
        include_lowercase,
        include_numbers,
        include_symbols,
    };

    generate_password(&options)
        .map_err(|e| format!("Failed to generate password: {}", e))
}

/// TOTP生成
pub fn api_generate_totp(secret: String, digits: u32, period: u32) -> Result<String, String> {
    generate_totp(&secret, digits, period as u64)
        .map_err(|e| format!("Failed to generate TOTP: {}", e))
}

/// TOTP生成（デフォルト）
pub fn api_generate_totp_default(secret: String) -> Result<String, String> {
    generate_totp_default(&secret)
        .map_err(|e| format!("Failed to generate TOTP: {}", e))
}
