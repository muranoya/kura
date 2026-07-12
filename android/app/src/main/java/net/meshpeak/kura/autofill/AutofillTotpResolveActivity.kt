package net.meshpeak.kura.autofill

import android.content.Intent
import android.os.Bundle
import android.service.autofill.Dataset
import android.util.Log
import android.view.autofill.AutofillManager
import android.view.autofill.AutofillValue
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.autofill.model.TotpResolveRequest
import net.meshpeak.kura.autofill.model.getTotpResolveRequest
import net.meshpeak.kura.data.model.CustomField
import net.meshpeak.kura.data.model.CustomFieldType
import net.meshpeak.kura.viewmodel.AppViewModel

private const val TAG = "KuraAutofill"

/**
 * TOTP専用Dataset（Dataset単位認証、docs/android-autofillservice.md参照）選択時に起動される
 * トランポリンActivity。TOTPコードは30秒程度で失効するため、`onFillRequest`時点で
 * 生成・埋め込みはせず、ユーザーが実際に候補を選んだこの瞬間に生成する。
 *
 * [AutofillUnlockActivity] と異なり、返す値は `FillResponse` ではなく `Dataset` 単体
 * （選択されたDataset自体を置き換える、Dataset単位認証のセマンティクス）。
 * 選択までの間にvaultが自動ロックされている可能性があるため、[AutofillUnlockActivity] と
 * 同様に [AutofillAuthScreen] を経由して認証を挟む。
 */
class AutofillTotpResolveActivity : AppCompatActivity() {

    private val appViewModel: AppViewModel by viewModels { AppViewModel.Factory }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val request = intent.getTotpResolveRequest()
        if (request == null) {
            finishCanceled()
            return
        }

        setContent {
            AutofillAuthScreen(
                appViewModel = appViewModel,
                onUnlocked = { finishWithTotpDataset(request) },
                onLogout = { finishCanceled() }
            )
        }
    }

    private fun finishWithTotpDataset(request: TotpResolveRequest) {
        lifecycleScope.launch {
            val dataset = try {
                resolveTotpDataset(request)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) Log.d(TAG, "failed to resolve TOTP dataset", e)
                null
            }
            if (dataset != null) {
                val result = Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset)
                setResult(RESULT_OK, result)
            } else {
                setResult(RESULT_CANCELED)
            }
            finish()
        }
    }

    private suspend fun resolveTotpDataset(request: TotpResolveRequest): Dataset? {
        val entry = appViewModel.repository.getEntry(request.entryId)
        val customFields = entry.customFields?.let {
            Json.decodeFromString<List<CustomField>>(it)
        } ?: emptyList()
        val totpField = customFields.firstOrNull { it.fieldType == CustomFieldType.TOTP.value } ?: return null
        val code = appViewModel.repository.generateTotpFromValue(totpField.value)
        // 認証解決後のDatasetはUIに再表示されないためpresentationの内容自体に意味はないが、
        // Dataset.Builder(RemoteViews)コンストラクタ（API 26〜）がminSdk 26との互換性を保つ
        // 唯一の選択肢（無引数コンストラクタはAPI 30以降）。
        val presentation = FillResponseBuilder.simplePresentation(applicationContext, totpField.name)
        return Dataset.Builder(presentation)
            .setValue(request.totpFieldId, AutofillValue.forText(code))
            .build()
    }

    private fun finishCanceled() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
