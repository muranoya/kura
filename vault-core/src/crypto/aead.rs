//! schema_version 2 の暗号処理（`docs/vault-format-v2.md` 5章）。
//!
//! - DEK から HKDF-SHA256 で index 用・secret 用のサブ鍵を導出する（ドメイン分離）
//! - AEAD は XChaCha20-Poly1305。nonce は 24 バイトのランダム値
//! - AAD で暗号文を「どの vault の、どのエントリの、どの版か」に束縛する
//!
//! 形式: `base64(nonce[24] | ciphertext | tag[16])`

use crate::error::{Result, VaultError};
use chacha20poly1305::{
    aead::{Aead, KeyInit, Payload},
    XChaCha20Poly1305, XNonce,
};
use hkdf::Hkdf;
use sha2::Sha256;
use std::fmt;
use zeroize::{Zeroize, Zeroizing};

const NONCE_LEN: usize = 24;
const TAG_LEN: usize = 16;

const INFO_INDEX: &str = "kura/v2/index";
const INFO_SECRET: &str = "kura/v2/secret";

/// 32 バイトの用途別サブ鍵。drop 時にゼロ化される。
/// `Dek` と同様、鍵素材の複製を防ぐため Clone は実装しない。
struct SubKey([u8; 32]);

impl Drop for SubKey {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

/// DEK から導出した index 用・secret 用のサブ鍵の組
pub struct SubKeys {
    index_key: SubKey,
    secret_key: SubKey,
}

impl fmt::Debug for SubKeys {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("SubKeys([REDACTED])")
    }
}

impl SubKeys {
    /// DEK から HKDF-SHA256 でサブ鍵を導出する。
    /// DEK は一様ランダムなので salt は使わない。
    pub fn derive(dek: &super::Dek) -> Self {
        let hk = Hkdf::<Sha256>::new(None, dek.as_bytes());
        Self {
            index_key: expand(&hk, INFO_INDEX),
            secret_key: expand(&hk, INFO_SECRET),
        }
    }

    /// index ブロックを暗号化する
    pub fn seal_index(&self, vault_uuid: &str, plaintext: &[u8]) -> Result<String> {
        seal(&self.index_key, &index_aad(vault_uuid), plaintext)
    }

    /// index ブロックを復号する
    pub fn open_index(&self, vault_uuid: &str, sealed_b64: &str) -> Result<Zeroizing<Vec<u8>>> {
        open(&self.index_key, &index_aad(vault_uuid), sealed_b64)
    }

    /// エントリの secret ブロックを暗号化する
    pub fn seal_secret(
        &self,
        vault_uuid: &str,
        entry_id: &str,
        secret_rev: &str,
        plaintext: &[u8],
    ) -> Result<String> {
        seal(
            &self.secret_key,
            &secret_aad(vault_uuid, entry_id, secret_rev),
            plaintext,
        )
    }

    /// エントリの secret ブロックを復号する。
    /// `entry_id` は `secrets` マップの読み出し先キー、`secret_rev` は index にある現行の値を
    /// 渡すこと。いずれかが暗号化時と異なれば復号に失敗する（入れ替え・ロールバックの検出）。
    pub fn open_secret(
        &self,
        vault_uuid: &str,
        entry_id: &str,
        secret_rev: &str,
        sealed_b64: &str,
    ) -> Result<Zeroizing<Vec<u8>>> {
        open(
            &self.secret_key,
            &secret_aad(vault_uuid, entry_id, secret_rev),
            sealed_b64,
        )
    }
}

fn expand(hk: &Hkdf<Sha256>, info: &str) -> SubKey {
    // 一時バッファを経由せず SubKey に直接書き込み、鍵素材の複製をスタックに残さない
    let mut key = SubKey([0u8; 32]);
    // L = 32 は HKDF-SHA256 の上限（255 * 32）を大きく下回るため失敗しない
    hk.expand(info.as_bytes(), &mut key.0)
        .expect("32 bytes is a valid HKDF-SHA256 output length");
    key
}

/// `enc(x) = u32_be(len(x)) || utf8(x)`。長さプレフィックスで連結の曖昧さをなくす
fn push_field(aad: &mut Vec<u8>, value: &str) {
    aad.extend_from_slice(&(value.len() as u32).to_be_bytes());
    aad.extend_from_slice(value.as_bytes());
}

fn index_aad(vault_uuid: &str) -> Vec<u8> {
    let mut aad = Vec::new();
    push_field(&mut aad, INFO_INDEX);
    push_field(&mut aad, vault_uuid);
    aad
}

fn secret_aad(vault_uuid: &str, entry_id: &str, secret_rev: &str) -> Vec<u8> {
    let mut aad = Vec::new();
    push_field(&mut aad, INFO_SECRET);
    push_field(&mut aad, vault_uuid);
    push_field(&mut aad, entry_id);
    push_field(&mut aad, secret_rev);
    aad
}

fn seal(key: &SubKey, aad: &[u8], plaintext: &[u8]) -> Result<String> {
    use base64::Engine;

    let cipher = XChaCha20Poly1305::new_from_slice(&key.0)
        .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;
    let nonce_bytes: [u8; NONCE_LEN] = rand::random();
    let ciphertext = cipher
        .encrypt(
            XNonce::from_slice(&nonce_bytes),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| VaultError::EncryptionError("Encryption failed".to_string()))?;

    let mut sealed = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    sealed.extend_from_slice(&nonce_bytes);
    sealed.extend_from_slice(&ciphertext);
    Ok(base64::engine::general_purpose::STANDARD.encode(&sealed))
}

