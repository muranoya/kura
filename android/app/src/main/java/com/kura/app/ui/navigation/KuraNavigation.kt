package com.kura.app.ui.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.kura.app.viewmodel.AppState
import com.kura.app.viewmodel.AppViewModel
import com.kura.app.ui.onboarding.*
import com.kura.app.ui.auth.*
import com.kura.app.ui.entries.*
import com.kura.app.ui.labels.*
import com.kura.app.ui.tools.*
import com.kura.app.ui.sync.*
import com.kura.app.ui.settings.*

object Routes {
    // Onboarding
    const val WELCOME = "welcome"
    const val STORAGE_SETUP = "storage_setup"
    const val MASTER_PASSWORD = "master_password"
    const val RECOVERY_KEY = "recovery_key/{recoveryKey}"
    const val UNLOCK_EXISTING = "unlock_existing"

    // Auth
    const val LOCK = "lock"
    const val RECOVERY = "recovery"

    // Main
    const val ENTRY_LIST = "entries"
    const val FAVORITES = "favorites"
    const val ENTRY_DETAIL = "entries/{entryId}"
    const val ENTRY_CREATE = "entries/create"
    const val ENTRY_EDIT = "entries/{entryId}/edit"
    const val TRASH = "trash"
    const val LABEL_MANAGER = "labels"
    const val LABEL_ENTRIES = "labels/{labelId}/entries"
    const val PASSWORD_GENERATOR = "password_generator"
    const val SYNC = "sync"
    const val SETTINGS = "settings"

    fun recoveryKey(key: String) = "recovery_key/$key"
    fun entryDetail(id: String) = "entries/$id"
    fun entryEdit(id: String) = "entries/$id/edit"
    fun labelEntries(labelId: String) = "labels/$labelId/entries"
}

sealed class BottomNavItem(val route: String, val label: String, val icon: @Composable () -> Unit) {
    data object Items : BottomNavItem(Routes.ENTRY_LIST, "アイテム", { Icon(Icons.Default.Key, contentDescription = null) })
    data object Favorites : BottomNavItem(Routes.FAVORITES, "お気に入り", { Icon(Icons.Default.Star, contentDescription = null) })
    data object Generator : BottomNavItem(Routes.PASSWORD_GENERATOR, "生成", { Icon(Icons.Default.AutoAwesome, contentDescription = null) })
    data object Sync : BottomNavItem(Routes.SYNC, "同期", { Icon(Icons.Default.Sync, contentDescription = null) })
    data object Settings : BottomNavItem(Routes.SETTINGS, "設定", { Icon(Icons.Default.Settings, contentDescription = null) })
}

val bottomNavItems = listOf(
    BottomNavItem.Items,
    BottomNavItem.Favorites,
    BottomNavItem.Generator,
)

@Composable
fun KuraApp(appViewModel: AppViewModel = viewModel()) {
    val appState by appViewModel.appState.collectAsState()

    when (appState) {
        AppState.LOADING -> LoadingScreen()
        AppState.ONBOARDING -> OnboardingNavHost(appViewModel)
        AppState.LOCKED -> AuthNavHost(appViewModel)
        AppState.UNLOCKED -> MainNavHost(appViewModel)
    }
}

@Composable
fun LoadingScreen() {
    Box(modifier = Modifier.fillMaxSize()) {
        CircularProgressIndicator(
            modifier = Modifier.align(androidx.compose.ui.Alignment.Center)
        )
    }
}

@Composable
fun OnboardingNavHost(appViewModel: AppViewModel) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Routes.WELCOME) {
        composable(Routes.WELCOME) {
            WelcomeScreen(onStart = { navController.navigate(Routes.STORAGE_SETUP) })
        }
        composable(Routes.STORAGE_SETUP) {
            StorageSetupScreen(
                appViewModel = appViewModel,
                onNewVault = { navController.navigate(Routes.MASTER_PASSWORD) },
                onExistingVault = { navController.navigate(Routes.UNLOCK_EXISTING) },
                onBack = { navController.popBackStack() }
            )
        }
        composable(Routes.MASTER_PASSWORD) {
            MasterPasswordScreen(
                appViewModel = appViewModel,
                onVaultCreated = { recoveryKey ->
                    navController.navigate(Routes.recoveryKey(recoveryKey))
                },
                onBack = { navController.popBackStack() }
            )
        }
        composable(
            Routes.RECOVERY_KEY,
            arguments = listOf(navArgument("recoveryKey") { type = NavType.StringType })
        ) { backStackEntry ->
            val recoveryKey = backStackEntry.arguments?.getString("recoveryKey") ?: ""
            RecoveryKeyScreen(
                recoveryKey = recoveryKey,
                appViewModel = appViewModel,
                onComplete = {
                    appViewModel.setAppState(AppState.UNLOCKED)
                }
            )
        }
        composable(Routes.UNLOCK_EXISTING) {
            UnlockExistingVaultScreen(
                appViewModel = appViewModel,
                onUnlocked = { appViewModel.setAppState(AppState.UNLOCKED) },
                onBack = { navController.popBackStack() }
            )
        }
    }
}

