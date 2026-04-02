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
    let now = chrono::Utc::now().timestamp() as u64;
    let code = totp.generate(now);

    // ゼロ埋め
    Ok(format!("{:0width$}", code.parse::<u32>().unwrap_or(0), width = digits as usize))
}

/// otpauth URI をパースしてシークレット・桁数・周期を抽出する
///
/// # Format
/// `otpauth://totp/Label?secret=BASE32&digits=6&period=30`
///
/// secret は必須、digits（デフォルト6）と period（デフォルト30）はオプション
pub fn parse_otpauth_uri(uri: &str) -> Result<(String, u32, u64)> {
    if !uri.starts_with("otpauth://totp/") && !uri.starts_with("otpauth://TOTP/") {
        return Err(VaultError::InvalidInput("Not a valid otpauth TOTP URI".into()));
    }

    let query = uri.split('?').nth(1)
        .ok_or(VaultError::InvalidInput("Missing query parameters in otpauth URI".into()))?;

    let mut secret = None;
    let mut digits = 6u32;
    let mut period = 30u64;

    for param in query.split('&') {
        let mut kv = param.splitn(2, '=');
        match (kv.next(), kv.next()) {
            (Some("secret"), Some(v)) => secret = Some(v.to_string()),
            (Some("digits"), Some(v)) => digits = v.parse().unwrap_or(6),
            (Some("period"), Some(v)) => period = v.parse().unwrap_or(30),
            _ => {}
        }
    }

    let secret = secret.ok_or(VaultError::InvalidInput("Missing secret parameter in otpauth URI".into()))?;
    Ok((secret, digits, period))
}

/// カスタムフィールドの値から TOTP コードを生成する
///
/// otpauth:// URI の場合はパースしてパラメータを抽出し、
/// それ以外は生の Base32 シークレットとしてデフォルト設定で生成する
pub fn generate_totp_from_value(value: &str) -> Result<String> {
    if value.starts_with("otpauth://") {
        let (secret, digits, period) = parse_otpauth_uri(value)?;
        generate_totp(&secret, digits, period)
    } else {
        generate_totp_default(value)
    }
}

/// カスタムフィールドの値から TOTP の周期（秒）を抽出する
///
/// otpauth:// URI の場合は period パラメータを返し、それ以外はデフォルトの 30 を返す
pub fn parse_totp_period(value: &str) -> u64 {
    if value.starts_with("otpauth://") {
        parse_otpauth_uri(value)
            .map(|(_, _, period)| period)
            .unwrap_or(30)
    } else {
        30
    }
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

    fn test_secret() -> String {
        base32::encode(b"0123456789ABCDEF0123")
    }

    #[test]
    fn test_parse_otpauth_uri_full() {
        let secret = test_secret();
        let uri = format!("otpauth://totp/Test:user@example.com?secret={}&digits=8&period=60&issuer=Test", secret);
        let (parsed_secret, digits, period) = parse_otpauth_uri(&uri).unwrap();
        assert_eq!(parsed_secret, secret);
        assert_eq!(digits, 8);
        assert_eq!(period, 60);
    }

    #[test]
    fn test_parse_otpauth_uri_defaults() {
        let secret = test_secret();
        let uri = format!("otpauth://totp/MyApp?secret={}", secret);
        let (parsed_secret, digits, period) = parse_otpauth_uri(&uri).unwrap();
        assert_eq!(parsed_secret, secret);
        assert_eq!(digits, 6);
        assert_eq!(period, 30);
    }

    #[test]
    fn test_parse_otpauth_uri_missing_secret() {
        let uri = "otpauth://totp/MyApp?digits=6&period=30";
        assert!(parse_otpauth_uri(uri).is_err());
    }

    #[test]
    fn test_parse_otpauth_uri_invalid_scheme() {
        let uri = "https://example.com?secret=ABC";
        assert!(parse_otpauth_uri(uri).is_err());
    }

    #[test]
    fn test_generate_totp_from_value_with_uri() {
        let secret = test_secret();
        let uri = format!("otpauth://totp/Test?secret={}&digits=6&period=30", secret);
        let result = generate_totp_from_value(&uri);
        assert!(result.is_ok());
        let code = result.unwrap();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_digit()));
    }

    #[test]
    fn test_generate_totp_from_value_with_raw_secret() {
        let secret = test_secret();
        let result = generate_totp_from_value(&secret);
        assert!(result.is_ok());
        let code = result.unwrap();
        assert_eq!(code.len(), 6);
        assert!(code.chars().all(|c| c.is_ascii_digit()));
    }

    #[test]
    fn test_parse_totp_period_from_uri() {
        let secret = test_secret();
        let uri = format!("otpauth://totp/Test?secret={}&period=60", secret);
        assert_eq!(parse_totp_period(&uri), 60);
    }

    #[test]
    fn test_parse_totp_period_default() {
        let secret = test_secret();
        assert_eq!(parse_totp_period(&secret), 30);
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
