package net.meshpeak.kura.ui.settings

import android.content.Context
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.widget.Toast
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.os.LocaleListCompat
import androidx.appcompat.app.AppCompatDelegate
import androidx.fragment.app.FragmentActivity
import net.meshpeak.kura.R
import net.meshpeak.kura.bridge.VaultBridge
import net.meshpeak.kura.data.model.S3Config
import net.meshpeak.kura.ui.components.ConfirmDialog
import net.meshpeak.kura.util.ClipboardUtil
import net.meshpeak.kura.util.findActivity
import net.meshpeak.kura.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    appViewModel: AppViewModel,
    onOpenDrawer: () -> Unit = {},
    onLogout: () -> Unit
) {
    var showChangePasswordDialog by remember { mutableStateOf(false) }
    var showRotateDekDialog by remember { mutableStateOf(false) }
    var showRegenRecoveryDialog by remember { mutableStateOf(false) }
    var showRecoveryKeyDisplay by remember { mutableStateOf(false) }
    var recoveryKeyValue by remember { mutableStateOf("") }
    var showLogoutDialog by remember { mutableStateOf(false) }
    var showBiometricEnrollDialog by remember { mutableStateOf(false) }
    var showPasscodeSetupDialog by remember { mutableStateOf(false) }
    var showTransferDialog by remember { mutableStateOf(false) }
    var showTransferPasswordConfirm by remember { mutableStateOf(false) }
    var showExportDialog by remember { mutableStateOf(false) }
    var showExportPasswordConfirm by remember { mutableStateOf(false) }
    var exportJson by remember { mutableStateOf<String?>(null) }

    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val exportFileLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        if (uri != null && exportJson != null) {
            try {
                context.contentResolver.openOutputStream(uri)?.use { output ->
                    output.write(exportJson!!.toByteArray())
                }
                Toast.makeText(context, context.getString(R.string.export_success), Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                Toast.makeText(context, context.getString(R.string.export_failed, e.message ?: ""), Toast.LENGTH_SHORT).show()
            }
            exportJson = null
        }
    }

    val autolockMinutes by appViewModel.preferences.autolockMinutesFlow
        .collectAsState(initial = 5)
    var autolockExpanded by remember { mutableStateOf(false) }

    val clipboardClearSeconds by appViewModel.preferences.clipboardClearSecondsFlow
        .collectAsState(initial = 30)
    var clipboardClearExpanded by remember { mutableStateOf(false) }

    val canUseBiometric = remember {
        BiometricManager.from(context).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS
    }
    val biometricEnabled by appViewModel.preferences.biometricEnabledFlow
        .collectAsState(initial = false)
    val passcodeEnabled by appViewModel.preferences.passcodeEnabledFlow
        .collectAsState(initial = false)
    val passcodeConfigured = passcodeEnabled && appViewModel.passcodeHelper.isSetUp()

    val s3ConfigJson by appViewModel.preferences.s3ConfigFlow
        .collectAsState(initial = null)
    val s3Config = remember(s3ConfigJson) {
        s3ConfigJson?.let {
            try {
                Json.decodeFromString<S3Config>(it)
            } catch (_: Exception) { null }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Default.Menu, contentDescription = stringResource(R.string.cd_menu))
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // セキュリティセクション
            Text(stringResource(R.string.settings_section_security), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            Card(onClick = { showChangePasswordDialog = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_change_master_password)) },
                    supportingContent = { Text(stringResource(R.string.settings_change_master_password_description)) },
                    leadingContent = { Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Card(onClick = { showRotateDekDialog = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_dek_rotate)) },
                    supportingContent = { Text(stringResource(R.string.settings_dek_rotate_description_long)) },
                    leadingContent = { Icon(Icons.Default.VpnKey, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Card(onClick = { showRegenRecoveryDialog = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_recovery_key_rotate)) },
                    supportingContent = { Text(stringResource(R.string.settings_recovery_key_rotate_description)) },
                    leadingContent = { Icon(Icons.Default.Key, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_autolock)) },
                    supportingContent = { Text(stringResource(R.string.settings_autolock_description_background)) },
                    leadingContent = {
                        Icon(Icons.Default.Timer, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    },
                    trailingContent = {
                        ExposedDropdownMenuBox(
                            expanded = autolockExpanded,
                            onExpandedChange = { autolockExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = if (autolockMinutes == 0) stringResource(R.string.settings_autolock_disabled) else stringResource(R.string.settings_autolock_minutes_format, autolockMinutes),
                                onValueChange = {},
                                readOnly = true,
                                modifier = Modifier
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                    .width(120.dp),
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = autolockExpanded) },
                                singleLine = true
                            )
                            ExposedDropdownMenu(
                                expanded = autolockExpanded,
                                onDismissRequest = { autolockExpanded = false }
                            ) {
                                listOf(0, 1, 3, 5, 10, 15, 30, 60).forEach { minutes ->
                                    DropdownMenuItem(
                                        text = { Text(if (minutes == 0) stringResource(R.string.settings_autolock_disabled) else stringResource(R.string.settings_autolock_minutes_format, minutes)) },
                                        onClick = {
                                            scope.launch { appViewModel.preferences.saveAutolockMinutes(minutes) }
                                            autolockExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                )
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_clipboard_clear)) },
                    supportingContent = { Text(stringResource(R.string.settings_clipboard_clear_description)) },
                    leadingContent = {
                        Icon(Icons.Default.ContentPaste, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    },
                    trailingContent = {
                        ExposedDropdownMenuBox(
                            expanded = clipboardClearExpanded,
                            onExpandedChange = { clipboardClearExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = when (clipboardClearSeconds) {
                                    0 -> stringResource(R.string.settings_clipboard_clear_disabled)
                                    in 1..59 -> stringResource(R.string.settings_clipboard_clear_seconds, clipboardClearSeconds)
                                    else -> stringResource(R.string.settings_autolock_minutes_format, clipboardClearSeconds / 60)
                                },
                                onValueChange = {},
                                readOnly = true,
                                modifier = Modifier
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                    .width(120.dp),
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = clipboardClearExpanded) },
                                singleLine = true
                            )
                            ExposedDropdownMenu(
                                expanded = clipboardClearExpanded,
                                onDismissRequest = { clipboardClearExpanded = false }
                            ) {
                                val clipboardOptions = listOf(
                                    0 to stringResource(R.string.settings_clipboard_clear_disabled),
                                    30 to stringResource(R.string.settings_clipboard_clear_30s),
                                    60 to stringResource(R.string.settings_clipboard_clear_1min),
                                    120 to stringResource(R.string.settings_clipboard_clear_2min)
                                )
                                clipboardOptions.forEach { (seconds, label) ->
                                    DropdownMenuItem(
                                        text = { Text(label) },
                                        onClick = {
                                            scope.launch { appViewModel.preferences.saveClipboardClearSeconds(seconds) }
                                            clipboardClearExpanded = false
                                        }
                                    )
                                }
                            }
                        }
                    }
                )
            }

            if (canUseBiometric) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(stringResource(R.string.settings_biometric)) },
                        supportingContent = { Text(stringResource(R.string.settings_biometric_description)) },
                        leadingContent = {
                            Icon(Icons.Default.Fingerprint, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                        },
                        trailingContent = {
                            Switch(
                                checked = biometricEnabled,
                                onCheckedChange = { enabled ->
                                    if (enabled) {
                                        showBiometricEnrollDialog = true
                                    } else {
                                        scope.launch {
                                            appViewModel.biometricHelper.clearAll()
                                            appViewModel.preferences.setBiometricEnabled(false)
                                        }
                                    }
                                }
                            )
                        }
                    )
                }
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_passcode)) },
                    supportingContent = { Text(stringResource(R.string.settings_passcode_description)) },
                    leadingContent = {
                        Icon(Icons.Default.Pin, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    },
                    trailingContent = {
                        Switch(
                            checked = passcodeConfigured,
                            onCheckedChange = { enabled ->
                                if (enabled) {
                                    showPasscodeSetupDialog = true
                                } else {
                                    scope.launch {
                                        appViewModel.passcodeHelper.clearAll()
                                        appViewModel.preferences.setPasscodeEnabled(false)
                                    }
                                }
                            }
                        )
                    }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // ストレージ設定セクション
            Text(stringResource(R.string.settings_section_storage), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            if (s3Config != null) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(stringResource(R.string.settings_storage_bucket)) },
                        supportingContent = { Text(s3Config.bucket) },
                        leadingContent = { Icon(Icons.Default.Cloud, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                    )
                }
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(stringResource(R.string.settings_storage_region)) },
                        supportingContent = { Text(s3Config.region) },
                        leadingContent = { Icon(Icons.Default.Public, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                    )
                }
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(stringResource(R.string.settings_storage_file_path)) },
                        supportingContent = { Text(s3Config.key) },
                        leadingContent = { Icon(Icons.Default.Description, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                    )
                }
                if (!s3Config.endpoint.isNullOrEmpty()) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        ListItem(
                            headlineContent = { Text(stringResource(R.string.settings_storage_endpoint)) },
                            supportingContent = { Text(s3Config.endpoint!!) },
                            leadingContent = { Icon(Icons.Default.Link, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                        )
                    }
                }
            } else {
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text(stringResource(R.string.settings_storage_not_configured), color = MaterialTheme.colorScheme.onSurfaceVariant) },
                        leadingContent = { Icon(Icons.Default.Cloud, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // データセクション
            Text(stringResource(R.string.settings_section_data), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            Card(onClick = { showExportPasswordConfirm = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_export_bitwarden)) },
                    supportingContent = { Text(stringResource(R.string.settings_export_bitwarden_description)) },
                    leadingContent = { Icon(Icons.Default.FileDownload, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // Transfer section
            Text(stringResource(R.string.settings_section_transfer), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            Card(onClick = { showTransferPasswordConfirm = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_transfer_card_title)) },
                    supportingContent = { Text(stringResource(R.string.settings_transfer_card_description)) },
                    leadingContent = { Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // Language section
            Text(stringResource(R.string.settings_section_language), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            var languageExpanded by remember { mutableStateOf(false) }
            val currentLocales = AppCompatDelegate.getApplicationLocales()
            val currentLanguageTag = if (currentLocales.isEmpty) "" else currentLocales.toLanguageTags().substringBefore(',')
            val languageLabel = when (currentLanguageTag) {
                "en" -> stringResource(R.string.settings_language_english)
                "ja" -> stringResource(R.string.settings_language_japanese)
                else -> stringResource(R.string.settings_language_system)
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_section_language)) },
                    leadingContent = {
                        Icon(Icons.Default.Language, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    },
                    trailingContent = {
                        ExposedDropdownMenuBox(
                            expanded = languageExpanded,
                            onExpandedChange = { languageExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = languageLabel,
                                onValueChange = {},
                                readOnly = true,
                                modifier = Modifier
                                    .menuAnchor(MenuAnchorType.PrimaryNotEditable)
                                    .width(180.dp),
                                trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = languageExpanded) },
                                singleLine = true
                            )
                            ExposedDropdownMenu(
                                expanded = languageExpanded,
                                onDismissRequest = { languageExpanded = false }
                            ) {
                                val languageOptions = listOf(
                                    "" to stringResource(R.string.settings_language_system),
                                    "en" to stringResource(R.string.settings_language_english),
                                    "ja" to stringResource(R.string.settings_language_japanese)
                                )
                                languageOptions.forEach { (tag, label) ->
                                    DropdownMenuItem(
                                        text = { Text(label) },
                                        onClick = {
                                            val locales = if (tag.isEmpty()) {
                                                LocaleListCompat.getEmptyLocaleList()
                                            } else {
                                                LocaleListCompat.forLanguageTags(tag)
                                            }
                                            AppCompatDelegate.setApplicationLocales(locales)
                                            languageExpanded = false
                                            context.findActivity()?.recreate()
                                        }
                                    )
                                }
                            }
                        }
                    }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // About section
            Text(stringResource(R.string.settings_section_about), style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                val context = LocalContext.current
                val appVersion = remember {
                    context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "?"
                }
                ListItem(
                    headlineContent = { Text(stringResource(R.string.settings_about_version)) },
                    trailingContent = { Text("v$appVersion", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // Logout
            Card(
                onClick = { showLogoutDialog = true },
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)
            ) {
                ListItem(
                    headlineContent = {
                        Text(stringResource(R.string.settings_logout_title), color = MaterialTheme.colorScheme.onErrorContainer)
                    },
                    supportingContent = {
                        Text(
                            stringResource(R.string.settings_logout_description_short),
                            color = MaterialTheme.colorScheme.onErrorContainer.copy(alpha = 0.7f)
                        )
                    },
                    leadingContent = {
                        Icon(
                            Icons.AutoMirrored.Filled.Logout,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                )
            }
        }
    }

    // Change password dialog
    if (showChangePasswordDialog) {
        PasswordChangeDialog(
            appViewModel = appViewModel,
            onDismiss = { showChangePasswordDialog = false }
        )
    }

    // Rotate DEK dialog
    if (showRotateDekDialog) {
        SinglePasswordDialog(
            title = stringResource(R.string.settings_dek_rotate),
            description = stringResource(R.string.settings_dek_rotate_description_long),
            onConfirm = { password ->
                val newKey = appViewModel.repository.rotateDek(password)
                appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                // DEKローテーション後は生体認証を無効化
                appViewModel.biometricHelper.clearAll()
                appViewModel.preferences.setBiometricEnabled(false)
                appViewModel.passcodeHelper.clearAll()
                appViewModel.preferences.setPasscodeEnabled(false)
                recoveryKeyValue = newKey
                showRotateDekDialog = false
                showRecoveryKeyDisplay = true
            },
            onDismiss = { showRotateDekDialog = false }
        )
    }

    // Regenerate recovery key dialog
    if (showRegenRecoveryDialog) {
        SinglePasswordDialog(
            title = stringResource(R.string.settings_recovery_key_rotate),
            description = stringResource(R.string.settings_recovery_key_rotate_description),
            onConfirm = { password ->
                val newKey = appViewModel.repository.regenerateRecoveryKey(password)
                appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                recoveryKeyValue = newKey
                showRegenRecoveryDialog = false
                showRecoveryKeyDisplay = true
            },
            onDismiss = { showRegenRecoveryDialog = false }
        )
    }

    // Recovery key display dialog
    if (showRecoveryKeyDisplay) {
        var copied by remember { mutableStateOf(false) }
        AlertDialog(
            onDismissRequest = { showRecoveryKeyDisplay = false },
            title = { Text(stringResource(R.string.recovery_key_new_title)) },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(stringResource(R.string.recovery_key_new_description), style = MaterialTheme.typography.bodySmall)
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Text(recoveryKeyValue, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace))
                    }
                    OutlinedButton(
                        onClick = {
                            ClipboardUtil.copyToClipboard(context, "recovery_key", recoveryKeyValue, clipboardClearSeconds, scope)
                            copied = true
                            scope.launch { delay(2000); copied = false }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(if (copied) Icons.Default.Check else Icons.Default.ContentCopy, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(if (copied) stringResource(R.string.feedback_copied) else stringResource(R.string.action_copy))
                    }
                }
            },
            confirmButton = { Button(onClick = { showRecoveryKeyDisplay = false }) { Text(stringResource(R.string.recovery_key_stored)) } }
        )
    }

    // Biometric enrollment dialog
    if (showBiometricEnrollDialog) {
        SinglePasswordDialog(
            title = stringResource(R.string.biometric_enroll_title),
            description = stringResource(R.string.biometric_enroll_description),
            onConfirm = { password ->
                // まずマスターパスワードが正しいか検証
                appViewModel.repository.verifyPassword(password)

                val activity = context as FragmentActivity
                val biometricHelper = appViewModel.biometricHelper

                biometricHelper.generateKey()
                val cipher = biometricHelper.getEncryptCipher()

                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(context.getString(R.string.app_name))
                    .setSubtitle(context.getString(R.string.biometric_enroll_prompt_subtitle))
                    .setNegativeButtonText(context.getString(R.string.action_cancel))
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build()

                val biometricPrompt = BiometricPrompt(
                    activity,
                    ContextCompat.getMainExecutor(context),
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            val authenticatedCipher = result.cryptoObject?.cipher ?: return
                            biometricHelper.encryptAndStore(authenticatedCipher, password)
                            scope.launch {
                                appViewModel.passcodeHelper.clearAll()
                                appViewModel.preferences.setPasscodeEnabled(false)
                                appViewModel.preferences.setBiometricEnabled(true)
                            }
                            showBiometricEnrollDialog = false
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            biometricHelper.clearAll()
                            Toast.makeText(context, context.getString(R.string.biometric_enroll_failed), Toast.LENGTH_SHORT).show()
                        }
                    }
                )
                biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            },
            onDismiss = { showBiometricEnrollDialog = false }
        )
    }

    // Passcode setup dialog
    if (showPasscodeSetupDialog) {
        PasscodeSetupDialog(
            appViewModel = appViewModel,
            onDismiss = { showPasscodeSetupDialog = false }
        )
    }

    // Export reauth dialog
    if (showExportPasswordConfirm) {
        SinglePasswordDialog(
            title = stringResource(R.string.reauth_master_password_title),
            description = stringResource(R.string.reauth_master_password_description),
            onConfirm = { password ->
                appViewModel.repository.verifyPassword(password)
                showExportPasswordConfirm = false
                showExportDialog = true
            },
            onDismiss = { showExportPasswordConfirm = false }
        )
    }

    // Transfer reauth dialog
    if (showTransferPasswordConfirm) {
        SinglePasswordDialog(
            title = stringResource(R.string.reauth_master_password_title),
            description = stringResource(R.string.reauth_master_password_description),
            onConfirm = { password ->
                appViewModel.repository.verifyPassword(password)
                showTransferPasswordConfirm = false
                showTransferDialog = true
            },
            onDismiss = { showTransferPasswordConfirm = false }
        )
    }

    // Transfer config dialog
    if (showTransferDialog) {
        TransferConfigDialog(
            appViewModel = appViewModel,
            clipboardClearSeconds = clipboardClearSeconds,
            onDismiss = { showTransferDialog = false }
        )
    }

    // Export dialog
    if (showExportDialog) {
        ConfirmDialog(
            title = stringResource(R.string.export_dialog_title),
            description = stringResource(R.string.export_dialog_description),
            confirmText = stringResource(R.string.action_export),
            onConfirm = {
                showExportDialog = false
                scope.launch {
                    try {
                        val json = appViewModel.repository.exportBitwardenJson()
                        exportJson = json
                        val today = java.time.LocalDate.now().toString()
                        exportFileLauncher.launch("kura-export-$today.json")
                    } catch (e: Exception) {
                        Toast.makeText(context, context.getString(R.string.export_failed, e.message ?: ""), Toast.LENGTH_SHORT).show()
                    }
                }
            },
            onCancel = { showExportDialog = false }
        )
    }

    // Logout dialog
    if (showLogoutDialog) {
        ConfirmDialog(
            title = stringResource(R.string.settings_logout_title),
            description = stringResource(R.string.settings_logout_description),
            confirmText = stringResource(R.string.action_logout),
            isDangerous = true,
            onConfirm = {
                scope.launch {
                    appViewModel.preferences.clearAll()
                    appViewModel.repository.deleteVaultFile()
                    onLogout()
                }
            },
            onCancel = { showLogoutDialog = false }
        )
    }
}

@Composable
fun PasswordChangeDialog(
    appViewModel: AppViewModel,
    onDismiss: () -> Unit
) {
    var oldPassword by remember { mutableStateOf("") }
    var newPassword by remember { mutableStateOf("") }
    var confirmPassword by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val allRequiredMsg = stringResource(R.string.password_change_all_required)
    val mismatchMsg = stringResource(R.string.password_change_mismatch)
    val sameAsOldMsg = stringResource(R.string.password_change_same_as_old)
    val failedDefaultMsg = stringResource(R.string.password_change_failed_default)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.password_change_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.password_change_description), style = MaterialTheme.typography.bodySmall)
                if (error.isNotEmpty()) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedTextField(
                    value = oldPassword, onValueChange = { oldPassword = it; error = "" },
                    label = { Text(stringResource(R.string.password_change_current)) },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
                OutlinedTextField(
                    value = newPassword, onValueChange = { newPassword = it; error = "" },
                    label = { Text(stringResource(R.string.password_change_new)) },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
                OutlinedTextField(
                    value = confirmPassword, onValueChange = { confirmPassword = it; error = "" },
                    label = { Text(stringResource(R.string.password_change_confirm)) },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    when {
                        oldPassword.isBlank() || newPassword.isBlank() || confirmPassword.isBlank() -> error = allRequiredMsg
                        newPassword != confirmPassword -> error = mismatchMsg
                        newPassword == oldPassword -> error = sameAsOldMsg
                        else -> scope.launch {
                            isLoading = true
                            try {
                                appViewModel.repository.changeMasterPassword(oldPassword, newPassword)
                                appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                                // マスターパスワード変更後は生体認証を無効化
                                appViewModel.biometricHelper.clearAll()
                                appViewModel.preferences.setBiometricEnabled(false)
                                appViewModel.passcodeHelper.clearAll()
                                appViewModel.preferences.setPasscodeEnabled(false)
                                onDismiss()
                            } catch (e: Exception) {
                                error = failedDefaultMsg
                            } finally { isLoading = false }
                        }
                    }
                },
                enabled = !isLoading
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text(stringResource(R.string.action_change))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } }
    )
}

