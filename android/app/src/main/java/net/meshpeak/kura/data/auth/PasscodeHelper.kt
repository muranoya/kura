package net.meshpeak.kura.data.auth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import net.meshpeak.kura.data.preferences.SecureStorage
import java.security.KeyStore
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/** パスコードが違う。[remainingAttempts]回失敗するとパスコードは無効化される */
class WrongPasscodeException(val remainingAttempts: Int) : Exception("Wrong passcode")

/** 規定回数失敗したためパスコードのデータを削除した。マスターパスワードでのアンロックが必要 */
class PasscodeLockedOutException : Exception("Passcode disabled after too many failed attempts")

/**
 * パスコード（短い数字）でマスターパスワードを暗号化して端末に保存する。
 *
 * パスコードはエントロピーが低いため、次の2点で総当たりを防ぐ。
 * - 鍵導出の前にパスコードをKeystore内のHMAC鍵（エクスポート不可）に通す。暗号文を端末から
 *   取り出しても、端末の外ではオフライン総当たりができない
 * - 失敗回数を記録し、[MAX_FAILED_ATTEMPTS]回失敗したらデータを削除する。回数は試行の前に
 *   加算するため、試行中にプロセスを強制終了しても回数制限を回避できない
 */
class PasscodeHelper(private val secureStorage: SecureStorage) {

    companion object {
        const val MAX_FAILED_ATTEMPTS = 5
        const val MIN_PASSCODE_LENGTH = 6

        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val KEY_ALGORITHM = "AES"
        private const val KDF_ALGORITHM = "PBKDF2WithHmacSHA256"
        private const val GCM_TAG_LENGTH = 128
        private const val KEY_LENGTH = 256
        private const val ITERATIONS = 210_000
        private const val SALT_LENGTH = 16

        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val PEPPER_KEY_ALIAS = "kura_passcode_pepper"

        /** Keystoreの鍵を通さずに導出していた旧形式 */
        private const val VERSION_LEGACY = 1
        private const val VERSION_KEYSTORE_PEPPER = 2
    }

    fun encryptAndStore(passcode: String, masterPassword: String) {
        regeneratePepperKey()
        val salt = ByteArray(SALT_LENGTH).also { SecureRandom().nextBytes(it) }
        val key = deriveKey(passcode, salt, VERSION_KEYSTORE_PEPPER)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        val encrypted = cipher.doFinal(masterPassword.toByteArray(Charsets.UTF_8))

        secureStorage.savePasscodeData(
            encryptedPassword = Base64.encodeToString(encrypted, Base64.NO_WRAP),
            iv = Base64.encodeToString(cipher.iv, Base64.NO_WRAP),
            salt = Base64.encodeToString(salt, Base64.NO_WRAP),
            version = VERSION_KEYSTORE_PEPPER
        )
    }

    /**
     * @throws WrongPasscodeException パスコードが違う
     * @throws PasscodeLockedOutException 規定回数失敗したためデータを削除した
     */
    fun decryptPassword(passcode: String): String {
        val encryptedBase64 = secureStorage.getPasscodeEncryptedPassword()
            ?: throw IllegalStateException("Passcode encrypted password not found")
        val ivBase64 = secureStorage.getPasscodeIv()
            ?: throw IllegalStateException("Passcode IV not found")
        val saltBase64 = secureStorage.getPasscodeSalt()
            ?: throw IllegalStateException("Passcode salt not found")

        val attempts = secureStorage.incrementPasscodeFailedAttempts()
        if (attempts > MAX_FAILED_ATTEMPTS) {
            clearAll()
            throw PasscodeLockedOutException()
        }

        val encrypted = Base64.decode(encryptedBase64, Base64.NO_WRAP)
        val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
        val salt = Base64.decode(saltBase64, Base64.NO_WRAP)
        val version = secureStorage.getPasscodeVersion() ?: VERSION_LEGACY
        val masterPassword = try {
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.DECRYPT_MODE, deriveKey(passcode, salt, version), GCMParameterSpec(GCM_TAG_LENGTH, iv))
            String(cipher.doFinal(encrypted), Charsets.UTF_8)
        } catch (e: AEADBadTagException) {
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                clearAll()
                throw PasscodeLockedOutException()
            }
            throw WrongPasscodeException(MAX_FAILED_ATTEMPTS - attempts)
        }

        secureStorage.resetPasscodeFailedAttempts()
        if (version == VERSION_LEGACY) {
            // 旧形式はオフライン総当たりが可能なため、正しいパスコードが分かった時点で新形式に移行する
            encryptAndStore(passcode, masterPassword)
        }
        return masterPassword
    }

    fun clearAll() {
        try {
            val keyStore = getKeyStore()
            if (keyStore.containsAlias(PEPPER_KEY_ALIAS)) {
                keyStore.deleteEntry(PEPPER_KEY_ALIAS)
            }
        } catch (_: Exception) {
            // キー削除失敗は無視
        }
        secureStorage.clearPasscodeData()
    }

    fun isSetUp(): Boolean = secureStorage.hasPasscodeData()

    private fun deriveKey(passcode: String, salt: ByteArray, version: Int): SecretKeySpec {
        val input = if (version == VERSION_LEGACY) {
            passcode.toCharArray()
        } else {
            Base64.encodeToString(pepper(passcode), Base64.NO_WRAP).toCharArray()
        }
        val spec = PBEKeySpec(input, salt, ITERATIONS, KEY_LENGTH)
        val bytes = SecretKeyFactory.getInstance(KDF_ALGORITHM).generateSecret(spec).encoded
        return SecretKeySpec(bytes, KEY_ALGORITHM)
    }

    private fun pepper(passcode: String): ByteArray {
        val key = getKeyStore().getKey(PEPPER_KEY_ALIAS, null) as? SecretKey
            ?: throw IllegalStateException("Passcode pepper key not found")
        return Mac.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256)
            .apply { init(key) }
            .doFinal(passcode.toByteArray(Charsets.UTF_8))
    }

    private fun regeneratePepperKey() {
        val keyStore = getKeyStore()
        if (keyStore.containsAlias(PEPPER_KEY_ALIAS)) {
            keyStore.deleteEntry(PEPPER_KEY_ALIAS)
        }
        try {
            generatePepperKey(strongBox = true)
        } catch (_: StrongBoxUnavailableException) {
            generatePepperKey(strongBox = false)
        }
    }

    private fun generatePepperKey(strongBox: Boolean) {
        val spec = KeyGenParameterSpec.Builder(PEPPER_KEY_ALIAS, KeyProperties.PURPOSE_SIGN)
            .setIsStrongBoxBacked(strongBox)
            .build()
        KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_HMAC_SHA256, KEYSTORE_PROVIDER).apply {
            init(spec)
            generateKey()
        }
    }

    private fun getKeyStore(): KeyStore =
        KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
}
