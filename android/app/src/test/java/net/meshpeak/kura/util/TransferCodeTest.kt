package net.meshpeak.kura.util

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TransferCodeTest {
    @Test
    fun isTransferCode_acceptsPrefixedPayload() {
        assertTrue(TransferCode.isTransferCode("kura-config-v1\$AAAABBBBCCCC"))
    }

    @Test
    fun isTransferCode_ignoresSurroundingWhitespace() {
        assertTrue(TransferCode.isTransferCode("  kura-config-v1\$AAAA\n"))
    }

    @Test
    fun isTransferCode_rejectsOtherPayloads() {
        assertFalse(TransferCode.isTransferCode("otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP"))
        assertFalse(TransferCode.isTransferCode("https://example.com"))
        assertFalse(TransferCode.isTransferCode("kura-config-v1\$"))
        assertFalse(TransferCode.isTransferCode(""))
    }
}
