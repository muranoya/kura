package com.kura.app.ui.entries

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.CustomField
import com.kura.app.data.model.Label
import com.kura.app.ui.components.EntryForm
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryEditScreen(
    entryId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    onSaved: () -> Unit
) {
    var entryType by remember { mutableStateOf("") }
    var name by remember { mutableStateOf("") }
    var typedValues by remember { mutableStateOf<Map<String, String>>(emptyMap()) }
    var notes by remember { mutableStateOf("") }
    var customFields by remember { mutableStateOf<List<CustomField>>(emptyList()) }
    var labels by remember { mutableStateOf<List<Label>>(emptyList()) }
    var selectedLabelIds by remember { mutableStateOf<Set<String>>(emptySet()) }
    var loading by remember { mutableStateOf(true) }
    var isLoading by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf("") }
    val scope = rememberCoroutineScope()
    val context = LocalContext.current

    LaunchedEffect(entryId) {
        try {
            val entry = appViewModel.repository.getEntry(entryId)
            labels = appViewModel.repository.listLabels()
            entryType = entry.entryType
            name = entry.name
            notes = entry.notes ?: ""
            selectedLabelIds = entry.labels.toSet()
            customFields = try {
                entry.customFields?.let { Json.decodeFromString<List<CustomField>>(it) } ?: emptyList()
            } catch (_: Exception) { emptyList() }
            val tv = try {
                Json.parseToJsonElement(entry.typedValue).jsonObject
            } catch (_: Exception) { JsonObject(emptyMap()) }
            typedValues = tv.entries.associate { (k, v) ->
                k to (v.jsonPrimitive.contentOrNull ?: "")
            }
        } catch (e: Exception) {
            error = e.message ?: "エラー"
        }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("編集") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                },
                actions = {
                    if (!loading) {
                        TextButton(
                            onClick = {
                                if (name.isBlank()) { error = "名前を入力してください"; return@TextButton }
                                scope.launch {
                                    isLoading = true
                                    try {
                                        val tvJson = buildJsonObject {
                                            typedValues.forEach { (k, v) -> put(k, v) }
                                        }.toString()
                                        val cfJson = Json.encodeToString(kotlinx.serialization.builtins.ListSerializer(CustomField.serializer()), customFields)
                                        appViewModel.repository.updateEntry(
                                            id = entryId,
                                            name = name,
                                            typedValueJson = tvJson,
                                            notes = notes.ifBlank { null },
                                            labelIds = selectedLabelIds.toList(),
                                            customFieldsJson = cfJson
                                        )
                                        appViewModel.repository.saveLocally()
                                        scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                                        onSaved()
                                    } catch (e: Exception) {
                                        error = "更新に失敗しました: ${e.message}"
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
        when {
            loading -> Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error.isNotEmpty() && loading -> Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text(error, color = MaterialTheme.colorScheme.error) }
            else -> {
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
                        entryType = entryType,
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
                        onGeneratePassword = { len, lower, upper, num, sym1, sym2, sym3 ->
                            appViewModel.repository.generatePassword(len, lower, upper, num, sym1, sym2, sym3)
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
}
