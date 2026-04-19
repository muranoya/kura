package net.meshpeak.kura.ui.onboarding

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import net.meshpeak.kura.R
import net.meshpeak.kura.util.ClipboardUtil
import net.meshpeak.kura.viewmodel.AppViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RecoveryKeyScreen(
    recoveryKey: String,
    appViewModel: AppViewModel,
    onComplete: () -> Unit
) {
    val context = LocalContext.current
    var copied by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val clipboardClearSeconds by appViewModel.preferences.clipboardClearSecondsFlow
        .collectAsState(initial = 30)

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(R.string.recovery_key_title)) }) }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Card(
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Text(
                    text = recoveryKey,
                    modifier = Modifier.padding(16.dp).testTag("recovery_key_text"),
                    style = MaterialTheme.typography.bodyLarge.copy(fontFamily = FontFamily.Monospace)
                )
            }

            OutlinedButton(
                onClick = {
                    ClipboardUtil.copyToClipboard(context, "recovery_key", recoveryKey, clipboardClearSeconds, scope)
                    copied = true
                    scope.launch {
                        delay(2000)
                        copied = false
                    }
                },
                modifier = Modifier.fillMaxWidth()
            ) {
                Icon(
                    if (copied) Icons.Default.Check else Icons.Default.ContentCopy,
                    contentDescription = null
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(if (copied) stringResource(R.string.feedback_copied) else stringResource(R.string.action_copy))
            }

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = {
                    scope.launch {
                        try {
                            val s3Config = appViewModel.preferences.s3ConfigFlow.first()
                            if (s3Config != null) {
                                appViewModel.repository.saveAndSync(s3Config)
                            }
                        } catch (_: Exception) { }
                        onComplete()
                    }
                },
                modifier = Modifier.fillMaxWidth().testTag("complete_button")
            ) {
                Text(stringResource(R.string.action_complete))
            }
        }
    }
}
