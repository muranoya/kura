package net.meshpeak.kura.ui.onboarding

import android.util.Log
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import net.meshpeak.kura.R
import net.meshpeak.kura.viewmodel.AppViewModel
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
    var showTransfer by remember { mutableStateOf(false) }
    var transferString by remember { mutableStateOf("") }
    var transferPassword by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()

    val context = LocalContext.current
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.storage_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.cd_back))
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
                stringResource(R.string.storage_description_generic),
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

            // Transfer import section
            if (showTransfer) {
                Card {
                    Column(
                        modifier = Modifier.padding(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        Text(
                            stringResource(R.string.storage_transfer_import_title),
                            style = MaterialTheme.typography.titleSmall
                        )
                        Text(
                            stringResource(R.string.storage_transfer_import_description),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        OutlinedTextField(
                            value = transferString,
                            onValueChange = { transferString = it },
                            label = { Text(stringResource(R.string.storage_transfer_code)) },
                            placeholder = { Text(stringResource(R.string.storage_transfer_code_placeholder)) },
                            modifier = Modifier.fillMaxWidth(),
                            minLines = 3,
                            maxLines = 5,
                            enabled = !isLoading
                        )
                        OutlinedTextField(
                            value = transferPassword,
                            onValueChange = { transferPassword = it },
                            label = { Text(stringResource(R.string.storage_transfer_password)) },
                            placeholder = { Text(stringResource(R.string.storage_transfer_password_placeholder)) },
                            modifier = Modifier.fillMaxWidth(),
                            singleLine = true,
                            visualTransformation = PasswordVisualTransformation(),
                            enabled = !isLoading
                        )
                        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                            OutlinedButton(
                                onClick = { showTransfer = false; error = "" },
                                modifier = Modifier.weight(1f),
                                enabled = !isLoading
                            ) { Text(stringResource(R.string.action_cancel)) }
                            Button(
                                onClick = {
                                    scope.launch {
                                        isLoading = true
                                        error = ""
                                        try {
                                            val configJson = appViewModel.repository.decryptTransferConfig(
                                                transferPassword, transferString.trim()
                                            )
                                            val config = Json.parseToJsonElement(configJson).jsonObject
                                            region = config["region"]?.jsonPrimitive?.content ?: ""
                                            bucket = config["bucket"]?.jsonPrimitive?.content ?: ""
                                            key = config["key"]?.jsonPrimitive?.content ?: "vault.json"
                                            accessKeyId = config["accessKeyId"]?.jsonPrimitive?.content ?: ""
                                            secretAccessKey = config["secretAccessKey"]?.jsonPrimitive?.content ?: ""
                                            endpoint = config["endpoint"]?.jsonPrimitive?.content ?: ""
                                            showTransfer = false
                                            transferString = ""
                                            transferPassword = ""
                                        } catch (e: Exception) {
                                            error = context.getString(R.string.storage_transfer_decrypt_failed, e.message ?: e.toString())
                                        } finally {
                                            isLoading = false
                                        }
                                    }
                                },
                                modifier = Modifier.weight(1f),
                                enabled = !isLoading && transferString.isNotBlank() && transferPassword.isNotEmpty()
                            ) {
                                if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                                else Text(stringResource(R.string.storage_transfer_load))
                            }
                        }
                    }
                }
            } else {
                OutlinedButton(
                    onClick = { showTransfer = true },
                    modifier = Modifier.fillMaxWidth()
                ) { Text(stringResource(R.string.storage_transfer_import_button)) }
            }

            OutlinedTextField(
                value = region, onValueChange = { region = it; error = "" },
                label = { Text(stringResource(R.string.storage_region_required)) },
                placeholder = { Text(stringResource(R.string.storage_region_placeholder)) },
                modifier = Modifier.fillMaxWidth().testTag("region_input"), singleLine = true
            )
            OutlinedTextField(
                value = bucket, onValueChange = { bucket = it; error = "" },
                label = { Text(stringResource(R.string.storage_bucket_required)) },
                placeholder = { Text(stringResource(R.string.storage_bucket_placeholder)) },
                modifier = Modifier.fillMaxWidth().testTag("bucket_input"), singleLine = true
            )
            OutlinedTextField(
                value = key, onValueChange = { key = it },
                label = { Text(stringResource(R.string.storage_file_path_required)) },
                placeholder = { Text(stringResource(R.string.storage_file_path_placeholder)) },
                modifier = Modifier.fillMaxWidth().testTag("key_input"), singleLine = true,
                supportingText = { Text(stringResource(R.string.storage_file_path_supporting)) }
            )
            OutlinedTextField(
                value = accessKeyId, onValueChange = { accessKeyId = it; error = "" },
                label = { Text(stringResource(R.string.storage_access_key_required)) },
                placeholder = { Text(stringResource(R.string.storage_access_key_placeholder)) },
                modifier = Modifier.fillMaxWidth().testTag("access_key_input"), singleLine = true
            )
            OutlinedTextField(
                value = secretAccessKey, onValueChange = { secretAccessKey = it; error = "" },
                label = { Text(stringResource(R.string.storage_secret_key_required)) },
                modifier = Modifier.fillMaxWidth().testTag("secret_key_input"), singleLine = true
            )
            OutlinedTextField(
                value = endpoint, onValueChange = { endpoint = it },
                label = { Text(stringResource(R.string.storage_endpoint_label)) },
                placeholder = { Text(stringResource(R.string.storage_endpoint_placeholder)) },
                modifier = Modifier.fillMaxWidth(), singleLine = true,
                supportingText = { Text(stringResource(R.string.storage_endpoint_supporting)) }
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                OutlinedButton(
                    onClick = onBack,
                    modifier = Modifier.weight(1f).testTag("storage_back_button"),
                    enabled = !isLoading
                ) { Text(stringResource(R.string.action_back)) }
                Button(
                    onClick = {
                        if (region.isBlank() || bucket.isBlank() || key.isBlank() || accessKeyId.isBlank() || secretAccessKey.isBlank()) {
                            error = context.getString(R.string.storage_required_all)
                            return@Button
                        }
                        scope.launch {
                            isLoading = true
                            try {
                                val config = buildJsonObject {
                                    put("region", region)
                                    put("bucket", bucket)
                                    put("key", key)
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
                                error = context.getString(R.string.storage_access_failed, e.message ?: e.toString())
                            } finally {
                                isLoading = false
                            }
                        }
                    },
                    modifier = Modifier.weight(1f).testTag("storage_next_button"),
                    enabled = !isLoading
                ) {
                    if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                    else Text(stringResource(R.string.action_next))
                }
            }
        }
    }
}
