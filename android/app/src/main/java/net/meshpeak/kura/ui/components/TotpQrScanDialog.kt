package net.meshpeak.kura.ui.components

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Size
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.meshpeak.kura.R
import net.meshpeak.kura.util.TotpQrImageDecoder
import net.meshpeak.kura.util.TotpQrPayload
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

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
                        Text(stringResource(R.string.totp_qr_from_gallery))
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
            when (val outcome = decodeAndValidateTotpQr(context, uri, validateState.value)) {
                is TotpQrDecodeOutcome.Success -> onResultState.value(outcome.value)
                is TotpQrDecodeOutcome.Failure -> errorMessage = context.getString(outcome.messageRes)
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
                    Text(stringResource(R.string.totp_qr_processing))
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

private sealed class TotpQrDecodeOutcome {
    data class Success(val value: String) : TotpQrDecodeOutcome()
    data class Failure(val messageRes: Int) : TotpQrDecodeOutcome()
}

private suspend fun decodeAndValidateTotpQr(
    context: Context,
    uri: Uri,
    validateTotp: suspend (String) -> Boolean,
): TotpQrDecodeOutcome {
    return try {
        val payload = withContext(Dispatchers.IO) { TotpQrImageDecoder.decode(context, uri) }
            ?: return TotpQrDecodeOutcome.Failure(R.string.totp_qr_error_no_qr)
        val value = TotpQrPayload.normalize(payload)
        if (TotpQrPayload.isEmpty(value)) {
            return TotpQrDecodeOutcome.Failure(R.string.totp_qr_error_empty)
        }
        val ok = try {
            validateTotp(value)
        } catch (_: Exception) {
            false
        }
        if (ok) {
            TotpQrDecodeOutcome.Success(value)
        } else {
            TotpQrDecodeOutcome.Failure(R.string.totp_qr_error_invalid)
        }
    } catch (_: Exception) {
        TotpQrDecodeOutcome.Failure(R.string.totp_qr_error_no_qr)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TotpQrScanDialog(
    onResult: (String) -> Unit,
    onDismiss: () -> Unit,
    validateTotp: suspend (String) -> Boolean,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED
        )
    }
    var permissionDenied by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var processing by remember { mutableStateOf(false) }
    val handled = remember { AtomicBoolean(false) }
    val analysisEnabled = remember { AtomicBoolean(true) }

    LaunchedEffect(processing) {
        analysisEnabled.set(!processing)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        hasCameraPermission = granted
        permissionDenied = !granted
    }

    fun handlePayload(raw: String) {
        if (!handled.compareAndSet(false, true)) return
        analysisEnabled.set(false)
        scope.launch {
            processing = true
            errorMessage = null
            val value = TotpQrPayload.normalize(raw)
            if (TotpQrPayload.isEmpty(value)) {
                errorMessage = context.getString(R.string.totp_qr_error_empty)
                handled.set(false)
                processing = false
                analysisEnabled.set(true)
                return@launch
            }
            val ok = try {
                validateTotp(value)
            } catch (_: Exception) {
                false
            }
            if (ok) {
                onResult(value)
            } else {
                errorMessage = context.getString(R.string.totp_qr_error_invalid)
                handled.set(false)
                processing = false
                analysisEnabled.set(true)
            }
        }
    }

    val galleryLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            processing = true
            analysisEnabled.set(false)
            errorMessage = null
            when (val outcome = decodeAndValidateTotpQr(context, uri, validateTotp)) {
                is TotpQrDecodeOutcome.Success -> onResult(outcome.value)
                is TotpQrDecodeOutcome.Failure -> {
                    errorMessage = context.getString(outcome.messageRes)
                    processing = false
                    analysisEnabled.set(true)
                }
            }
        }
    }

    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            usePlatformDefaultWidth = false,
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
        )
    ) {
        Scaffold(
            modifier = Modifier.fillMaxSize(),
            topBar = {
                TopAppBar(
                    title = { Text(stringResource(R.string.totp_qr_scan_title)) },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) {
                            Icon(
                                Icons.AutoMirrored.Filled.ArrowBack,
                                contentDescription = stringResource(R.string.cd_back)
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = Color.Black.copy(alpha = 0.7f),
                        titleContentColor = Color.White,
                        navigationIconContentColor = Color.White,
                    )
                )
            },
            containerColor = Color.Black,
        ) { padding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                when {
                    hasCameraPermission -> {
                        CameraPreview(
                            analysisEnabled = analysisEnabled,
                            onQrDetected = { handlePayload(it) },
                            modifier = Modifier.fillMaxSize()
                        )
                    }
                    permissionDenied -> {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                stringResource(R.string.totp_qr_camera_denied),
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Spacer(Modifier.height(16.dp))
                            Button(onClick = {
                                permissionLauncher.launch(Manifest.permission.CAMERA)
                            }) {
                                Text(stringResource(R.string.totp_qr_request_camera))
                            }
                        }
                    }
                    else -> {
                        Column(
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(24.dp),
                            verticalArrangement = Arrangement.Center,
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text(
                                stringResource(R.string.totp_qr_camera_rationale),
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Spacer(Modifier.height(16.dp))
                            Button(onClick = {
                                permissionLauncher.launch(Manifest.permission.CAMERA)
                            }) {
                                Text(stringResource(R.string.totp_qr_request_camera))
                            }
                        }
                    }
                }

                Column(
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .fillMaxWidth()
                        .background(Color.Black.copy(alpha = 0.65f))
                        .navigationBarsPadding()
                        .padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    errorMessage?.let { msg ->
                        Text(
                            msg,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(bottom = 8.dp),
                        )
                    }
                    if (processing) {
                        CircularProgressIndicator(
                            modifier = Modifier
                                .size(28.dp)
                                .padding(bottom = 8.dp),
                            color = Color.White,
                            strokeWidth = 2.dp,
                        )
                    }
                    TextButton(
                        onClick = { galleryLauncher.launch("image/*") },
                        enabled = !processing,
                    ) {
                        Icon(Icons.Default.Image, contentDescription = null)
                        Spacer(Modifier.size(8.dp))
                        Text(stringResource(R.string.totp_qr_from_gallery))
                    }
                }
            }
        }
    }
}

