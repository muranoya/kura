package net.meshpeak.kura.ui.components

import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import net.meshpeak.kura.R

@Composable
fun ConfirmDialog(
    title: String,
    description: String,
    confirmText: String = stringResource(R.string.action_confirm),
    cancelText: String = stringResource(R.string.action_cancel),
    isDangerous: Boolean = false,
    onConfirm: () -> Unit,
    onCancel: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(title) },
        text = { Text(description) },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = if (isDangerous) ButtonDefaults.buttonColors(
                    containerColor = MaterialTheme.colorScheme.error
                ) else ButtonDefaults.buttonColors()
            ) {
                Text(confirmText)
            }
        },
        dismissButton = {
            TextButton(onClick = onCancel) {
                Text(cancelText)
            }
        }
    )
}
