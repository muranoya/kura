package net.meshpeak.kura.credential

import android.content.Intent
import android.os.Bundle
import android.util.Log
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
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.autofill.AutofillAuthScreen
import net.meshpeak.kura.credential.model.PasskeyGetSelection
import net.meshpeak.kura.credential.model.getPasskeyGetSelection
import net.meshpeak.kura.data.model.WebAuthnAssertionResult
import net.meshpeak.kura.ui.navigation.LoadingScreen
import net.meshpeak.kura.ui.theme.KuraTheme
import net.meshpeak.kura.viewmodel.AppViewModel

private const val TAG = "KuraPasskey"

private sealed interface GetUiState {
    data object Auth : GetUiState
    data object Loading : GetUiState
}

/**
 * Getフロー Selection フェーズのトランポリンActivity（[AutofillUnlockActivity]が雛形）。
 * 起動経路が2通りある点に注意（docs/android-passkey.md 3-2）:
 *
 * 1. Query（Begin）フェーズで候補が1件確定済み（[GetCredentialQueryBuilder.buildEntry]の
 *    `PublicKeyCredentialEntry`が持つPendingIntent経由）→ `intent`に
 *    [PasskeyGetSelection]が付与されており、`PendingIntentHandler.retrieveProviderGetCredentialRequest`
 *    でそのまま元のリクエストを復元して直接認証できる。
 * 2. Query時点ではロック中で`AuthenticationAction`のみを返している
 *    （[GetCredentialQueryBuilder.buildAuthenticationAction]のPendingIntent経由）→
 *    `AuthenticationAction`のPendingIntentには`ProviderGetCredentialRequest`が一切
 *    埋め込まれないため`retrieveProviderGetCredentialRequest`は常にnullを返す
 *    （実機検証で確認済み。以前はここでも同じ関数を呼んでいたため、アンロック後に必ず
 *    キャンセル扱いになり、システムの選択UIに戻って無限ループしていた）。
 *    正しくは`PendingIntentHandler.retrieveBeginGetCredentialRequest`で元の
 *    `BeginGetCredentialRequest`を復元し、[GetCredentialQueryBuilder.build]と同じロジックで
 *    （今度はアンロック済みとして）候補を再構築し、
 *    `PendingIntentHandler.setBeginGetCredentialResponse`でシステムに突き返す。
 *    システムは実際の候補一覧を含む選択UIを再表示し、ユーザーが選ぶと経路1として
 *    このActivityが改めて起動される。
 */
class PasskeyGetActivity : AppCompatActivity() {

    private val appViewModel: AppViewModel by viewModels { AppViewModel.Factory }
    private var uiState by mutableStateOf<GetUiState>(GetUiState.Auth)
    private var providerRequest: ProviderGetCredentialRequest? = null
    private var resolvedOrigin: OriginResolver.Resolved? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val selection = intent.getPasskeyGetSelection()
        Log.d(TAG, "onCreate: hasSelection=${selection != null}")

