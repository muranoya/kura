package com.kura.app.ui.entries

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.ui.graphics.Color
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.compose.material.icons.outlined.StarOutline
import com.kura.app.data.model.CustomField
import com.kura.app.data.model.Entry
import com.kura.app.data.model.Label
import com.kura.app.ui.components.ConfirmDialog
import com.kura.app.ui.components.EntryTypeIcon
import com.kura.app.ui.components.entryTypeDisplayName
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryDetailScreen(
    entryId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    onEdit: () -> Unit,
    onDeleted: () -> Unit = onBack
) {
    var entry by remember { mutableStateOf<Entry?>(null) }
    var labels by remember { mutableStateOf<List<Label>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
    var showDeleteDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    LaunchedEffect(entryId) {
        try {
            entry = appViewModel.repository.getEntry(entryId)
            labels = appViewModel.repository.listLabels()
        } catch (e: Exception) {
            error = e.message ?: "エラー"
        }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(entry?.name ?: "") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "戻る")
                    }
                },
                actions = {
                    if (entry != null) {
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(Icons.Default.Delete, contentDescription = "ゴミ箱に移動")
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            if (entry != null) {
                FloatingActionButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = "編集")
                }
            }
        }
    ) { padding ->
        when {
            loading -> Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
            error.isNotEmpty() -> Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) { Text(error, color = MaterialTheme.colorScheme.error) }
            entry != null -> {
                val e = entry!!
                val typedValue = try { Json.parseToJsonElement(e.typedValue).jsonObject } catch (_: Exception) { JsonObject(emptyMap()) }
                val customFields: List<CustomField> = try {
                    e.customFields?.let { Json.decodeFromString<List<CustomField>>(it) } ?: emptyList()
                } catch (_: Exception) { emptyList() }
                val entryLabels = labels.filter { it.id in e.labels }

                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(padding)
                        .verticalScroll(rememberScrollState()),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Rich header
                    Surface(
                        color = MaterialTheme.colorScheme.primaryContainer,
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Row(
                            modifier = Modifier.padding(24.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            EntryTypeIcon(
                                e.entryType,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            Spacer(modifier = Modifier.width(16.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    e.name,
                                    style = MaterialTheme.typography.headlineSmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer
                                )
                                Text(
                                    entryTypeDisplayName(e.entryType),
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.7f)
                                )
                            }
                            IconButton(
                                onClick = {
                                    scope.launch {
                                        try {
                                            appViewModel.repository.setFavorite(entryId, !e.isFavorite)
                                            entry = appViewModel.repository.getEntry(entryId)
                                        } catch (_: Exception) { }
                                    }
                                }
                            ) {
                                Icon(
                                    if (e.isFavorite) Icons.Default.Star else Icons.Outlined.StarOutline,
                                    contentDescription = "お気に入り",
                                    tint = if (e.isFavorite) Color(0xFFD97706) else MaterialTheme.colorScheme.onPrimaryContainer,
                                    modifier = Modifier.size(28.dp)
                                )
                            }
                        }
                    }

                    // Content with padding
                    Column(
                        modifier = Modifier.padding(horizontal = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Labels
                        if (entryLabels.isNotEmpty()) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                entryLabels.forEach { label ->
                                    AssistChip(
                                        onClick = {},
                                        label = { Text(label.name) },
                                        leadingIcon = {
                                            Icon(
                                                Icons.Default.Label,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    )
                                }
                            }
                        }

                        // Typed fields section
                        val fieldEntries = typedValue.entries.filter { (key, value) ->
                            val strValue = when (value) {
                                is JsonPrimitive -> value.contentOrNull ?: ""
                                else -> value.toString()
                            }
                            strValue.isNotEmpty() && key != "totp"
                        }
                        if (fieldEntries.isNotEmpty()) {
                            DetailSection(title = "基本情報") {
                                fieldEntries.forEachIndexed { index, (key, value) ->
                                    val strValue = when (value) {
                                        is JsonPrimitive -> value.contentOrNull ?: ""
                                        else -> value.toString()
                                    }
                                    if (index > 0) {
                                        HorizontalDivider(
                                            modifier = Modifier.padding(horizontal = 16.dp),
                                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                                        )
                                    }
                                    val isSecret = key in listOf("password", "pin", "passphrase", "cvv", "private_key")
                                    DetailField(
                                        label = fieldDisplayName(key),
                                        value = strValue,
                                        isSecret = isSecret,
                                        context = context,
                                        isMultiLine = key == "private_key" || key == "content"
                                    )
                                }
                            }
                        }

                        // TOTP
                        val totpSecret = typedValue["totp"]?.jsonPrimitive?.contentOrNull
                        if (!totpSecret.isNullOrEmpty()) {
                            DetailSection(title = "ワンタイムパスワード") {
                                TotpField(secret = totpSecret, appViewModel = appViewModel, context = context)
                            }
                        }

                        // Notes
                        if (!e.notes.isNullOrEmpty()) {
                            DetailSection(title = "メモ") {
                                DetailField(label = "メモ", value = e.notes, context = context, isMultiLine = true)
                            }
                        }

                        // Custom fields
                        if (customFields.isNotEmpty()) {
                            DetailSection(title = "カスタムフィールド") {
                                customFields.forEachIndexed { index, field ->
                                    if (index > 0) {
                                        HorizontalDivider(
                                            modifier = Modifier.padding(horizontal = 16.dp),
                                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                                        )
                                    }
                                    DetailField(
                                        label = field.name,
                                        value = field.value,
                                        isSecret = field.fieldType == "password",
                                        context = context
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(80.dp)) // Space for FAB
                    }
                }
            }
        }
    }

    if (showDeleteDialog) {
        ConfirmDialog(
            title = "アイテムを削除",
            description = "このアイテムをゴミ箱に移動しますか？",
            confirmText = "ゴミ箱に移動",
            isDangerous = true,
            onConfirm = {
                scope.launch {
                    try {
                        appViewModel.repository.deleteEntry(entryId)
                        appViewModel.repository.saveAndPush(appViewModel.preferences.s3ConfigFlow.first())
                    } catch (_: Exception) { }
                    showDeleteDialog = false
                    onDeleted()
                }
            },
            onCancel = { showDeleteDialog = false }
        )
    }
}

@Composable
private fun DetailSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Surface(
        tonalElevation = 1.dp,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
        Column {
            Text(
                title,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.primary,
                modifier = Modifier.padding(start = 16.dp, top = 12.dp, end = 16.dp, bottom = 4.dp)
            )
            content()
        }
    }
}

@Composable
fun DetailField(
    label: String,
    value: String,
    isSecret: Boolean = false,
    context: Context,
    isMultiLine: Boolean = false
) {
    var visible by remember { mutableStateOf(!isSecret) }
    var copied by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(modifier = Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.Top) {
            Text(
                text = if (visible) value else "••••••••",
                style = if (isMultiLine) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge,
                fontFamily = if (isSecret || isMultiLine) FontFamily.Monospace else FontFamily.Default,
                modifier = Modifier.weight(1f)
            )
            if (isSecret) {
                IconButton(onClick = { visible = !visible }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = null,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            IconButton(
                onClick = {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText(label, value))
                    copied = true
                    scope.launch { delay(2000); copied = false }
                },
                modifier = Modifier.size(32.dp)
            ) {
                Icon(
                    if (copied) Icons.Default.Check else Icons.Default.ContentCopy,
                    contentDescription = "コピー",
                    modifier = Modifier.size(18.dp)
                )
            }
        }
    }
}

@Composable
fun TotpField(
    secret: String,
    appViewModel: AppViewModel,
    context: Context
) {
    var totpCode by remember { mutableStateOf("") }
    var copied by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(secret) {
        while (true) {
            try { totpCode = appViewModel.repository.generateTotpDefault(secret) } catch (_: Exception) { }
            delay(1000)
        }
    }

    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
        Text("TOTP", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Spacer(modifier = Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = totpCode,
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = androidx.compose.ui.unit.TextUnit(4f, androidx.compose.ui.unit.TextUnitType.Sp)
                ),
                modifier = Modifier.weight(1f)
            )
            IconButton(
                onClick = {
                    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                    clipboard.setPrimaryClip(ClipData.newPlainText("totp", totpCode))
                    copied = true
                    scope.launch { delay(2000); copied = false }
                }
            ) {
                Icon(if (copied) Icons.Default.Check else Icons.Default.ContentCopy, contentDescription = "コピー")
            }
        }
    }
}

fun fieldDisplayName(key: String): String = when (key) {
    "url" -> "URL"
    "username" -> "ユーザー名"
    "password" -> "パスワード"
    "totp" -> "TOTP シークレット"
    "bank_name" -> "銀行名"
    "account_number" -> "口座番号"
    "pin" -> "PIN"
    "private_key" -> "秘密鍵"
    "passphrase" -> "パスフレーズ"
    "content" -> "内容"
    "cardholder" -> "カード名義"
    "number" -> "カード番号"
    "expiry" -> "有効期限"
    "cvv" -> "CVV"
    else -> key
}
