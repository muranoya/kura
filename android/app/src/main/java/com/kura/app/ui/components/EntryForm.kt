package com.kura.app.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.kura.app.data.model.CustomField
import com.kura.app.data.model.CustomFieldType
import com.kura.app.data.model.Label
import kotlinx.serialization.json.*
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
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
    onGeneratePassword: (suspend (Int, Boolean, Boolean, Boolean, Boolean) -> String)? = null,
    onCopyToClipboard: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    val scrollState = rememberScrollState()

    Column(
        modifier = modifier
            .verticalScroll(scrollState)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Name field
        OutlinedTextField(
            value = name,
            onValueChange = onNameChange,
            label = { Text("名前") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true
        )

        // Type-specific fields
        when (entryType) {
            "login" -> {
                OutlinedTextField(
                    value = typedValues["url"] ?: "",
                    onValueChange = { onTypedValueChange("url", it) },
                    label = { Text("URL") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri)
                )
                OutlinedTextField(
                    value = typedValues["username"] ?: "",
                    onValueChange = { onTypedValueChange("username", it) },
                    label = { Text("ユーザー名") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                PasswordField(
                    value = typedValues["password"] ?: "",
                    onValueChange = { onTypedValueChange("password", it) },
                    label = "パスワード",
                    onGeneratePassword = onGeneratePassword,
                    onCopy = onCopyToClipboard
                )
                OutlinedTextField(
                    value = typedValues["totp"] ?: "",
                    onValueChange = { onTypedValueChange("totp", it) },
                    label = { Text("TOTP シークレット") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
            }
            "bank" -> {
                OutlinedTextField(
                    value = typedValues["bank_name"] ?: "",
                    onValueChange = { onTypedValueChange("bank_name", it) },
                    label = { Text("銀行名") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = typedValues["account_number"] ?: "",
                    onValueChange = { onTypedValueChange("account_number", it) },
                    label = { Text("口座番号") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                PasswordField(
                    value = typedValues["pin"] ?: "",
                    onValueChange = { onTypedValueChange("pin", it) },
                    label = "PIN",
                    onCopy = onCopyToClipboard
                )
            }
            "ssh_key" -> {
                OutlinedTextField(
                    value = typedValues["private_key"] ?: "",
                    onValueChange = { onTypedValueChange("private_key", it) },
                    label = { Text("秘密鍵") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3,
                    maxLines = 8
                )
                PasswordField(
                    value = typedValues["passphrase"] ?: "",
                    onValueChange = { onTypedValueChange("passphrase", it) },
                    label = "パスフレーズ",
                    onCopy = onCopyToClipboard
                )
            }
            "secure_note" -> {
                OutlinedTextField(
                    value = typedValues["content"] ?: "",
                    onValueChange = { onTypedValueChange("content", it) },
                    label = { Text("内容") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 5,
                    maxLines = 20
                )
            }
            "credit_card" -> {
                OutlinedTextField(
                    value = typedValues["cardholder"] ?: "",
                    onValueChange = { onTypedValueChange("cardholder", it) },
                    label = { Text("カード名義") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                OutlinedTextField(
                    value = typedValues["number"] ?: "",
                    onValueChange = { onTypedValueChange("number", it) },
                    label = { Text("カード番号") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                )
                OutlinedTextField(
                    value = typedValues["expiry"] ?: "",
                    onValueChange = { onTypedValueChange("expiry", it) },
                    label = { Text("有効期限") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true
                )
                PasswordField(
                    value = typedValues["cvv"] ?: "",
                    onValueChange = { onTypedValueChange("cvv", it) },
                    label = "CVV",
                    onCopy = onCopyToClipboard
                )
            }
        }

        // Notes
        if (entryType != "secure_note") {
            OutlinedTextField(
                value = notes,
                onValueChange = onNotesChange,
                label = { Text("メモ") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 6
            )
        }

        // Labels
        if (labels.isNotEmpty()) {
            Text("ラベル", style = MaterialTheme.typography.titleSmall)
            FlowRow(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                labels.forEach { label ->
                    FilterChip(
                        selected = label.id in selectedLabelIds,
                        onClick = { onLabelToggle(label.id) },
                        label = { Text(label.name) }
                    )
                }
            }
        }

        // Custom fields
        Text("カスタムフィールド", style = MaterialTheme.typography.titleSmall)
        customFields.forEachIndexed { index, field ->
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
        TextButton(
            onClick = {
                val newField = CustomField(
                    id = UUID.randomUUID().toString(),
                    name = "",
                    fieldType = "text",
                    value = ""
                )
                onCustomFieldsChange(customFields + newField)
            }
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Spacer(modifier = Modifier.width(4.dp))
            Text("フィールドを追加")
        }
    }
}

@Composable
fun PasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    onGeneratePassword: (suspend (Int, Boolean, Boolean, Boolean, Boolean) -> String)? = null,
    onCopy: ((String) -> Unit)? = null
) {
    var visible by remember { mutableStateOf(false) }
    var showGenerator by remember { mutableStateOf(false) }

    OutlinedTextField(
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
        }
    )

    if (showGenerator && onGeneratePassword != null) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = 4.dp)
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

@Composable
fun CustomFieldEditor(
    field: CustomField,
    onFieldChange: (CustomField) -> Unit,
    onRemove: () -> Unit
) {
    val fieldTypes = CustomFieldType.entries
    var expanded by remember { mutableStateOf(false) }

    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = field.name,
                    onValueChange = { onFieldChange(field.copy(name = it)) },
                    label = { Text("フィールド名") },
                    modifier = Modifier.weight(1f),
                    singleLine = true
                )
                Spacer(modifier = Modifier.width(8.dp))
                IconButton(onClick = onRemove) {
                    Icon(Icons.Default.Close, contentDescription = "削除", tint = MaterialTheme.colorScheme.error)
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Type selector
            ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
                OutlinedTextField(
                    value = CustomFieldType.fromValue(field.fieldType)?.displayName ?: field.fieldType,
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("タイプ") },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor()
                )
                ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
                    fieldTypes.forEach { type ->
                        DropdownMenuItem(
                            text = { Text(type.displayName) },
                            onClick = {
                                onFieldChange(field.copy(fieldType = type.value))
                                expanded = false
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Value
            val isPassword = field.fieldType == "password"
            var visible by remember { mutableStateOf(!isPassword) }

            OutlinedTextField(
                value = field.value,
                onValueChange = { onFieldChange(field.copy(value = it)) },
                label = { Text("値") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                visualTransformation = if (!visible) PasswordVisualTransformation() else VisualTransformation.None,
                trailingIcon = if (isPassword) {
                    {
                        IconButton(onClick = { visible = !visible }) {
                            Icon(
                                if (visible) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                contentDescription = null
                            )
                        }
                    }
                } else null
            )
        }
    }
}
