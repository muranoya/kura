package com.kura.app.ui.settings

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.kura.app.ui.components.ConfirmDialog
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

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
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

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

            Spacer(modifier = Modifier.height(16.dp))
            HorizontalDivider()
            Spacer(modifier = Modifier.height(8.dp))

            // About section
            Text("このアプリについて", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.height(4.dp))

            Card(modifier = Modifier.fillMaxWidth()) {
                ListItem(
                    headlineContent = { Text("バージョン") },
                    trailingContent = { Text("v0.1.0", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
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
                            Icons.Default.Logout,
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
                            val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                            clipboard.setPrimaryClip(ClipData.newPlainText("recovery_key", recoveryKeyValue))
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
