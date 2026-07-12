package net.meshpeak.kura.autofill

import android.content.Intent
import android.os.Bundle
import android.view.autofill.AutofillManager
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import net.meshpeak.kura.autofill.model.ParsedLoginForm
import net.meshpeak.kura.autofill.model.getParsedLoginForm
import net.meshpeak.kura.viewmodel.AppViewModel

/**
 * onFillRequest時にvaultがロック中だった場合の認証プレースホルダーから起動される。
 * LockScreen/RecoveryScreenはコード変更なしでそのまま再利用する
 * （BiometricHelperはContext非依存、BiometricPromptにはFragmentActivityが必要
 * という既存の設計上、AppCompatActivityであれば問題なく動作するため）。
 */
class AutofillUnlockActivity : AppCompatActivity() {

    private val appViewModel: AppViewModel by viewModels { AppViewModel.Factory }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val parsed = intent.getParsedLoginForm()
        if (parsed.usernameFieldId == null && parsed.passwordFieldId == null && parsed.totpFieldId == null) {
            finishCanceled()
            return
        }

        setContent {
            AutofillAuthScreen(
                appViewModel = appViewModel,
                onUnlocked = { finishWithFillResponse(parsed) },
                onLogout = { finishCanceled() }
            )
        }
    }

    private fun finishWithFillResponse(parsed: ParsedLoginForm) {
        lifecycleScope.launch {
            val response = try {
                FillResponseBuilder.buildUnlocked(applicationContext, appViewModel.repository, parsed)
            } catch (_: Exception) {
                null
            }
            if (response != null) {
                val result = Intent().putExtra(AutofillManager.EXTRA_AUTHENTICATION_RESULT, response)
                setResult(RESULT_OK, result)
            } else {
                setResult(RESULT_CANCELED)
            }
            finish()
        }
    }

    private fun finishCanceled() {
        setResult(RESULT_CANCELED)
        finish()
    }
}
