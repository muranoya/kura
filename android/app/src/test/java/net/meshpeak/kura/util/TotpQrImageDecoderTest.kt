package net.meshpeak.kura.util

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TotpQrImageDecoderTest {

    @Test
    fun decodeWithZxing_readsOtpauthUriFromGeneratedQr() {
        val payload = "otpauth://totp/Example:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Example"
        val bitmap = renderQr(payload, size = 320)
        val decoded = TotpQrImageDecoder.decodeWithZxing(bitmap)
        assertNotNull(decoded)
        assertEquals(payload, decoded)
    }

    @Test
    fun decodeWithZxing_readsBase32Secret() {
        val payload = "JBSWY3DPEHPK3PXP"
        val bitmap = renderQr(payload, size = 256)
        val decoded = TotpQrImageDecoder.decodeWithZxing(bitmap)
        assertNotNull(decoded)
        assertEquals(payload, decoded)
    }

    @Test
    fun decodeWithZxing_readsInvertedQr() {
        val payload = "otpauth://totp/Demo:a@b.c?secret=MFRGGZDFMZTWQ2LK&issuer=Demo"
        val normal = renderQr(payload, size = 280)
        val inverted = invert(normal)
        val decoded = TotpQrImageDecoder.decodeWithZxing(inverted)
        assertNotNull(decoded)
        assertEquals(payload, decoded)
    }

    private fun renderQr(text: String, size: Int): Bitmap {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, size, size, hints)
        val bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        for (x in 0 until size) {
            for (y in 0 until size) {
                bitmap.setPixel(x, y, if (matrix[x, y]) Color.BLACK else Color.WHITE)
            }
        }
        return bitmap
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
}
