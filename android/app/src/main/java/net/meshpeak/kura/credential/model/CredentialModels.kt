package net.meshpeak.kura.credential.model

import android.content.Intent

/**
 * Get Query（Begin）フェーズで確定した候補1件を Selection フェーズ（[PasskeyGetActivity]）
 * へ伝えるためのリクエスト。ロック中に開始された場合（Query時点ではAuthenticationAction
 * のみを返している）は付与されず、Activity側でアンロック後に改めて候補解決を行う
 * （docs/android-passkey.md 3-3、AutofillModels.kt の TotpResolveRequest と同パターン）。
 */
data class PasskeyGetSelection(
    val entryId: String,
    val customFieldId: String,
    val credentialId: String
)

private const val EXTRA_ENTRY_ID = "net.meshpeak.kura.credential.EXTRA_ENTRY_ID"
private const val EXTRA_CUSTOM_FIELD_ID = "net.meshpeak.kura.credential.EXTRA_CUSTOM_FIELD_ID"
private const val EXTRA_CREDENTIAL_ID = "net.meshpeak.kura.credential.EXTRA_CREDENTIAL_ID"

fun Intent.putPasskeyGetSelection(selection: PasskeyGetSelection) {
    putExtra(EXTRA_ENTRY_ID, selection.entryId)
    putExtra(EXTRA_CUSTOM_FIELD_ID, selection.customFieldId)
    putExtra(EXTRA_CREDENTIAL_ID, selection.credentialId)
}

/** いずれかのフィールドが欠落している場合（ロック中開始、またはIntent改変等）はnullを返す */
fun Intent.getPasskeyGetSelection(): PasskeyGetSelection? {
    val entryId = getStringExtra(EXTRA_ENTRY_ID) ?: return null
    val customFieldId = getStringExtra(EXTRA_CUSTOM_FIELD_ID) ?: return null
    val credentialId = getStringExtra(EXTRA_CREDENTIAL_ID) ?: return null
    return PasskeyGetSelection(entryId, customFieldId, credentialId)
}
