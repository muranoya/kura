use super::VaultManager;

/// WebAuthn passkey候補（秘匿値を含まない）
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct WebAuthnCredentialCandidate {
    pub entry_id: String,
    pub entry_name: String,
    pub custom_field_id: String,
    pub credential_id: String,
    pub user_handle: String,
    pub user_name: String,
    pub user_display_name: String,
}

/// Passkey作成結果（秘密鍵を含まない）
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct WebAuthnAttestationResult {
    pub entry_id: String,
    pub custom_field_id: String,
    pub credential_id: String,
    /// base64url-encoded CBOR attestationObject
    pub attestation_object: String,
}

/// Passkey認証結果
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct WebAuthnAssertionResult {
    pub credential_id: String,
    pub user_handle: String,
    /// base64url-encoded authenticatorData
    pub authenticator_data: String,
    /// base64url-encoded DER ECDSA signature
    pub signature: String,
}

impl VaultManager {
    /// `rp_id`に一致するPasskey候補を検索する（秘密鍵を含まない）
    pub fn api_webauthn_find_credentials(
        &self,
        rp_id: String,
        allow_credential_ids: Vec<String>,
    ) -> Result<Vec<WebAuthnCredentialCandidate>, String> {
        self.with_unlocked(|unlocked| {
            Ok(unlocked
                .find_passkey_credentials(&rp_id, &allow_credential_ids)
                .into_iter()
                .map(|c| WebAuthnCredentialCandidate {
                    entry_id: c.entry_id,
                    entry_name: c.entry_name,
                    custom_field_id: c.custom_field_id,
                    credential_id: c.credential_id,
                    user_handle: c.user_handle,
                    user_name: c.user_name,
                    user_display_name: c.user_display_name,
                })
                .collect())
        })
    }

    /// 新しいPasskeyを作成する。`entry_id`を指定すればその既存loginエントリに、
    /// `None`なら新規loginエントリを作成した上で追加する。
    #[allow(clippy::too_many_arguments)]
    pub fn api_webauthn_create_credential(
        &self,
        entry_id: Option<String>,
        rp_id: String,
        rp_name: Option<String>,
        user_handle: String,
        user_name: String,
        user_display_name: String,
        exclude_credential_ids: Vec<String>,
    ) -> Result<WebAuthnAttestationResult, String> {
        self.with_unlocked_mut(|unlocked| {
            let result = unlocked
                .create_passkey_credential(
                    entry_id,
                    rp_id,
                    rp_name,
                    user_handle,
                    user_name,
                    user_display_name,
                    &exclude_credential_ids,
                )
                .map_err(|e| format!("Failed to create passkey credential: {}", e))?;

            Ok(WebAuthnAttestationResult {
                entry_id: result.entry_id,
                custom_field_id: result.custom_field_id,
                credential_id: result.credential_id,
                attestation_object: result.attestation_object_b64url,
            })
        })
    }

    /// 既存Passkeyで認証assertionに署名する。エントリのupdateは行わない
    /// （sign_countを持たせない設計、`PasskeyFieldData`参照）。
    pub fn api_webauthn_get_assertion(
        &self,
        entry_id: String,
        custom_field_id: String,
        client_data_json: String,
    ) -> Result<WebAuthnAssertionResult, String> {
        self.with_unlocked(|unlocked| {
            let result = unlocked
                .get_passkey_assertion(&entry_id, &custom_field_id, &client_data_json)
                .map_err(|e| format!("Failed to get passkey assertion: {}", e))?;

            Ok(WebAuthnAssertionResult {
                credential_id: result.credential_id,
                user_handle: result.user_handle,
                authenticator_data: result.authenticator_data_b64url,
                signature: result.signature_b64url,
            })
        })
    }

    /// [`Self::api_webauthn_get_assertion`]と同じだが、clientDataJSONそのものでは
    /// なくそのSHA-256ハッシュ（32バイト）を受け取る。Android Credential Managerの
    /// 特権アプリ（ブラウザ）発リクエストは元のJSON文字列を提供せず`clientDataHash`
    /// のみを渡すため（`docs/android-passkey.md` 5-3参照）。
    pub fn api_webauthn_get_assertion_with_hash(
        &self,
        entry_id: String,
        custom_field_id: String,
        client_data_hash: Vec<u8>,
    ) -> Result<WebAuthnAssertionResult, String> {
        let hash: [u8; 32] = client_data_hash
            .try_into()
            .map_err(|_| "client_data_hash must be exactly 32 bytes".to_string())?;

        self.with_unlocked(|unlocked| {
            let result = unlocked
                .get_passkey_assertion_with_hash(&entry_id, &custom_field_id, &hash)
                .map_err(|e| format!("Failed to get passkey assertion: {}", e))?;

            Ok(WebAuthnAssertionResult {
                credential_id: result.credential_id,
                user_handle: result.user_handle,
                authenticator_data: result.authenticator_data_b64url,
                signature: result.signature_b64url,
            })
        })
    }
}