        setContent {
            when (uiState) {
                // AutofillAuthScreenは内部で自前にKuraThemeを適用するため、ここでは
                // 二重にラップしない（AutofillUnlockActivityと同じ呼び出し方に揃える）。
                GetUiState.Auth -> AutofillAuthScreen(
                    appViewModel = appViewModel,
                    onUnlocked = { proceed(selection) },
                    onLogout = { finishCanceled() }
                )
                GetUiState.Loading -> KuraTheme { LoadingScreen() }
            }
        }
    }

    private fun proceed(selection: PasskeyGetSelection?) {
        if (uiState != GetUiState.Auth) return
        if (BuildConfig.DEBUG) Log.d(TAG, "proceed: unlocked, resuming flow (hasSelection=${selection != null})")
        uiState = GetUiState.Loading
        lifecycleScope.launch {
            if (selection != null) {
                proceedWithSelection(selection)
            } else {
                proceedFromAuthenticationAction()
            }
        }
    }

    /** 経路1: Query時点で候補が確定済み。元のProviderGetCredentialRequestを復元してそのまま認証する。 */
    private suspend fun proceedWithSelection(selection: PasskeyGetSelection) {
        val request = PendingIntentHandler.retrieveProviderGetCredentialRequest(intent)
        if (request == null) {
            if (BuildConfig.DEBUG) Log.d(TAG, "proceedWithSelection: retrieveProviderGetCredentialRequest returned null -> cancel")
            finishCanceled()
            return
        }
        providerRequest = request

        val resolved = OriginResolver.resolve(applicationContext, request.callingAppInfo)
        if (resolved == null) {
            if (BuildConfig.DEBUG) Log.d(TAG, "proceedWithSelection: OriginResolver.resolve returned null for package=${request.callingAppInfo.packageName} -> cancel")
            finishCanceled()
            return
        }
        resolvedOrigin = resolved
        finishWithAssertion(selection)
    }

    /**
     * 経路2: AuthenticationAction経由（Query時点ではロック中で候補未確定）。
     * ここで直接候補解決・認証まで完結させようとしてはいけない
     * （`retrieveProviderGetCredentialRequest`は常にnullを返すため、fail-closedでキャンセルする
     * しかなく、システムの選択UIに戻って無限ループする）。代わりに元の`BeginGetCredentialRequest`を
     * 復元し、アンロック済みとして候補を再構築してシステムに突き返す。
     */
    private suspend fun proceedFromAuthenticationAction() {
        val beginRequest = PendingIntentHandler.retrieveBeginGetCredentialRequest(intent)
        if (beginRequest == null) {
            if (BuildConfig.DEBUG) Log.d(TAG, "proceedFromAuthenticationAction: retrieveBeginGetCredentialRequest returned null -> cancel")
            finishCanceled()
            return
        }
        val response = try {
            GetCredentialQueryBuilder.build(applicationContext, appViewModel.repository, beginRequest)
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "proceedFromAuthenticationAction: GetCredentialQueryBuilder.build failed -> cancel", e)
            finishCanceled()
            return
        }
        Log.d(TAG, "proceedFromAuthenticationAction: rebuilt ${response.credentialEntries.size} credentialEntries -> handing back to system")
        val resultIntent = Intent()
        PendingIntentHandler.setBeginGetCredentialResponse(resultIntent, response)
        setResult(RESULT_OK, resultIntent)
        finish()
    }

    private fun finishWithAssertion(selection: PasskeyGetSelection) {
        uiState = GetUiState.Loading
        lifecycleScope.launch {
            val request = providerRequest
            val resolved = resolvedOrigin
            if (request == null || resolved == null) {
                if (BuildConfig.DEBUG) Log.d(TAG, "finishWithAssertion: providerRequest or resolvedOrigin missing -> cancel")
                finishCanceled()
                return@launch
            }
            val pkOption = request.credentialOptions.filterIsInstance<GetPublicKeyCredentialOption>().firstOrNull()
            if (pkOption == null) {
                if (BuildConfig.DEBUG) Log.d(TAG, "finishWithAssertion: no GetPublicKeyCredentialOption in request -> cancel")
                finishCanceled()
                return@launch
            }

            val result = try {
                buildAssertionResult(selection, pkOption, resolved)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) Log.d(TAG, "finishWithAssertion: buildAssertionResult failed -> cancel", e)
                null
            }
            if (result == null) {
                finishCanceled()
                return@launch
            }
            Log.d(TAG, "finishWithAssertion: assertion built successfully -> RESULT_OK")
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

    /**
     * WebAuthn Level 3 `AuthenticationResponseJSON`を組み立てる。`clientExtensionResults`
     * （spec上必須、拡張機能版`webauthn-main-injected.js`の`toJSON()`も常に`{}`を返す）と
     * `authenticatorAttachment`（拡張機能版は常に`"platform"`）が欠けていると、Chrome側の
     * JSON→`PublicKeyCredential`変換で不正な形として扱われ、`navigator.credentials.get()`の
     * Promiseが解決されずページのJSが再試行を繰り返す（実機検証で発覚：kuraはRESULT_OKを
     * 返しているのに、ページ側は一度も検証APIを呼ばずchallenge再取得を繰り返しループしていた）。
     */
    private fun buildAuthenticationResponseJson(
        credentialId: String,
        assertion: WebAuthnAssertionResult,
        clientDataJson: String
    ): String = buildJsonObject {
        put("id", credentialId)
        put("rawId", credentialId)
        put("type", "public-key")
        put("authenticatorAttachment", "platform")
        putJsonObject("response") {
            // clientDataHash経由（ネイティブ側でJSONを持たない）の場合は空文字列のまま返し、
            // Credential Managerシステム側が実際のclientDataJSONに補完する規約に従う。
            put("clientDataJSON", if (clientDataJson.isEmpty()) "" else ClientDataJsonBuilder.encodeBase64Url(clientDataJson))
            put("authenticatorData", assertion.authenticatorData)
            put("signature", assertion.signature)
            put("userHandle", assertion.userHandle)
        }
        putJsonObject("clientExtensionResults") {}
    }.toString()

    private fun finishCanceled() {
        Log.d(TAG, "finishCanceled: returning RESULT_CANCELED")
        setResult(RESULT_CANCELED)
        finish()
    }
}
