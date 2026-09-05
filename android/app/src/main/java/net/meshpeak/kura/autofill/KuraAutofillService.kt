package net.meshpeak.kura.autofill

import android.os.CancellationSignal
import android.service.autofill.AutofillService
import android.service.autofill.FillCallback
import android.service.autofill.FillRequest
import android.service.autofill.SaveCallback
import android.service.autofill.SaveRequest
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.R
import net.meshpeak.kura.autofill.log.AutofillLogEvent
import net.meshpeak.kura.autofill.log.AutofillLogOutcome
import net.meshpeak.kura.autofill.log.AutofillLogStore
import net.meshpeak.kura.data.repository.IVaultRepository
import net.meshpeak.kura.data.repository.VaultRepository

private const val TAG = "KuraAutofill"

/**
 * ネイティブアプリおよびブラウザ（Chrome/Firefox/WebView）双方のログインフォームに対応する
 * （docs/android-autofillservice.md 1-1）。onSaveRequest（新規ログイン保存提案）は方針として非対応。
 */
class KuraAutofillService : AutofillService() {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private val repository: IVaultRepository by lazy { VaultRepository(applicationContext) }

    override fun onDestroy() {
        serviceJob.cancel()
        super.onDestroy()
    }

    override fun onFillRequest(
        request: FillRequest,
        cancellationSignal: CancellationSignal,
        callback: FillCallback
    ) {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "onFillRequest called")
        }

        val structure = request.fillContexts.lastOrNull()?.structure
        if (structure == null) {
            if (BuildConfig.DEBUG) Log.d(TAG, "no AssistStructure in request -> onSuccess(null)")
            AutofillLogStore.record(
                applicationContext,
                AutofillLogEvent(target = null, isBrowserRequest = false, outcome = AutofillLogOutcome.NO_STRUCTURE)
            )
            callback.onSuccess(null)
            return
        }

        val parsed = AssistStructureParser.parse(structure, applicationContext)
        val target = if (parsed.isBrowserRequest) parsed.webDomain else parsed.packageName
        if (!parsed.isBrowserRequest && parsed.packageName == null) {
            // ネイティブアプリ由来だがパッケージ名不明: 対象外
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "skipping: native request with unknown packageName")
            }
            AutofillLogStore.record(
                applicationContext,
                AutofillLogEvent(target = null, isBrowserRequest = false, outcome = AutofillLogOutcome.UNKNOWN_PACKAGE)
            )
            callback.onSuccess(null)
            return
        }
        if (parsed.usernameFieldId == null && parsed.passwordFieldId == null && parsed.totpFieldId == null) {
            if (BuildConfig.DEBUG) Log.d(TAG, "skipping: no username/password/totp field detected")
            AutofillLogStore.record(
                applicationContext,
                AutofillLogEvent(
                    target = target,
                    isBrowserRequest = parsed.isBrowserRequest,
                    outcome = AutofillLogOutcome.NO_FIELDS_DETECTED
                )
            )
            callback.onSuccess(null)
            return
        }

        val job = serviceScope.launch {
            val response = try {
                val unlocked = repository.isUnlocked()
                if (BuildConfig.DEBUG) Log.d(TAG, "vault isUnlocked=$unlocked, packageName=${parsed.packageName}")
                if (unlocked) {
                    FillResponseBuilder.buildUnlocked(applicationContext, repository, parsed)
                } else {
                    FillResponseBuilder.buildLockedAuthPlaceholder(applicationContext, parsed).also { placeholder ->
                        if (placeholder != null) {
                            AutofillLogStore.record(
                                applicationContext,
                                AutofillLogEvent(
                                    target = target,
                                    isBrowserRequest = parsed.isBrowserRequest,
                                    outcome = AutofillLogOutcome.LOCKED_PLACEHOLDER
                                )
                            )
                        }
                    }
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) Log.d(TAG, "failed to build FillResponse", e)
                AutofillLogStore.record(
                    applicationContext,
                    AutofillLogEvent(
                        target = target,
                        isBrowserRequest = parsed.isBrowserRequest,
                        outcome = AutofillLogOutcome.ERROR,
                        errorClass = e::class.simpleName
                    )
                )
                null
            }
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "onFillRequest result: ${if (response == null) "no candidates" else "response built"}")
            }
            withContext(Dispatchers.Main) {
                callback.onSuccess(response)
            }
        }
        cancellationSignal.setOnCancelListener { job.cancel() }
    }

    override fun onSaveRequest(request: SaveRequest, callback: SaveCallback) {
        callback.onFailure(getString(R.string.autofill_save_not_supported))
    }
}