@Composable
fun PasscodeSetupDialog(
    appViewModel: AppViewModel,
    onDismiss: () -> Unit
) {
    var masterPassword by remember { mutableStateOf("") }
    var passcode by remember { mutableStateOf("") }
    var confirmPasscode by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    val allRequiredMsg = stringResource(R.string.passcode_setup_all_required)
    val formatMsg = stringResource(R.string.passcode_setup_format)
    val mismatchMsg = stringResource(R.string.passcode_setup_mismatch)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.passcode_setup_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(stringResource(R.string.passcode_setup_description), style = MaterialTheme.typography.bodySmall)
                if (error.isNotEmpty()) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedTextField(
                    value = masterPassword,
                    onValueChange = { masterPassword = it; error = "" },
                    label = { Text(stringResource(R.string.single_password_label)) },
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation()
                )
                OutlinedTextField(
                    value = passcode,
                    onValueChange = { passcode = it.filter(Char::isDigit); error = "" },
                    label = { Text(stringResource(R.string.passcode_setup_passcode)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    visualTransformation = PasswordVisualTransformation()
                )
                OutlinedTextField(
                    value = confirmPasscode,
                    onValueChange = { confirmPasscode = it.filter(Char::isDigit); error = "" },
                    label = { Text(stringResource(R.string.passcode_setup_confirm)) },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
                    visualTransformation = PasswordVisualTransformation()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    when {
                        masterPassword.isBlank() || passcode.isBlank() || confirmPasscode.isBlank() -> error = allRequiredMsg
                        passcode.length < 4 -> error = formatMsg
                        passcode != confirmPasscode -> error = mismatchMsg
                        else -> scope.launch {
                            isLoading = true
                            try {
                                appViewModel.repository.verifyPassword(masterPassword)
                                appViewModel.passcodeHelper.encryptAndStore(passcode, masterPassword)
                                appViewModel.biometricHelper.clearAll()
                                appViewModel.preferences.setBiometricEnabled(false)
                                appViewModel.preferences.setPasscodeEnabled(true)
                                onDismiss()
                            } catch (e: Exception) {
                                error = context.getString(R.string.passcode_setup_failed, e.message ?: "")
                            } finally {
                                isLoading = false
                            }
                        }
                    }
                },
                enabled = !isLoading
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text(stringResource(R.string.action_save))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } }
    )
}

