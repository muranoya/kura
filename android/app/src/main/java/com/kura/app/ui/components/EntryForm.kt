package com.kura.app.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.CustomField
import com.kura.app.data.model.CustomFieldType
import com.kura.app.data.model.Label
import kotlinx.coroutines.launch
import kotlinx.serialization.json.*
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun EntryForm(
    entryType: String,
    name: String,
    onNameChange: (String) -> Unit,
    typedValues: Map<String, String>,
    onTypedValueChange: (String, String) -> Unit,
    notes: String,
    onNotesChange: (String) -> Unit,
    customFields: List<CustomField>,
    onCustomFieldsChange: (List<CustomField>) -> Unit,
    labels: List<Label>,
    selectedLabelIds: Set<String>,
    onLabelToggle: (String) -> Unit,
    onGeneratePassword: (suspend (Int, Boolean, Boolean, Boolean) -> String)? = null,
    onCopyToClipboard: ((String) -> Unit)? = null,
    onCreateLabel: (suspend (String) -> Label)? = null,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()
    val coroutineScope = rememberCoroutineScope()
    var showNewLabelInput by remember { mutableStateOf(false) }
    var newLabelName by remember { mutableStateOf("") }
    var creatingLabel by remember { mutableStateOf(false) }

    Column(
        modifier = modifier
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Name field - prominent, borderless
        TextField(
            value = name,
            onValueChange = onNameChange,
            placeholder = { Text("アイテム名を入力...", style = MaterialTheme.typography.headlineSmall) },
            textStyle = MaterialTheme.typography.headlineSmall,
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            colors = TextFieldDefaults.colors(
                unfocusedContainerColor = Color.Transparent,
                focusedContainerColor = Color.Transparent,
                unfocusedIndicatorColor = MaterialTheme.colorScheme.outlineVariant,
                focusedIndicatorColor = MaterialTheme.colorScheme.primary
            )
        )

        // Type-specific fields section
        FormSection(title = sectionTitle(entryType)) {
            when (entryType) {
                "login" -> {
                    FlatTextField(
                        value = typedValues["username"] ?: "",
                        onValueChange = { onTypedValueChange("username", it) },
                        label = "ユーザー名"
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["password"] ?: "",
                        onValueChange = { onTypedValueChange("password", it) },
                        label = "パスワード",
                        onGeneratePassword = onGeneratePassword,
                        onCopy = onCopyToClipboard
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["url"] ?: "",
                        onValueChange = { onTypedValueChange("url", it) },
                        label = "URL",
                        keyboardType = KeyboardType.Uri
                    )
                }
                "bank" -> {
                    FlatTextField(
                        value = typedValues["bank_name"] ?: "",
                        onValueChange = { onTypedValueChange("bank_name", it) },
                        label = "銀行名"
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["branch_code"] ?: "",
                        onValueChange = { onTypedValueChange("branch_code", it) },
                        label = "支店コード"
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["account_type"] ?: "",
                        onValueChange = { onTypedValueChange("account_type", it) },
                        label = "口座種別"
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["account_holder"] ?: "",
                        onValueChange = { onTypedValueChange("account_holder", it) },
                        label = "口座名義"
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["account_number"] ?: "",
                        onValueChange = { onTypedValueChange("account_number", it) },
                        label = "口座番号"
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["pin"] ?: "",
                        onValueChange = { onTypedValueChange("pin", it) },
                        label = "PIN",
                        onCopy = onCopyToClipboard
                    )
                }
                "ssh_key" -> {
                    FlatTextField(
                        value = typedValues["private_key"] ?: "",
                        onValueChange = { onTypedValueChange("private_key", it) },
                        label = "秘密鍵",
                        minLines = 3,
                        maxLines = 8,
                        singleLine = false
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["passphrase"] ?: "",
                        onValueChange = { onTypedValueChange("passphrase", it) },
                        label = "パスフレーズ",
                        onCopy = onCopyToClipboard
                    )
                }
                "secure_note" -> {
                    FlatTextField(
                        value = typedValues["content"] ?: "",
                        onValueChange = { onTypedValueChange("content", it) },
                        label = "内容",
                        minLines = 5,
                        maxLines = 20,
                        singleLine = false
                    )
                }
                "credit_card" -> {
                    FlatTextField(
                        value = typedValues["cardholder"] ?: "",
                        onValueChange = { onTypedValueChange("cardholder", it) },
                        label = "カード名義"
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["number"] ?: "",
                        onValueChange = { onTypedValueChange("number", it) },
                        label = "カード番号",
                        keyboardType = KeyboardType.Number
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["expiry"] ?: "",
                        onValueChange = { onTypedValueChange("expiry", it) },
                        label = "有効期限"
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["cvv"] ?: "",
                        onValueChange = { onTypedValueChange("cvv", it) },
                        label = "CVV",
                        onCopy = onCopyToClipboard
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["pin"] ?: "",
                        onValueChange = { onTypedValueChange("pin", it) },
                        label = "PIN",
                        onCopy = onCopyToClipboard
                    )
                }
                "password" -> {
                    FlatTextField(
                        value = typedValues["username"] ?: "",
                        onValueChange = { onTypedValueChange("username", it) },
                        label = "ユーザー名"
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["password"] ?: "",
                        onValueChange = { onTypedValueChange("password", it) },
                        label = "パスワード",
                        onGeneratePassword = onGeneratePassword,
                        onCopy = onCopyToClipboard
                    )
                }
                "software_license" -> {
                    FlatTextField(
                        value = typedValues["license_key"] ?: "",
                        onValueChange = { onTypedValueChange("license_key", it) },
                        label = "ライセンスキー",
                        minLines = 2,
                        maxLines = 6,
                        singleLine = false
                    )
                }
            }
        }

        // Custom fields section
        CustomFieldsSection(
            customFields = customFields,
            onCustomFieldsChange = onCustomFieldsChange
        )

        // Notes section
        FormSection(title = "メモ") {
            FlatTextField(
                value = notes,
                onValueChange = onNotesChange,
                label = "メモ",
                minLines = 2,
                maxLines = 6,
                singleLine = false
            )
        }

        // Labels section
        if (labels.isNotEmpty() || onCreateLabel != null) {
            FormSection(title = "ラベル") {
                FlowRow(
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    labels.forEach { label ->
                        FilterChip(
                            selected = label.id in selectedLabelIds,
                            onClick = { onLabelToggle(label.id) },
                            label = { Text(label.name) },
                            leadingIcon = if (label.id in selectedLabelIds) {
                                { Icon(Icons.Default.Check, contentDescription = null, modifier = Modifier.size(16.dp)) }
                            } else null
                        )
                    }
                    if (onCreateLabel != null) {
                        AssistChip(
                            onClick = { showNewLabelInput = true },
                            label = { Text("新規") },
                            leadingIcon = { Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp)) }
                        )
                    }
                }
            }
        }

        if (onCreateLabel != null && showNewLabelInput) {
            AlertDialog(
                onDismissRequest = {
                    if (!creatingLabel) {
                        showNewLabelInput = false
                        newLabelName = ""
                    }
                },
                title = { Text("新しいラベル") },
                text = {
                    OutlinedTextField(
                        value = newLabelName,
                        onValueChange = { newLabelName = it },
                        placeholder = { Text("ラベル名") },
                        singleLine = true,
                        enabled = !creatingLabel,
                        modifier = Modifier.fillMaxWidth()
                    )
                },
                confirmButton = {
                    TextButton(
                        onClick = {
                            val trimmed = newLabelName.trim()
                            if (trimmed.isNotEmpty() && !creatingLabel) {
                                creatingLabel = true
                                coroutineScope.launch {
                                    try {
                                        val label = onCreateLabel(trimmed)
                                        onLabelToggle(label.id)
                                        newLabelName = ""
                                        showNewLabelInput = false
                                    } catch (_: Exception) { }
                                    creatingLabel = false
                                }
                            }
                        },
                        enabled = newLabelName.trim().isNotEmpty() && !creatingLabel
                    ) {
                        if (creatingLabel) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp)
                        } else {
                            Text("追加")
                        }
                    }
                },
                dismissButton = {
                    TextButton(
                        onClick = {
                            showNewLabelInput = false
                            newLabelName = ""
                        },
                        enabled = !creatingLabel
                    ) {
                        Text("キャンセル")
                    }
                }
            )
        }
    }
}

