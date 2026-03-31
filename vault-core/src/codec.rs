/// Base32 encoding/decoding utilities using base32 crate
pub mod base32 {
    use ::base32::Alphabet;

    pub fn encode(data: &[u8]) -> String {
        ::base32::encode(Alphabet::Rfc4648 { padding: true }, data)
    }

    pub fn decode(s: &str) -> Option<Vec<u8>> {
        ::base32::decode(Alphabet::Rfc4648 { padding: true }, s)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn test_roundtrip() {
            let original: Vec<u8> = (0..32).collect();
            let decoded = decode(&encode(&original)).unwrap();
            assert_eq!(decoded, original);
        }

        #[test]
        fn test_decode_invalid() {
            assert_eq!(decode("!!!!"), None);
        }
    }
}
