package net.meshpeak.kura.ui.settings

import android.content.Context
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.widget.Toast
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
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
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import net.meshpeak.kura.bridge.VaultBridge
import net.meshpeak.kura.data.model.S3Config
import net.meshpeak.kura.ui.components.ConfirmDialog
import net.meshpeak.kura.util.copyToClipboard
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
    var showTransferDialog by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

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
                title = { Text("設定") },
                navigationIcon = {
                    IconButton(onClick = onOpenDrawer) {
                        Icon(Icons.Default.Menu, contentDescription = "メニュー")
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
            Text("セキュリティ", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            Card(onClick = { showChangePasswordDialog = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("マスターパスワード変更") },
                    supportingContent = { Text("マスターパスワードを新しいものに変更") },
                    leadingContent = { Icon(Icons.Default.Lock, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Card(onClick = { showRotateDekDialog = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("DEK更新") },
                    supportingContent = { Text("データ暗号化キーを更新し、リカバリーキーも再生成") },
                    leadingContent = { Icon(Icons.Default.VpnKey, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Card(onClick = { showRegenRecoveryDialog = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("リカバリーキー再生成") },
                    supportingContent = { Text("新しいリカバリーキーを生成して表示") },
                    leadingContent = { Icon(Icons.Default.Key, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("自動ロック") },
                    supportingContent = { Text("バックグラウンド移行後の自動ロック時間") },
                    leadingContent = {
                        Icon(Icons.Default.Timer, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    },
                    trailingContent = {
                        ExposedDropdownMenuBox(
                            expanded = autolockExpanded,
                            onExpandedChange = { autolockExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = if (autolockMinutes == 0) "無効" else "${autolockMinutes}分",
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
                                        text = { Text(if (minutes == 0) "無効" else "${minutes}分") },
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
                    headlineContent = { Text("クリップボード自動クリア") },
                    supportingContent = { Text("コピー後に自動でクリップボードをクリア") },
                    leadingContent = {
                        Icon(Icons.Default.ContentPaste, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                    },
                    trailingContent = {
                        ExposedDropdownMenuBox(
                            expanded = clipboardClearExpanded,
                            onExpandedChange = { clipboardClearExpanded = it }
                        ) {
                            OutlinedTextField(
                                value = if (clipboardClearSeconds == 0) "無効" else "${clipboardClearSeconds}秒",
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
                                listOf(0, 10, 30, 60, 120).forEach { seconds ->
                                    DropdownMenuItem(
                                        text = { Text(if (seconds == 0) "無効" else "${seconds}秒") },
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
                        headlineContent = { Text("生体認証でアンロック") },
                        supportingContent = { Text("指紋認証や顔認証でアンロック") },
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

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // ストレージ設定セクション
            Text("ストレージ設定", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            if (s3Config != null) {
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text("バケット") },
                        supportingContent = { Text(s3Config.bucket) },
                        leadingContent = { Icon(Icons.Default.Cloud, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                    )
                }
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text("リージョン") },
                        supportingContent = { Text(s3Config.region) },
                        leadingContent = { Icon(Icons.Default.Public, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                    )
                }
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text("ファイルパス") },
                        supportingContent = { Text(s3Config.key) },
                        leadingContent = { Icon(Icons.Default.Description, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                    )
                }
                if (!s3Config.endpoint.isNullOrEmpty()) {
                    Card(modifier = Modifier.fillMaxWidth()) {
                        ListItem(
                            headlineContent = { Text("エンドポイント") },
                            supportingContent = { Text(s3Config.endpoint!!) },
                            leadingContent = { Icon(Icons.Default.Link, contentDescription = null, tint = MaterialTheme.colorScheme.primary) }
                        )
                    }
                }
            } else {
                Card(modifier = Modifier.fillMaxWidth()) {
                    ListItem(
                        headlineContent = { Text("ストレージ設定が見つかりません", color = MaterialTheme.colorScheme.onSurfaceVariant) },
                        leadingContent = { Icon(Icons.Default.Cloud, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // Transfer section
            Text("端末間転送", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            Card(onClick = { showTransferDialog = true }, modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("設定を別端末に転送") },
                    supportingContent = { Text("S3設定を暗号化した転送コードを生成") },
                    leadingContent = { Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    trailingContent = { Icon(Icons.Default.ChevronRight, contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                )
            }

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // About section
            Text("このアプリについて", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("バージョン") },
                    trailingContent = { Text("v${VaultBridge.getVersion()}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
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
                        Text("ログアウト", color = MaterialTheme.colorScheme.onErrorContainer)
                    },
                    supportingContent = {
                        Text(
                            "ローカルキャッシュとS3設定をクリア",
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
            title = "DEK更新",
            description = "データ暗号化キーを新しく生成します。マスターパスワードで認証が必要です。同時にリカバリーキーも更新されます。",
            onConfirm = { password ->
                val newKey = appViewModel.repository.rotateDek(password)
                appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                // DEKローテーション後は生体認証を無効化
                appViewModel.biometricHelper.clearAll()
                appViewModel.preferences.setBiometricEnabled(false)
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
            title = "リカバリーキー再生成",
            description = "新しいリカバリーキーを生成します。マスターパスワードで認証が必要です。",
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
            title = { Text("新しいリカバリーキー") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("新しいリカバリーキーが生成されました。安全な場所に保管してください。", style = MaterialTheme.typography.bodySmall)
                    Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)) {
                        Text(recoveryKeyValue, modifier = Modifier.padding(12.dp), style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace))
                    }
                    OutlinedButton(
                        onClick = {
                            copyToClipboard(context, "recovery_key", recoveryKeyValue, clipboardClearSeconds, scope)
                            copied = true
                            scope.launch { delay(2000); copied = false }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(if (copied) Icons.Default.Check else Icons.Default.ContentCopy, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(if (copied) "コピーしました" else "コピー")
                    }
                }
            },
            confirmButton = { Button(onClick = { showRecoveryKeyDisplay = false }) { Text("保管しました") } }
        )
    }

    // Biometric enrollment dialog
    if (showBiometricEnrollDialog) {
        SinglePasswordDialog(
            title = "生体認証の有効化",
            description = "マスターパスワードを入力してから、生体認証で確認します。",
            onConfirm = { password ->
                // まずマスターパスワードが正しいか検証
                appViewModel.repository.verifyPassword(password)

                val activity = context as FragmentActivity
                val biometricHelper = appViewModel.biometricHelper

                biometricHelper.generateKey()
                val cipher = biometricHelper.getEncryptCipher()

                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle("kura")
                    .setSubtitle("生体認証を登録")
                    .setNegativeButtonText("キャンセル")
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
                                appViewModel.preferences.setBiometricEnabled(true)
                            }
                            showBiometricEnrollDialog = false
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            biometricHelper.clearAll()
                            Toast.makeText(context, "生体認証の登録に失敗しました", Toast.LENGTH_SHORT).show()
                        }
                    }
                )
                biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            },
            onDismiss = { showBiometricEnrollDialog = false }
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

    // Logout dialog
    if (showLogoutDialog) {
        ConfirmDialog(
            title = "ログアウト",
            description = "ログアウトするとローカルキャッシュとS3設定がクリアされます。再度ログインには設定の再入力が必要になります。",
            confirmText = "ログアウト",
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

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("マスターパスワード変更") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("新しいマスターパスワードを設定します。", style = MaterialTheme.typography.bodySmall)
                if (error.isNotEmpty()) {
                    Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                OutlinedTextField(
                    value = oldPassword, onValueChange = { oldPassword = it; error = "" },
                    label = { Text("現在のパスワード") },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
                OutlinedTextField(
                    value = newPassword, onValueChange = { newPassword = it; error = "" },
                    label = { Text("新しいパスワード") },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
                OutlinedTextField(
                    value = confirmPassword, onValueChange = { confirmPassword = it; error = "" },
                    label = { Text("新しいパスワード（確認）") },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    when {
                        oldPassword.isBlank() || newPassword.isBlank() || confirmPassword.isBlank() -> error = "すべてのフィールドを入力してください"
                        newPassword != confirmPassword -> error = "新しいパスワードが一致しません"
                        newPassword == oldPassword -> error = "新しいパスワードは現在のものと異なる必要があります"
                        else -> scope.launch {
                            isLoading = true
                            try {
                                appViewModel.repository.changeMasterPassword(oldPassword, newPassword)
                                appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                                // マスターパスワード変更後は生体認証を無効化
                                appViewModel.biometricHelper.clearAll()
                                appViewModel.preferences.setBiometricEnabled(false)
                                onDismiss()
                            } catch (e: Exception) {
                                error = "パスワード変更に失敗しました"
                            } finally { isLoading = false }
                        }
                    }
                },
                enabled = !isLoading
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text("変更")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("キャンセル") } }
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
                    label = { Text("マスターパスワード") },
                    singleLine = true, visualTransformation = PasswordVisualTransformation()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (password.isBlank()) { error = "パスワードを入力してください"; return@Button }
                    scope.launch {
                        isLoading = true
                        try { onConfirm(password) } catch (e: Exception) { error = "操作に失敗しました: ${e.message}" }
                        finally { isLoading = false }
                    }
                },
                enabled = !isLoading
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text("実行")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("キャンセル") } }
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

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("設定を別端末に転送") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                if (transferString.isNotEmpty()) {
                    Text(
                        "転送コードが生成されました。別の端末のセットアップ時にこのコードと転送パスワードを入力してください。",
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
                            copyToClipboard(context, "transfer_config", transferString, clipboardClearSeconds, scope)
                            copied = true
                            scope.launch { delay(2000); copied = false }
                        },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(if (copied) Icons.Default.Check else Icons.Default.ContentCopy, contentDescription = null)
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(if (copied) "コピーしました" else "転送コードをコピー")
                    }
                } else {
                    Text(
                        "転送パスワードで暗号化した転送コードを生成します。受信側にこのパスワードを共有してください。",
                        style = MaterialTheme.typography.bodySmall
                    )
                    if (error.isNotEmpty()) {
                        Text(error, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                    OutlinedTextField(
                        value = password, onValueChange = { password = it; error = "" },
                        label = { Text("転送パスワード") },
                        placeholder = { Text("受信側に共有するパスワードを設定") },
                        singleLine = true, visualTransformation = PasswordVisualTransformation()
                    )
                }
            }
        },
        confirmButton = {
            if (transferString.isNotEmpty()) {
                Button(onClick = onDismiss) { Text("閉じる") }
            } else {
                Button(
                    onClick = {
                        if (password.isBlank()) { error = "パスワードを入力してください"; return@Button }
                        scope.launch {
                            isLoading = true
                            try {
                                val configJson = appViewModel.preferences.s3ConfigFlow.first()
                                    ?: throw IllegalStateException("S3設定が見つかりません")
                                transferString = appViewModel.repository.encryptTransferConfig(password, configJson)
                            } catch (e: Exception) {
                                error = "転送コードの生成に失敗しました: ${e.message}"
                            } finally { isLoading = false }
                        }
                    },
                    enabled = !isLoading
                ) {
                    if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text("生成")
                }
            }
        },
        dismissButton = {
            if (transferString.isEmpty()) {
                TextButton(onClick = onDismiss) { Text("キャンセル") }
            }
        }
    )
}