@Composable
private fun CustomFieldsSection(
    customFields: List<CustomField>,
    onCustomFieldsChange: (List<CustomField>) -> Unit
) {
    var showTypeSelector by remember { mutableStateOf(false) }

    Surface(
        tonalElevation = 1.dp,
        shape = RoundedCornerShape(12.dp),
        modifier = Modifier.fillMaxWidth()
    ) {
      Column {
        customFields.forEachIndexed { index, field ->
            if (index > 0) SectionDivider()
            CustomFieldEditor(
                field = field,
                onFieldChange = { updated ->
                    val newList = customFields.toMutableList()
                    newList[index] = updated
                    onCustomFieldsChange(newList)
                },
                onRemove = {
                    val newList = customFields.toMutableList()
                    newList.removeAt(index)
                    onCustomFieldsChange(newList)
                }
            )
        }
        if (customFields.isNotEmpty()) SectionDivider()

        if (showTypeSelector) {
            // Type selection chips
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(
                    "フィールドの種類を選択",
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
                @OptIn(ExperimentalLayoutApi::class)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    CustomFieldType.entries.forEach { type ->
                        val icon = when (type) {
                            CustomFieldType.TEXT -> Icons.Default.TextFields
                            CustomFieldType.PASSWORD -> Icons.Default.Lock
                            CustomFieldType.EMAIL -> Icons.Default.Email
                            CustomFieldType.URL -> Icons.Default.Link
                            CustomFieldType.PHONE -> Icons.Default.Phone
                            CustomFieldType.TOTP -> Icons.Default.Timer
                        }
                        AssistChip(
                            onClick = {
                                val newField = CustomField(
                                    id = UUID.randomUUID().toString(),
                                    name = "",
                                    fieldType = type.value,
                                    value = ""
                                )
                                onCustomFieldsChange(customFields + newField)
                                showTypeSelector = false
                            },
                            label = { Text(type.displayName) },
                            leadingIcon = {
                                Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
                            }
                        )
                    }
                }
                TextButton(
                    onClick = { showTypeSelector = false },
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    Text("キャンセル")
                }
            }
        } else {
            TextButton(
                onClick = { showTypeSelector = true },
                modifier = Modifier.padding(horizontal = 8.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("フィールドを追加")
            }
        }
      }
    }
}

