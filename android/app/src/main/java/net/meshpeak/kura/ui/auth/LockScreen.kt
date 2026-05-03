package net.meshpeak.kura.ui.auth

import android.security.keystore.KeyPermanentlyInvalidatedException
import android.widget.Toast
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import net.meshpeak.kura.R
import net.meshpeak.kura.ui.components.ConfirmDialog
import net.meshpeak.kura.viewmodel.AppViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@Composable
fun LockScreen(
    appViewModel: AppViewModel,
    onUnlocked: () -> Unit,
    onRecovery: () -> Unit,
    onLogout: () -> Unit
) {
    var password by remember { mutableStateOf("") }
    var passwordVisible by remember { mutableStateOf(false) }
    var usePasscode by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var showLogoutDialog by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val passcodeEnabled by appViewModel.preferences.passcodeEnabledFlow
        .collectAsState(initial = false)
    val passcodeAvailable = passcodeEnabled && appViewModel.passcodeHelper.isSetUp()

    LaunchedEffect(passcodeAvailable) {
        if (passcodeAvailable) {
            usePasscode = true
            password = ""
            error = ""
        } else {
            usePasscode = false
        }
    }

    val biometricAvailable = remember {
        val canAuth = BiometricManager.from(context).canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS
        canAuth && appViewModel.biometricHelper.isSetUp()
    }

    val showBiometricPrompt = remember {
        { ->
            val activity = context as FragmentActivity
            val biometricHelper = appViewModel.biometricHelper

            try {
                val cipher = biometricHelper.getDecryptCipher()
                val promptInfo = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(context.getString(R.string.app_name))
                    .setSubtitle(context.getString(R.string.lock_biometric_prompt))
                    .setNegativeButtonText(context.getString(R.string.lock_use_password))
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                    .build()

                val biometricPrompt = BiometricPrompt(
                    activity,
                    ContextCompat.getMainExecutor(context),
                    object : BiometricPrompt.AuthenticationCallback() {
                        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                            val authenticatedCipher = result.cryptoObject?.cipher ?: return
                            scope.launch {
                                isLoading = true
                                try {
                                    val masterPassword = biometricHelper.decryptPassword(authenticatedCipher)
                                    appViewModel.repository.unlock(masterPassword)
                                    onUnlocked()
                                } catch (e: Exception) {
                                    error = context.getString(R.string.lock_unlock_failed)
                                } finally {
                                    isLoading = false
                                }
                            }
                        }

                        override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                            if (errorCode == BiometricPrompt.ERROR_LOCKOUT ||
                                errorCode == BiometricPrompt.ERROR_LOCKOUT_PERMANENT
                            ) {
                                error = context.getString(R.string.lock_biometric_locked)
                            }
                            // ERROR_NEGATIVE_BUTTON / ERROR_USER_CANCELED: パスワード入力にフォールバック
                        }
                    }
                )
                biometricPrompt.authenticate(promptInfo, BiometricPrompt.CryptoObject(cipher))
            } catch (_: KeyPermanentlyInvalidatedException) {
                biometricHelper.clearAll()
                scope.launch { appViewModel.preferences.setBiometricEnabled(false) }
                Toast.makeText(context, context.getString(R.string.lock_biometric_disabled), Toast.LENGTH_LONG).show()
            } catch (_: Exception) {
                // キーやデータの不整合: フォールバック
            }
        }
    }

    // 画面表示時に自動で生体認証を表示
    LaunchedEffect(Unit) {
        val enabled = appViewModel.preferences.biometricEnabledFlow.first()
        if (enabled && biometricAvailable) {
            showBiometricPrompt()
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp)
            .imePadding()
            .verticalScroll(rememberScrollState()),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Default.Lock,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(stringResource(R.string.lock_title), style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.primary)
        Spacer(modifier = Modifier.height(8.dp))
        Text(stringResource(R.string.lock_subtitle), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(modifier = Modifier.height(32.dp))

        if (error.isNotEmpty()) {
            Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                Text(error, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
            }
            Spacer(modifier = Modifier.height(16.dp))
        }

        OutlinedTextField(
            value = password,
            onValueChange = { password = it; error = "" },
            label = { Text(if (usePasscode) stringResource(R.string.lock_passcode_label) else stringResource(R.string.lock_password_label)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            keyboardOptions = if (usePasscode) KeyboardOptions(keyboardType = KeyboardType.NumberPassword) else KeyboardOptions.Default,
            visualTransformation = if (passwordVisible) VisualTransformation.None else PasswordVisualTransformation(),
            trailingIcon = {
                IconButton(onClick = { passwordVisible = !passwordVisible }) {
                    Icon(if (passwordVisible) Icons.Default.VisibilityOff else Icons.Default.Visibility, contentDescription = null)
                }
            }
        )
        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = {
                if (password.isBlank()) {
                    error = context.getString(if (usePasscode) R.string.lock_passcode_required else R.string.lock_password_required)
                    return@Button
                }
                scope.launch {
                    isLoading = true
                    try {
                        val masterPassword = if (usePasscode) {
                            appViewModel.passcodeHelper.decryptPassword(password)
                        } else {
                            password
                        }
                        appViewModel.repository.unlock(masterPassword)
                        onUnlocked()
                    } catch (e: Exception) {
                        error = context.getString(if (usePasscode) R.string.lock_passcode_unlock_failed else R.string.lock_unlock_failed)
                    } finally { isLoading = false }
                }
            },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isLoading
        ) {
            if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
            else Text(stringResource(R.string.action_unlock))
        }

        if (passcodeAvailable) {
            Spacer(modifier = Modifier.height(8.dp))
            TextButton(
                onClick = {
                    usePasscode = !usePasscode
                    password = ""
                    error = ""
                },
                enabled = !isLoading
            ) {
                Text(stringResource(if (usePasscode) R.string.lock_use_password else R.string.lock_use_passcode))
            }
        }

        if (biometricAvailable) {
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedButton(
                onClick = { showBiometricPrompt() },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading
            ) {
                Icon(Icons.Default.Fingerprint, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.lock_biometric_prompt))
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        TextButton(onClick = onRecovery) { Text(stringResource(R.string.lock_unlock_with_recovery)) }

        TextButton(onClick = { showLogoutDialog = true }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) {
            Text(stringResource(R.string.action_logout))
        }
    }

    if (showLogoutDialog) {
        ConfirmDialog(
            title = stringResource(R.string.lock_logout_confirm_title),
            description = stringResource(R.string.lock_logout_confirm_description),
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
