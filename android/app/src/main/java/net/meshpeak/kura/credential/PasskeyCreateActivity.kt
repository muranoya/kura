package net.meshpeak.kura.credential

import android.content.Intent
import android.os.Bundle
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
import kotlinx.serialization.json.add
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject
import net.meshpeak.kura.autofill.AutofillAuthScreen
import net.meshpeak.kura.data.model.AutofillCandidate
import net.meshpeak.kura.data.model.WebAuthnAttestationResult
import net.meshpeak.kura.data.model.WebAuthnCredentialCandidate
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
    /** 新規Passkeyの実際の束縛先rp_id。[proceed]内で[OriginResolver.Resolved.validateClaimedRpId]により確定する。 */
    private var effectiveRpId: String? = null

    /** createPasskey()の多重起動防止用（Loading状態はproceed()内部からも一時的に経由するためuiStateでは判定できない）。 */
    private var creationInProgress = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setContent {
            when (val state = uiState) {
                // AutofillAuthScreenは内部で自前にKuraThemeを適用するため、ここでは
                // 二重にラップしない（AutofillUnlockActivityと同じ呼び出し方に揃える）。
                CreateActivityState.Auth -> AutofillAuthScreen(
                    appViewModel = appViewModel,
                    onUnlocked = { proceed() },
                    onLogout = { finishCanceled() }
                )
                is CreateActivityState.Confirm -> KuraTheme {
                    PasskeyCreateConfirmScreen(
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

            // サイトが自己申告するrp.id（例: ログインページ"login.example.com"に対する
            // 親ドメイン"example.com"）。有効性検証はvalidateClaimedRpId内で行われる
            // （検証を経ずに使ってはならない。GetCredentialQueryBuilder.buildと同じ理由）。
            val claimedRpId = resolved.validateClaimedRpId(appViewModel.repository, info.rpId)
            // 新規Passkeyの実際の束縛先rp_id。検証済みならサイトの自己申告値
            // （将来のGetフローがこの値をrpIdとして問い合わせてきたときに一致させるため）、
            // そうでなければ検証済みoriginをそのまま使う。
            val effectiveRpId = claimedRpId ?: resolved.rpId
            this@PasskeyCreateActivity.effectiveRpId = effectiveRpId
            val searchRpIds = if (claimedRpId != null) resolved.allRpIds + claimedRpId else resolved.allRpIds

            // rp.nameはリクエストJSON内の自己申告値で検証手段がない。Passkey自体・
            // 紐付け先エントリの検索は常に検証済みのrp_id（＝effectiveRpId）にのみ束縛されるため、
            // rp.nameが偽装されていても認証が別ドメイン宛てに成立したり無関係なエントリに
            // 紐づいたりすることはない（セキュリティ上の実害はない）。それでも、
            // ブラウザがページタイトルではなくURLを信頼の起点にするのと同じ理由で、
            // ユーザーが「このPasskeyが実際にどのドメイン向けか」を判断できる値を
            // 見せるべきなので、確認ダイアログの表示名にはrp.nameではなくeffectiveRpIdを使う。
            val rpDisplayName = effectiveRpId

            try {
                if (info.excludeCredentialIds.isNotEmpty()) {
                    // 複数ドメインが紐づくパッケージ（OriginResolver.Resolved.allRpIds参照）は
                    // 全ドメインを横断してチェックする。検索失敗を「一致なし」として握りつぶすと
                    // 既に登録済みのPasskeyを見逃したまま作成に進んでしまうため、例外は
                    // ここでcatchせず外側のcatchでErrorに倒す（fail-safe）。
                    val existing = findExcludedCredentials(searchRpIds, info.excludeCredentialIds)
                    if (existing.isNotEmpty()) {
                        uiState = CreateActivityState.Confirm(CreateUiState.AlreadyRegistered)
                        return@launch
                    }
                }

                // 同様に検索失敗を「候補0件」として握りつぶすと、既存エントリがあるにも
                // 関わらず確認なしで重複した新規エントリを自動作成してしまうため、
                // 例外はここでcatchせず外側のcatchでErrorに倒す。
                val matched = listLoginCandidatesAcrossDomains(searchRpIds)
                uiState = when {
                    matched.isEmpty() -> {
                        createPasskey(null)
                        return@launch
                    }
                    matched.size == 1 -> CreateActivityState.Confirm(CreateUiState.Proposal(rpDisplayName, matched[0]))
                    else -> CreateActivityState.Confirm(CreateUiState.Selection(rpDisplayName, matched))
                }
            } catch (_: Exception) {
                uiState = CreateActivityState.Confirm(CreateUiState.Error)
            }
        }
    }

    /** [findCredentialsAcrossDomains]のexcludeCredentials版。詳細は呼び出し元のコメント参照。 */
    private suspend fun findExcludedCredentials(
        rpIds: List<String>,
        excludeCredentialIds: List<String>
    ): List<WebAuthnCredentialCandidate> = rpIds.flatMap { rpId ->
        appViewModel.repository.webauthnFindCredentials(rpId, excludeCredentialIds)
    }

    /**
     * [rpIds]を横断して`listLoginCandidates`を行い、エントリIDで重複排除して返す。
     * 1パッケージに複数ドメインが登録されている場合（OriginResolver.Resolved.allRpIds参照）に
     * いずれのドメインの既存エントリも提案候補として拾えるようにする。例外はcatchせず
     * 呼び出し元に伝播させる（検索失敗を「候補なし」と混同しないため）。
     */
    private suspend fun listLoginCandidatesAcrossDomains(rpIds: List<String>): List<AutofillCandidate> {
        val seenEntryIds = HashSet<String>()
        val result = mutableListOf<AutofillCandidate>()
        for (rpId in rpIds) {
            val found = appViewModel.repository.listLoginCandidates(rpId, strictSubdomain = false)
            for (candidate in found) {
                if (seenEntryIds.add(candidate.id)) {
                    result += candidate
                }
            }
        }
        return result
    }

    private fun createPasskey(entryId: String?) {
        if (creationInProgress) return
        creationInProgress = true
        uiState = CreateActivityState.Confirm(CreateUiState.Loading)
        lifecycleScope.launch {
            val request = pkRequest
            val resolved = resolvedOrigin
            val info = requestInfo
            val rpId = effectiveRpId
            if (request == null || resolved == null || info == null || rpId == null) {
                finishCanceled()
                return@launch
            }

            val attestation = try {
                appViewModel.repository.webauthnCreateCredential(
                    entryId,
                    rpId,
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
                creationInProgress = false
                uiState = CreateActivityState.Confirm(CreateUiState.Error)
                return@launch
            }

            val clientDataJson = if (request.clientDataHash != null) {
                ""
            } else {
                ClientDataJsonBuilder.encodeBase64Url(ClientDataJsonBuilder.buildForCreate(info.challenge, rpId))
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

    /**
     * WebAuthn Level 3 `RegistrationResponseJSON`を組み立てる。`clientExtensionResults`
     * （spec上必須）・`authenticatorAttachment`・`response.transports`は、拡張機能版
     * `webauthn-main-injected.js`の`createOverride`の`toJSON()`が常に含めているのに対し
     * Android版では欠落していた。GetフローのbuildAuthenticationResponseJsonと同じ理由
     * （欠落しているとChrome側のJSON→PublicKeyCredential変換が失敗しうる）で追加する。
     */
    private fun buildRegistrationResponseJson(
        attestation: WebAuthnAttestationResult,
        clientDataJson: String
    ): String = buildJsonObject {
        put("id", attestation.credentialId)
        put("rawId", attestation.credentialId)
        put("type", "public-key")
        put("authenticatorAttachment", "platform")
        putJsonObject("response") {
            put("clientDataJSON", clientDataJson)
            put("attestationObject", attestation.attestationObject)
            putJsonArray("transports") { add("internal") }
        }
        putJsonObject("clientExtensionResults") {}
    }.toString()

    private fun finishCanceled() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
