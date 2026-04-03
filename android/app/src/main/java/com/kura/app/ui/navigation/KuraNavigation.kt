package com.kura.app.ui.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.kura.app.viewmodel.AppState
import com.kura.app.viewmodel.AppViewModel
import com.kura.app.ui.onboarding.*
import com.kura.app.ui.auth.*
import com.kura.app.ui.entries.*
import com.kura.app.ui.home.*
import com.kura.app.ui.labels.*
import com.kura.app.ui.tools.*
import com.kura.app.ui.sync.*
import com.kura.app.ui.settings.*
import kotlinx.coroutines.launch

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
    const val HOME = "home"
    const val ENTRY_LIST = "entries"
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
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route

    ModalNavigationDrawer(
        drawerState = drawerState,
        gesturesEnabled = currentRoute == Routes.HOME,
        drawerContent = {
            ModalDrawerSheet(modifier = Modifier.width(300.dp)) {
                // Header
                Column(modifier = Modifier.padding(24.dp)) {
                    Icon(
                        Icons.Default.Key,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text("kura", style = MaterialTheme.typography.headlineSmall)
                    Text(
                        "パスワードマネージャー",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }

                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp))
                Spacer(modifier = Modifier.height(8.dp))

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Sync, contentDescription = null) },
                    label = { Text("同期") },
                    selected = currentRoute == Routes.SYNC,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(Routes.SYNC) { launchSingleTop = true }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.AutoAwesome, contentDescription = null) },
                    label = { Text("パスワード生成") },
                    selected = currentRoute == Routes.PASSWORD_GENERATOR,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(Routes.PASSWORD_GENERATOR) { launchSingleTop = true }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Label, contentDescription = null) },
                    label = { Text("ラベル管理") },
                    selected = currentRoute == Routes.LABEL_MANAGER,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(Routes.LABEL_MANAGER) { launchSingleTop = true }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Delete, contentDescription = null) },
                    label = { Text("ゴミ箱") },
                    selected = currentRoute == Routes.TRASH,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(Routes.TRASH) { launchSingleTop = true }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )

                HorizontalDivider(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp))

                NavigationDrawerItem(
                    icon = { Icon(Icons.Default.Settings, contentDescription = null) },
                    label = { Text("設定") },
                    selected = currentRoute == Routes.SETTINGS,
                    onClick = {
                        scope.launch { drawerState.close() }
                        navController.navigate(Routes.SETTINGS) { launchSingleTop = true }
                    },
                    modifier = Modifier.padding(horizontal = 12.dp)
                )
            }
        }
    ) {
        NavHost(
            navController = navController,
            startDestination = Routes.HOME
        ) {
            composable(Routes.HOME) {
                HomeScreen(
                    appViewModel = appViewModel,
                    onOpenDrawer = { scope.launch { drawerState.open() } },
                    onEntryClick = { id -> navController.navigate(Routes.entryDetail(id)) },
                    onCreateClick = { navController.navigate(Routes.ENTRY_CREATE) }
                )
            }
            composable(
                Routes.ENTRY_LIST + "?type={type}&favorites={favorites}",
                arguments = listOf(
                    navArgument("type") { type = NavType.StringType; defaultValue = "" },
                    navArgument("favorites") { type = NavType.BoolType; defaultValue = false }
                )
            ) { backStackEntry ->
                val type = backStackEntry.arguments?.getString("type")?.ifEmpty { null }
                val favorites = backStackEntry.arguments?.getBoolean("favorites") ?: false
                EntryListScreen(
                    appViewModel = appViewModel,
                    onEntryClick = { id -> navController.navigate(Routes.entryDetail(id)) },
                    onCreateClick = { navController.navigate(Routes.ENTRY_CREATE) },
                    onlyFavorites = favorites,
                    initialType = type,
                    onBack = { navController.popBackStack() }
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
                    labelId = labelId,
                    onBack = { navController.popBackStack() }
                )
            }
            composable(Routes.PASSWORD_GENERATOR) {
                PasswordGeneratorScreen(
                    appViewModel = appViewModel,
                    onBack = { navController.popBackStack() }
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
