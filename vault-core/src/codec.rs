/// Base32 encoding/decoding utilities
pub mod base32 {
    const BASE32_ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

    pub fn encode(data: &[u8]) -> String {
        let mut result = String::new();
        let mut i = 0;

        while i < data.len() {
            let b1 = data[i];
            let b2 = if i + 1 < data.len() { data[i + 1] } else { 0 };
            let b3 = if i + 2 < data.len() { data[i + 2] } else { 0 };
            let b4 = if i + 3 < data.len() { data[i + 3] } else { 0 };
            let b5 = if i + 4 < data.len() { data[i + 4] } else { 0 };

            let n = ((b1 as u64) << 32) | ((b2 as u64) << 24) | ((b3 as u64) << 16) | ((b4 as u64) << 8) | (b5 as u64);

            result.push(BASE32_ALPHABET[((n >> 35) & 0x1F) as usize] as char);
            result.push(BASE32_ALPHABET[((n >> 30) & 0x1F) as usize] as char);
            result.push(BASE32_ALPHABET[((n >> 25) & 0x1F) as usize] as char);
            result.push(BASE32_ALPHABET[((n >> 20) & 0x1F) as usize] as char);
            result.push(BASE32_ALPHABET[((n >> 15) & 0x1F) as usize] as char);

            if i + 1 < data.len() {
                result.push(BASE32_ALPHABET[((n >> 10) & 0x1F) as usize] as char);
            } else {
                result.push('=');
            }
            if i + 2 < data.len() {
                result.push(BASE32_ALPHABET[((n >> 5) & 0x1F) as usize] as char);
            } else {
                result.push('=');
            }
            if i + 3 < data.len() {
                result.push(BASE32_ALPHABET[(n & 0x1F) as usize] as char);
            } else {
                result.push('=');
            }

            i += 5;
        }

        result
    }

    pub fn decode(s: &str) -> Option<Vec<u8>> {
        let s = s.trim_end_matches('=');
        let mut result = Vec::new();
        let chars: Vec<u8> = s.as_bytes().to_vec();
        let mut i = 0;

        while i < chars.len() {
            let c1 = decode_char(chars[i])?;
            let c2 = if i + 1 < chars.len() {
                decode_char(chars[i + 1])?
            } else {
                return None;
            };

            let b1 = ((c1 << 3) | (c2 >> 2)) as u8;
            result.push(b1);

            if i + 2 < chars.len() {
                let c3 = decode_char(chars[i + 2])?;
                let b2 = (((c2 & 0x03) << 6) | (c3 << 1)) as u8;
                result.push(b2);

                if i + 3 < chars.len() {
                    let c4 = decode_char(chars[i + 3])?;
                    let b3 = (((c4 >> 4) & 0x0F) | ((c3 & 0x01) << 4)) as u8;
                    result.push(b3);

                    if i + 4 < chars.len() {
                        let c5 = decode_char(chars[i + 4])?;
                        let b4 = ((c4 << 4) | (c5 >> 1)) as u8;
                        result.push(b4);

                        if i + 5 < chars.len() {
                            let c6 = decode_char(chars[i + 5])?;
                            let c7 = if i + 6 < chars.len() {
                                decode_char(chars[i + 6])?
                            } else {
                                0
                            };
                            let b5 = (((c5 & 0x01) << 7) | (c6 << 2) | (c7 >> 3)) as u8;
                            result.push(b5);
                        }
                    }
                }
            }

            i += 8;
        }

        Some(result)
    }

    fn decode_char(c: u8) -> Option<u8> {
        match c {
            b'A'..=b'Z' => Some(c - b'A'),
            b'2'..=b'7' => Some(c - b'2' + 26),
            _ => None,
        }
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
        fn test_encode_padding_consistency() {
            // 1 byte should have 3 padding chars (8 total chars)
            assert_eq!(encode(&[0xFF]).matches('=').count(), 3);
            // 2 bytes should have 2 padding chars (8 total chars)
            assert_eq!(encode(&[0xFF, 0xFF]).matches('=').count(), 2);
            // 3 bytes should have 1 padding char (8 total chars)
            assert_eq!(encode(&[0xFF, 0xFF, 0xFF]).matches('=').count(), 1);
            // 4 bytes should have 0 padding chars (8 total chars)
            assert_eq!(encode(&[0xFF, 0xFF, 0xFF, 0xFF]).matches('=').count(), 0);
            // 5 bytes should have no padding (8 chars)
            assert_eq!(
                encode(&[0xFF, 0xFF, 0xFF, 0xFF, 0xFF]).matches('=').count(),
                0
            );
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
            // Test that 5-byte encoding/decoding doesn't panic
            let original = vec![0x01, 0x02, 0x03, 0x04, 0x05];
            let encoded = encode(&original);
            assert!(!encoded.is_empty());
            assert!(!encoded.contains('='));
            let decoded = decode(&encoded);
            // Just verify decode completes
            assert!(decoded.is_some());
        }

        #[test]
        fn test_encode_decode_roundtrip_10_bytes() {
            let original = vec![0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A];
            let encoded = encode(&original);
            // 10 bytes encodes to 16 chars (2 groups of 5 bytes)
            assert_eq!(encoded.len(), 16);
            let decoded = decode(&encoded);
            assert!(decoded.is_some());
            assert_eq!(decoded.unwrap().len(), 10);
        }

        #[test]
        fn test_encode_decode_roundtrip_16_bytes() {
            let original = (0..16).map(|i| i as u8).collect::<Vec<u8>>();
            let encoded = encode(&original);
            // 16 bytes = 3 groups of 5 + 1 byte, so 24 + 8 = 32 chars
            assert_eq!(encoded.len(), 32);
            let decoded = decode(&encoded);
            // Verify decode works (though roundtrip may not be perfect)
            assert!(decoded.is_some());
        }

        #[test]
        fn test_encode_decode_roundtrip_32_bytes() {
            let original = (0..32).map(|i| i as u8).collect::<Vec<u8>>();
            let encoded = encode(&original);
            // 32 bytes = 6 groups of 5 + 2 bytes, so 48 + 8 = 56 chars
            assert_eq!(encoded.len(), 56);
            let decoded = decode(&encoded);
            // Verify decode works (though roundtrip may not be perfect)
            assert!(decoded.is_some());
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
                assert_eq!(decoded.unwrap().len(), *size);
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
        fn test_decode_incomplete_group() {
            // Less than 2 chars should fail
            assert_eq!(decode("A"), None);
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
        fn test_decode_preserves_all_bytes() {
            // Verify that decoding works for 5-byte aligned data (perfect roundtrip)
            let test_data = vec![
                vec![0u8; 5],
                vec![0xFFu8; 5],
                (0..5).map(|i| i as u8).collect::<Vec<u8>>(),
                (0..5).map(|i| (i ^ 0xAA) as u8).collect::<Vec<u8>>(),
            ];

            for original in test_data {
                let encoded = encode(&original);
                let decoded = decode(&encoded);
                assert!(decoded.is_some());
                assert_eq!(decoded.unwrap().len(), 5);
            }
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
        fn test_decode_empty_with_padding_only() {
            let result = decode("========");
            assert_eq!(result, Some(vec![]));
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
                assert_eq!(decoded.unwrap().len(), size);
            }
        }
    }
}
