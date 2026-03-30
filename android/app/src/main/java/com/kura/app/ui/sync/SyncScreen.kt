package com.kura.app.ui.sync

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

enum class SyncStatus { IDLE, SYNCING, SUCCESS, ERROR }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SyncScreen(appViewModel: AppViewModel) {
    var syncStatus by remember { mutableStateOf(SyncStatus.IDLE) }
    var lastSyncTime by remember { mutableStateOf<Long?>(null) }
    var errorMessage by remember { mutableStateOf("") }
    var hasConfig by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(Unit) {
        val config = appViewModel.preferences.s3ConfigFlow.first()
        hasConfig = config != null
        val ts = appViewModel.repository.getLastSyncTime()
        if (ts > 0) lastSyncTime = ts
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text("同期") }) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Status icon
            when (syncStatus) {
                SyncStatus.IDLE -> Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
                SyncStatus.SYNCING -> CircularProgressIndicator(modifier = Modifier.size(64.dp))
                SyncStatus.SUCCESS -> Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.primary)
                SyncStatus.ERROR -> Icon(Icons.Default.Error, contentDescription = null, modifier = Modifier.size(64.dp), tint = MaterialTheme.colorScheme.error)
            }

            // Last sync time
            if (lastSyncTime != null) {
                val relativeTime = formatRelativeTime(lastSyncTime!!)
                Text("最終同期: $relativeTime", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            } else {
                Text("まだ同期されていません", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }

            if (errorMessage.isNotEmpty()) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Text(errorMessage, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
                }
            }

            if (!hasConfig) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer)) {
                    Text("ストレージが設定されていません", modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onTertiaryContainer)
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = {
                    scope.launch {
                        syncStatus = SyncStatus.SYNCING
                        errorMessage = ""
                        try {
                            val config = appViewModel.preferences.s3ConfigFlow.first()
                            if (config != null) {
                                val result = appViewModel.repository.syncVault(config)
                                if (result.synced) {
                                    lastSyncTime = result.lastSyncedAt
                                    val vaultBytes = appViewModel.repository.getVaultBytes()
                                    appViewModel.repository.writeVaultFile(vaultBytes)
                                    if (result.lastSyncedAt != null) {
                                        appViewModel.preferences.saveLastSyncTime(result.lastSyncedAt)
                                    }
                                }
                                syncStatus = SyncStatus.SUCCESS
                            } else {
                                errorMessage = "ストレージが設定されていません"
                                syncStatus = SyncStatus.ERROR
                            }
                        } catch (e: Exception) {
                            errorMessage = "同期に失敗しました: ${e.message}"
                            syncStatus = SyncStatus.ERROR
                        }
                    }
                },
                enabled = syncStatus != SyncStatus.SYNCING && hasConfig,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text("同期を実行")
            }
        }
    }
}

fun formatRelativeTime(timestamp: Long): String {
    val now = System.currentTimeMillis() / 1000
    val diff = now - timestamp
    return when {
        diff < 60 -> "たった今"
        diff < 3600 -> "${diff / 60}分前"
        diff < 86400 -> "${diff / 3600}時間前"
        else -> "${diff / 86400}日前"
    }
}
