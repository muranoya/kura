package net.meshpeak.kura.ui.components

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
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import net.meshpeak.kura.R
import net.meshpeak.kura.data.model.CustomField
import net.meshpeak.kura.data.model.CustomFieldType
import net.meshpeak.kura.data.model.Label
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
    onGeneratePassword: (suspend (Int, Boolean, Boolean, Boolean, Boolean, Boolean, Boolean) -> String)? = null,
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
            .imePadding()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // Name field - prominent, borderless
        TextField(
            value = name,
            onValueChange = onNameChange,
            placeholder = { Text(stringResource(R.string.field_name_placeholder), style = MaterialTheme.typography.headlineSmall) },
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
                        label = stringResource(R.string.field_username)
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["password"] ?: "",
                        onValueChange = { onTypedValueChange("password", it) },
                        label = stringResource(R.string.field_password),
                        onGeneratePassword = onGeneratePassword,
                        onCopy = onCopyToClipboard
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["url"] ?: "",
                        onValueChange = { onTypedValueChange("url", it) },
                        label = stringResource(R.string.field_url),
                        keyboardType = KeyboardType.Uri
                    )
                }
                "bank" -> {
                    FlatTextField(
                        value = typedValues["bank_name"] ?: "",
                        onValueChange = { onTypedValueChange("bank_name", it) },
                        label = stringResource(R.string.field_bank_name)
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["branch_code"] ?: "",
                        onValueChange = { onTypedValueChange("branch_code", it) },
                        label = stringResource(R.string.field_branch_code)
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["account_type"] ?: "",
                        onValueChange = { onTypedValueChange("account_type", it) },
                        label = stringResource(R.string.field_account_type)
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["account_holder"] ?: "",
                        onValueChange = { onTypedValueChange("account_holder", it) },
                        label = stringResource(R.string.field_account_holder)
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["account_number"] ?: "",
                        onValueChange = { onTypedValueChange("account_number", it) },
                        label = stringResource(R.string.field_account_number)
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["pin"] ?: "",
                        onValueChange = { onTypedValueChange("pin", it) },
                        label = stringResource(R.string.field_pin),
                        onCopy = onCopyToClipboard
                    )
                }
                "ssh_key" -> {
                    FlatTextField(
                        value = typedValues["private_key"] ?: "",
                        onValueChange = { onTypedValueChange("private_key", it) },
                        label = stringResource(R.string.field_private_key),
                        minLines = 3,
                        maxLines = 8,
                        singleLine = false
                    )
                }
                "secure_note" -> {
                    FlatTextField(
                        value = typedValues["content"] ?: "",
                        onValueChange = { onTypedValueChange("content", it) },
                        label = stringResource(R.string.field_content),
                        minLines = 5,
                        maxLines = 20,
                        singleLine = false
                    )
                }
                "credit_card" -> {
                    FlatTextField(
                        value = typedValues["cardholder"] ?: "",
                        onValueChange = { onTypedValueChange("cardholder", it) },
                        label = stringResource(R.string.field_cardholder)
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["number"] ?: "",
                        onValueChange = { onTypedValueChange("number", it) },
                        label = stringResource(R.string.field_number),
                        keyboardType = KeyboardType.Number
                    )
                    SectionDivider()
                    FlatTextField(
                        value = typedValues["expiry"] ?: "",
                        onValueChange = { onTypedValueChange("expiry", it) },
                        label = stringResource(R.string.field_expiry)
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["cvv"] ?: "",
                        onValueChange = { onTypedValueChange("cvv", it) },
                        label = stringResource(R.string.field_cvv),
                        onCopy = onCopyToClipboard
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["pin"] ?: "",
                        onValueChange = { onTypedValueChange("pin", it) },
                        label = stringResource(R.string.field_pin),
                        onCopy = onCopyToClipboard
                    )
                }
                "password" -> {
                    FlatTextField(
                        value = typedValues["username"] ?: "",
                        onValueChange = { onTypedValueChange("username", it) },
                        label = stringResource(R.string.field_username)
                    )
                    SectionDivider()
                    PasswordField(
                        value = typedValues["password"] ?: "",
                        onValueChange = { onTypedValueChange("password", it) },
                        label = stringResource(R.string.field_password),
                        onGeneratePassword = onGeneratePassword,
                        onCopy = onCopyToClipboard
                    )
                }
                "software_license" -> {
                    FlatTextField(
                        value = typedValues["license_key"] ?: "",
                        onValueChange = { onTypedValueChange("license_key", it) },
                        label = stringResource(R.string.field_license_key),
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
            onCustomFieldsChange = onCustomFieldsChange,
            onGeneratePassword = onGeneratePassword
        )

        // Notes section
        FormSection(title = stringResource(R.string.section_notes)) {
            FlatTextField(
                value = notes,
                onValueChange = onNotesChange,
                label = stringResource(R.string.field_notes),
                minLines = 2,
                maxLines = 6,
                singleLine = false
            )
        }

        // Labels section
        if (labels.isNotEmpty() || onCreateLabel != null) {
            FormSection(title = stringResource(R.string.section_labels)) {
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
                            label = { Text(stringResource(R.string.label_new_chip)) },
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
                title = { Text(stringResource(R.string.label_new_dialog_title)) },
                text = {
                    OutlinedTextField(
                        value = newLabelName,
                        onValueChange = { newLabelName = it },
                        placeholder = { Text(stringResource(R.string.label_new_name_placeholder)) },
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
                            Text(stringResource(R.string.action_add))
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
                        Text(stringResource(R.string.action_cancel))
                    }
                }
            )
        }
    }
}

