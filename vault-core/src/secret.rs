use std::fmt;
use zeroize::Zeroizing;

pub struct SecretString(Zeroizing<String>);

impl SecretString {
    pub fn from_string(value: String) -> Self {
        Self(Zeroizing::new(value))
    }

    pub(crate) fn as_str(&self) -> &str {
        self.0.as_str()
    }

    pub(crate) fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SecretString([REDACTED])")
    }
}

macro_rules! secret_string_newtype {
    ($name:ident) => {
        #[allow(dead_code)]
        pub struct $name(SecretString);

        #[allow(dead_code)]
        impl $name {
            pub fn from_string(value: String) -> Self {
                Self(SecretString::from_string(value))
            }

            pub(crate) fn as_str(&self) -> &str {
                self.0.as_str()
            }

            pub(crate) fn as_bytes(&self) -> &[u8] {
                self.0.as_bytes()
            }
        }

        impl fmt::Debug for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(concat!(stringify!($name), "([REDACTED])"))
            }
        }
    };
}

secret_string_newtype!(MasterPassword);
secret_string_newtype!(RecoveryKeyInput);
secret_string_newtype!(TransferPassword);
secret_string_newtype!(PlaintextConfig);
secret_string_newtype!(TotpSecretInput);
