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
import net.meshpeak.kura.data.repository.IVaultRepository
import net.meshpeak.kura.data.repository.VaultRepository

private const val TAG = "KuraAutofill"

/**
 * v1スコープはネイティブアプリのログインフォームのみ（docs/android-autofillservice.md 1-1）。
 * onSaveRequest（新規ログイン保存提案）は将来課題として未対応。
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
            callback.onSuccess(null)
            return
        }

        val parsed = AssistStructureParser.parse(structure)
        if (parsed.isBrowserRequest || parsed.packageName == null) {
            // ブラウザ由来リクエスト、またはパッケージ名不明: 対象外（Section 1-6, 3-1-2）
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "skipping: isBrowserRequest=${parsed.isBrowserRequest} packageName=${parsed.packageName}")
            }
            callback.onSuccess(null)
            return
        }
        if (parsed.usernameFieldId == null && parsed.passwordFieldId == null && parsed.totpFieldId == null) {
            if (BuildConfig.DEBUG) Log.d(TAG, "skipping: no username/password/totp field detected")
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
                    FillResponseBuilder.buildLockedAuthPlaceholder(applicationContext, parsed)
                }
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) Log.d(TAG, "failed to build FillResponse", e)
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
