package net.meshpeak.kura.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import net.meshpeak.kura.R
import kotlin.math.roundToInt

@Composable
fun PasswordGeneratorPanel(
    onGenerate: suspend (Int, Boolean, Boolean, Boolean, Boolean, Boolean, Boolean) -> String,
    onCopy: (String) -> Unit,
    onUse: ((String) -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    var password by remember { mutableStateOf("") }
    var length by remember { mutableFloatStateOf(16f) }
    var lowercase by remember { mutableStateOf(true) }
    var uppercase by remember { mutableStateOf(true) }
    var numbers by remember { mutableStateOf(true) }
    var symbols1 by remember { mutableStateOf(true) }
    var symbols2 by remember { mutableStateOf(true) }
    var symbols3 by remember { mutableStateOf(true) }
    var isGenerating by remember { mutableStateOf(false) }

    LaunchedEffect(length, lowercase, uppercase, numbers, symbols1, symbols2, symbols3) {
        isGenerating = true
        try {
            password = onGenerate(length.roundToInt(), lowercase, uppercase, numbers, symbols1, symbols2, symbols3)
        } catch (_: Exception) { }
        isGenerating = false
    }

    Column(modifier = modifier) {
        // Generated password display
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = password.ifEmpty { "..." },
                    style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    modifier = Modifier
                        .weight(1f)
                        .horizontalScroll(rememberScrollState())
                )
                if (onUse != null) {
                    IconButton(
                        onClick = {
                            val currentLength = length
                            length = if (currentLength < 128f) currentLength + 0.01f else currentLength - 0.01f
                        }
                    ) {
                        Icon(Icons.Default.Refresh, contentDescription = stringResource(R.string.action_regenerate))
                    }
                    FilledTonalButton(
                        onClick = { if (password.isNotEmpty()) onUse(password) },
                        enabled = password.isNotEmpty()
                    ) {
                        Icon(Icons.Default.Check, contentDescription = null)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(stringResource(R.string.action_use))
                    }
                } else {
                    IconButton(onClick = { if (password.isNotEmpty()) onCopy(password) }) {
                        Icon(Icons.Default.ContentCopy, contentDescription = stringResource(R.string.cd_copy))
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Length slider
        Text(
            stringResource(R.string.pwgen_length, length.roundToInt()),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurface
        )
        Slider(
            value = length,
            onValueChange = { length = it },
            valueRange = 4f..128f
        )

        Spacer(modifier = Modifier.height(4.dp))

        // Toggle options
        if (onUse != null) {
            // Inline mode: collapsible chips
            var showCharOptions by remember { mutableStateOf(false) }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .clickable { showCharOptions = !showCharOptions }
                    .padding(vertical = 4.dp)
            ) {
                Icon(
                    imageVector = if (showCharOptions) Icons.Default.KeyboardArrowDown else Icons.AutoMirrored.Filled.KeyboardArrowRight,
                    contentDescription = null,
                    modifier = Modifier.size(20.dp),
                    tint = MaterialTheme.colorScheme.onSurface
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    stringResource(R.string.pwgen_character_settings),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }

            AnimatedVisibility(visible = showCharOptions) {
                @OptIn(ExperimentalLayoutApi::class)
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                    modifier = Modifier.padding(top = 4.dp)
                ) {
                    FilterChip(
                        selected = lowercase,
                        onClick = { lowercase = !lowercase },
                        label = { Text("a-z") }
                    )
                    FilterChip(
                        selected = uppercase,
                        onClick = { uppercase = !uppercase },
                        label = { Text("A-Z") }
                    )
                    FilterChip(
                        selected = numbers,
                        onClick = { numbers = !numbers },
                        label = { Text("0-9") }
                    )
                    FilterChip(
                        selected = symbols1,
                        onClick = { symbols1 = !symbols1 },
                        label = { Text("!@#\$%^&*") }
                    )
                    FilterChip(
                        selected = symbols2,
                        onClick = { symbols2 = !symbols2 },
                        label = { Text("()[]{}+=") }
                    )
                    FilterChip(
                        selected = symbols3,
                        onClick = { symbols3 = !symbols3 },
                        label = { Text("`<>'\"\\|") }
                    )
                }
            }
        } else {
            // Standalone mode: checkboxes
            Column {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { lowercase = !lowercase }
                ) {
                    Checkbox(checked = lowercase, onCheckedChange = { lowercase = it })
                    Text(stringResource(R.string.pwgen_lowercase), style = MaterialTheme.typography.bodyMedium)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { uppercase = !uppercase }
                ) {
                    Checkbox(checked = uppercase, onCheckedChange = { uppercase = it })
                    Text(stringResource(R.string.pwgen_uppercase), style = MaterialTheme.typography.bodyMedium)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { numbers = !numbers }
                ) {
                    Checkbox(checked = numbers, onCheckedChange = { numbers = it })
                    Text(stringResource(R.string.pwgen_numbers), style = MaterialTheme.typography.bodyMedium)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { symbols1 = !symbols1 }
                ) {
                    Checkbox(checked = symbols1, onCheckedChange = { symbols1 = it })
                    Text(stringResource(R.string.pwgen_symbols_basic), style = MaterialTheme.typography.bodyMedium)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { symbols2 = !symbols2 }
                ) {
                    Checkbox(checked = symbols2, onCheckedChange = { symbols2 = it })
                    Text(stringResource(R.string.pwgen_symbols_brackets), style = MaterialTheme.typography.bodyMedium)
                }
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.clickable { symbols3 = !symbols3 }
                ) {
                    Checkbox(checked = symbols3, onCheckedChange = { symbols3 = it })
                    Text(stringResource(R.string.pwgen_symbols_other), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Regenerate button (standalone only)
        if (onUse == null) {
            OutlinedButton(
                onClick = {
                    // Force re-generation by toggling a dummy value
                    val currentLength = length
                    length = if (currentLength < 128f) currentLength + 0.01f else currentLength - 0.01f
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(Icons.Default.Refresh, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.action_regenerate))
            }
        }
    }
}
