package com.kura.app.ui.entries

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.ui.platform.LocalContext
import com.kura.app.data.model.CustomField
import com.kura.app.data.model.EntryType
import com.kura.app.data.model.Label
import com.kura.app.ui.components.EntryForm
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryCreateScreen(
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    onCreated: (String) -> Unit
) {
    var selectedType by remember { mutableStateOf<String?>(null) }
    var name by remember { mutableStateOf("") }
    var typedValues by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var notes by remember { mutableStateOf("") }
    var customFields by remember { mutableStateOf<List<CustomField>>(emptyList()) }
    var labels by remember { mutableStateOf<List<Label>>(emptyList()) }
    var selectedLabelIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        try { labels = appViewModel.repository.listLabels() } catch (_: Exception) { }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("新規作成") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                },
                actions = {
                    if (selectedType != null) {
                        TextButton(
                            onClick = {
                                if (name.isBlank()) { error = "名前を入力してください"; return@TextButton }
                                scope.launch {
                                    isLoading = true
                                    try {
                                        val tvJson = buildJsonObject {
                                            typedValues.forEach { (k, v) -> put(k, v) }
                                        }.toString()
                                        val cfJson = if (customFields.isNotEmpty()) {
                                            Json.encodeToString(kotlinx.serialization.builtins.ListSerializer(CustomField.serializer()), customFields)
                                        } else null
                                        val id = appViewModel.repository.createEntry(
                                            entryType = selectedType!!,
                                            name = name,
                                            notes = notes.ifBlank { null },
                                            typedValueJson = tvJson,
                                            labelIds = selectedLabelIds.toList(),
                                            customFieldsJson = cfJson
                                        )
                                        appViewModel.repository.saveAndSync(appViewModel.preferences.s3ConfigFlow.first())
                                        onCreated(id)
                                    } catch (e: Exception) {
                                        error = "作成に失敗しました: ${e.message}"
                                    } finally { isLoading = false }
                                }
                            },
                            enabled = !isLoading
                        ) {
                            if (isLoading) CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                            else Text("保存")
                        }
                    }
                }
            )
        }
    ) { padding ->
        if (selectedType == null) {
            // Type selection
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                Text("エントリのタイプを選択", style = MaterialTheme.typography.titleMedium)
                EntryType.entries.forEach { type ->
                    Card(
                        onClick = { selectedType = type.value },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(modifier = Modifier.padding(16.dp)) {
                            com.kura.app.ui.components.EntryTypeIcon(type.value, tint = MaterialTheme.colorScheme.primary)
                            Spacer(modifier = Modifier.width(12.dp))
                            Text(type.displayName, style = MaterialTheme.typography.bodyLarge)
                        }
                    }
                }
            }
        } else {
            Column(modifier = Modifier.padding(padding)) {
                if (error.isNotEmpty()) {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp)
                    ) {
                        Text(error, modifier = Modifier.padding(12.dp), color = MaterialTheme.colorScheme.onErrorContainer, style = MaterialTheme.typography.bodySmall)
                    }
                }
                EntryForm(
                    entryType = selectedType!!,
                    name = name,
                    onNameChange = { name = it; error = "" },
                    typedValues = typedValues,
                    onTypedValueChange = { key, value -> typedValues = typedValues + (key to value) },
                    notes = notes,
                    onNotesChange = { notes = it },
                    customFields = customFields,
                    onCustomFieldsChange = { customFields = it },
                    labels = labels,
                    selectedLabelIds = selectedLabelIds,
                    onLabelToggle = { id ->
                        selectedLabelIds = if (id in selectedLabelIds) selectedLabelIds - id else selectedLabelIds + id
                    },
                    onGeneratePassword = { len, up, num, sym ->
                        appViewModel.repository.generatePassword(len, up, num, sym)
                    },
                    onCopyToClipboard = { text ->
                        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                        clipboard.setPrimaryClip(ClipData.newPlainText("kura", text))
                    },
                    onCreateLabel = { name ->
                        val id = appViewModel.repository.createLabel(name)
                        val newLabel = Label(id = id, name = name)
                        labels = labels + newLabel
                        newLabel
                    }
                )
            }
        }
    }
}
