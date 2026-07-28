//! Reads and writes `passkey` custom fields on `login` entries. Cryptographic
//! operations (key generation, signing, CBOR construction) live in
//! `crate::webauthn`; this module only knows about `CustomField`/`VaultEntry`.

use crate::error::{Result, VaultError};
use crate::models::{CustomField, EntryData, PasskeyFieldData};
use crate::secret::SecretString;
use crate::store::VaultEntry;

use super::UnlockedVault;

/// Non-secret passkey candidate info, used to let the user pick which saved
/// credential to authenticate with (never includes `private_key`).
pub struct PasskeyCandidate {
    pub entry_id: String,
    pub entry_name: String,
    pub custom_field_id: String,
    pub credential_id: String,
    pub user_handle: String,
    pub user_name: String,
    pub user_display_name: String,
}

/// Result of registering a new passkey credential (no private key exposed).
pub struct PasskeyAttestation {
    pub entry_id: String,
    pub custom_field_id: String,
    pub credential_id: String,
    pub attestation_object_b64url: String,
}

/// Result of signing an authentication assertion.
pub struct PasskeyAssertion {
    pub credential_id: String,
    pub user_handle: String,
    pub authenticator_data_b64url: String,
    pub signature_b64url: String,
}

impl UnlockedVault {
    /// Passkeyカスタムフィールドを持つ`login`エントリのうち、`rp_id`が一致するものを
    /// 列挙する。`allow_credential_ids`が空でない場合はさらにcredential_idで絞り込む
    /// （WebAuthnの`allowCredentials`に対応）。ゴミ箱・tombstoneのエントリは除外する。
    pub fn find_passkey_credentials(
        &self,
        rp_id: &str,
        allow_credential_ids: &[String],
    ) -> Vec<PasskeyCandidate> {
        let mut result = Vec::new();
        for (entry_id, vault_entry) in &self.contents.entries {
            if vault_entry.entry_type != "login"
                || vault_entry.deleted_at.is_some()
                || vault_entry.purged_at.is_some()
            {
                continue;
            }
            for field in find_passkey_fields(vault_entry) {
                let Ok(data) = PasskeyFieldData::from_json_string(field.value.as_str()) else {
                    continue;
                };
                if data.rp_id != rp_id {
                    continue;
                }
                if !allow_credential_ids.is_empty()
                    && !allow_credential_ids.contains(&data.credential_id)
                {
                    continue;
                }
                result.push(PasskeyCandidate {
                    entry_id: entry_id.clone(),
                    entry_name: vault_entry.name.clone(),
                    custom_field_id: field.id.clone(),
                    credential_id: data.credential_id,
                    user_handle: data.user_handle,
                    user_name: data.user_name,
                    user_display_name: data.user_display_name,
                });
            }
        }
        result
    }

    /// 新しいPasskeyを生成し、指定エントリ（`entry_id`）に追加する。`entry_id`が
    /// `None`の場合は`rp_name`/`rp_id`/`user_name`から新規`login`エントリを作成する。
    /// `exclude_credential_ids`のいずれかと一致する既存credentialがあればUIを開かず
    /// エラーで即拒否する（WebAuthnの`excludeCredentials`対応、サイドチャネル防止）。
    #[allow(clippy::too_many_arguments)]
    pub fn create_passkey_credential(
        &mut self,
        entry_id: Option<String>,
        rp_id: String,
        rp_name: Option<String>,
        user_handle: String,
        user_name: String,
        user_display_name: String,
        exclude_credential_ids: &[String],
    ) -> Result<PasskeyAttestation> {
        if !exclude_credential_ids.is_empty() {
            let existing = self.find_passkey_credentials(&rp_id, &[]);
            if existing
                .iter()
                .any(|c| exclude_credential_ids.contains(&c.credential_id))
            {
                return Err(VaultError::WebAuthnError(
                    "Credential already registered for this relying party".to_string(),
                ));
            }
        }

        let attestation = crate::webauthn::create_credential(&rp_id)?;

        let display_name = rp_name.clone().unwrap_or_else(|| rp_id.clone());
        let passkey_data = PasskeyFieldData {
            rp_id: rp_id.clone(),
            rp_name,
            user_handle,
            user_name: user_name.clone(),
            user_display_name,
            credential_id: attestation.credential_id_b64url.clone(),
            private_key: attestation.private_key_b64,
        };
        let custom_field_id = uuid::Uuid::new_v4().to_string();
        let custom_field = CustomField {
            id: custom_field_id.clone(),
            name: format!("Passkey ({})", display_name),
            field_type: "passkey".to_string(),
            value: SecretString::from_string(passkey_data.to_json_string()?),
        };

        let target_entry_id = match entry_id {
            Some(id) => {
                let entry = self
                    .get_entry(&id)?
                    .ok_or_else(|| VaultError::EntryNotFound(id.clone()))?;
                if entry.entry_type != "login" {
                    return Err(VaultError::InvalidInput(
                        "Passkeys can only be attached to login entries".to_string(),
                    ));
                }
                let name = entry.name;
                let mut data = entry.data;
                let mut fields = data.custom_fields.take().unwrap_or_default();
                fields.push(custom_field);
                data.custom_fields = Some(fields);
                self.update_entry(&id, name, data)?;
                id
            }
            None => {
                let mut data =
                    EntryData::new_login(Some(rp_id.clone()), user_name, String::new(), None);
                data.custom_fields = Some(vec![custom_field]);
                let entry = self.create_entry(display_name, "login".to_string(), data, vec![])?;
                entry.id
            }
        };

        Ok(PasskeyAttestation {
            entry_id: target_entry_id,
            custom_field_id,
            credential_id: attestation.credential_id_b64url,
            attestation_object_b64url: attestation.attestation_object_b64url,
        })
    }

