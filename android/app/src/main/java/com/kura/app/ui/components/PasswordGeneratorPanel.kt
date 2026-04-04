package com.kura.app.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import kotlin.math.roundToInt

@Composable
fun PasswordGeneratorPanel(
    onGenerate: suspend (Int, Boolean, Boolean, Boolean) -> String,
    onCopy: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var password by remember { mutableStateOf("") }
    var length by remember { mutableFloatStateOf(16f) }
    var uppercase by remember { mutableStateOf(true) }
    var numbers by remember { mutableStateOf(true) }
    var symbols by remember { mutableStateOf(true) }
    var isGenerating by remember { mutableStateOf(false) }

    LaunchedEffect(length, uppercase, numbers, symbols) {
        isGenerating = true
        try {
            password = onGenerate(length.roundToInt(), uppercase, numbers, symbols)
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
                    .padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = password.ifEmpty { "..." },
                    style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace),
                    maxLines = 1,
                    modifier = Modifier
                        .weight(1f)
                        .horizontalScroll(rememberScrollState())
                )
                IconButton(onClick = { if (password.isNotEmpty()) onCopy(password) }) {
                    Icon(Icons.Default.ContentCopy, contentDescription = "コピー")
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Length slider
        Text("長さ: ${length.roundToInt()}", style = MaterialTheme.typography.bodyMedium)
        Slider(
            value = length,
            onValueChange = { length = it },
            valueRange = 4f..128f
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Toggle options
        Column {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { uppercase = !uppercase }
            ) {
                Checkbox(checked = uppercase, onCheckedChange = { uppercase = it })
                Text("大文字 (A-Z)", style = MaterialTheme.typography.bodyMedium)
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { numbers = !numbers }
            ) {
                Checkbox(checked = numbers, onCheckedChange = { numbers = it })
                Text("数字 (0-9)", style = MaterialTheme.typography.bodyMedium)
            }
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.clickable { symbols = !symbols }
            ) {
                Checkbox(checked = symbols, onCheckedChange = { symbols = it })
                Text("記号 (!@#)", style = MaterialTheme.typography.bodyMedium)
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Regenerate button
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
            Text("再生成")
        }
    }
}