@Composable
fun AuthNavHost(appViewModel: AppViewModel) {
    val navController = rememberNavController()
    NavHost(navController = navController, startDestination = Routes.LOCK) {
        composable(Routes.LOCK) {
            LockScreen(
                appViewModel = appViewModel,
                onUnlocked = { appViewModel.setAppState(AppState.UNLOCKED) },
                onRecovery = { navController.navigate(Routes.RECOVERY) },
                onLogout = { appViewModel.setAppState(AppState.ONBOARDING) }
            )
        }
        composable(Routes.RECOVERY) {
            RecoveryScreen(
                appViewModel = appViewModel,
                onUnlocked = { appViewModel.setAppState(AppState.UNLOCKED) },
                onBack = { navController.popBackStack() }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MainNavHost(appViewModel: AppViewModel) {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    val showBottomBar = currentRoute in bottomNavItems.map { it.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        NavigationBarItem(
                            icon = item.icon,
                            label = { Text(item.label) },
                            selected = currentRoute == item.route,
                            onClick = {
                                if (currentRoute != item.route) {
                                    navController.navigate(item.route) {
                                        popUpTo(navController.graph.startDestinationId) {
                                            saveState = true
                                        }
                                        launchSingleTop = true
                                        restoreState = true
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Routes.ENTRY_LIST,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Routes.ENTRY_LIST) {
                EntryListScreen(
                    appViewModel = appViewModel,
                    onEntryClick = { id -> navController.navigate(Routes.entryDetail(id)) },
                    onCreateClick = { navController.navigate(Routes.ENTRY_CREATE) },
                    onlyFavorites = false,
                    onSettings = { navController.navigate(Routes.SETTINGS) }
                )
            }
            composable(Routes.FAVORITES) {
                EntryListScreen(
                    appViewModel = appViewModel,
                    onEntryClick = { id -> navController.navigate(Routes.entryDetail(id)) },
                    onCreateClick = { navController.navigate(Routes.ENTRY_CREATE) },
                    onlyFavorites = true,
                    onSettings = { navController.navigate(Routes.SETTINGS) }
                )
            }
            composable(
                Routes.ENTRY_DETAIL,
                arguments = listOf(navArgument("entryId") { type = NavType.StringType })
            ) { backStackEntry ->
                val entryId = backStackEntry.arguments?.getString("entryId") ?: ""
                EntryDetailScreen(
                    entryId = entryId,
                    appViewModel = appViewModel,
                    onBack = { navController.popBackStack() },
                    onEdit = { navController.navigate(Routes.entryEdit(entryId)) }
                )
            }
            composable(Routes.ENTRY_CREATE) {
                EntryCreateScreen(
                    appViewModel = appViewModel,
                    onBack = { navController.popBackStack() },
                    onCreated = { id ->
                        navController.popBackStack()
                        navController.navigate(Routes.entryDetail(id))
                    }
                )
            }
            composable(
                Routes.ENTRY_EDIT,
                arguments = listOf(navArgument("entryId") { type = NavType.StringType })
            ) { backStackEntry ->
                val entryId = backStackEntry.arguments?.getString("entryId") ?: ""
                EntryEditScreen(
                    entryId = entryId,
                    appViewModel = appViewModel,
                    onBack = { navController.popBackStack() },
                    onSaved = { navController.popBackStack() }
                )
            }
            composable(Routes.TRASH) {
                TrashScreen(
                    appViewModel = appViewModel,
                    onBack = { navController.popBackStack() }
                )
            }
            composable(Routes.LABEL_MANAGER) {
                LabelManagerScreen(
                    appViewModel = appViewModel,
                    onBack = { navController.popBackStack() },
                    onLabelClick = { labelId ->
                        navController.navigate(Routes.labelEntries(labelId))
                    }
                )
            }
            composable(
                Routes.LABEL_ENTRIES,
                arguments = listOf(navArgument("labelId") { type = NavType.StringType })
            ) { backStackEntry ->
                val labelId = backStackEntry.arguments?.getString("labelId") ?: ""
                EntryListScreen(
                    appViewModel = appViewModel,
                    onEntryClick = { id -> navController.navigate(Routes.entryDetail(id)) },
                    onCreateClick = { navController.navigate(Routes.ENTRY_CREATE) },
                    labelId = labelId
                )
            }
            composable(Routes.PASSWORD_GENERATOR) {
                PasswordGeneratorScreen(
                    appViewModel = appViewModel,
                    onSettings = { navController.navigate(Routes.SETTINGS) }
                )
            }
            composable(Routes.SYNC) {
                SyncScreen(
                    appViewModel = appViewModel,
                    onBack = { navController.popBackStack() }
                )
            }
            composable(Routes.SETTINGS) {
                SettingsScreen(
                    appViewModel = appViewModel,
                    onTrash = { navController.navigate(Routes.TRASH) },
                    onLabels = { navController.navigate(Routes.LABEL_MANAGER) },
                    onSync = { navController.navigate(Routes.SYNC) },
                    onBack = { navController.popBackStack() },
                    onLogout = {
                        appViewModel.setAppState(AppState.ONBOARDING)
                    }
                )
            }
        }
    }
}
