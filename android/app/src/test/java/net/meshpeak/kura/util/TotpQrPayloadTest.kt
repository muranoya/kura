package net.meshpeak.kura.util

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TotpQrPayloadTest {
    @Test
    fun normalize_trimsWhitespace() {
        assertEquals("ABCDEFGH", TotpQrPayload.normalize("  ABCDEFGH  "))
    }

    @Test
    fun normalize_keepsOtpauthUri() {
        val uri = "otpauth://totp/Test:user@example.com?secret=JBSWY3DPEHPK3PXP&digits=6&period=30"
        assertEquals(uri, TotpQrPayload.normalize(uri))
    }

    @Test
    fun isEmpty_detectsBlank() {
        assertTrue(TotpQrPayload.isEmpty("   "))
        assertTrue(TotpQrPayload.isEmpty(""))
    }
}
