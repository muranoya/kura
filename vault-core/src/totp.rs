use crate::codec::base32;
use crate::error::{VaultError, Result};

/// TOTP コードを生成する
///
/// # Arguments
/// - `secret`: Base32 エンコードされた TOTP シークレット（スペース・大文字小文字不問）
/// - `digits`: コードの桁数（通常 6）
/// - `period`: タイムステップ秒数（通常 30）
///
/// # Returns
/// ゼロ埋め済みの TOTP コード文字列（例: "012345"）
///
/// # Errors
/// Base32 デコード失敗またはTOTP生成エラーの場合は `VaultError::InvalidInput` を返す
pub fn generate_totp(secret: &str, digits: u32, period: u64) -> Result<String> {
    // スペースを除去して大文字に統一
    let secret_normalized = secret.replace(" ", "").to_uppercase();

    // Base32 デコード
    let secret_bytes = base32::decode(&secret_normalized)
        .ok_or(VaultError::InvalidBase32)?;

    if secret_bytes.is_empty() {
        return Err(VaultError::InvalidBase32);
    }

    // TOTP コードを生成
    let totp = totp_rs::TOTP::new(
        totp_rs::Algorithm::SHA1,
        digits as usize,
        0,       // skew
        period,  // step
        secret_bytes,
    )
    .map_err(|e| VaultError::InvalidInput(format!("TOTP generation failed: {}", e)))?;

    // 現在時刻のコードを取得してゼロ埋め
    let code = totp
        .generate_current()
        .map_err(|e| VaultError::InvalidInput(format!("TOTP code generation failed: {}", e)))?;

    // ゼロ埋め
    Ok(format!("{:0width$}", code.parse::<u32>().unwrap_or(0), width = digits as usize))
}

/// デフォルト設定（digits=6, period=30）で TOTP コードを生成する
///
/// # Arguments
/// - `secret`: Base32 エンコードされた TOTP シークレット
///
/// # Returns
/// ゼロ埋め済みの TOTP コード文字列（例: "012345"）
pub fn generate_totp_default(secret: &str) -> Result<String> {
    generate_totp(secret, 6, 30)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::codec::base32;

    #[test]
    fn test_generate_totp_default_with_test_secret() {
        // 20 バイト（160 ビット）のテストシークレットを Base32 エンコード
        let test_bytes = b"0123456789ABCDEF0123";  // 20 バイト
        let secret = base32::encode(test_bytes);

        let result = generate_totp_default(&secret);
        match result {
            Ok(code) => {
                assert_eq!(code.len(), 6);
                assert!(code.chars().all(|c| c.is_ascii_digit()));
            }
            Err(e) => panic!("generate_totp_default failed: {}", e),
        }
    }

    #[test]
    fn test_generate_totp_with_spaces() {
        // スペース区切りの秘密鍵もサポート
        let test_bytes = b"0123456789ABCDEF0123";  // 20 バイト
        let secret_base = base32::encode(test_bytes);
        let secret = format!("{} {}", &secret_base[..8], &secret_base[8..]);

        let result = generate_totp_default(&secret);
        match result {
            Ok(code) => {
                assert_eq!(code.len(), 6);
                assert!(code.chars().all(|c| c.is_ascii_digit()));
            }
            Err(e) => panic!("generate_totp_with_spaces failed: {}", e),
        }
    }

    #[test]
    fn test_generate_totp_with_lowercase() {
        // 小文字の秘密鍵もサポート
        let test_bytes = b"0123456789ABCDEF0123";  // 20 バイト
        let secret = base32::encode(test_bytes).to_lowercase();

        let result = generate_totp_default(&secret);
        match result {
            Ok(code) => {
                assert_eq!(code.len(), 6);
                assert!(code.chars().all(|c| c.is_ascii_digit()));
            }
            Err(e) => panic!("generate_totp_with_lowercase failed: {}", e),
        }
    }

    #[test]
    fn test_invalid_base32_secret() {
        let invalid_secret = "!!!invalid!!!";
        let result = generate_totp_default(invalid_secret);
        assert!(result.is_err());
    }

    #[test]
    fn test_empty_secret() {
        let result = generate_totp_default("");
        assert!(result.is_err());
    }

    #[test]
    fn test_custom_digits() {
        let test_bytes = b"0123456789ABCDEF0123";  // 20 バイト
        let secret = base32::encode(test_bytes);

        let result = generate_totp(&secret, 8, 30);
        match result {
            Ok(code) => {
                assert_eq!(code.len(), 8);
                assert!(code.chars().all(|c| c.is_ascii_digit()));
            }
            Err(e) => panic!("test_custom_digits failed: {}", e),
        }
    }
}