@Composable
private fun FormSection(
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
private fun SectionDivider() {
    HorizontalDivider(
        modifier = Modifier.padding(horizontal = 16.dp),
        color = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.5f)
    )
}

@Composable
private fun FlatTextField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    keyboardType: KeyboardType = KeyboardType.Text,
    singleLine: Boolean = true,
    minLines: Int = 1,
    maxLines: Int = 1
) {
    TextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = singleLine,
        minLines = minLines,
        maxLines = maxLines,
        keyboardOptions = KeyboardOptions(keyboardType = keyboardType),
        colors = TextFieldDefaults.colors(
            unfocusedContainerColor = Color.Transparent,
            focusedContainerColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent
        )
    )
}

private fun sectionTitle(entryType: String): String = when (entryType) {
    "login" -> "ログイン情報"
    "bank" -> "銀行口座情報"
    "ssh_key" -> "SSHキー情報"
    "secure_note" -> "ノート"
    "credit_card" -> "クレジットカード情報"
    "password" -> "パスワード情報"
    "software_license" -> "ライセンス情報"
    else -> "基本情報"
}

@Composable
fun PasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    onGeneratePassword: (suspend (Int, Boolean, Boolean, Boolean) -> String)? = null,
    onCopy: ((String) -> Unit)? = null
) {
    var visible by remember { mutableStateOf(false) }
    var showGenerator by remember { mutableStateOf(false) }

    TextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth(),
        singleLine = true,
        visualTransformation = if (visible) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            Row {
                IconButton(onClick = { visible = !visible }) {
                    Icon(
                        if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                        contentDescription = if (visible) "隠す" else "表示"
                    )
                }
                if (onCopy != null && value.isNotEmpty()) {
                    IconButton(onClick = { onCopy(value) }) {
                        Icon(Icons.Default.ContentCopy, contentDescription = "コピー")
                    }
                }
                if (onGeneratePassword != null) {
                    IconButton(onClick = { showGenerator = !showGenerator }) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = "生成")
                    }
                }
            }
        },
        colors = TextFieldDefaults.colors(
            unfocusedContainerColor = Color.Transparent,
            focusedContainerColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            focusedIndicatorColor = Color.Transparent
        )
    )

    if (showGenerator && onGeneratePassword != null) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 4.dp)
        ) {
            PasswordGeneratorPanel(
                onGenerate = onGeneratePassword,
                onCopy = { generated ->
                    onValueChange(generated)
                    showGenerator = false
                },
                modifier = Modifier.padding(12.dp)
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomFieldEditor(
    field: CustomField,
    onFieldChange: (CustomField) -> Unit,
    onRemove: () -> Unit
) {
    val isSecret = field.fieldType == "password" || field.fieldType == "totp"
    var visible by remember { mutableStateOf(!isSecret) }

    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        // Row 1: Field name + type badge (read-only) + delete
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextField(
                value = field.name,
                onValueChange = { onFieldChange(field.copy(name = it)) },
                placeholder = { Text("フィールド名") },
                modifier = Modifier.weight(1f),
                singleLine = true,
                textStyle = MaterialTheme.typography.bodyMedium,
                colors = TextFieldDefaults.colors(
                    unfocusedContainerColor = Color.Transparent,
                    focusedContainerColor = Color.Transparent,
                    unfocusedIndicatorColor = Color.Transparent,
                    focusedIndicatorColor = Color.Transparent
                )
            )
            Spacer(modifier = Modifier.width(4.dp))
            // Read-only type badge
            Surface(
                shape = RoundedCornerShape(8.dp),
                color = MaterialTheme.colorScheme.secondaryContainer,
            ) {
                Text(
                    text = CustomFieldType.fromValue(field.fieldType)?.displayName ?: field.fieldType,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                )
            }
            IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                Icon(
                    Icons.Default.RemoveCircleOutline,
                    contentDescription = "削除",
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // Row 2: Value
        TextField(
            value = field.value,
            onValueChange = { onFieldChange(field.copy(value = it)) },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
            placeholder = { Text(if (field.fieldType == "totp") "otpauth:// URI または Base32 シークレット" else "値") },
            visualTransformation = if (!visible && isSecret) PasswordVisualTransformation() else VisualTransformation.None,
            trailingIcon = if (isSecret) {
                {
                    IconButton(onClick = { visible = !visible }) {
                        Icon(
                            if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                            contentDescription = null,
                            modifier = Modifier.size(20.dp)
                        )
                    }
                }
            } else null,
            colors = TextFieldDefaults.colors(
                unfocusedContainerColor = Color.Transparent,
                focusedContainerColor = Color.Transparent,
                unfocusedIndicatorColor = Color.Transparent,
                focusedIndicatorColor = Color.Transparent
            )
        )
    }
}
