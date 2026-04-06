use crate::crypto;

/// S3設定を転送用に暗号化（VaultManager不要、freestanding）
/// Argon2パラメータを文字列内に埋め込むため、受信側でvaultセッション不要で復号可能
pub fn api_encrypt_transfer_config(password: String, config_json: String) -> Result<String, String> {
    crypto::transfer::encrypt_transfer(&password, config_json.as_bytes())
        .map_err(|e| format!("Failed to encrypt transfer config: {}", e))
}

/// 転送用暗号化文字列を復号（VaultManager不要、freestanding）
pub fn api_decrypt_transfer_config(
    password: String,
    transfer_string: String,
) -> Result<String, String> {
    let decrypted = crypto::transfer::decrypt_transfer(&password, &transfer_string)
        .map_err(|e| format!("Failed to decrypt transfer config: {}", e))?;

    String::from_utf8(decrypted)
        .map_err(|e| format!("Decrypted config is not valid UTF-8: {}", e))
}
