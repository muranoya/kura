use crate::error::Result;

/// Password generation options
#[derive(Debug, Clone)]
pub struct PasswordOptions {
    pub length: usize,
    pub include_uppercase: bool,
    pub include_lowercase: bool,
    pub include_numbers: bool,
    pub include_symbols: bool,
    pub exclude_ambiguous: bool,
}

impl Default for PasswordOptions {
    fn default() -> Self {
        PasswordOptions {
            length: 16,
            include_uppercase: true,
            include_lowercase: true,
            include_numbers: true,
            include_symbols: true,
            exclude_ambiguous: false,
        }
    }
}

pub fn generate_password(options: &PasswordOptions) -> Result<String> {
    const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
    const NUMBERS: &[u8] = b"0123456789";
    const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{}|;:,.<>?";
    const AMBIGUOUS: &[u8] = b"il1Lo0O";

    let mut charset = Vec::new();

    if options.include_uppercase {
        charset.extend_from_slice(UPPERCASE);
    }
    if options.include_lowercase {
        charset.extend_from_slice(LOWERCASE);
    }
    if options.include_numbers {
        charset.extend_from_slice(NUMBERS);
    }
    if options.include_symbols {
        charset.extend_from_slice(SYMBOLS);
    }

    // Remove ambiguous characters if requested
    if options.exclude_ambiguous {
        charset.retain(|&c| !AMBIGUOUS.contains(&c));
    }

    if charset.is_empty() {
        return Err(crate::error::VaultError::InvalidConfiguration(
            "No characters available for password generation".to_string(),
        ));
    }

    let mut password = String::new();
    for _ in 0..options.length {
        let idx = (rand::random::<u32>() as usize) % charset.len();
        password.push(charset[idx] as char);
    }

    Ok(password)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_password_generation() {
        let mut options = PasswordOptions::default();
        options.length = 32; // Use longer password to ensure all character types are included
        let password = generate_password(&options).unwrap();

        assert_eq!(password.len(), 32);
        assert!(password.chars().any(|c| c.is_uppercase()));
        assert!(password.chars().any(|c| c.is_lowercase()));
        assert!(password.chars().any(|c| c.is_numeric()));
    }

    #[test]
    fn test_numbers_only() {
        let options = PasswordOptions {
            length: 8,
            include_uppercase: false,
            include_lowercase: false,
            include_numbers: true,
            include_symbols: false,
            exclude_ambiguous: false,
        };

        let password = generate_password(&options).unwrap();
        assert_eq!(password.len(), 8);
        assert!(password.chars().all(|c| c.is_numeric()));
    }
}
