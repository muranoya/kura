use crate::password_gen::{generate_password, PasswordOptions};
use crate::totp::{
    generate_totp, generate_totp_default, generate_totp_from_value, parse_totp_period,
};

/// パスワード生成
pub fn api_generate_password(
    length: i32,
    include_lowercase: bool,
    include_uppercase: bool,
    include_numbers: bool,
    include_symbols1: bool,
    include_symbols2: bool,
    include_symbols3: bool,
) -> Result<String, String> {
    let length = length
        .try_into()
        .map_err(|_| "Invalid length".to_string())?;

    let options = PasswordOptions {
        length,
        include_lowercase,
        include_uppercase,
        include_numbers,
        include_symbols1,
        include_symbols2,
        include_symbols3,
    };

    generate_password(&options).map_err(|e| format!("Failed to generate password: {}", e))
}

/// TOTP生成
pub fn api_generate_totp(secret: String, digits: u32, period: u32) -> Result<String, String> {
    generate_totp(&secret, digits, period as u64)
        .map_err(|e| format!("Failed to generate TOTP: {}", e))
}

/// TOTP生成（デフォルト）
pub fn api_generate_totp_default(secret: String) -> Result<String, String> {
    generate_totp_default(&secret).map_err(|e| format!("Failed to generate TOTP: {}", e))
}

/// TOTP生成（otpauth URI または生シークレットから）
pub fn api_generate_totp_from_value(value: String) -> Result<String, String> {
    generate_totp_from_value(&value).map_err(|e| format!("Failed to generate TOTP: {}", e))
}

/// TOTP周期の取得（otpauth URI から抽出、デフォルト30秒）
pub fn api_parse_totp_period(value: String) -> u64 {
    parse_totp_period(&value)
}
