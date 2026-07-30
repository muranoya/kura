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
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.provider.PendingIntentHandler
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import net.meshpeak.kura.autofill.AutofillAuthScreen
import net.meshpeak.kura.data.model.WebAuthnAttestationResult
import net.meshpeak.kura.ui.credential.CreateUiState
import net.meshpeak.kura.ui.credential.PasskeyCreateConfirmScreen
import net.meshpeak.kura.ui.theme.KuraTheme
import net.meshpeak.kura.viewmodel.AppViewModel

private sealed interface CreateActivityState {
    data object Auth : CreateActivityState
    data class Confirm(val screenState: CreateUiState) : CreateActivityState
}

/**
 * Createフロー Selection フェーズのトランポリンActivity（[AutofillUnlockActivity]が雛形）。
 * アンロック後、`excludeCredentials`一致チェック→紐付け先エントリ検索（0件/1件/複数件）
 * →ユーザー確認→`webauthnCreateCredential`呼び出し、という一連の流れをここで行う
 * （docs/android-passkey.md 3-1、6-1）。
 */
class PasskeyCreateActivity : AppCompatActivity() {

    private val appViewModel: AppViewModel by viewModels { AppViewModel.Factory }
    private var uiState by mutableStateOf<CreateActivityState>(CreateActivityState.Auth)

    private var pkRequest: CreatePublicKeyCredentialRequest? = null
    private var resolvedOrigin: OriginResolver.Resolved? = null
    private var requestInfo: CreateRequestInfo? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            KuraTheme {
                when (val state = uiState) {
                    CreateActivityState.Auth -> AutofillAuthScreen(
                        appViewModel = appViewModel,
                        onUnlocked = { proceed() },
                        onLogout = { finishCanceled() }
                    )
                    is CreateActivityState.Confirm -> PasskeyCreateConfirmScreen(
                        state = state.screenState,
                        onConfirm = { entryId -> createPasskey(entryId) },
                        onCancel = { finishCanceled() }
                    )
                }
            }
        }
    }

    private fun proceed() {
        if (uiState != CreateActivityState.Auth) return
        uiState = CreateActivityState.Confirm(CreateUiState.Loading)
        lifecycleScope.launch {
            val providerRequest = PendingIntentHandler.retrieveProviderCreateCredentialRequest(intent)
            val request = providerRequest?.callingRequest as? CreatePublicKeyCredentialRequest
            if (request == null) {
                finishCanceled()
                return@launch
            }
            pkRequest = request

            val resolved = OriginResolver.resolve(applicationContext, providerRequest.callingAppInfo)
            if (resolved == null) {
                finishCanceled()
                return@launch
            }
            resolvedOrigin = resolved

            val info = CreateRequestJsonParser.parse(request.requestJson)
            if (info == null) {
                finishCanceled()
                return@launch
            }
            requestInfo = info

            if (info.excludeCredentialIds.isNotEmpty()) {
                val existing = try {
                    appViewModel.repository.webauthnFindCredentials(resolved.rpId, info.excludeCredentialIds)
                } catch (_: Exception) {
                    emptyList()
                }
                if (existing.isNotEmpty()) {
                    uiState = CreateActivityState.Confirm(CreateUiState.AlreadyRegistered)
                    return@launch
                }
            }

            val rpDisplayName = info.rpName ?: resolved.rpId
            val matched = try {
                appViewModel.repository.listLoginCandidates(resolved.rpId, strictSubdomain = false)
            } catch (_: Exception) {
                emptyList()
            }
            uiState = when {
                matched.isEmpty() -> {
                    createPasskey(null)
                    return@launch
                }
                matched.size == 1 -> CreateActivityState.Confirm(CreateUiState.Proposal(rpDisplayName, matched[0]))
                else -> CreateActivityState.Confirm(CreateUiState.Selection(rpDisplayName, matched))
            }
        }
    }

    private fun createPasskey(entryId: String?) {
        uiState = CreateActivityState.Confirm(CreateUiState.Loading)
        lifecycleScope.launch {
            val request = pkRequest
            val resolved = resolvedOrigin
            val info = requestInfo
            if (request == null || resolved == null || info == null) {
                finishCanceled()
                return@launch
            }

            val attestation = try {
                appViewModel.repository.webauthnCreateCredential(
                    entryId,
                    resolved.rpId,
                    info.rpName,
                    info.userHandle,
                    info.userName,
                    info.userDisplayName,
                    info.excludeCredentialIds
                )
            } catch (_: Exception) {
                null
            }
            if (attestation == null) {
                finishCanceled()
                return@launch
            }

            val clientDataJson = if (request.clientDataHash != null) {
                ""
            } else {
                encodeBase64Url(ClientDataJsonBuilder.buildForCreate(info.challenge, resolved.rpId))
            }

            val responseJson = buildRegistrationResponseJson(attestation, clientDataJson)
            val result = Intent()
            PendingIntentHandler.setCreateCredentialResponse(
                result, CreatePublicKeyCredentialResponse(responseJson)
            )
            setResult(RESULT_OK, result)
            finish()
        }
    }

    private fun buildRegistrationResponseJson(
        attestation: WebAuthnAttestationResult,
        clientDataJson: String
    ): String = buildJsonObject {
        put("id", attestation.credentialId)
        put("rawId", attestation.credentialId)
        put("type", "public-key")
        putJsonObject("response") {
            put("clientDataJSON", clientDataJson)
            put("attestationObject", attestation.attestationObject)
        }
    }.toString()

    private fun encodeBase64Url(text: String): String =
        Base64.encodeToString(text.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun finishCanceled() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
