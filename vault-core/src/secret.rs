use std::fmt;
use zeroize::Zeroizing;

pub struct SecretString(Zeroizing<String>);

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

impl SecretBytes {
    pub fn from_vec(value: Vec<u8>) -> Self {
        Self(Zeroizing::new(value))
    }

    #[allow(dead_code)]
    pub(crate) fn as_slice(&self) -> &[u8] {
        self.0.as_slice()
    }

    #[allow(dead_code)]
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

/// 値を JSON にシリアライズして `Zeroizing` バッファに書く。
///
/// 空の `Vec` に書くと、伸長のたびに再確保され、平文の断片がゼロ化されないまま
/// 解放済みメモリに残る。先に必要なバイト数を数えてから確保し、再確保を起こさない
pub(crate) fn to_json_zeroizing<T: serde::Serialize + ?Sized>(
    value: &T,
) -> serde_json::Result<Zeroizing<Vec<u8>>> {
    struct ByteCounter(usize);

    impl std::io::Write for ByteCounter {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0 += buf.len();
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    let mut counter = ByteCounter(0);
    serde_json::to_writer(&mut counter, value)?;
    let mut buf = Zeroizing::new(Vec::with_capacity(counter.0));
    serde_json::to_writer(&mut *buf, value)?;
    Ok(buf)
}

/// [`to_json_zeroizing`] の結果を `SecretString` として返す
pub(crate) fn to_json_secret_string<T: serde::Serialize + ?Sized>(
    value: &T,
) -> serde_json::Result<SecretString> {
    let mut buf = to_json_zeroizing(value)?;
    // serde_json の出力は常に UTF-8
    let json = String::from_utf8(std::mem::take(&mut *buf))
        .expect("serde_json always produces valid UTF-8");
    Ok(SecretString::from_string(json))
}

/// `serde_json::Value` 内の全文字列（オブジェクトのキーを含む）をゼロ埋めする
fn wipe_json_value(value: &mut serde_json::Value) {
    use zeroize::Zeroize;
    match value {
        serde_json::Value::String(s) => s.zeroize(),
        serde_json::Value::Array(items) => items.iter_mut().for_each(wipe_json_value),
        serde_json::Value::Object(map) => {
            for (mut key, mut item) in std::mem::take(map) {
                key.zeroize();
                wipe_json_value(&mut item);
            }
        }
        _ => {}
    }
}

/// drop 時に中身の文字列をゼロ埋めする任意の JSON 値
struct WipedJson(serde_json::Value);

impl Drop for WipedJson {
    fn drop(&mut self) {
        wipe_json_value(&mut self.0);
    }
}

impl Clone for WipedJson {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

// ============================================================================
// index（非秘匿値）用の型
// ============================================================================

/// index に置く非秘匿の文字列（エントリ名・username・URL 等）。
///
/// 検索・一覧表示のためアンロック中はメモリに常駐するが、個人情報ではあるため
/// drop 時（ロック時）にゼロ化する。秘匿値（`SecretString`）と取り違えないよう
/// 別の型にしている（`docs/vault-format-v2.md` 6章）。
#[derive(Clone, Default, PartialEq, Eq)]
pub struct PublicString(Zeroizing<String>);

impl PublicString {
    pub fn new(value: impl Into<String>) -> Self {
        Self(Zeroizing::new(value.into()))
    }

    pub fn as_str(&self) -> &str {
        self.0.as_str()
    }
}

impl std::ops::Deref for PublicString {
    type Target = str;
    fn deref(&self) -> &str {
        self.as_str()
    }
}

impl From<String> for PublicString {
    fn from(value: String) -> Self {
        Self::new(value)
    }
}

impl From<&str> for PublicString {
    fn from(value: &str) -> Self {
        Self::new(value)
    }
}

impl PartialEq<str> for PublicString {
    fn eq(&self, other: &str) -> bool {
        self.as_str() == other
    }
}

impl PartialEq<&str> for PublicString {
    fn eq(&self, other: &&str) -> bool {
        self.as_str() == *other
    }
}

impl fmt::Debug for PublicString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "PublicString({:?})", self.as_str())
    }
}

impl serde::Serialize for PublicString {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(self.as_str())
    }
}

impl<'de> serde::Deserialize<'de> for PublicString {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(Self::new(String::deserialize(d)?))
    }
}

/// index に置く非秘匿の JSON 値（`public_fields` の値）。
///
/// 既知のエントリタイプでは文字列（または null）だが、未知のエントリタイプでは
/// 書き込んだクライアントが任意の JSON 値を置きうるため `serde_json::Value` で保持する。
/// drop 時に中身の文字列をゼロ化する。
#[derive(Clone)]
pub struct PublicJson(WipedJson);

impl PublicJson {
    pub fn from_value(value: serde_json::Value) -> Self {
        Self(WipedJson(value))
    }

    pub fn value(&self) -> &serde_json::Value {
        &self.0 .0
    }

    /// 値が文字列ならその中身を返す
    pub fn as_str(&self) -> Option<&str> {
        self.value().as_str()
    }
}

impl fmt::Debug for PublicJson {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "PublicJson({})", self.value())
    }
}

impl serde::Serialize for PublicJson {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        self.value().serialize(s)
    }
}

impl<'de> serde::Deserialize<'de> for PublicJson {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(Self::from_value(serde_json::Value::deserialize(d)?))
    }
}

// ============================================================================
// secret（秘匿値）用の型
// ============================================================================

/// secret ブロックに置く秘匿の JSON 値（`EntrySecret.fields` の値）。
///
/// 未知のエントリタイプの typed_value は任意の JSON 値を含みうるため
/// `serde_json::Value` で保持する。drop 時に中身の文字列をゼロ化する。
#[derive(Clone)]
pub struct SecretJson(WipedJson);

impl SecretJson {
    pub fn from_value(value: serde_json::Value) -> Self {
        Self(WipedJson(value))
    }

    pub fn value(&self) -> &serde_json::Value {
        &self.0 .0
    }
}

impl fmt::Debug for SecretJson {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SecretJson([REDACTED])")
    }
}

impl serde::Serialize for SecretJson {
    fn serialize<S: serde::Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        self.value().serialize(s)
    }
}

impl<'de> serde::Deserialize<'de> for SecretJson {
    fn deserialize<D: serde::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        Ok(Self::from_value(serde_json::Value::deserialize(d)?))
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_to_json_zeroizing_allocates_exact_capacity() {
        let value = serde_json::json!({ "password": "p".repeat(1000), "notes": "改行\nを含む" });
        let buf = to_json_zeroizing(&value).unwrap();
        assert_eq!(buf.capacity(), buf.len());
        assert_eq!(*buf, serde_json::to_vec(&value).unwrap());
    }
}
