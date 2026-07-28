//! WebAuthn/Passkey cryptographic core: key generation, authenticatorData /
//! attestationObject / COSE_Key construction, and ECDSA signing.
//!
//! No network I/O and no vault/entry access here (see `crate::vault::webauthn`
//! for the code that reads/writes `CustomField`s) — this module only turns
//! bytes into other bytes, so it can be tested with byte-level golden vectors
//! independent of the vault storage model.

use crate::error::{Result, VaultError};
use base64::{
    engine::general_purpose::STANDARD, engine::general_purpose::URL_SAFE_NO_PAD, Engine as _,
};
use ciborium::value::Value as CborValue;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey, VerifyingKey};
use rand::rngs::OsRng;
use sha2::{Digest, Sha256};

/// Fixed AAGUID identifying kura as the authenticator implementation.
/// Arbitrary but must remain stable across releases (it is embedded in every
/// created credential's `attestedCredentialData`).
pub const KURA_AAGUID: [u8; 16] = *b"kura-webauthn-01";

const FLAG_UP: u8 = 0x01; // User Present
const FLAG_UV: u8 = 0x04; // User Verified
const FLAG_AT: u8 = 0x40; // Attested credential data included

/// Result of creating a new passkey credential. `private_key_b64` and
/// `credential_id_b64url` are what gets persisted (via `PasskeyFieldData`);
/// `attestation_object_b64url` is returned to the page and never stored.
pub struct AttestationResult {
    pub credential_id_b64url: String,
    pub private_key_b64: String,
    pub attestation_object_b64url: String,
}

/// Result of signing an authentication assertion for an existing credential.
pub struct AssertionResult {
    pub authenticator_data_b64url: String,
    pub signature_b64url: String,
}

fn sha256(data: &[u8]) -> [u8; 32] {
    Sha256::digest(data).into()
}

fn generate_private_key_b64() -> String {
    let signing_key = SigningKey::random(&mut OsRng);
    STANDARD.encode(signing_key.to_bytes())
}

fn generate_credential_id() -> [u8; 32] {
    rand::random()
}

fn signing_key_from_b64(private_key_b64: &str) -> Result<SigningKey> {
    let bytes = STANDARD
        .decode(private_key_b64)
        .map_err(|e| VaultError::WebAuthnError(format!("Invalid private key encoding: {}", e)))?;
    SigningKey::from_slice(&bytes)
        .map_err(|e| VaultError::WebAuthnError(format!("Invalid private key: {}", e)))
}

/// COSE_Key (EC2/P-256) CBOR bytes for the public key derived from `private_key_b64`.
/// The public key is never persisted; it is always re-derived from the private key
/// at the point it's needed (creation-time attestedCredentialData).
fn cose_public_key_bytes(private_key_b64: &str) -> Result<Vec<u8>> {
    let signing_key = signing_key_from_b64(private_key_b64)?;
    let verifying_key = VerifyingKey::from(&signing_key);
    let point = verifying_key.to_encoded_point(false); // uncompressed: 0x04 | x(32) | y(32)
    let x = point.x().ok_or_else(|| {
        VaultError::WebAuthnError("Failed to derive public key x-coordinate".to_string())
    })?;
    let y = point.y().ok_or_else(|| {
        VaultError::WebAuthnError("Failed to derive public key y-coordinate".to_string())
    })?;

    let map = CborValue::Map(vec![
        (CborValue::Integer(1.into()), CborValue::Integer(2.into())), // kty: EC2
        (
            CborValue::Integer(3.into()),
            CborValue::Integer((-7).into()),
        ), // alg: ES256
        (
            CborValue::Integer((-1).into()),
            CborValue::Integer(1.into()),
        ), // crv: P-256
        (
            CborValue::Integer((-2).into()),
            CborValue::Bytes(x.to_vec()),
        ), // x
        (
            CborValue::Integer((-3).into()),
            CborValue::Bytes(y.to_vec()),
        ), // y
    ]);
    let mut buf = Vec::new();
    ciborium::ser::into_writer(&map, &mut buf)
        .map_err(|e| VaultError::WebAuthnError(format!("COSE_Key CBOR encoding failed: {}", e)))?;
    Ok(buf)
}

