package net.meshpeak.kura.credential

import android.content.Intent
import android.os.Bundle
import android.util.Base64
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.credentials.GetCredentialResponse
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.provider.PendingIntentHandler
import androidx.credentials.provider.ProviderGetCredentialRequest
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import net.meshpeak.kura.autofill.AutofillAuthScreen
import net.meshpeak.kura.credential.model.PasskeyGetSelection
import net.meshpeak.kura.credential.model.getPasskeyGetSelection
import net.meshpeak.kura.data.model.WebAuthnAssertionResult
import net.meshpeak.kura.data.model.WebAuthnCredentialCandidate
import net.meshpeak.kura.ui.credential.PasskeyGetSelectScreen
import net.meshpeak.kura.ui.navigation.LoadingScreen
import net.meshpeak.kura.ui.theme.KuraTheme
import net.meshpeak.kura.viewmodel.AppViewModel

private sealed interface GetUiState {
    data object Auth : GetUiState
    data object Loading : GetUiState
    data class Selecting(val candidates: List<WebAuthnCredentialCandidate>) : GetUiState
}

/**
 * Getフロー Selection フェーズのトランポリンActivity（[AutofillUnlockActivity]が雛形）。
 * Query（Begin）フェーズで候補が1件確定済みならそのまま認証するだけだが、
 * ロック中に開始された場合（[GetCredentialQueryBuilder]がAuthenticationActionのみを
 * 返している）は、ここでアンロック後に改めて候補解決を行う必要がある
 * （docs/android-passkey.md 3-2/3-3のギャップに対する拡張、Part 0参照）。
 */
class PasskeyGetActivity : AppCompatActivity() {

    private val appViewModel: AppViewModel by viewModels { AppViewModel.Factory }
    private var uiState by mutableStateOf<GetUiState>(GetUiState.Auth)
    private var providerRequest: ProviderGetCredentialRequest? = null
    private var resolvedOrigin: OriginResolver.Resolved? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val selection = intent.getPasskeyGetSelection()

        setContent {
            KuraTheme {
                when (val state = uiState) {
                    GetUiState.Auth -> AutofillAuthScreen(
                        appViewModel = appViewModel,
                        onUnlocked = { proceed(selection) },
                        onLogout = { finishCanceled() }
                    )
                    GetUiState.Loading -> LoadingScreen()
                    is GetUiState.Selecting -> PasskeyGetSelectScreen(
                        candidates = state.candidates,
                        onSelect = { candidate ->
                            finishWithAssertion(
                                PasskeyGetSelection(candidate.entryId, candidate.customFieldId, candidate.credentialId)
                            )
                        }
                    )
                }
            }
        }
    }

    private fun proceed(selection: PasskeyGetSelection?) {
        if (uiState != GetUiState.Auth) return
        uiState = GetUiState.Loading
        lifecycleScope.launch {
            val request = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
            if (request == null) {
                finishCanceled()
                return@launch
            }
            providerRequest = request

            val resolved = OriginResolver.resolve(applicationContext, request.callingAppInfo)
            if (resolved == null) {
                finishCanceled()
                return@launch
            }
            resolvedOrigin = resolved

            if (selection != null) {
                finishWithAssertion(selection)
                return@launch
            }

            // ロック中に開始されたケース: システムの候補選択UIは機能していないため、
            // アンロック後にここで初めて候補を確定する。
            val candidates = try {
                appViewModel.repository.webauthnFindCredentials(resolved.rpId, emptyList())
            } catch (_: Exception) {
                emptyList()
            }
            when {
                candidates.isEmpty() -> finishCanceled()
                candidates.size == 1 -> {
                    val c = candidates[0]
                    finishWithAssertion(PasskeyGetSelection(c.entryId, c.customFieldId, c.credentialId))
                }
                else -> uiState = GetUiState.Selecting(candidates)
            }
        }
    }

    private fun finishWithAssertion(selection: PasskeyGetSelection) {
        uiState = GetUiState.Loading
        lifecycleScope.launch {
            val request = providerRequest
            val resolved = resolvedOrigin
            if (request == null || resolved == null) {
                finishCanceled()
                return@launch
            }
            val pkOption = request.credentialOptions.filterIsInstance<GetPublicKeyCredentialOption>().firstOrNull()
            if (pkOption == null) {
                finishCanceled()
                return@launch
            }

            val result = try {
                buildAssertionResult(selection, pkOption, resolved)
            } catch (_: Exception) {
                null
            }
            if (result == null) {
                finishCanceled()
                return@launch
            }
            val (assertion, clientDataJsonForResponse) = result

            val responseJson = buildAuthenticationResponseJson(
                selection.credentialId, assertion, clientDataJsonForResponse
            )
            val resultIntent = Intent()
            PendingIntentHandler.setGetCredentialResponse(
                resultIntent, GetCredentialResponse(PublicKeyCredential(responseJson)), request
            )
            setResult(RESULT_OK, resultIntent)
            finish()
        }
    }

    /**
     * @return assertionと、レスポンスJSONに埋め込むclientDataJSON（`clientDataHash`経由の
     * 場合、Kotlin側は元のJSON文字列を持たないため空文字列を返す——Credential Manager
     * システム側がこれを実際のclientDataJSONに補完する、という規約に沿う）。
     */
    private suspend fun buildAssertionResult(
        selection: PasskeyGetSelection,
        pkOption: GetPublicKeyCredentialOption,
        resolved: OriginResolver.Resolved
    ): Pair<WebAuthnAssertionResult, String> {
        val hash = pkOption.clientDataHash
        return if (hash != null) {
            val assertion = appViewModel.repository.webauthnGetAssertionWithHash(
                selection.entryId, selection.customFieldId, hash
            )
            assertion to ""
        } else {
            val challenge = ClientDataJsonBuilder.extractChallenge(pkOption.requestJson)
                ?: throw IllegalStateException("requestJson has no challenge")
            val clientDataJson = ClientDataJsonBuilder.buildForGet(challenge, resolved.rpId)
            val assertion = appViewModel.repository.webauthnGetAssertion(
                selection.entryId, selection.customFieldId, clientDataJson
            )
            assertion to clientDataJson
        }
    }

    private fun buildAuthenticationResponseJson(
        credentialId: String,
        assertion: WebAuthnAssertionResult,
        clientDataJson: String
    ): String = buildJsonObject {
        put("id", credentialId)
        put("rawId", credentialId)
        put("type", "public-key")
        putJsonObject("response") {
            // clientDataHash経由（ネイティブ側でJSONを持たない）の場合は空文字列のまま返し、
            // Credential Managerシステム側が実際のclientDataJSONに補完する規約に従う。
            put("clientDataJSON", if (clientDataJson.isEmpty()) "" else encodeBase64Url(clientDataJson))
            put("authenticatorData", assertion.authenticatorData)
            put("signature", assertion.signature)
            put("userHandle", assertion.userHandle)
        }
    }.toString()

    private fun encodeBase64Url(text: String): String =
        Base64.encodeToString(text.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun finishCanceled() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
