package com.kura.app.ui.onboarding

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.kura.app.ui.components.MarkdownText

@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    val context = LocalContext.current
    var lang by remember { mutableStateOf("ja") }
    var agreed by remember { mutableStateOf(false) }
    var showTermsDialog by remember { mutableStateOf(false) }

    val termsText by remember(lang) {
        derivedStateOf {
            try {
                context.assets.open("legal/terms_$lang.md").bufferedReader().readText()
            } catch (_: Exception) {
                ""
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            Icons.Default.Lock,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(24.dp))
        Text(
            text = "kura",
            style = MaterialTheme.typography.displaySmall,
            color = MaterialTheme.colorScheme.primary
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "パスワードマネージャー",
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(32.dp))
        Text(
            text = "サーバ不要、自分一人のための、\n運用コストゼロのパスワードマネージャー",
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Spacer(modifier = Modifier.height(24.dp))

        // 言語切替
        Row(
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TextButton(onClick = { lang = "ja" }) {
                Text(
                    text = "日本語",
                    color = if (lang == "ja") MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
            Text(
                text = "/",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 4.dp)
            )
            TextButton(onClick = { lang = "en" }) {
                Text(
                    text = "English",
                    color = if (lang == "en") MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // 同意チェックボックス
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(vertical = 8.dp)
        ) {
            Checkbox(
                checked = agreed,
                onCheckedChange = { agreed = it }
            )
            TextButton(onClick = { showTermsDialog = true }) {
                Text(
                    text = if (lang == "ja") "利用規約" else "Terms of Service",
                    color = MaterialTheme.colorScheme.primary
                )
            }
            Text(
                text = if (lang == "ja") "に同意する" else " — I agree",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = onStart,
            modifier = Modifier.fillMaxWidth(),
            enabled = agreed
        ) {
            Text(if (lang == "ja") "始める" else "Get Started")
        }
    }

    // 利用規約ダイアログ
    if (showTermsDialog) {
        AlertDialog(
            onDismissRequest = { showTermsDialog = false },
            title = {
                Text(
                    text = if (lang == "ja") "利用規約" else "Terms of Service",
                    style = MaterialTheme.typography.titleLarge
                )
            },
            text = {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 400.dp)
                        .verticalScroll(rememberScrollState())
                ) {
                    MarkdownText(
                        text = termsText,
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { showTermsDialog = false }) {
                    Text(if (lang == "ja") "閉じる" else "Close")
                }
            }
        )
    }
}
