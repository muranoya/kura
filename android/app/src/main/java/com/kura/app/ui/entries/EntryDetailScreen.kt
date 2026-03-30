package com.kura.app.ui.entries

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
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
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.CustomField
import com.kura.app.data.model.Entry
import com.kura.app.data.model.Label
import com.kura.app.ui.components.EntryTypeIcon
import com.kura.app.ui.components.entryTypeDisplayName
import com.kura.app.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EntryDetailScreen(
    entryId: String,
    appViewModel: AppViewModel,
    onBack: () -> Unit,
    onEdit: () -> Unit
) {
    var entry by remember { mutableStateOf<Entry?>(null) }
    var labels by remember { mutableStateOf<List<Label>>(emptyList()) }
    var loading by remember { mutableStateOf(true) }
    var error by remember { mutableStateOf("") }
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
                        .verticalScroll(rememberScrollState())
                        .padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    // Header
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        EntryTypeIcon(e.entryType, modifier = Modifier.size(32.dp), tint = MaterialTheme.colorScheme.primary)
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(e.name, style = MaterialTheme.typography.headlineSmall)
                            Text(entryTypeDisplayName(e.entryType), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Spacer(modifier = Modifier.weight(1f))
                        if (e.isFavorite) Icon(Icons.Default.Star, contentDescription = "お気に入り", tint = MaterialTheme.colorScheme.primary)
                    }

                    HorizontalDivider()

                    // Labels
                    if (entryLabels.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            entryLabels.forEach { label ->
                                AssistChip(onClick = {}, label = { Text(label.name) })
                            }
                        }
                    }

                    // Typed fields
                    typedValue.entries.forEach { (key, value) ->
                        val strValue = when (value) {
                            is JsonPrimitive -> value.contentOrNull ?: ""
                            else -> value.toString()
                        }
                        if (strValue.isNotEmpty()) {
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

                    // TOTP
                    val totpSecret = typedValue["totp"]?.jsonPrimitive?.contentOrNull
                    if (!totpSecret.isNullOrEmpty()) {
                        TotpField(secret = totpSecret, appViewModel = appViewModel, context = context)
                    }

                    // Notes
                    if (!e.notes.isNullOrEmpty()) {
                        DetailField(label = "メモ", value = e.notes, context = context, isMultiLine = true)
                    }

                    // Custom fields
                    if (customFields.isNotEmpty()) {
                        Text("カスタムフィールド", style = MaterialTheme.typography.titleSmall)
                        customFields.forEach { field ->
                            DetailField(
                                label = field.name,
                                value = field.value,
                                isSecret = field.fieldType == "password",
                                context = context
                            )
                        }
                    }
                }
            }
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

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
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
                    IconButton(onClick = { visible = !visible }, modifier = Modifier.size(24.dp)) {
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
                    modifier = Modifier.size(24.dp)
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

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Text("TOTP", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Spacer(modifier = Modifier.height(4.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = totpCode,
                    style = MaterialTheme.typography.headlineSmall.copy(fontFamily = FontFamily.Monospace, letterSpacing = androidx.compose.ui.unit.TextUnit(4f, androidx.compose.ui.unit.TextUnitType.Sp)),
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
