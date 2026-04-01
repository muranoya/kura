use crate::error::Result;

/// Password generation options
#[derive(Debug, Clone)]
pub struct PasswordOptions {
    pub length: usize,
    pub include_uppercase: bool,
    pub include_lowercase: bool,
    pub include_numbers: bool,
    pub include_symbols: bool,
}

impl Default for PasswordOptions {
    fn default() -> Self {
        PasswordOptions {
            length: 16,
            include_uppercase: true,
            include_lowercase: true,
            include_numbers: true,
            include_symbols: true,
        }
    }
}

pub fn generate_password(options: &PasswordOptions) -> Result<String> {
    const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
    const NUMBERS: &[u8] = b"0123456789";
    const SYMBOLS: &[u8] = b"!@#$%^&*()-_=+[]{}|;:,.<>?";

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

    if charset.is_empty() {
        return Err(crate::error::VaultError::InvalidConfiguration(
            "No characters available for password generation".to_string(),
        ));
    }

    use rand::Rng;
    let mut rng = rand::thread_rng();

    // Ensure at least one character from each enabled category
    let mut required: Vec<u8> = Vec::new();
    if options.include_uppercase {
        required.push(UPPERCASE[rng.gen_range(0..UPPERCASE.len())]);
    }
    if options.include_lowercase {
        required.push(LOWERCASE[rng.gen_range(0..LOWERCASE.len())]);
    }
    if options.include_numbers {
        required.push(NUMBERS[rng.gen_range(0..NUMBERS.len())]);
    }
    if options.include_symbols {
        required.push(SYMBOLS[rng.gen_range(0..SYMBOLS.len())]);
    }

    if options.length < required.len() {
        return Err(crate::error::VaultError::InvalidConfiguration(
            format!(
                "Password length {} is too short to include all required character types (need at least {})",
                options.length,
                required.len()
            ),
        ));
    }

    let remaining = options.length - required.len();
    let mut password_bytes: Vec<u8> = required;
    for _ in 0..remaining {
        let idx = rng.gen_range(0..charset.len());
        password_bytes.push(charset[idx]);
    }

    // Shuffle to avoid required characters always being at the start
    for i in (1..password_bytes.len()).rev() {
        let j = rng.gen_range(0..=i);
        password_bytes.swap(i, j);
    }

    let password: String = password_bytes.into_iter().map(|b| b as char).collect();
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
        };

        let password = generate_password(&options).unwrap();
        assert_eq!(password.len(), 8);
        assert!(password.chars().all(|c| c.is_numeric()));
    }
}
