package com.kura.app.ui.components

import androidx.compose.foundation.layout.*
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
    onGenerate: suspend (Int, Boolean, Boolean, Boolean, Boolean) -> String,
    onCopy: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    var password by remember { mutableStateOf("") }
    var length by remember { mutableFloatStateOf(16f) }
    var uppercase by remember { mutableStateOf(true) }
    var lowercase by remember { mutableStateOf(true) }
    var numbers by remember { mutableStateOf(true) }
    var symbols by remember { mutableStateOf(true) }
    var isGenerating by remember { mutableStateOf(false) }

    LaunchedEffect(length, uppercase, lowercase, numbers, symbols) {
        if (!uppercase && !lowercase && !numbers && !symbols) return@LaunchedEffect
        isGenerating = true
        try {
            password = onGenerate(length.roundToInt(), uppercase, lowercase, numbers, symbols)
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
                    modifier = Modifier.weight(1f)
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
            valueRange = 4f..128f,
            steps = 123
        )

        Spacer(modifier = Modifier.height(8.dp))

        // Toggle options
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            FilterChip(selected = uppercase, onClick = { uppercase = !uppercase }, label = { Text("A-Z") })
            FilterChip(selected = lowercase, onClick = { lowercase = !lowercase }, label = { Text("a-z") })
            FilterChip(selected = numbers, onClick = { numbers = !numbers }, label = { Text("0-9") })
            FilterChip(selected = symbols, onClick = { symbols = !symbols }, label = { Text("!@#") })
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
