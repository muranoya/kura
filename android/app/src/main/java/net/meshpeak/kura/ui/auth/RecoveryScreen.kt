package net.meshpeak.kura.ui.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import net.meshpeak.kura.viewmodel.AppViewModel
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecoveryScreen(
    appViewModel: AppViewModel,
    onUnlocked: () -> Unit,
    onBack: () -> Unit
) {
    var recoveryKey by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("リカバリーキーでアンロック") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                "リカバリーキーを入力してVaultをアンロックします。",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (error.isNotEmpty()) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Text(error, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
                }
            }

            OutlinedTextField(
                value = recoveryKey,
                onValueChange = { recoveryKey = it; error = "" },
                label = { Text("リカバリーキー") },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("XXXX-XXXX-XXXX-XXXX") }
            )

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = {
                    if (recoveryKey.isBlank()) { error = "リカバリーキーを入力してください"; return@Button }
                    scope.launch {
                        isLoading = true
                        try {
                            appViewModel.repository.unlockWithRecoveryKey(recoveryKey.trim())
                            onUnlocked()
                        } catch (e: Exception) {
                            error = "アンロックに失敗しました: ${e.message}"
                        } finally { isLoading = false }
                    }
                },
                modifier = Modifier.fillMaxWidth(),
                enabled = !isLoading
            ) {
                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                else Text("アンロック")
            }
        }
    }
}
