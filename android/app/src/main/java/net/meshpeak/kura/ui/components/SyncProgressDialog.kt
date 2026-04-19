package net.meshpeak.kura.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Error
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import net.meshpeak.kura.R
import kotlinx.coroutines.delay

enum class SyncDialogState {
    SYNCING, SUCCESS, ERROR
}

@Composable
fun SyncProgressDialog(
    state: SyncDialogState,
    errorMessage: String? = null,
    onDismiss: () -> Unit
) {
    if (state == SyncDialogState.SUCCESS) {
        LaunchedEffect(Unit) {
            delay(1500)
            onDismiss()
        }
    }

    AlertDialog(
        onDismissRequest = {
            if (state != SyncDialogState.SYNCING) onDismiss()
        },
        properties = DialogProperties(
            dismissOnBackPress = state != SyncDialogState.SYNCING,
            dismissOnClickOutside = state != SyncDialogState.SYNCING
        ),
        title = {
            Text(
                when (state) {
                    SyncDialogState.SYNCING -> stringResource(R.string.sync_in_progress)
                    SyncDialogState.SUCCESS -> stringResource(R.string.sync_success)
                    SyncDialogState.ERROR -> stringResource(R.string.sync_error)
                }
            )
        },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                when (state) {
                    SyncDialogState.SYNCING -> {
                        CircularProgressIndicator(modifier = Modifier.size(48.dp))
                    }
                    SyncDialogState.SUCCESS -> {
                        Icon(
                            Icons.Default.CheckCircle,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                    }
                    SyncDialogState.ERROR -> {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.error
                        )
                        Text(errorMessage ?: stringResource(R.string.sync_failed))
                    }
                }
            }
        },
        confirmButton = {
            if (state == SyncDialogState.ERROR) {
                TextButton(onClick = onDismiss) {
                    Text(stringResource(R.string.action_ok))
                }
            }
        }
    )
}
