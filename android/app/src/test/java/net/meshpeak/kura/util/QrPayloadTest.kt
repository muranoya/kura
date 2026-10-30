package net.meshpeak.kura.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class QrPayloadTest {
    @Test
    fun normalize_trimsWhitespace() {
        assertEquals("ABCDEFGH", QrPayload.normalize("  ABCDEFGH  "))
    }

    @Test
    fun normalize_keepsOtpauthUri() {
        val uri = "otpauth://totp/Test:user@example.com?secret=JBSWY3DPEHPK3PXP&digits=6&period=30"
        assertEquals(uri, QrPayload.normalize(uri))
    }

    @Test
    fun isEmpty_detectsBlank() {
        assertTrue(QrPayload.isEmpty("   "))
        assertTrue(QrPayload.isEmpty(""))
    }
}
