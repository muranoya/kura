package net.meshpeak.kura.util

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.RGBLuminanceSource
import com.google.zxing.common.GlobalHistogramBinarizer
import com.google.zxing.common.HybridBinarizer

/**
 * Decode a QR payload from a gallery/content [Uri] with ZXing.
 * PNG / JPEG / WebP など ContentResolver が読める静止画を対象とする。
 * （カメラのライブスキャンは ML Kit のまま）
 */
object TotpQrImageDecoder {
    private const val MAX_EDGE = 2048

    fun decode(context: Context, uri: Uri): String? {
        val bitmap = loadArgb8888Bitmap(context, uri) ?: return null
        return try {
            decodeWithZxing(bitmap)
        } finally {
            if (!bitmap.isRecycled) bitmap.recycle()
        }
    }

    /** Visible for unit tests. */
    fun decodeWithZxing(bitmap: Bitmap): String? {
        val owned = mutableListOf<Bitmap>()
        try {
            val variants = buildList {
                add(bitmap)
                val longest = maxOf(bitmap.width, bitmap.height)
                if (longest > 800) {
                    val scale = 800f / longest
                    val w = (bitmap.width * scale).toInt().coerceAtLeast(1)
                    val h = (bitmap.height * scale).toInt().coerceAtLeast(1)
                    val scaled = Bitmap.createScaledBitmap(bitmap, w, h, true)
                    if (scaled !== bitmap) owned.add(scaled)
                    add(scaled)
                }
                val inverted = invert(bitmap)
                owned.add(inverted)
                add(inverted)
            }
            for (candidate in variants) {
                tryDecodeZxing(candidate)?.let { return it }
            }
            return null
        } finally {
            owned.forEach { if (!it.isRecycled) it.recycle() }
        }
    }

    private fun tryDecodeZxing(bitmap: Bitmap): String? {
        val width = bitmap.width
        val height = bitmap.height
        if (width <= 0 || height <= 0) return null
        val pixels = IntArray(width * height)
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height)
        val source = RGBLuminanceSource(width, height, pixels)
        val hints = mapOf(
            DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
            DecodeHintType.TRY_HARDER to true,
            DecodeHintType.CHARACTER_SET to "UTF-8",
        )
        val reader = MultiFormatReader().apply { setHints(hints) }
        val binaries = listOf(
            BinaryBitmap(HybridBinarizer(source)),
            BinaryBitmap(GlobalHistogramBinarizer(source)),
        )
        for (binary in binaries) {
            try {
                val text = reader.decodeWithState(binary).text
                if (!text.isNullOrBlank()) return text
            } catch (_: Exception) {
                reader.reset()
            }
        }
        return null
    }

    private fun invert(source: Bitmap): Bitmap {
        val w = source.width
        val h = source.height
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val pixels = IntArray(w * h)
        source.getPixels(pixels, 0, w, 0, 0, w, h)
        for (i in pixels.indices) {
            val c = pixels[i]
            pixels[i] = Color.argb(
                Color.alpha(c),
                255 - Color.red(c),
                255 - Color.green(c),
                255 - Color.blue(c),
            )
        }
        out.setPixels(pixels, 0, w, 0, 0, w, h)
        return out
    }

    @Suppress("DEPRECATION")
    private fun loadArgb8888Bitmap(context: Context, uri: Uri): Bitmap? {
        return try {
            val decoded = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val source = ImageDecoder.createSource(context.contentResolver, uri)
                ImageDecoder.decodeBitmap(source) { decoder, info, _ ->
                    decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
                    decoder.isMutableRequired = false
                    val w = info.size.width
                    val h = info.size.height
                    val longest = maxOf(w, h)
                    if (longest > MAX_EDGE) {
                        val scale = MAX_EDGE.toFloat() / longest
                        decoder.setTargetSize(
                            (w * scale).toInt().coerceAtLeast(1),
                            (h * scale).toInt().coerceAtLeast(1),
                        )
                    }
                }
            } else {
                MediaStore.Images.Media.getBitmap(context.contentResolver, uri)
            }
            toArgb8888(decoded)
        } catch (_: Exception) {
            null
        }
    }

    private fun toArgb8888(source: Bitmap): Bitmap {
        if (source.config == Bitmap.Config.ARGB_8888 && !source.isHardwareBitmap()) {
            return source
        }
        val copy = source.copy(Bitmap.Config.ARGB_8888, false)
            ?: throw IllegalStateException("bitmap copy failed")
        if (source !== copy && !source.isRecycled) {
            source.recycle()
        }
        return copy
    }

    private fun Bitmap.isHardwareBitmap(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && config == Bitmap.Config.HARDWARE
}
