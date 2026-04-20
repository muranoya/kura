package net.meshpeak.kura.ui.onboarding

import androidx.appcompat.app.AppCompatDelegate
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowDropDown
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.os.LocaleListCompat
import java.util.Locale
import net.meshpeak.kura.R
import net.meshpeak.kura.ui.components.MarkdownText
import net.meshpeak.kura.util.findActivity

@Composable
fun WelcomeScreen(onStart: () -> Unit) {
    val context = LocalContext.current
    var agreed by remember { mutableStateOf(false) }
    var showTermsDialog by remember { mutableStateOf(false) }

    val termsText by remember {
        derivedStateOf {
            val lang = Locale.getDefault().language
            val candidates = listOf("legal/terms_${lang}.md", "legal/terms_ja.md")
            candidates.firstNotNullOfOrNull { path ->
                runCatching { context.assets.open(path).bufferedReader().readText() }.getOrNull()
            } ?: ""
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        WelcomeLanguageToggle(
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(horizontal = 8.dp, vertical = 4.dp)
        )

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
                text = stringResource(R.string.welcome_title),
                style = MaterialTheme.typography.displaySmall,
                color = MaterialTheme.colorScheme.primary
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                text = stringResource(R.string.welcome_subtitle),
                style = MaterialTheme.typography.titleMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(32.dp))
            Text(
                text = stringResource(R.string.welcome_tagline),
                style = MaterialTheme.typography.bodyLarge,
                textAlign = TextAlign.Center,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.height(24.dp))

            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.padding(vertical = 8.dp)
            ) {
                Checkbox(
                    checked = agreed,
                    onCheckedChange = { agreed = it },
                    modifier = Modifier.testTag("terms_checkbox")
                )
                val prefix = stringResource(R.string.welcome_terms_prefix)
                if (prefix.isNotEmpty()) {
                    Text(
                        text = prefix,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                TextButton(onClick = { showTermsDialog = true }) {
                    Text(
                        text = stringResource(R.string.welcome_terms_link),
                        color = MaterialTheme.colorScheme.primary
                    )
                }
                val suffix = stringResource(R.string.welcome_terms_suffix)
                if (suffix.isNotEmpty()) {
                    Text(
                        text = suffix,
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = onStart,
                modifier = Modifier.fillMaxWidth().testTag("start_button"),
                enabled = agreed
            ) {
                Text(stringResource(R.string.welcome_get_started))
            }
        }
    }

    if (showTermsDialog) {
        AlertDialog(
            onDismissRequest = { showTermsDialog = false },
            title = {
                Text(
                    text = stringResource(R.string.welcome_terms_link),
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
                    Text(stringResource(R.string.action_close))
                }
            }
        )
    }
}

@Composable
private fun WelcomeLanguageToggle(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var expanded by remember { mutableStateOf(false) }
    val currentLocales = AppCompatDelegate.getApplicationLocales()
    val currentTag = if (currentLocales.isEmpty) {
        Locale.getDefault().language
    } else {
        currentLocales.toLanguageTags().substringBefore(',')
    }
    val currentLabel = when (currentTag) {
        "ja" -> stringResource(R.string.settings_language_japanese)
        else -> stringResource(R.string.settings_language_english)
    }

    Box(modifier = modifier) {
        TextButton(
            onClick = { expanded = true },
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
        ) {
            Icon(
                Icons.Default.Language,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = currentLabel,
                style = MaterialTheme.typography.bodyMedium
            )
            Icon(
                Icons.Default.ArrowDropDown,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
        }
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            val options = listOf(
                "en" to stringResource(R.string.settings_language_english),
                "ja" to stringResource(R.string.settings_language_japanese)
            )
            options.forEach { (tag, label) ->
                DropdownMenuItem(
                    text = { Text(label) },
                    onClick = {
                        AppCompatDelegate.setApplicationLocales(
                            LocaleListCompat.forLanguageTags(tag)
                        )
                        expanded = false
                        context.findActivity()?.recreate()
                    }
                )
            }
        }
    }
}