    /// 指定エントリ・カスタムフィールドのPasskeyで認証assertionに署名する。
    /// sign_countを持たせない設計（`PasskeyFieldData`参照）を守るため、
    /// ここでは`update_entry`を一切呼ばない。
    pub fn get_passkey_assertion(
        &self,
        entry_id: &str,
        custom_field_id: &str,
        client_data_json: &str,
    ) -> Result<PasskeyAssertion> {
        let vault_entry = self
            .contents
            .entries
            .get(entry_id)
            .ok_or_else(|| VaultError::EntryNotFound(entry_id.to_string()))?;

        let field = find_passkey_fields(vault_entry)
            .find(|f| f.id == custom_field_id)
            .ok_or_else(|| VaultError::EntryNotFound(custom_field_id.to_string()))?;

        let data = PasskeyFieldData::from_json_string(field.value.as_str())?;
        let assertion =
            crate::webauthn::get_assertion(&data.rp_id, &data.private_key, client_data_json)?;

        Ok(PasskeyAssertion {
            credential_id: data.credential_id,
            user_handle: data.user_handle,
            authenticator_data_b64url: assertion.authenticator_data_b64url,
            signature_b64url: assertion.signature_b64url,
        })
    }
}

/// `VaultEntry`の`custom_fields`から`field_type == "passkey"`のものだけを走査する。
/// `custom_fields`全体をclone/パースしない（`find_totp_value`と同じ設計、
/// `vault/entries.rs`参照）。
fn find_passkey_fields(e: &VaultEntry) -> impl Iterator<Item = &CustomField> {
    e.custom_fields
        .iter()
        .flatten()
        .filter(|f| f.field_type == "passkey")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::Dek;
    use crate::models::{Argon2Params, VaultMeta};
    use crate::store::VaultContents;

    fn make_vault() -> UnlockedVault {
        UnlockedVault {
            meta: VaultMeta {
                vault_uuid: "test-uuid".to_string(),
                encrypted_dek_master: String::new(),
                encrypted_dek_recovery: String::new(),
                argon2_params: Argon2Params::default(),
                created_at: 0,
            },
            contents: VaultContents::default(),
            dek: Dek::generate(),
            etag: None,
        }
    }

    #[test]
    fn test_create_credential_for_new_entry_and_find_it_again() {
        let mut vault = make_vault();

        let attestation = vault
            .create_passkey_credential(
                None,
                "example.com".to_string(),
                Some("Example".to_string()),
                "user-handle".to_string(),
                "user@example.com".to_string(),
                "Example User".to_string(),
                &[],
            )
            .unwrap();

        let candidates = vault.find_passkey_credentials("example.com", &[]);
        assert_eq!(candidates.len(), 1);
        assert_eq!(candidates[0].entry_id, attestation.entry_id);
        assert_eq!(candidates[0].credential_id, attestation.credential_id);
        assert_eq!(candidates[0].user_name, "user@example.com");

        // Different rp_id must not match.
        assert!(vault
            .find_passkey_credentials("other.example", &[])
            .is_empty());
    }

    #[test]
    fn test_create_credential_attaches_to_existing_login_entry() {
        let mut vault = make_vault();
        let entry = vault
            .create_entry(
                "My Login".to_string(),
                "login".to_string(),
                EntryData::new_login(
                    Some("example.com".to_string()),
                    "user".to_string(),
                    "pw".to_string(),
                    None,
                ),
                vec![],
            )
            .unwrap();

        let attestation = vault
            .create_passkey_credential(
                Some(entry.id.clone()),
                "example.com".to_string(),
                None,
                "handle".to_string(),
                "user".to_string(),
                "User".to_string(),
                &[],
            )
            .unwrap();

        assert_eq!(attestation.entry_id, entry.id);
        let updated = vault.get_entry(&entry.id).unwrap().unwrap();
        assert_eq!(updated.data.custom_fields.unwrap().len(), 1);
    }

    #[test]
    fn test_exclude_credentials_rejects_when_already_registered() {
        let mut vault = make_vault();
        let attestation = vault
            .create_passkey_credential(
                None,
                "example.com".to_string(),
                None,
                "handle".to_string(),
                "user".to_string(),
                "User".to_string(),
                &[],
            )
            .unwrap();

        let result = vault.create_passkey_credential(
            None,
            "example.com".to_string(),
            None,
            "handle2".to_string(),
            "user2".to_string(),
            "User2".to_string(),
            &[attestation.credential_id],
        );
        assert!(result.is_err());
    }

    #[test]
    fn test_get_assertion_does_not_update_entry_timestamp() {
        let mut vault = make_vault();
        let attestation = vault
            .create_passkey_credential(
                None,
                "example.com".to_string(),
                None,
                "handle".to_string(),
                "user".to_string(),
                "User".to_string(),
                &[],
            )
            .unwrap();

        let before = vault.get_entry(&attestation.entry_id).unwrap().unwrap();

        let assertion = vault
            .get_passkey_assertion(
                &attestation.entry_id,
                &attestation.custom_field_id,
                r#"{"type":"webauthn.get"}"#,
            )
            .unwrap();
        assert_eq!(assertion.credential_id, attestation.credential_id);

        let after = vault.get_entry(&attestation.entry_id).unwrap().unwrap();
        assert_eq!(before.updated_at, after.updated_at);
    }
}
