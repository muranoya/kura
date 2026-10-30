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
import androidx.camera.core.ExperimentalGetImage
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
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Image
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
import net.meshpeak.kura.util.QrImageDecoder
import net.meshpeak.kura.util.QrPayload
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Validates a decoded QR payload. Returns null when accepted,
 * or a string resource id of the error message to show.
 */
typealias QrPayloadValidator = suspend (String) -> Int?

internal sealed class QrDecodeOutcome {
    data class Success(val value: String) : QrDecodeOutcome()
    data class Failure(val messageRes: Int) : QrDecodeOutcome()
}

internal suspend fun validateQrPayload(raw: String, validate: QrPayloadValidator): QrDecodeOutcome {
    val value = QrPayload.normalize(raw)
    if (QrPayload.isEmpty(value)) {
        return QrDecodeOutcome.Failure(R.string.qr_error_empty)
    }
    return when (val error = validate(value)) {
        null -> QrDecodeOutcome.Success(value)
        else -> QrDecodeOutcome.Failure(error)
    }
}

internal suspend fun decodeAndValidateQrImage(
    context: Context,
    uri: Uri,
    validate: QrPayloadValidator,
): QrDecodeOutcome {
    return try {
        val payload = withContext(Dispatchers.IO) { QrImageDecoder.decode(context, uri) }
            ?: return QrDecodeOutcome.Failure(R.string.qr_error_no_qr)
        validateQrPayload(payload, validate)
    } catch (_: Exception) {
        QrDecodeOutcome.Failure(R.string.qr_error_no_qr)
    }
}

/**
 * Full-screen QR scanner (camera, with a fallback to picking an image).
 * [onResult] is called once with a payload accepted by [validate].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QrScanDialog(
    title: String,
    cameraRationale: String,
    validate: QrPayloadValidator,
    onResult: (String) -> Unit,
    onDismiss: () -> Unit,
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

    fun handleOutcome(outcome: QrDecodeOutcome) {
        when (outcome) {
            is QrDecodeOutcome.Success -> onResult(outcome.value)
            is QrDecodeOutcome.Failure -> {
                errorMessage = context.getString(outcome.messageRes)
                handled.set(false)
                processing = false
                analysisEnabled.set(true)
            }
        }
    }

    fun handlePayload(raw: String) {
        if (!handled.compareAndSet(false, true)) return
        analysisEnabled.set(false)
        scope.launch {
            processing = true
            errorMessage = null
            handleOutcome(validateQrPayload(raw, validate))
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
            handleOutcome(decodeAndValidateQrImage(context, uri, validate))
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
                    title = { Text(title) },
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
                                stringResource(R.string.qr_camera_denied),
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Spacer(Modifier.height(16.dp))
                            Button(onClick = {
                                permissionLauncher.launch(Manifest.permission.CAMERA)
                            }) {
                                Text(stringResource(R.string.qr_request_camera))
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
                                cameraRationale,
                                color = Color.White,
                                style = MaterialTheme.typography.bodyLarge,
                            )
                            Spacer(Modifier.height(16.dp))
                            Button(onClick = {
                                permissionLauncher.launch(Manifest.permission.CAMERA)
                            }) {
                                Text(stringResource(R.string.qr_request_camera))
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
                        Text(stringResource(R.string.qr_from_gallery))
                    }
                }
            }
        }
    }
}

@androidx.annotation.OptIn(markerClass = [ExperimentalGetImage::class])
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
