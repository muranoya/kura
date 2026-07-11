package net.meshpeak.kura.autofill

import android.content.Intent
import android.os.Bundle
import android.view.autofill.AutofillManager
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import kotlinx.coroutines.launch
import net.meshpeak.kura.autofill.model.ParsedLoginForm
import net.meshpeak.kura.autofill.model.getParsedLoginForm
import net.meshpeak.kura.ui.auth.LockScreen
import net.meshpeak.kura.ui.auth.RecoveryScreen
import net.meshpeak.kura.ui.navigation.LoadingScreen
import net.meshpeak.kura.ui.theme.KuraTheme
import net.meshpeak.kura.viewmodel.AppState
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
        if (parsed.usernameFieldId == null && parsed.passwordFieldId == null) {
            finishCanceled()
            return
        }

        setContent {
            KuraTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    val appState by appViewModel.appState.collectAsState()
                    when (appState) {
                        AppState.LOADING -> LoadingScreen()
                        AppState.LOCKED -> AutofillAuthNavHost(
                            appViewModel = appViewModel,
                            onUnlocked = { finishWithFillResponse(parsed) },
                            onLogout = { finishCanceled() }
                        )
                        AppState.UNLOCKED -> {
                            LaunchedEffect(Unit) { finishWithFillResponse(parsed) }
                        }
                        AppState.ONBOARDING -> {
                            LaunchedEffect(Unit) { finishCanceled() }
                        }
                    }
                }
            }
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

@Composable
private fun AutofillAuthNavHost(
    appViewModel: AppViewModel,
    onUnlocked: () -> Unit,
    onLogout: () -> Unit
) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = "lock") {
        composable("lock") {
            LockScreen(
                appViewModel = appViewModel,
                onUnlocked = onUnlocked,
                onRecovery = { navController.navigate("recovery") },
                onLogout = onLogout
            )
        }
        composable("recovery") {
            RecoveryScreen(
                appViewModel = appViewModel,
                onUnlocked = onUnlocked,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