@Composable
fun SinglePasswordDialog(
    title: String,
    description: String,
    onConfirm: suspend (String) -> Unit,
    onDismiss: () -> Unit
) {
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val emptyMsg = stringResource(R.string.single_password_empty)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text(description, style = MaterialTheme.typography.bodySmall)
                if (error.isNotEmpty()) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedTextField(
                    value = password, onValueChange = { password = it; error = "" },
                    label = { Text(stringResource(R.string.single_password_label)) },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (password.isBlank()) { error = emptyMsg; return@Button }
                    scope.launch {
                        isLoading = true
                        try { onConfirm(password) } catch (e: Exception) { error = context.getString(R.string.single_password_failed, e.message ?: "") }
                        finally { isLoading = false }
                    }
                },
                enabled = !isLoading
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text(stringResource(R.string.action_execute))
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) } }
    )
}

@Composable
fun TransferConfigDialog(
    appViewModel: AppViewModel,
    clipboardClearSeconds: Int,
    onDismiss: () -> Unit
) {
    var password by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var transferString by remember { mutableStateOf("") }
    var copied by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val emptyMsg = stringResource(R.string.single_password_empty)
    val s3NotFoundMsg = stringResource(R.string.transfer_config_s3_not_found)

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.transfer_config_card_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (transferString.isNotEmpty()) {
                    Text(
                        stringResource(R.string.transfer_config_code_generated),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Text(
                            transferString,
                            modifier = Modifier.padding(12.dp),
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = FontFamily.Monospace)
                        )
                    }
                    OutlinedButton(
                        onClick = {
                            ClipboardUtil.copyToClipboard(context, "transfer_config", transferString, clipboardClearSeconds, scope)
                            copied = true
                            scope.launch { delay(2000); copied = false }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(if (copied) Icons.Default.Check else Icons.Default.ContentCopy, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(if (copied) stringResource(R.string.feedback_copied) else stringResource(R.string.transfer_config_copy_code))
                    }
                } else {
                    Text(
                        stringResource(R.string.transfer_config_description),
                        style = MaterialTheme.typography.bodySmall
                    )
                    if (error.isNotEmpty()) {
                        Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    OutlinedTextField(
                        value = password, onValueChange = { password = it; error = "" },
                        label = { Text(stringResource(R.string.transfer_dialog_password)) },
                        placeholder = { Text(stringResource(R.string.transfer_config_password_placeholder)) },
                        singleLine = true, visualTransformation = PasswordVisualTransformation()
                    )
                }
            }
        },
        confirmButton = {
            if (transferString.isNotEmpty()) {
                Button(onClick = onDismiss) { Text(stringResource(R.string.action_close)) }
            } else {
                Button(
                    onClick = {
                        if (password.isBlank()) { error = emptyMsg; return@Button }
                        scope.launch {
                            isLoading = true
                            try {
                                val configJson = appViewModel.preferences.s3ConfigFlow.first()
                                    ?: throw IllegalStateException(s3NotFoundMsg)
                                transferString = appViewModel.repository.encryptTransferConfig(password, configJson)
                            } catch (e: Exception) {
                                error = context.getString(R.string.transfer_dialog_generate_failed, e.message ?: "")
                            } finally { isLoading = false }
                        }
                    },
                    enabled = !isLoading
                ) {
                    if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text(stringResource(R.string.transfer_dialog_generate))
                }
            }
        },
        dismissButton = {
            if (transferString.isEmpty()) {
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.action_cancel)) }
            }
        }
    )
}