/// `rpIdHash(32) | flags(1) | signCount(4, always 0) | [attestedCredentialData]`.
/// `signCount` is hardcoded to 0 (see `PasskeyFieldData` doc comment for rationale:
/// synced passkeys can't maintain a meaningful monotonic counter across devices).
fn build_authenticator_data(rp_id: &str, flags: u8, attested: Option<(&[u8], &[u8])>) -> Vec<u8> {
    let rp_id_hash = sha256(rp_id.as_bytes());
    let mut data = Vec::with_capacity(37);
    data.extend_from_slice(&rp_id_hash);
    data.push(flags);
    data.extend_from_slice(&0u32.to_be_bytes());
    if let Some((credential_id, cose_key)) = attested {
        data.extend_from_slice(&KURA_AAGUID);
        data.extend_from_slice(&(credential_id.len() as u16).to_be_bytes());
        data.extend_from_slice(credential_id);
        data.extend_from_slice(cose_key);
    }
    data
}

/// CBOR-encode `{fmt: "none", attStmt: {}, authData: <bytes>}`. The "none"
/// attestation format carries no signature, so no key material is involved here.
fn build_attestation_object(auth_data: &[u8]) -> Result<Vec<u8>> {
    let map = CborValue::Map(vec![
        (
            CborValue::Text("fmt".to_string()),
            CborValue::Text("none".to_string()),
        ),
        (
            CborValue::Text("attStmt".to_string()),
            CborValue::Map(vec![]),
        ),
        (
            CborValue::Text("authData".to_string()),
            CborValue::Bytes(auth_data.to_vec()),
        ),
    ]);
    let mut buf = Vec::new();
    ciborium::ser::into_writer(&map, &mut buf).map_err(|e| {
        VaultError::WebAuthnError(format!("attestationObject CBOR encoding failed: {}", e))
    })?;
    Ok(buf)
}

/// Sign `message` with the P-256 key encoded in `private_key_b64`, returning a
/// DER-encoded ECDSA signature.
fn sign(private_key_b64: &str, message: &[u8]) -> Result<Vec<u8>> {
    let signing_key = signing_key_from_b64(private_key_b64)?;
    let signature: Signature = signing_key.sign(message);
    Ok(signature.to_der().as_bytes().to_vec())
}

/// Generate a new P-256 keypair and credential ID, and build the "none"-format
/// attestationObject for a `navigator.credentials.create()` response. The
/// private key is returned so the caller can persist it as `PasskeyFieldData`;
/// it is never written to storage by this module.
pub fn create_credential(rp_id: &str) -> Result<AttestationResult> {
    let private_key_b64 = generate_private_key_b64();
    let credential_id = generate_credential_id();
    let cose_key = cose_public_key_bytes(&private_key_b64)?;
    let auth_data = build_authenticator_data(
        rp_id,
        FLAG_UP | FLAG_UV | FLAG_AT,
        Some((&credential_id, &cose_key)),
    );
    let attestation_object = build_attestation_object(&auth_data)?;

    Ok(AttestationResult {
        credential_id_b64url: URL_SAFE_NO_PAD.encode(credential_id),
        private_key_b64,
        attestation_object_b64url: URL_SAFE_NO_PAD.encode(attestation_object),
    })
}

