package net.meshpeak.kura.credential

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.credentials.provider.AuthenticationAction
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.BeginGetPublicKeyCredentialOption
import androidx.credentials.provider.CredentialEntry
import androidx.credentials.provider.PublicKeyCredentialEntry
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import net.meshpeak.kura.R
import net.meshpeak.kura.credential.model.PasskeyGetSelection
import net.meshpeak.kura.credential.model.putPasskeyGetSelection
import net.meshpeak.kura.data.model.WebAuthnCredentialCandidate
import net.meshpeak.kura.data.repository.IVaultRepository
import java.util.concurrent.atomic.AtomicInteger

/** [android.app.PendingIntent]のrequestCode採番。FillResponseBuilder.authRequestCodeSeqと同じ理由。 */
private val requestCodeSeq = AtomicInteger()
private val requestJsonFormat = Json { ignoreUnknownKeys = true }

/**
 * `onBeginGetCredentialRequest`本体ロジック。ロック中は候補の有無に関わらず常に
 * `AuthenticationAction`のみを返す（早期return、docs/android-passkey.md 3-3を実装として
 * 強制する）。`isUnlocked()`判定より前にOrigin解決・`find_credentials`呼び出しを
 * 一切行わない。
 */
object GetCredentialQueryBuilder {

    suspend fun build(
        context: Context,
        repository: IVaultRepository,
        request: BeginGetCredentialRequest
    ): BeginGetCredentialResponse {
        val unlocked = try {
            repository.isUnlocked()
        } catch (_: Exception) {
            false
        }
        if (!unlocked) {
            return BeginGetCredentialResponse(authenticationActions = listOf(buildAuthenticationAction(context)))
        }

        val callingAppInfo = request.callingAppInfo ?: return BeginGetCredentialResponse()
        val resolved = OriginResolver.resolve(context, callingAppInfo) ?: return BeginGetCredentialResponse()

        val entries = mutableListOf<CredentialEntry>()
        for (option in request.beginGetCredentialOptions.filterIsInstance<BeginGetPublicKeyCredentialOption>()) {
            val allowIds = parseAllowCredentialIds(option.requestJson)
            val candidates = try {
                repository.webauthnFindCredentials(resolved.rpId, allowIds)
            } catch (_: Exception) {
                emptyList()
            }
            candidates.forEach { entries += buildEntry(context, option, it) }
        }
        return BeginGetCredentialResponse(credentialEntries = entries)
    }

    private fun buildAuthenticationAction(context: Context): AuthenticationAction {
        val intent = Intent(context, PasskeyGetActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCodeSeq.incrementAndGet(),
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return AuthenticationAction(context.getString(R.string.passkey_unlock_prompt), pendingIntent)
    }

    private fun buildEntry(
        context: Context,
        option: BeginGetPublicKeyCredentialOption,
        candidate: WebAuthnCredentialCandidate
    ): PublicKeyCredentialEntry {
        val intent = Intent(context, PasskeyGetActivity::class.java).apply {
            putPasskeyGetSelection(
                PasskeyGetSelection(candidate.entryId, candidate.customFieldId, candidate.credentialId)
            )
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCodeSeq.incrementAndGet(),
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return PublicKeyCredentialEntry.Builder(context, candidate.userName, pendingIntent, option)
            .setDisplayName(candidate.userDisplayName.ifBlank { candidate.userName })
            .build()
    }

    private fun parseAllowCredentialIds(requestJson: String): List<String> = runCatching {
        requestJsonFormat.parseToJsonElement(requestJson).jsonObject["allowCredentials"]
            ?.jsonArray
            ?.mapNotNull { it.jsonObject["id"]?.jsonPrimitive?.content }
            ?: emptyList()
    }.getOrDefault(emptyList())
}
