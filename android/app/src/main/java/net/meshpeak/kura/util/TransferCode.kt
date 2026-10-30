package net.meshpeak.kura.util

/**
 * Transfer code produced by vault-core `encrypt_transfer` (shown as text / QR on the sender).
 * Decryption itself is done by vault-core; this only rejects unrelated QR payloads early.
 */
object TransferCode {
    private const val PREFIX = "kura-config-v1$"

    fun isTransferCode(value: String): Boolean {
        val trimmed = value.trim()
        return trimmed.startsWith(PREFIX) && trimmed.length > PREFIX.length
    }
}