/// Sign a `navigator.credentials.get()` assertion with an existing credential's
/// private key. Does not touch storage; the caller is responsible for not
/// updating the entry afterwards (see `PasskeyFieldData` sign_count rationale).
pub fn get_assertion(
    rp_id: &str,
    private_key_b64: &str,
    client_data_json: &str,
) -> Result<AssertionResult> {
    let auth_data = build_authenticator_data(rp_id, FLAG_UP | FLAG_UV, None);
    let client_data_hash = sha256(client_data_json.as_bytes());

    let mut message = Vec::with_capacity(auth_data.len() + client_data_hash.len());
    message.extend_from_slice(&auth_data);
    message.extend_from_slice(&client_data_hash);

    let signature = sign(private_key_b64, &message)?;

    Ok(AssertionResult {
        authenticator_data_b64url: URL_SAFE_NO_PAD.encode(&auth_data),
        signature_b64url: URL_SAFE_NO_PAD.encode(signature),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use p256::ecdsa::signature::Verifier;

    #[test]
    fn test_create_credential_produces_valid_cbor_attestation_object() {
        let result = create_credential("example.com").unwrap();

        let attestation_bytes = URL_SAFE_NO_PAD
            .decode(&result.attestation_object_b64url)
            .unwrap();
        let value: CborValue = ciborium::de::from_reader(attestation_bytes.as_slice()).unwrap();
        let CborValue::Map(entries) = value else {
            panic!("expected CBOR map");
        };

        let fmt = entries
            .iter()
            .find(|(k, _)| *k == CborValue::Text("fmt".to_string()))
            .map(|(_, v)| v.clone());
        assert_eq!(fmt, Some(CborValue::Text("none".to_string())));

        let auth_data = entries
            .iter()
            .find(|(k, _)| *k == CborValue::Text("authData".to_string()))
            .and_then(|(_, v)| v.as_bytes().cloned())
            .expect("authData bytes");

        // rpIdHash(32) + flags(1) + signCount(4) + aaguid(16) + credIdLen(2) + credId(32) + COSE_Key
        assert!(auth_data.len() > 32 + 1 + 4 + 16 + 2 + 32);
        assert_eq!(&auth_data[0..32], &sha256(b"example.com"));
        assert_eq!(auth_data[32], FLAG_UP | FLAG_UV | FLAG_AT);
        assert_eq!(&auth_data[33..37], &[0u8; 4]); // signCount fixed at 0
        assert_eq!(&auth_data[37..53], &KURA_AAGUID);
    }

    #[test]
    fn test_get_assertion_signature_verifies_against_derived_public_key() {
        let created = create_credential("example.com").unwrap();
        let client_data_json =
            r#"{"type":"webauthn.get","challenge":"abc","origin":"https://example.com"}"#;

        let assertion =
            get_assertion("example.com", &created.private_key_b64, client_data_json).unwrap();

        let signing_key = signing_key_from_b64(&created.private_key_b64).unwrap();
        let verifying_key = VerifyingKey::from(&signing_key);

        let auth_data = URL_SAFE_NO_PAD
            .decode(&assertion.authenticator_data_b64url)
            .unwrap();
        let signature_der = URL_SAFE_NO_PAD.decode(&assertion.signature_b64url).unwrap();
        let signature = Signature::from_der(&signature_der).unwrap();

        let mut message = auth_data.clone();
        message.extend_from_slice(&sha256(client_data_json.as_bytes()));

        assert!(verifying_key.verify(&message, &signature).is_ok());

        // Assertion authenticatorData must NOT include attestedCredentialData.
        assert_eq!(auth_data.len(), 32 + 1 + 4);
        assert_eq!(auth_data[32], FLAG_UP | FLAG_UV);
    }

    #[test]
    fn test_get_assertion_wrong_rp_id_hash_differs() {
        let created = create_credential("example.com").unwrap();
        let client_data_json = r#"{"type":"webauthn.get"}"#;

        let assertion_a =
            get_assertion("example.com", &created.private_key_b64, client_data_json).unwrap();
        let assertion_b =
            get_assertion("other.example", &created.private_key_b64, client_data_json).unwrap();

        assert_ne!(
            assertion_a.authenticator_data_b64url,
            assertion_b.authenticator_data_b64url
        );
    }

    #[test]
    fn test_invalid_private_key_encoding_returns_error() {
        let result = get_assertion("example.com", "not-base64!!", "{}");
        assert!(result.is_err());
    }
}
