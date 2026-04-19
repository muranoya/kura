package net.meshpeak.kura.ui.entries

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Label
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.ripple
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material.icons.outlined.StarOutline
import net.meshpeak.kura.R
import net.meshpeak.kura.data.model.CustomField
import net.meshpeak.kura.data.model.Entry
import net.meshpeak.kura.data.model.Label
import net.meshpeak.kura.ui.components.ConfirmDialog
import net.meshpeak.kura.ui.components.LargeTextDialog
import net.meshpeak.kura.ui.components.MarkdownText
import net.meshpeak.kura.ui.components.EntryTypeIcon
import net.meshpeak.kura.ui.components.entryTypeDisplayName
import net.meshpeak.kura.util.ClipboardUtil
import net.meshpeak.kura.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

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
    val clipboardClearSeconds by appViewModel.preferences.clipboardClearSecondsFlow
        .collectAsState(initial = 30)

    val genericErrorText = stringResource(R.string.entry_generic_error)
    LaunchedEffect(entryId) {
        try {
            entry = appViewModel.repository.getEntry(entryId)
            labels = appViewModel.repository.listLabels()
        } catch (e: Exception) {
            error = e.message ?: genericErrorText
        }
        loading = false
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {},
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = stringResource(R.string.cd_back))
                    }
                },
                actions = {
                    if (entry != null) {
                        IconButton(onClick = { showDeleteDialog = true }) {
                            Icon(Icons.Default.Delete, contentDescription = stringResource(R.string.cd_trash))
                        }
                    }
                }
            )
        },
        floatingActionButton = {
            if (entry != null) {
                FloatingActionButton(onClick = onEdit) {
                    Icon(Icons.Default.Edit, contentDescription = stringResource(R.string.cd_edit))
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
                                            appViewModel.repository.saveLocally()
                                            scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
                                            entry = appViewModel.repository.getEntry(entryId)
                                        } catch (_: Exception) { }
                                    }
                                }
                            ) {
                                Icon(
                                    if (e.isFavorite) Icons.Default.Star else Icons.Outlined.StarOutline,
                                    contentDescription = stringResource(if (e.isFavorite) R.string.cd_favorite else R.string.cd_not_favorite),
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
                                                Icons.AutoMirrored.Filled.Label,
                                                contentDescription = null,
                                                modifier = Modifier.size(16.dp)
                                            )
                                        }
                                    )
                                }
                            }
                        }

                        // Typed fields section - ordered per entry type, show all fields
                        val orderedFields = typedFieldsForType(e.entryType)
                        if (orderedFields.isNotEmpty()) {
                            DetailSection(title = sectionHeaderForType(e.entryType)) {
                                orderedFields.forEachIndexed { index, key ->
                                    val rawValue = typedValue[key]
                                    val strValue = when (rawValue) {
                                        is JsonPrimitive -> rawValue.contentOrNull ?: ""
                                        null -> ""
                                        else -> rawValue.toString()
                                    }
                                    val isEmpty = strValue.isEmpty()
                                    if (index > 0) {
                                        HorizontalDivider(
                                            modifier = Modifier.padding(horizontal = 16.dp),
                                            color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                                        )
                                    }
                                    if (e.entryType == "secure_note" && key == "content") {
                                        if (isEmpty) {
                                            DetailField(
                                                label = fieldDisplayName(key),
                                                value = "",
                                                isEmpty = true,
                                                context = context,
                                                clipboardClearSeconds = clipboardClearSeconds,
                                            )
                                        } else {
                                            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
                                                MarkdownText(text = strValue)
                                            }
                                        }
                                    } else {
                                        val isSecret = key in listOf("password", "pin", "cvv", "private_key", "number")
                                        DetailField(
                                            label = fieldDisplayName(key),
                                            value = strValue,
                                            isSecret = isSecret,
                                            isEmpty = isEmpty,
                                            isUrl = key == "url",
                                            context = context,
                                            isMultiLine = key == "private_key" || key == "content",
                                            clipboardClearSeconds = clipboardClearSeconds,
                                        )
                                    }
                                }
                            }
                        }

                        // Custom fields
                        if (customFields.isNotEmpty()) {
                            Surface(
                                tonalElevation = 1.dp,
                                shape = RoundedCornerShape(12.dp),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column {
                                    customFields.forEachIndexed { index, field ->
                                        if (index > 0) {
                                            HorizontalDivider(
                                                modifier = Modifier.padding(horizontal = 16.dp),
                                                color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
                                            )
                                        }
                                        if (field.fieldType == "totp" && field.value.isNotEmpty()) {
                                            TotpField(
                                                label = field.name,
                                                value = field.value,
                                                appViewModel = appViewModel,
                                                context = context,
                                                clipboardClearSeconds = clipboardClearSeconds,
                                            )
                                        } else {
                                            DetailField(
                                                label = field.name,
                                                value = field.value,
                                                isSecret = field.fieldType == "password",
                                                isEmpty = field.value.isEmpty(),
                                                context = context,
                                                clipboardClearSeconds = clipboardClearSeconds,
                                            )
                                        }
                                    }
                                }
                            }
                        }

                        // Notes
                        DetailSection(title = stringResource(R.string.section_notes)) {
                            val hasNotes = !e.notes.isNullOrEmpty()
                            DetailField(
                                label = stringResource(R.string.field_notes),
                                value = e.notes ?: "",
                                isEmpty = !hasNotes,
                                context = context,
                                isMultiLine = true,
                                showLargeText = false,
                                copyable = false
                            )
                        }

                        // Timestamps
                        Surface(
                            tonalElevation = 1.dp,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        stringResource(R.string.entry_detail_updated),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        formatTimestamp(e.updatedAt),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween
                                ) {
                                    Text(
                                        stringResource(R.string.entry_detail_created),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
                                    )
                                    Text(
                                        formatTimestamp(e.createdAt),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant
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
            title = stringResource(R.string.entry_detail_delete_title),
            description = stringResource(R.string.entry_detail_delete_description),
            confirmText = stringResource(R.string.action_move_to_trash),
            isDangerous = true,
            onConfirm = {
                scope.launch {
                    try {
                        appViewModel.repository.deleteEntry(entryId)
                        appViewModel.repository.saveLocally()
                        scope.launch { try { appViewModel.repository.syncInBackground(appViewModel.preferences.s3ConfigFlow.first()) } catch (_: Exception) { } }
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
    isEmpty: Boolean = false,
    isUrl: Boolean = false,
    context: Context,
    isMultiLine: Boolean = false,
    showLargeText: Boolean = true,
    copyable: Boolean = true,
    clipboardClearSeconds: Int = 30,
) {
    var visible by remember { mutableStateOf(!isSecret) }
    var copied by remember { mutableStateOf(false) }
    var largeTextOpen by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    val backgroundColor by animateColorAsState(
        targetValue = if (copied) MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f) else Color.Transparent,
        animationSpec = tween(durationMillis = 300),
        label = "copyFeedback"
    )

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .then(
                if (!isEmpty && (copyable || isUrl)) {
                    Modifier.clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = ripple()
                    ) {
                        if (isUrl) {
                            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(value))
                            context.startActivity(intent)
                        } else {
                            val copyValue = if (isSecret && !visible) value else value
                            ClipboardUtil.copyToClipboard(context, label, copyValue, clipboardClearSeconds, scope)
                            copied = true
                            scope.launch { delay(1500); copied = false }
                        }
                    }
                } else {
                    Modifier
                }
            )
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.Top
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        label,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (copied) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            stringResource(R.string.feedback_copied),
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
                Spacer(modifier = Modifier.height(4.dp))
                if (isEmpty) {
                    Text(
                        stringResource(R.string.feedback_empty_value),
                        style = MaterialTheme.typography.bodyMedium,
                        fontStyle = FontStyle.Italic,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                    )
                } else {
                    Text(
                        text = if (visible) value else "••••••••",
                        style = if (isMultiLine) MaterialTheme.typography.bodyMedium else MaterialTheme.typography.bodyLarge,
                        fontFamily = if (isSecret || isMultiLine) FontFamily.Monospace else FontFamily.Default,
                    )
                }
            }
            if (!isEmpty && showLargeText) {
                IconButton(onClick = { largeTextOpen = true }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        Icons.Default.OpenInFull,
                        contentDescription = stringResource(R.string.cd_expand),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            if (isUrl && !isEmpty) {
                IconButton(onClick = {
                    ClipboardUtil.copyToClipboard(context, label, value, clipboardClearSeconds, scope)
                    copied = true
                    scope.launch { delay(1500); copied = false }
                }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        Icons.Default.ContentCopy,
                        contentDescription = stringResource(R.string.cd_copy),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
            if (isSecret && !isEmpty) {
                IconButton(onClick = { visible = !visible }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = stringResource(if (visible) R.string.cd_hide else R.string.cd_show),
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }

    if (largeTextOpen) {
        LargeTextDialog(
            label = label,
            value = value,
            onDismiss = { largeTextOpen = false }
        )
    }
}

@Composable
fun TotpField(
    value: String,
    appViewModel: AppViewModel,
    context: Context,
    label: String = "TOTP",
    clipboardClearSeconds: Int = 30,
) {
    var totpCode by remember { mutableStateOf("") }
    var copied by remember { mutableStateOf(false) }
    var largeTextOpen by remember { mutableStateOf(false) }
    var period by remember { mutableStateOf(30L) }
    var remainingSeconds by remember { mutableStateOf(0) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(value) {
        period = try { appViewModel.repository.parseTotpPeriod(value) } catch (_: Exception) { 30L }
        while (true) {
            val now = System.currentTimeMillis() / 1000
            val remaining = (period - (now % period)).toInt()
            remainingSeconds = remaining
            if (totpCode.isEmpty() || remaining == period.toInt()) {
                try { totpCode = appViewModel.repository.generateTotpFromValue(value) } catch (_: Exception) { }
            }
            delay(1000)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = ripple()
            ) {
                ClipboardUtil.copyToClipboard(context, "totp", totpCode, clipboardClearSeconds, scope)
                copied = true
                scope.launch { delay(1500); copied = false }
            }
            .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                label,
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (copied) {
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    stringResource(R.string.feedback_copied),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.primary
                )
            }
        }
        Spacer(modifier = Modifier.height(4.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Text(
                text = totpCode,
                style = MaterialTheme.typography.headlineSmall.copy(
                    fontFamily = FontFamily.Monospace,
                    letterSpacing = 4.sp
                )
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { largeTextOpen = true }, modifier = Modifier.size(32.dp)) {
                    Icon(
                        Icons.Default.OpenInFull,
                        contentDescription = stringResource(R.string.cd_expand),
                        modifier = Modifier.size(18.dp)
                    )
                }
                Spacer(modifier = Modifier.width(4.dp))
                TotpCountdownCircle(
                    remainingSeconds = remainingSeconds,
                    period = period.toInt()
                )
            }
        }
    }

    if (largeTextOpen) {
        LargeTextDialog(
            label = label,
            value = totpCode,
            onDismiss = { largeTextOpen = false }
        )
    }
}

@Composable
private fun TotpCountdownCircle(
    remainingSeconds: Int,
    period: Int
) {
    val trackColor = MaterialTheme.colorScheme.outlineVariant
    val arcColor = MaterialTheme.colorScheme.primary
    val textColor = MaterialTheme.colorScheme.onSurfaceVariant
    val textMeasurer = rememberTextMeasurer()
    val text = remainingSeconds.toString()
    val textStyle = TextStyle(fontSize = 8.sp, color = textColor)
    val textLayoutResult = remember(text) { textMeasurer.measure(text, textStyle) }

    Canvas(modifier = Modifier.size(28.dp)) {
        val strokeWidth = 2.5.dp.toPx()
        val radius = (size.minDimension - strokeWidth) / 2f
        val topLeft = Offset(
            (size.width - radius * 2) / 2f,
            (size.height - radius * 2) / 2f
        )
        val arcSize = Size(radius * 2, radius * 2)

        drawCircle(
            color = trackColor,
            radius = radius,
            style = Stroke(width = strokeWidth)
        )

        val sweepAngle = if (period > 0) 360f * remainingSeconds / period else 0f
        drawArc(
            color = arcColor,
            startAngle = -90f,
            sweepAngle = sweepAngle,
            useCenter = false,
            topLeft = topLeft,
            size = arcSize,
            style = Stroke(width = strokeWidth, cap = StrokeCap.Round)
        )

        drawText(
            textLayoutResult = textLayoutResult,
            topLeft = Offset(
                (size.width - textLayoutResult.size.width) / 2f,
                (size.height - textLayoutResult.size.height) / 2f
            )
        )
    }
}

@Composable
fun sectionHeaderForType(entryType: String): String = stringResource(
    when (entryType) {
        "login" -> R.string.section_login
        "bank" -> R.string.section_bank
        "credit_card" -> R.string.section_credit_card
        "ssh_key" -> R.string.section_ssh_key
        "secure_note" -> R.string.section_secure_note
        "password" -> R.string.section_password
        "software_license" -> R.string.section_software_license
        else -> R.string.section_default
    }
)

fun typedFieldsForType(entryType: String): List<String> = when (entryType) {
    "login" -> listOf("username", "password", "url")
    "bank" -> listOf("bank_name", "branch_code", "account_type", "account_holder", "account_number", "pin")
    "ssh_key" -> listOf("private_key")
    "secure_note" -> listOf("content")
    "credit_card" -> listOf("cardholder", "number", "expiry", "cvv", "pin")
    "password" -> listOf("username", "password")
    "software_license" -> listOf("license_key")
    else -> emptyList()
}

@Composable
fun fieldDisplayName(key: String): String {
    val resId = when (key) {
        "url" -> R.string.field_url
        "username" -> R.string.field_username
        "password" -> R.string.field_password
        "bank_name" -> R.string.field_bank_name
        "branch_code" -> R.string.field_branch_code
        "account_type" -> R.string.field_account_type
        "account_holder" -> R.string.field_account_holder
        "account_number" -> R.string.field_account_number
        "pin" -> R.string.field_pin
        "private_key" -> R.string.field_private_key
        "content" -> R.string.field_content
        "cardholder" -> R.string.field_cardholder
        "number" -> R.string.field_number
        "expiry" -> R.string.field_expiry
        "cvv" -> R.string.field_cvv
        "license_key" -> R.string.field_license_key
        else -> return key
    }
    return stringResource(resId)
}

private fun formatTimestamp(epochSeconds: Long): String {
    if (epochSeconds == 0L) return "-"
    val instant = Instant.ofEpochSecond(epochSeconds)
    val formatter = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm")
        .withZone(ZoneId.systemDefault())
    return formatter.format(instant)
}
