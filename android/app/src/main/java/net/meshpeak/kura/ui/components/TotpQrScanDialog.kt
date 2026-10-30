package net.meshpeak.kura.ui.components

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch
import net.meshpeak.kura.R

@Composable
fun TotpQrSourceDialog(
    onCamera: () -> Unit,
    onGallery: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.totp_qr_source_title)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                TextButton(
                    onClick = onCamera,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.PhotoCamera, contentDescription = null)
                        Spacer(Modifier.width(12.dp))
                        Text(stringResource(R.string.totp_qr_use_camera))
                    }
                }
                TextButton(
                    onClick = onGallery,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Default.Image, contentDescription = null)
                        Spacer(Modifier.width(12.dp))
                        Text(stringResource(R.string.qr_from_gallery))
                    }
                }
            }
        },
        confirmButton = {},
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.action_cancel))
            }
        },
    )
}

/**
 * Launches the system image picker, decodes a TOTP QR, and reports the result.
 * Call [launch] from a click handler. While processing, shows a blocking progress dialog;
 * on failure shows an error dialog.
 */
@Composable
fun TotpQrGalleryImport(
    validateTotp: suspend (String) -> Boolean,
    onResult: (String) -> Unit,
    onIdle: () -> Unit = {},
): () -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var processing by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    val validateState = rememberUpdatedState(validateTotp)
    val onResultState = rememberUpdatedState(onResult)
    val onIdleState = rememberUpdatedState(onIdle)

    val launcher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) {
            onIdleState.value()
            return@rememberLauncherForActivityResult
        }
        scope.launch {
            processing = true
            errorMessage = null
            when (val outcome = decodeAndValidateQrImage(context, uri, totpValidator(validateState.value))) {
                is QrDecodeOutcome.Success -> onResultState.value(outcome.value)
                is QrDecodeOutcome.Failure -> errorMessage = context.getString(outcome.messageRes)
            }
            processing = false
            if (errorMessage == null) {
                onIdleState.value()
            }
        }
    }

    if (processing) {
        AlertDialog(
            onDismissRequest = {},
            title = { Text(stringResource(R.string.totp_qr_source_title)) },
            text = {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(28.dp), strokeWidth = 2.dp)
                    Text(stringResource(R.string.qr_processing))
                }
            },
            confirmButton = {},
        )
    }

    errorMessage?.let { msg ->
        AlertDialog(
            onDismissRequest = {
                errorMessage = null
                onIdleState.value()
            },
            title = { Text(stringResource(R.string.totp_qr_source_title)) },
            text = { Text(msg) },
            confirmButton = {
                TextButton(onClick = {
                    errorMessage = null
                    onIdleState.value()
                }) {
                    Text(stringResource(R.string.action_confirm))
                }
            },
        )
    }

    return remember(launcher) {
        { launcher.launch("image/*") }
    }
}

private fun totpValidator(validateTotp: suspend (String) -> Boolean): QrPayloadValidator = { value ->
    val ok = try {
        validateTotp(value)
    } catch (_: Exception) {
        false
    }
    if (ok) null else R.string.totp_qr_error_invalid
}

@Composable
fun TotpQrScanDialog(
    onResult: (String) -> Unit,
    onDismiss: () -> Unit,
    validateTotp: suspend (String) -> Boolean,
) {
    QrScanDialog(
        title = stringResource(R.string.totp_qr_scan_title),
        cameraRationale = stringResource(R.string.totp_qr_camera_rationale),
        validate = totpValidator(validateTotp),
        onResult = onResult,
        onDismiss = onDismiss,
    )
}
