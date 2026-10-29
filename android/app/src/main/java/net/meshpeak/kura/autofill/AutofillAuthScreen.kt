package net.meshpeak.kura.autofill

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.fragment.app.FragmentActivity
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import net.meshpeak.kura.credential.UserVerificationPrompt
import net.meshpeak.kura.data.session.VaultSession
import net.meshpeak.kura.ui.auth.LockScreen
import net.meshpeak.kura.ui.auth.RecoveryScreen
import net.meshpeak.kura.ui.navigation.LoadingScreen
import net.meshpeak.kura.ui.theme.KuraTheme
import net.meshpeak.kura.viewmodel.AppState
import net.meshpeak.kura.viewmodel.AppViewModel

/**
 * AutofillServiceの認証トランポリンActivity（[AutofillUnlockActivity], [AutofillTotpResolveActivity]）
 * が共有するvaultロック解除UI。appStateに応じてLoadingScreen/LockScreen(+Recovery)/即時コールバックを
 * 出し分けるだけで、解除後に何をするか（FillResponseを返す/TOTPコードを解決する）は呼び出し側に委ねる。
 *
 * [onUnlocked]の引数は、この操作のためにユーザーを認証したか（PasskeyのUVフラグに使う）。
 * ロック画面でアンロックした場合はtrue。アンロック済みだった場合は、[verifyUserWhenUnlocked]が
 * trueなら[UserVerificationPrompt]で本人確認し、その結果を渡す。
 */
@Composable
fun AutofillAuthScreen(
    appViewModel: AppViewModel,
    onUnlocked: (userVerified: Boolean) -> Unit,
    onLogout: () -> Unit,
    verifyUserWhenUnlocked: Boolean = false,
    onVerificationCanceled: () -> Unit = onLogout
) {
    KuraTheme {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            val appState by appViewModel.appState.collectAsState()
            when (appState) {
                AppState.LOADING -> LoadingScreen()
                AppState.LOCKED -> AutofillAuthNavHost(
                    appViewModel = appViewModel,
                    onUnlocked = onUnlocked,
                    onLogout = onLogout
                )
                AppState.UNLOCKED -> {
                    val activity = LocalContext.current as FragmentActivity
                    LaunchedEffect(Unit) {
                        when {
                            !verifyUserWhenUnlocked -> onUnlocked(false)
                            VaultSession.wasUserVerifiedRecently() -> onUnlocked(true)
                            else -> UserVerificationPrompt.show(activity) { result ->
                                when (result) {
                                    UserVerificationPrompt.Result.VERIFIED -> onUnlocked(true)
                                    UserVerificationPrompt.Result.UNAVAILABLE -> onUnlocked(false)
                                    UserVerificationPrompt.Result.CANCELED -> onVerificationCanceled()
                                }
                            }
                        }
                    }
                }
                AppState.ONBOARDING -> {
                    LaunchedEffect(Unit) { onLogout() }
                }
            }
        }
    }
}

@Composable
private fun AutofillAuthNavHost(
    appViewModel: AppViewModel,
    onUnlocked: (userVerified: Boolean) -> Unit,
    onLogout: () -> Unit
) {
    val navController = rememberNavController()
    val onUnlockedByUser = {
        VaultSession.markUserVerified()
        onUnlocked(true)
    }
    NavHost(navController = navController, startDestination = "lock") {
        composable("lock") {
            LockScreen(
                appViewModel = appViewModel,
                onUnlocked = onUnlockedByUser,
                onRecovery = { navController.navigate("recovery") },
                onLogout = onLogout
            )
        }
        composable("recovery") {
            RecoveryScreen(
                appViewModel = appViewModel,
                onUnlocked = onUnlockedByUser,
                onBack = { navController.popBackStack() }
            )
        }
    }
}
