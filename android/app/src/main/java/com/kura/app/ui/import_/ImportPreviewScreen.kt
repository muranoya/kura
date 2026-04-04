package com.kura.app.ui.import_

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.*
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

private val ENTRY_TYPE_LABELS = mapOf(
    "login" to "ログイン",
    "credit_card" to "クレジットカード",
    "secure_note" to "セキュアノート",
    "password" to "パスワード",
    "software_license" to "ソフトウェアライセンス",
    "bank" to "銀行口座",
    "ssh_key" to "SSH鍵",
    "passkey" to "パスキー"
)

private fun getEntryTypeLabel(type: String): String = ENTRY_TYPE_LABELS[type] ?: type

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ImportPreviewScreen(
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    onImportComplete: () -> Unit
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    var step by remember { mutableStateOf("idle") } // idle, loading, preview, executing, result
    var error by remember { mutableStateOf<String?>(null) }
    var fileBytes by remember { mutableStateOf<ByteArray?>(null) }
    var preview by remember { mutableStateOf<ImportPreview?>(null) }
    var result by remember { mutableStateOf<ImportResult?>(null) }
    // Map of source_id -> action json element
    var itemActions by remember { mutableStateOf<Map<String, JsonElement>>(emptyMap()) }

    val filePicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            step = "loading"
            error = null
            try {
                val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: throw Exception("ファイルを読み取れませんでした")
                fileBytes = bytes

                val previewData = appViewModel.repository.import1puxPreview(bytes)
                preview = previewData

                // Initialize actions from defaults
                val actions = mutableMapOf<String, JsonElement>()
                for (item in previewData.items) {
                    actions[item.sourceId] = item.defaultAction
                }
                itemActions = actions
                step = "preview"
            } catch (e: Exception) {
                error = e.message ?: "エラーが発生しました"
                step = "idle"
            }
        }
    }

    val handleExecute: () -> Unit = {
        scope.launch {
            step = "executing"
            error = null
            try {
                val actions = itemActions.map { (sourceId, action) ->
                    val targetType = preview?.items?.find { it.sourceId == sourceId }?.targetEntryType
                    ImportItemAction(
                        sourceId = sourceId,
                        action = action,
                        targetEntryType = targetType
                    )
                }
                val actionsJson = Json.encodeToString(kotlinx.serialization.builtins.ListSerializer(ImportItemAction.serializer()), actions)
                val importResult = appViewModel.repository.import1puxExecute(fileBytes!!, actionsJson)
                result = importResult
                step = "result"

                // Save and sync
                try {
                    val s3ConfigJson = appViewModel.preferences.s3ConfigFlow.first()
                    appViewModel.repository.saveAndSync(s3ConfigJson)
                } catch (_: Exception) {}
            } catch (e: Exception) {
                error = e.message ?: "インポートに失敗しました"
                step = "preview"
            }
        }
    }

    val importCount = itemActions.count { (_, action) ->
        action is JsonPrimitive && action.content == "import" ||
        action is JsonObject && action.containsKey("overwrite")
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(when (step) {
                    "idle" -> "1Passwordからインポート"
                    "loading" -> "解析中..."
                    "preview" -> "インポートプレビュー"
                    "executing" -> "インポート実行中..."
                    "result" -> "インポート完了"
                    else -> "インポート"
                }) },
                navigationIcon = {
                    if (step != "loading" && step != "executing") {
                        IconButton(onClick = if (step == "result") onImportComplete else onBack) {
                            Icon(Icons.Default.ArrowBack, contentDescription = "戻る")
                        }
                    }
                }
            )
        },
        bottomBar = {
            if (step == "preview") {
                Surface(tonalElevation = 3.dp) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedButton(onClick = onBack, modifier = Modifier.weight(1f)) {
                            Text("キャンセル")
                        }
                        Button(
                            onClick = handleExecute,
                            enabled = importCount > 0,
                            modifier = Modifier.weight(1f)
                        ) {
                            Text("${importCount}件をインポート")
                        }
                    }
                }
            }
            if (step == "result") {
                Surface(tonalElevation = 3.dp) {
                    Button(
                        onClick = onImportComplete,
                        modifier = Modifier.fillMaxWidth().padding(16.dp)
                    ) {
                        Text("閉じる")
                    }
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (step) {
                "idle" -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.FileUpload,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            "1Passwordからエクスポートした .1pux ファイルを選択してください",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 32.dp)
                        )
                        Spacer(modifier = Modifier.height(24.dp))
                        Button(onClick = { filePicker.launch("*/*") }) {
                            Icon(Icons.Default.FolderOpen, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("ファイルを選択")
                        }
                        if (error != null) {
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                        }
                    }
                }

                "loading", "executing" -> {
                    Column(
                        modifier = Modifier.fillMaxSize(),
                        verticalArrangement = Arrangement.Center,
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        CircularProgressIndicator()
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            if (step == "loading") "ファイルを解析中..." else "エントリを作成中...",
                            style = MaterialTheme.typography.bodyMedium
                        )
                    }
                }

                "preview" -> {
                    val p = preview ?: return@Box
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        // Stats
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                if (p.sourceAccountName.isNotEmpty()) {
                                    Text(
                                        "アカウント: ${p.sourceAccountName}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    AssistChip(onClick = {}, label = { Text("合計 ${p.stats.totalItems}件") })
                                    if (p.stats.duplicateCount > 0) {
                                        AssistChip(
                                            onClick = {},
                                            label = { Text("重複 ${p.stats.duplicateCount}件") },
                                            colors = AssistChipDefaults.assistChipColors(
                                                containerColor = MaterialTheme.colorScheme.errorContainer
                                            )
                                        )
                                    }
                                }

                                // Bulk actions
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    TextButton(onClick = {
                                        itemActions = itemActions.mapValues { JsonPrimitive("import") }
                                    }) { Text("全て取り込む") }
                                    TextButton(onClick = {
                                        itemActions = itemActions.mapValues { JsonPrimitive("skip") }
                                    }) { Text("全てスキップ") }
                                }

                                if (error != null) {
                                    Text(error!!, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                                }

                                HorizontalDivider()
                            }
                        }

                        // Items
                        items(p.items) { item ->
                            ImportPreviewItemRow(
                                item = item,
                                action = itemActions[item.sourceId] ?: JsonPrimitive("skip"),
                                onActionChange = { newAction ->
                                    itemActions = itemActions.toMutableMap().apply {
                                        put(item.sourceId, newAction)
                                    }
                                }
                            )
                        }
                    }
                }

                "result" -> {
                    val r = result ?: return@Box
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        item {
                            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    if (r.createdCount > 0) AssistChip(onClick = {}, label = { Text("作成 ${r.createdCount}件") })
                                    if (r.overwrittenCount > 0) AssistChip(onClick = {}, label = { Text("上書き ${r.overwrittenCount}件") })
                                    if (r.skippedCount > 0) AssistChip(onClick = {}, label = { Text("スキップ ${r.skippedCount}件") })
                                    if (r.errorCount > 0) {
                                        AssistChip(
                                            onClick = {},
                                            label = { Text("エラー ${r.errorCount}件") },
                                            colors = AssistChipDefaults.assistChipColors(
                                                containerColor = MaterialTheme.colorScheme.errorContainer
                                            )
                                        )
                                    }
                                }
                                if (r.labelsCreated.isNotEmpty()) {
                                    Text(
                                        "新規作成ラベル: ${r.labelsCreated.joinToString(", ")}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                            }
                        }

                        // Error items
                        val errorItems = r.items.filter { !it.success }
                        if (errorItems.isNotEmpty()) {
                            item { HorizontalDivider() }
                            item {
                                Text("エラー詳細", style = MaterialTheme.typography.titleSmall, color = MaterialTheme.colorScheme.error)
                            }
                            items(errorItems) { item ->
                                ListItem(
                                    headlineContent = { Text(item.sourceName) },
                                    supportingContent = { Text(item.error ?: "不明なエラー", color = MaterialTheme.colorScheme.error) },
                                    leadingContent = { Icon(Icons.Default.Error, contentDescription = null, tint = MaterialTheme.colorScheme.error) }
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ImportPreviewItemRow(
    item: ImportPreviewItem,
    action: JsonElement,
    onActionChange: (JsonElement) -> Unit
) {
    val actionStr = when {
        action is JsonPrimitive && action.content == "import" -> "import"
        action is JsonPrimitive && action.content == "skip" -> "skip"
        action is JsonObject && action.containsKey("overwrite") -> "overwrite"
        else -> "skip"
    }

    var expanded by remember { mutableStateOf(false) }

    ListItem(
        headlineContent = {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(item.sourceName, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f, fill = false))
                if (!item.sourceCategory.isDirectMapping) {
                    SuggestionChip(
                        onClick = {},
                        label = { Text(item.sourceCategory.categoryName, style = MaterialTheme.typography.labelSmall) },
                        modifier = Modifier.height(24.dp)
                    )
                }
                if (item.hasAttachments) {
                    Icon(Icons.Default.Warning, contentDescription = "添付ファイル", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(16.dp))
                }
            }
        },
        supportingContent = {
            Column {
                Text(getEntryTypeLabel(item.targetEntryType), style = MaterialTheme.typography.bodySmall)
                if (item.duplicates.isNotEmpty()) {
                    Text(
                        "重複: ${item.duplicates.first().existingEntryName}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        },
        trailingContent = {
            Box {
                FilterChip(
                    selected = actionStr == "import",
                    onClick = { expanded = true },
                    label = { Text(when (actionStr) {
                        "import" -> "取り込む"
                        "skip" -> "スキップ"
                        "overwrite" -> "上書き"
                        else -> "スキップ"
                    }, style = MaterialTheme.typography.labelSmall) }
                )
                DropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    DropdownMenuItem(
                        text = { Text("取り込む") },
                        onClick = {
                            onActionChange(JsonPrimitive("import"))
                            expanded = false
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("スキップ") },
                        onClick = {
                            onActionChange(JsonPrimitive("skip"))
                            expanded = false
                        }
                    )
                    for (dup in item.duplicates) {
                        DropdownMenuItem(
                            text = { Text("上書き: ${dup.existingEntryName}") },
                            onClick = {
                                onActionChange(buildJsonObject {
                                    putJsonObject("overwrite") {
                                        put("existing_entry_id", dup.existingEntryId)
                                    }
                                })
                                expanded = false
                            }
                        )
                    }
                }
            }
        }
    )
}
