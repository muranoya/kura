use crate::error::Result;

/// Password generation options
#[derive(Debug, Clone)]
pub struct PasswordOptions {
    pub length: usize,
    pub include_lowercase: bool,
    pub include_uppercase: bool,
    pub include_numbers: bool,
    pub include_symbols1: bool,
    pub include_symbols2: bool,
    pub include_symbols3: bool,
}

impl Default for PasswordOptions {
    fn default() -> Self {
        PasswordOptions {
            length: 16,
            include_lowercase: true,
            include_uppercase: true,
            include_numbers: true,
            include_symbols1: true,
            include_symbols2: true,
            include_symbols3: true,
        }
    }
}

pub fn generate_password(options: &PasswordOptions) -> Result<String> {
    const LOWERCASE: &[u8] = b"abcdefghijklmnopqrstuvwxyz";
    const UPPERCASE: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const NUMBERS: &[u8] = b"0123456789";
    const SYMBOLS1: &[u8] = b"!@#$%^&*-_.";
    const SYMBOLS2: &[u8] = b"()[]{}+=~/";
    const SYMBOLS3: &[u8] = b"`<>'\"\\|;,:";

    let mut charset = Vec::new();
    if options.include_lowercase {
        charset.extend_from_slice(LOWERCASE);
    }
    if options.include_uppercase {
        charset.extend_from_slice(UPPERCASE);
    }
    if options.include_numbers {
        charset.extend_from_slice(NUMBERS);
    }
    if options.include_symbols1 {
        charset.extend_from_slice(SYMBOLS1);
    }
    if options.include_symbols2 {
        charset.extend_from_slice(SYMBOLS2);
    }
    if options.include_symbols3 {
        charset.extend_from_slice(SYMBOLS3);
    }

    if charset.is_empty() {
        return Ok(String::new());
    }

    use rand::Rng;
    let mut rng = rand::thread_rng();

    // Ensure at least one character from each enabled category
    let mut required: Vec<u8> = Vec::new();
    if options.include_lowercase {
        required.push(LOWERCASE[rng.gen_range(0..LOWERCASE.len())]);
    }
    if options.include_uppercase {
        required.push(UPPERCASE[rng.gen_range(0..UPPERCASE.len())]);
    }
    if options.include_numbers {
        required.push(NUMBERS[rng.gen_range(0..NUMBERS.len())]);
    }
    if options.include_symbols1 {
        required.push(SYMBOLS1[rng.gen_range(0..SYMBOLS1.len())]);
    }
    if options.include_symbols2 {
        required.push(SYMBOLS2[rng.gen_range(0..SYMBOLS2.len())]);
    }
    if options.include_symbols3 {
        required.push(SYMBOLS3[rng.gen_range(0..SYMBOLS3.len())]);
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
        options.length = 32;
        let password = generate_password(&options).unwrap();

        assert_eq!(password.len(), 32);
        assert!(password.chars().any(|c| c.is_uppercase()));
        assert!(password.chars().any(|c| c.is_lowercase()));
        assert!(password.chars().any(|c| c.is_numeric()));
    }

    #[test]
    fn test_lowercase_only() {
        let options = PasswordOptions {
            length: 8,
            include_lowercase: true,
            include_uppercase: false,
            include_numbers: false,
            include_symbols1: false,
            include_symbols2: false,
            include_symbols3: false,
        };

        let password = generate_password(&options).unwrap();
        assert_eq!(password.len(), 8);
        assert!(password.chars().all(|c| c.is_lowercase()));
    }

    #[test]
    fn test_numbers_only() {
        let options = PasswordOptions {
            length: 6,
            include_lowercase: false,
            include_uppercase: false,
            include_numbers: true,
            include_symbols1: false,
            include_symbols2: false,
            include_symbols3: false,
        };

        let password = generate_password(&options).unwrap();
        assert_eq!(password.len(), 6);
        assert!(password.chars().all(|c| c.is_numeric()));
    }

    #[test]
    fn test_all_options_disabled_returns_empty() {
        let options = PasswordOptions {
            length: 16,
            include_lowercase: false,
            include_uppercase: false,
            include_numbers: false,
            include_symbols1: false,
            include_symbols2: false,
            include_symbols3: false,
        };

        let password = generate_password(&options).unwrap();
        assert_eq!(password, "");
    }

    #[test]
    fn test_symbols_split() {
        let symbols1_chars = "!@#$%^&*-_.";

        let options = PasswordOptions {
            length: 20,
            include_lowercase: false,
            include_uppercase: false,
            include_numbers: false,
            include_symbols1: true,
            include_symbols2: false,
            include_symbols3: false,
        };

        let password = generate_password(&options).unwrap();
        assert_eq!(password.len(), 20);
        assert!(password.chars().all(|c| symbols1_chars.contains(c)));
    }
}
