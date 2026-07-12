package net.meshpeak.kura.autofill

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
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
 */
@Composable
fun AutofillAuthScreen(
    appViewModel: AppViewModel,
    onUnlocked: () -> Unit,
    onLogout: () -> Unit
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
                    LaunchedEffect(Unit) { onUnlocked() }
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
