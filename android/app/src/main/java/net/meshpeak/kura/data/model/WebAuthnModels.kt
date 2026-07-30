package net.meshpeak.kura.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** vault-core `WebAuthnCredentialCandidate` に対応（秘密鍵を含まない）。 */
@Serializable
data class WebAuthnCredentialCandidate(
    @SerialName("entry_id") val entryId: String,
    @SerialName("entry_name") val entryName: String,
    @SerialName("custom_field_id") val customFieldId: String,
    @SerialName("credential_id") val credentialId: String,
    @SerialName("user_handle") val userHandle: String,
    @SerialName("user_name") val userName: String,
    @SerialName("user_display_name") val userDisplayName: String
)

/** vault-core `WebAuthnAttestationResult` に対応（秘密鍵を含まない）。 */
@Serializable
data class WebAuthnAttestationResult(
    @SerialName("entry_id") val entryId: String,
    @SerialName("custom_field_id") val customFieldId: String,
    @SerialName("credential_id") val credentialId: String,
    @SerialName("attestation_object") val attestationObject: String
)

/** vault-core `WebAuthnAssertionResult` に対応。 */
@Serializable
data class WebAuthnAssertionResult(
    @SerialName("credential_id") val credentialId: String,
    @SerialName("user_handle") val userHandle: String,
    @SerialName("authenticator_data") val authenticatorData: String,
    val signature: String
)
