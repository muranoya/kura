package net.meshpeak.kura.autofill

import android.content.Intent
import android.os.Bundle
import android.service.autofill.Dataset
import android.view.autofill.AutofillManager
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import kotlinx.coroutines.launch
import net.meshpeak.kura.R
import net.meshpeak.kura.autofill.model.ParsedLoginForm
import net.meshpeak.kura.autofill.model.getParsedLoginForm
import net.meshpeak.kura.viewmodel.AppViewModel

/**
 * 通常のオートフィル候補が1件も出せなかった場合に提示する「アイテムを探す」候補
 * （Dataset単位認証、[FillResponseBuilder]の`buildManualSearchDataset`参照）から
 * 起動されるトランポリンActivity。[AutofillTotpResolveActivity]と同様、選択までの間に
 * vaultが自動ロックされている可能性があるため[AutofillAuthScreen]で認証を挟む。
 *
 * TOTPの場合と異なり、認証後は即座に処理を終えず[AutofillPickerScreen]で検索・選択させる。
 * 選択したエントリにusername/passwordどちらも無くDataset構築に失敗した場合は、画面を
 * 閉じずにエラー表示のうえ選び直せるようにする（デッドエンドを避ける）。
 */
class AutofillPickerActivity : AppCompatActivity() {

    private val appViewModel: AppViewModel by viewModels { AppViewModel.Factory }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val parsed = intent.getParsedLoginForm()
        if (parsed.usernameFieldId == null && parsed.passwordFieldId == null) {
            finishCanceled()
            return
        }

        setContent {
            var showPicker by remember { mutableStateOf(false) }
            var errorMessage by remember { mutableStateOf<String?>(null) }
            val scope = rememberCoroutineScope()

            if (showPicker) {
                AutofillPickerScreen(
                    appViewModel = appViewModel,
                    errorMessage = errorMessage,
                    onSelect = { entryId ->
                        errorMessage = null
                        scope.launch {
                            val dataset = try {
                                resolveDataset(parsed, entryId)
                            } catch (_: Exception) {
                                null
                            }
                            if (dataset != null) {
                                finishWithDataset(dataset)
                            } else {
                                errorMessage = getString(R.string.autofill_picker_no_value)
                            }
                        }
                    },
                    onCancel = { finishCanceled() }
                )
            } else {
                AutofillAuthScreen(
                    appViewModel = appViewModel,
                    onUnlocked = { showPicker = true },
                    onLogout = { finishCanceled() }
                )
            }
        }
    }

    private suspend fun resolveDataset(parsed: ParsedLoginForm, entryId: String): Dataset? {
        val entry = appViewModel.repository.getEntry(entryId)
        return FillResponseBuilder.buildLoginDataset(
            applicationContext,
            entry.name,
            entry.typedValue,
            parsed.usernameFieldId,
            parsed.passwordFieldId
        )
    }

    private fun finishWithDataset(dataset: Dataset) {
        val result = Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, dataset)
        setResult(RESULT_OK, result)
        finish()
    }

    private fun finishCanceled() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