@Composable
private fun CustomFieldsSection(
    customFields: List<CustomField>,
    onCustomFieldsChange: (List<CustomField>) -> Unit,
    onGeneratePassword: (suspend (Int, Boolean, Boolean, Boolean, Boolean, Boolean, Boolean) -> String)? = null
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
                },
                canMoveUp = customFields.size > 1 && index > 0,
                canMoveDown = customFields.size > 1 && index < customFields.lastIndex,
                onMoveUp = if (customFields.size > 1 && index > 0) {
                    {
                        val newList = customFields.toMutableList()
                        val temp = newList[index]
                        newList[index] = newList[index - 1]
                        newList[index - 1] = temp
                        onCustomFieldsChange(newList)
                    }
                } else null,
                onMoveDown = if (customFields.size > 1 && index < customFields.lastIndex) {
                    {
                        val newList = customFields.toMutableList()
                        val temp = newList[index]
                        newList[index] = newList[index + 1]
                        newList[index + 1] = temp
                        onCustomFieldsChange(newList)
                    }
                } else null,
                onGeneratePassword = onGeneratePassword
            )
        }
        if (customFields.isNotEmpty()) SectionDivider()

        if (showTypeSelector) {
            // Type selection chips
            Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
                Text(
                    stringResource(R.string.custom_field_select_type),
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
                            label = { Text(stringResource(type.displayNameResId)) },
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
                    Text(stringResource(R.string.action_cancel))
                }
            }
        } else {
            TextButton(
                onClick = { showTypeSelector = true },
                modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(stringResource(R.string.custom_field_add))
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

@Composable
private fun sectionTitle(entryType: String): String = stringResource(
    when (entryType) {
        "login" -> R.string.section_login
        "bank" -> R.string.section_bank
        "ssh_key" -> R.string.section_ssh_key
        "secure_note" -> R.string.section_secure_note
        "credit_card" -> R.string.section_credit_card
        "password" -> R.string.section_password
        "software_license" -> R.string.section_software_license
        else -> R.string.section_default
    }
)

@Composable
fun PasswordField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    onGeneratePassword: (suspend (Int, Boolean, Boolean, Boolean, Boolean, Boolean, Boolean) -> String)? = null,
    onCopy: ((String) -> Unit)? = null
) {
    var isFocused by remember { mutableStateOf(false) }
    var showGenerator by remember { mutableStateOf(false) }

    TextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        modifier = Modifier.fillMaxWidth().onFocusChanged { isFocused = it.isFocused },
        singleLine = true,
        visualTransformation = if (isFocused) VisualTransformation.None else PasswordVisualTransformation(),
        trailingIcon = {
            Row {
                if (onCopy != null && value.isNotEmpty()) {
                    IconButton(onClick = { onCopy(value) }) {
                        Icon(Icons.Default.ContentCopy, contentDescription = stringResource(R.string.cd_copy))
                    }
                }
                if (onGeneratePassword != null) {
                    IconButton(onClick = { showGenerator = !showGenerator }) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = stringResource(R.string.cd_generate_password))
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
                onCopy = {},
                onUse = { generated ->
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
    onRemove: () -> Unit,
    canMoveUp: Boolean = false,
    canMoveDown: Boolean = false,
    onMoveUp: (() -> Unit)? = null,
    onMoveDown: (() -> Unit)? = null,
    onGeneratePassword: (suspend (Int, Boolean, Boolean, Boolean, Boolean, Boolean, Boolean) -> String)? = null
) {
    val isSecret = field.fieldType == "password" || field.fieldType == "totp"
    var isValueFocused by remember { mutableStateOf(false) }
    var showGenerator by remember { mutableStateOf(false) }
    val showGenerateButton = field.fieldType == "password" && onGeneratePassword != null

    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        // Row 1: Field name + type badge (read-only) + delete
        Row(verticalAlignment = Alignment.CenterVertically) {
            TextField(
                value = field.name,
                onValueChange = { onFieldChange(field.copy(name = it)) },
                placeholder = { Text(stringResource(R.string.custom_field_name_placeholder)) },
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
                    text = CustomFieldType.fromValue(field.fieldType)?.let { stringResource(it.displayNameResId) } ?: field.fieldType,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)
                )
            }
            if (onMoveUp != null || onMoveDown != null) {
                IconButton(
                    onClick = { onMoveUp?.invoke() },
                    enabled = canMoveUp,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.KeyboardArrowUp,
                        contentDescription = stringResource(R.string.cd_move_up),
                        modifier = Modifier.size(20.dp)
                    )
                }
                IconButton(
                    onClick = { onMoveDown?.invoke() },
                    enabled = canMoveDown,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.KeyboardArrowDown,
                        contentDescription = stringResource(R.string.cd_move_down),
                        modifier = Modifier.size(20.dp)
                    )
                }
            }
            IconButton(onClick = onRemove, modifier = Modifier.size(32.dp)) {
                Icon(
                    Icons.Default.RemoveCircleOutline,
                    contentDescription = stringResource(R.string.cd_delete),
                    tint = MaterialTheme.colorScheme.error,
                    modifier = Modifier.size(20.dp)
                )
            }
        }

        // Row 2: Value
        TextField(
            value = field.value,
            onValueChange = { onFieldChange(field.copy(value = it)) },
            modifier = Modifier.fillMaxWidth().onFocusChanged { isValueFocused = it.isFocused },
            singleLine = true,
            placeholder = { Text(if (field.fieldType == "totp") stringResource(R.string.field_totp_placeholder) else stringResource(R.string.field_value_placeholder)) },
            visualTransformation = if (!isValueFocused && isSecret) PasswordVisualTransformation() else VisualTransformation.None,
            trailingIcon = if (showGenerateButton) {
                {
                    IconButton(onClick = { showGenerator = !showGenerator }) {
                        Icon(Icons.Default.AutoAwesome, contentDescription = stringResource(R.string.cd_generate_password))
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

        if (showGenerator && onGeneratePassword != null) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 4.dp)
            ) {
                PasswordGeneratorPanel(
                    onGenerate = onGeneratePassword,
                    onCopy = {},
                    onUse = { generated ->
                        onFieldChange(field.copy(value = generated))
                        showGenerator = false
                    },
                    modifier = Modifier.padding(12.dp)
                )
            }
        }
    }
}
