package net.meshpeak.kura.util

/**
 * Helpers for raw QR payloads (TOTP secret / otpauth URI, transfer code, ...).
 * Content-specific validation is done by each caller.
 */
object QrPayload {
    fun normalize(raw: String): String = raw.trim()

    fun isEmpty(raw: String): Boolean = normalize(raw).isEmpty()
}
