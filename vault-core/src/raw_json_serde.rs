/// Custom serde module for handling Zeroizing<String> as raw JSON
/// This allows storing sensitive JSON data that gets automatically zeroized on drop
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use zeroize::Zeroizing;

/// Serialize Zeroizing<String> as raw JSON (embedded, not quoted)
pub fn serialize<S: Serializer>(val: &Zeroizing<String>, s: S) -> Result<S::Ok, S::Error> {
    let raw: &serde_json::value::RawValue =
        serde_json::from_str(val).map_err(serde::ser::Error::custom)?;
    raw.serialize(s)
}

/// Deserialize raw JSON into Zeroizing<String>
pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<Zeroizing<String>, D::Error> {
    let raw = Box::<serde_json::value::RawValue>::deserialize(d)?;
    Ok(Zeroizing::new(raw.get().to_string()))
}
