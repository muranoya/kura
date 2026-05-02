package net.meshpeak.kura.data.auth

import android.util.Base64
import net.meshpeak.kura.data.preferences.SecureStorage
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

class PasscodeHelper(private val secureStorage: SecureStorage) {

    companion object {
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_ALGORITHM = "AES"
        private const val KDF_ALGORITHM = "PBKDF2WithHmacSHA256"
        private const val GCM_TAG_LENGTH = 128
        private const val KEY_LENGTH = 256
        private const val ITERATIONS = 210_000
        private const val SALT_LENGTH = 16
    }

    fun encryptAndStore(passcode: String, masterPassword: String) {
        val salt = ByteArray(SALT_LENGTH).also { SecureRandom().nextBytes(it) }
        val key = deriveKey(passcode, salt)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val encrypted = cipher.doFinal(masterPassword.toByteArray(Charsets.UTF_8))

        secureStorage.savePasscodeData(
            encryptedPassword = Base64.encodeToString(encrypted, Base64.NO_WRAP),
            iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            salt = Base64.encodeToString(salt, Base64.NO_WRAP)
        )
    }

    fun decryptPassword(passcode: String): String {
        val encryptedBase64 = secureStorage.getPasscodeEncryptedPassword()
            ?: throw IllegalStateException("Passcode encrypted password not found")
        val ivBase64 = secureStorage.getPasscodeIv()
            ?: throw IllegalStateException("Passcode IV not found")
        val saltBase64 = secureStorage.getPasscodeSalt()
            ?: throw IllegalStateException("Passcode salt not found")

        val encrypted = Base64.decode(encryptedBase64, Base64.NO_WRAP)
        val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
        val salt = Base64.decode(saltBase64, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, deriveKey(passcode, salt), GCMParameterSpec(GCM_TAG_LENGTH, iv))
        return String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }

    fun clearAll() {
        secureStorage.clearPasscodeData()
    }

    fun isSetUp(): Boolean = secureStorage.hasPasscodeData()

    private fun deriveKey(passcode: String, salt: ByteArray): SecretKeySpec {
        val spec = PBEKeySpec(passcode.toCharArray(), salt, ITERATIONS, KEY_LENGTH)
        val bytes = SecretKeyFactory.getInstance(KDF_ALGORITHM).generateSecret(spec).encoded
        return SecretKeySpec(bytes, KEY_ALGORITHM)
    }
}
