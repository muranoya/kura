use std::fmt;
use zeroize::Zeroizing;

pub struct SecretString(Zeroizing<String>);
#[allow(dead_code)]
pub struct SecretBytes(Zeroizing<Vec<u8>>);

impl SecretString {
    pub fn from_string(value: String) -> Self {
        Self(Zeroizing::new(value))
    }

    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }

    pub(crate) fn as_bytes(&self) -> &[u8] {
        self.0.as_bytes()
    }
}

// VaultContents が Clone を必要とする（sync 処理）ため、SecretString も Clone を実装する。
// 複製された値は Zeroizing でラップされるため drop 時にゼロ化される。
impl Clone for SecretString {
    fn clone(&self) -> Self {
        Self(Zeroizing::new(self.0.as_str().to_string()))
    }
}

impl serde::Serialize for SecretString {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.0.as_str())
    }
}

impl<'de> serde::Deserialize<'de> for SecretString {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let s = String::deserialize(d)?;
        Ok(Self::from_string(s))
    }
}

impl fmt::Debug for SecretString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SecretString([REDACTED])")
    }
}

/// typed_value 用の Secret 型。内部は raw JSON 文字列を保持し、drop 時にゼロ化される。
/// Serialize/Deserialize は raw JSON として埋め込む（文字列として引用符でくくらない）。
pub struct EntrySecretJson(SecretString);

impl EntrySecretJson {
    pub fn from_string(s: String) -> Self {
        Self(SecretString::from_string(s))
    }

    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl Clone for EntrySecretJson {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

impl fmt::Debug for EntrySecretJson {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("EntrySecretJson([REDACTED])")
    }
}

impl serde::Serialize for EntrySecretJson {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        let raw: &serde_json::value::RawValue =
            serde_json::from_str(self.0.as_str()).map_err(serde::ser::Error::custom)?;
        raw.serialize(s)
    }
}

impl<'de> serde::Deserialize<'de> for EntrySecretJson {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        let raw = Box::<serde_json::value::RawValue>::deserialize(d)?;
        Ok(Self::from_string(raw.get().to_string()))
    }
}

impl AsRef<str> for EntrySecretJson {
    fn as_ref(&self) -> &str {
        self.as_str()
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