fn open(key: &SubKey, aad: &[u8], sealed_b64: &str) -> Result<Zeroizing<Vec<u8>>> {
    use base64::Engine;

    let sealed = base64::engine::general_purpose::STANDARD
        .decode(sealed_b64)
        .map_err(|_| VaultError::DecryptionError("Invalid base64 encoding".to_string()))?;
    if sealed.len() < NONCE_LEN + TAG_LEN {
        return Err(VaultError::DecryptionError(
            "Encrypted data too short".to_string(),
        ));
    }

    let cipher = XChaCha20Poly1305::new_from_slice(&key.0)
        .map_err(|_| VaultError::EncryptionError("Failed to create cipher".to_string()))?;
    let plaintext = cipher
        .decrypt(
            XNonce::from_slice(&sealed[..NONCE_LEN]),
            Payload {
                msg: &sealed[NONCE_LEN..],
                aad,
            },
        )
        .map_err(|_| VaultError::DecryptionError("Decryption failed".to_string()))?;
    Ok(Zeroizing::new(plaintext))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::Dek;

    const UUID: &str = "11111111-1111-4111-8111-111111111111";

    #[test]
    fn test_index_roundtrip() {
        let keys = SubKeys::derive(&Dek::generate());
        let sealed = keys.seal_index(UUID, b"{\"labels\":{}}").unwrap();
        let opened = keys.open_index(UUID, &sealed).unwrap();
        assert_eq!(opened.as_slice(), b"{\"labels\":{}}");
    }

    #[test]
    fn test_secret_roundtrip() {
        let keys = SubKeys::derive(&Dek::generate());
        let sealed = keys.seal_secret(UUID, "entry-a", "rev-1", b"{}").unwrap();
        let opened = keys.open_secret(UUID, "entry-a", "rev-1", &sealed).unwrap();
        assert_eq!(opened.as_slice(), b"{}");
    }

    #[test]
    fn test_format_is_nonce_ciphertext_tag() {
        use base64::Engine;
        let keys = SubKeys::derive(&Dek::generate());
        let sealed = keys.seal_index(UUID, b"abc").unwrap();
        let raw = base64::engine::general_purpose::STANDARD
            .decode(sealed)
            .unwrap();
        assert_eq!(raw.len(), NONCE_LEN + 3 + TAG_LEN);
    }

    #[test]
    fn test_nonce_is_random() {
        let keys = SubKeys::derive(&Dek::generate());
        let a = keys.seal_index(UUID, b"same").unwrap();
        let b = keys.seal_index(UUID, b"same").unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn test_derivation_is_deterministic() {
        let dek = Dek::from_bytes([7u8; 32]);
        let sealed = SubKeys::derive(&dek).seal_index(UUID, b"x").unwrap();
        let opened = SubKeys::derive(&dek).open_index(UUID, &sealed).unwrap();
        assert_eq!(opened.as_slice(), b"x");
    }

    #[test]
    fn test_index_and_secret_keys_are_separated() {
        // 同じ平文・同じ AAD 構造でも、index 鍵で暗号化したものは secret 鍵では開けない
        let keys = SubKeys::derive(&Dek::generate());
        let sealed = seal(&keys.index_key, b"aad", b"x").unwrap();
        assert!(open(&keys.secret_key, b"aad", &sealed).is_err());
        assert!(open(&keys.index_key, b"aad", &sealed).is_ok());
    }

    #[test]
    fn test_wrong_dek_fails() {
        let sealed = SubKeys::derive(&Dek::generate())
            .seal_index(UUID, b"x")
            .unwrap();
        assert!(SubKeys::derive(&Dek::generate())
            .open_index(UUID, &sealed)
            .is_err());
    }

    #[test]
    fn test_index_bound_to_vault_uuid() {
        let keys = SubKeys::derive(&Dek::generate());
        let sealed = keys.seal_index(UUID, b"x").unwrap();
        assert!(keys
            .open_index("22222222-2222-4222-8222-222222222222", &sealed)
            .is_err());
    }

    #[test]
    fn test_secret_swap_between_entries_detected() {
        let keys = SubKeys::derive(&Dek::generate());
        let sealed_a = keys.seal_secret(UUID, "entry-a", "rev", b"a").unwrap();
        // secrets["A"] を secrets["B"] に置いても、読み出し先キー B が AAD に入るので開けない
        assert!(keys.open_secret(UUID, "entry-b", "rev", &sealed_a).is_err());
    }

    #[test]
    fn test_secret_rollback_detected() {
        let keys = SubKeys::derive(&Dek::generate());
        let old = keys
            .seal_secret(UUID, "entry-a", "rev-old", b"old")
            .unwrap();
        assert!(keys.open_secret(UUID, "entry-a", "rev-new", &old).is_err());
    }

    #[test]
    fn test_aad_length_prefix_prevents_ambiguity() {
        // 長さプレフィックスがなければ ("ab", "c") と ("a", "bc") が同じ AAD になる
        assert_ne!(secret_aad(UUID, "ab", "c"), secret_aad(UUID, "a", "bc"));
    }

    #[test]
    fn test_tampered_ciphertext_fails() {
        use base64::Engine;
        let engine = base64::engine::general_purpose::STANDARD;
        let keys = SubKeys::derive(&Dek::generate());
        let sealed = keys.seal_index(UUID, b"hello").unwrap();
        let mut raw = engine.decode(sealed).unwrap();
        raw[NONCE_LEN] ^= 1;
        assert!(keys.open_index(UUID, &engine.encode(raw)).is_err());
    }

    #[test]
    fn test_too_short_input_fails() {
        use base64::Engine;
        let keys = SubKeys::derive(&Dek::generate());
        let short = base64::engine::general_purpose::STANDARD.encode([0u8; 39]);
        assert!(keys.open_index(UUID, &short).is_err());
        assert!(keys.open_index(UUID, "not base64!").is_err());
    }
}
