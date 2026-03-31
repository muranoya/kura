package com.kura.app.ui.onboarding

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StorageSetupScreen(
    appViewModel: AppViewModel,
    onNewVault: () -> Unit,
    onExistingVault: () -> Unit,
    onBack: () -> Unit
) {
    var region by remember { mutableStateOf("") }
    var bucket by remember { mutableStateOf("") }
    var key by remember { mutableStateOf("vault.json") }
    var accessKeyId by remember { mutableStateOf("") }
    var secretAccessKey by remember { mutableStateOf("") }
    var endpoint by remember { mutableStateOf("") }
    var error by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("ストレージ設定") },
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
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(
                "S3互換のクラウドストレージを設定します",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (error.isNotEmpty()) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer)) {
                    Text(
                        error,
                        modifier = Modifier.padding(12.dp),
                        color = MaterialTheme.colorScheme.onErrorContainer,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }

            OutlinedTextField(
                value = region, onValueChange = { region = it; error = "" },
                label = { Text("リージョン *") },
                placeholder = { Text("例: ap-northeast-1") },
                modifier = Modifier.fillMaxWidth(), singleLine = true
            )
            OutlinedTextField(
                value = bucket, onValueChange = { bucket = it; error = "" },
                label = { Text("バケット *") },
                placeholder = { Text("例: my-vault") },
                modifier = Modifier.fillMaxWidth(), singleLine = true
            )
            OutlinedTextField(
                value = key, onValueChange = { key = it },
                label = { Text("ファイルパス") },
                placeholder = { Text("vault.json") },
                modifier = Modifier.fillMaxWidth(), singleLine = true,
                supportingText = { Text("バケット内の保存パス。デフォルト: vault.json") }
            )
            OutlinedTextField(
                value = accessKeyId, onValueChange = { accessKeyId = it; error = "" },
                label = { Text("アクセスキーID *") },
                placeholder = { Text("AKIA...") },
                modifier = Modifier.fillMaxWidth(), singleLine = true
            )
            OutlinedTextField(
                value = secretAccessKey, onValueChange = { secretAccessKey = it; error = "" },
                label = { Text("シークレットアクセスキー *") },
                modifier = Modifier.fillMaxWidth(), singleLine = true
            )
            OutlinedTextField(
                value = endpoint, onValueChange = { endpoint = it },
                label = { Text("エンドポイント (オプション)") },
                placeholder = { Text("例: https://s3.example.com") },
                modifier = Modifier.fillMaxWidth(), singleLine = true,
                supportingText = { Text("S3互換サーバーを使用する場合のみ") }
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = onBack,
                    modifier = Modifier.weight(1f),
                    enabled = !isLoading
                ) { Text("戻る") }
                Button(
                    onClick = {
                        if (region.isBlank() || bucket.isBlank() || accessKeyId.isBlank() || secretAccessKey.isBlank()) {
                            error = "すべての必須フィールドを入力してください"
                            return@Button
                        }
                        scope.launch {
                            isLoading = true
                            try {
                                val config = buildJsonObject {
                                    put("region", region)
                                    put("bucket", bucket)
                                    put("key", key.ifBlank { "vault.json" })
                                    put("accessKeyId", accessKeyId)
                                    put("secretAccessKey", secretAccessKey)
                                    if (endpoint.isNotBlank()) put("endpoint", endpoint)
                                }
                                val configJson = config.toString()
                                appViewModel.preferences.saveS3Config(configJson)

                                val exists = appViewModel.repository.downloadVault(configJson)
                                if (exists) onExistingVault() else onNewVault()
                            } catch (e: Exception) {
                                Log.e("StorageSetup", "S3 access failed", e)
                                error = "ストレージへのアクセスに失敗しました: ${e.message ?: e.toString()}"
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    modifier = Modifier.weight(1f),
                    enabled = !isLoading
                ) {
                    if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text("次へ")
                }
            }
        }
    }
}
