use std::fmt;
use zeroize::Zeroizing;

pub struct SecretString(Zeroizing<String>);
#[allow(dead_code)]
pub struct SecretBytes(Zeroizing<Vec<u8>>);

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

#[allow(dead_code)]
impl SecretBytes {
    pub fn from_vec(value: Vec<u8>) -> Self {
        Self(Zeroizing::new(value))
    }

    pub(crate) fn as_slice(&self) -> &[u8] {
        self.0.as_slice()
    }

    pub(crate) fn to_vec(&self) -> Vec<u8> {
        self.0.to_vec()
    }

    #[cfg(test)]
    pub(crate) fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}

impl fmt::Debug for SecretBytes {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SecretBytes([REDACTED])")
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
