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
        fn test_encode_empty() {
            let result = encode(&[]);
            assert_eq!(result, "");
        }

        #[test]
        fn test_encode_single_byte() {
            let result = encode(&[0xAB]);
            assert!(!result.is_empty());
            assert!(result.len() >= 2);
            assert!(result.contains('='));
        }

        #[test]
        fn test_encode_two_bytes() {
            let result = encode(&[0xAB, 0xCD]);
            assert!(!result.is_empty());
            assert!(result.len() >= 3); // At least 3 chars before padding
        }

        #[test]
        fn test_encode_five_bytes() {
            // Five bytes = 40 bits = 8 base32 chars
            let data = [0x01, 0x02, 0x03, 0x04, 0x05];
            let result = encode(&data);
            assert_eq!(result.len(), 8);
            assert!(!result.contains('='));
        }

        #[test]
        fn test_encode_ten_bytes() {
            let data = vec![0u8; 10];
            let result = encode(&data);
            assert_eq!(result.len(), 16);
            assert!(!result.contains('='));
        }

        #[test]
        fn test_encode_has_padding() {
            // Verify that padding is used when needed
            let one_byte = encode(&[0xFF]);
            assert!(one_byte.contains('='), "1 byte should have padding");

            let five_bytes = encode(&[0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);
            assert!(!five_bytes.contains('='), "5 bytes should not have padding");
        }

        #[test]
        fn test_decode_empty() {
            let result = decode("");
            assert_eq!(result, Some(vec![]));
        }

        #[test]
        fn test_decode_single_byte() {
            let data = vec![0xAB];
            let encoded = encode(&data);
            // Just verify encoding succeeds and decode handles it
            let decoded = decode(&encoded);
            assert!(decoded.is_some());
            assert!(!encoded.is_empty());
        }

        #[test]
        fn test_decode_two_bytes() {
            let data = vec![0xAB, 0xCD];
            let encoded = encode(&data);
            // Verify encoding works
            assert!(!encoded.is_empty());
            let decoded = decode(&encoded);
            assert!(decoded.is_some());
        }

        #[test]
        fn test_encode_decode_roundtrip_5_bytes() {
            // Test that 5-byte encoding/decoding roundtrips correctly
            let original = vec![0x01, 0x02, 0x03, 0x04, 0x05];
            let encoded = encode(&original);
            assert!(!encoded.is_empty());
            assert!(!encoded.contains('='));
            let decoded = decode(&encoded).expect("Decoding failed");
            assert_eq!(decoded, original, "5-byte roundtrip should be perfect");
        }

        #[test]
        fn test_encode_decode_roundtrip_10_bytes() {
            let original = vec![0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A];
            let encoded = encode(&original);
            // 10 bytes encodes to 16 chars (2 groups of 5 bytes)
            assert_eq!(encoded.len(), 16);
            let decoded = decode(&encoded).expect("Decoding failed");
            assert_eq!(decoded.len(), 10);
            assert_eq!(decoded, original, "10-byte roundtrip should be perfect");
        }

        #[test]
        fn test_encode_decode_roundtrip_16_bytes() {
            // Test that 16-byte salt/RecoveryKey roundtrips correctly
            let original = (0..16).map(|i| i as u8).collect::<Vec<u8>>();
            let encoded = encode(&original);
            // 16 bytes = 3 groups of 5 + 1 byte, so 32 chars
            assert_eq!(encoded.len(), 32);
            let decoded = decode(&encoded).expect("Decoding failed");
            // 16 bytes should roundtrip perfectly (3 groups of 5 bytes + 1 byte)
            assert_eq!(decoded.len(), 16, "Decoded length should be 16");
            assert_eq!(decoded, original, "Roundtrip should be perfect for 16 bytes");
        }

        #[test]
        fn test_encode_decode_roundtrip_32_bytes() {
            let original = (0..32).map(|i| i as u8).collect::<Vec<u8>>();
            let encoded = encode(&original);
            // 32 bytes = 6 groups of 5 + 2 bytes
            let decoded = decode(&encoded).expect("Decoding failed");
            assert_eq!(decoded.len(), 32);
            assert_eq!(decoded, original, "32-byte roundtrip should be perfect");
        }

        #[test]
        fn test_encode_decode_roundtrip_arbitrary_sizes() {
            // Test that encoding/decoding works for perfect multiples of 5 bytes
            for size in [0, 5, 10, 15, 20, 25].iter() {
                let original: Vec<u8> = (0..*size).map(|i| (i ^ 0xAB) as u8).collect();
                let encoded = encode(&original);
                let decoded = decode(&encoded);
                assert!(decoded.is_some(), "Failed to decode size: {}", size);
                // For multiples of 5, the roundtrip should preserve length
                let decoded_data = decoded.unwrap();
                assert_eq!(decoded_data.len(), *size);
                assert_eq!(decoded_data, original, "Roundtrip failed for size {}", size);
            }
        }

        #[test]
        fn test_decode_with_padding() {
            let original = vec![0xFF];
            let encoded = encode(&original);
            assert!(encoded.contains('='));
            let decoded = decode(&encoded);
            assert!(decoded.is_some());
        }

        #[test]
        fn test_decode_without_padding() {
            let data = vec![0x01, 0x02, 0x03, 0x04, 0x05];
            let encoded = encode(&data);
            assert!(!encoded.contains('='));
            let decoded = decode(&encoded);
            assert!(decoded.is_some());
            assert_eq!(decoded.unwrap().len(), 5);
        }

        #[test]
        fn test_decode_invalid_character() {
            assert_eq!(decode("!!!!"), None);
        }

        #[test]
        fn test_decode_invalid_character_lowercase() {
            // Lowercase letters should fail (must be uppercase)
            assert_eq!(decode("abcd"), None);
        }

        #[test]
        fn test_decode_invalid_character_invalid_digit() {
            // 0, 1, 8, 9 are invalid in base32
            assert_eq!(decode("0000"), None);
            assert_eq!(decode("1111"), None);
            assert_eq!(decode("8888"), None);
            assert_eq!(decode("9999"), None);
        }

        #[test]
        fn test_encode_all_zero_bytes() {
            let data = vec![0u8; 16];
            let encoded = encode(&data);
            assert!(!encoded.is_empty());
            // Zero bytes should encode to all 'A's (base32 0)
            assert!(encoded.chars().all(|c| c == 'A' || c == '='));
        }

        #[test]
        fn test_encode_all_max_bytes() {
            let data = vec![0xFFu8; 10];
            let encoded = encode(&data);
            assert_eq!(encoded.len(), 16);
            let decoded = decode(&encoded);
            assert!(decoded.is_some());
            assert_eq!(decoded.unwrap().len(), 10);
        }

        #[test]
        fn test_encode_alternating_pattern() {
            let data = vec![0xAA, 0x55, 0xAA, 0x55, 0xAA];
            let encoded = encode(&data);
            assert!(!encoded.is_empty());
            let decoded = decode(&encoded);
            assert!(decoded.is_some());
            assert_eq!(decoded.unwrap().len(), 5);
        }

        #[test]
        fn test_encode_output_uses_only_valid_alphabet() {
            let data = vec![rand::random::<u8>(); 32];
            let encoded = encode(&data);
            for c in encoded.chars() {
                assert!(
                    (c >= 'A' && c <= 'Z') || (c >= '2' && c <= '7') || c == '=',
                    "Invalid character in output: {}",
                    c
                );
            }
        }

        #[test]
        fn test_various_multiples_of_five() {
            // Test multiples of 5 bytes (no padding needed)
            for multiple in 1..=5 {
                let size = multiple * 5;
                let data: Vec<u8> = (0..size).map(|i| i as u8).collect();
                let encoded = encode(&data);
                assert!(!encoded.contains('='), "Size {} should not have padding", size);
                let decoded = decode(&encoded);
                assert!(decoded.is_some());
                let decoded_data = decoded.unwrap();
                assert_eq!(decoded_data.len(), size);
                assert_eq!(decoded_data, data, "Roundtrip failed for size {}", size);
            }
        }
    }
}
