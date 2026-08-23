package net.meshpeak.kura.util

/**
 * Helpers for TOTP QR payloads (otpauth URI or Base32 secret).
 * Final acceptance still goes through vault-core generateTotpFromValue.
 */
object TotpQrPayload {
    fun normalize(raw: String): String = raw.trim()

    fun isEmpty(raw: String): Boolean = normalize(raw).isEmpty()
}