@Composable
private fun CameraPreview(
    analysisEnabled: AtomicBoolean,
    onQrDetected: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val onQrDetectedState = rememberUpdatedState(onQrDetected)
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build()
        )
    }
    val previewView = remember {
        PreviewView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            scaleType = PreviewView.ScaleType.FILL_CENTER
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
        }
    }

    DisposableEffect(lifecycleOwner) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        val mainExecutor = ContextCompat.getMainExecutor(context)
        val listener = Runnable {
            val cameraProvider = try {
                cameraProviderFuture.get()
            } catch (_: Exception) {
                return@Runnable
            }
            val preview = Preview.Builder().build().also {
                it.surfaceProvider = previewView.surfaceProvider
            }
            val resolutionSelector = ResolutionSelector.Builder()
                .setResolutionStrategy(
                    ResolutionStrategy(
                        Size(1280, 720),
                        ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                    )
                )
                .build()
            val analysis = ImageAnalysis.Builder()
                .setResolutionSelector(resolutionSelector)
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_YUV_420_888)
                .build()
            analysis.setAnalyzer(analysisExecutor) { imageProxy ->
                if (!analysisEnabled.get()) {
                    imageProxy.close()
                    return@setAnalyzer
                }
                val mediaImage = imageProxy.image
                if (mediaImage == null) {
                    imageProxy.close()
                    return@setAnalyzer
                }
                val image = InputImage.fromMediaImage(
                    mediaImage,
                    imageProxy.imageInfo.rotationDegrees,
                )
                scanner.process(image)
                    .addOnSuccessListener { barcodes ->
                        val value = barcodes.firstOrNull()?.rawValue
                        if (value != null) {
                            onQrDetectedState.value(value)
                        }
                    }
                    .addOnCompleteListener {
                        imageProxy.close()
                    }
            }
            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis,
                )
            } catch (_: Exception) {
                // camera unavailable
            }
        }
        cameraProviderFuture.addListener(listener, mainExecutor)

        onDispose {
            try {
                cameraProviderFuture.get().unbindAll()
            } catch (_: Exception) {
            }
            analysisExecutor.shutdown()
            scanner.close()
        }
    }

    AndroidView(
        factory = { previewView },
        modifier = modifier,
    )
}
