package net.meshpeak.kura.data.auth

import android.util.Base64
import net.meshpeak.kura.data.preferences.PasscodeStore
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec

/** パスコードが間違っていた（[remainingAttempts]回まで再試行可能） */
class WrongPasscodeException(val remainingAttempts: Int) : Exception("Wrong passcode")

/** 失敗回数が上限に達したため、パスコードアンロックのデータを消去した */
class PasscodeLockedOutException : Exception("Too many failed passcode attempts")

/**
 * 短いパスコードでマスターパスワードを暗号化して端末に保持する。
 *
 * パスコードは4桁以上の数字であり鍵空間が小さいため、オンラインでの総当たりを
 * [MAX_FAILED_ATTEMPTS]回の失敗で打ち切る（超過時は暗号化済みマスターパスワードを消去し、
 * マスターパスワードでのアンロックを要求する）。
 */
class PasscodeHelper(private val secureStorage: PasscodeStore) {

    companion object {
        const val MAX_FAILED_ATTEMPTS = 5

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

    /**
     * @throws WrongPasscodeException パスコードが違う（残り回数あり）
     * @throws PasscodeLockedOutException 失敗回数が上限に達し、パスコードデータを消去した
     */
    fun decryptPassword(passcode: String): String {
        // 前回の試行中にプロセスが落ちた等で上限に達したまま残っている場合
        if (secureStorage.getPasscodeFailedAttempts() >= MAX_FAILED_ATTEMPTS) {
            clearAll()
            throw PasscodeLockedOutException()
        }

        val encryptedBase64 = secureStorage.getPasscodeEncryptedPassword()
            ?: throw IllegalStateException("Passcode encrypted password not found")
        val ivBase64 = secureStorage.getPasscodeIv()
            ?: throw IllegalStateException("Passcode IV not found")
        val saltBase64 = secureStorage.getPasscodeSalt()
            ?: throw IllegalStateException("Passcode salt not found")

        val encrypted = Base64.decode(encryptedBase64, Base64.NO_WRAP)
        val iv = Base64.decode(ivBase64, Base64.NO_WRAP)
        val salt = Base64.decode(saltBase64, Base64.NO_WRAP)

        // 復号を試す前に失敗回数を加算して永続化する。復号（PBKDF2）の最中にプロセスを
        // 強制終了して失敗をカウントさせない、という回避を防ぐため（成功時に0へ戻す）。
        val attempts = secureStorage.getPasscodeFailedAttempts() + 1
        secureStorage.setPasscodeFailedAttempts(attempts)

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, deriveKey(passcode, salt), GCMParameterSpec(GCM_TAG_LENGTH, iv))
        val plaintext = try {
            cipher.doFinal(encrypted)
        } catch (e: AEADBadTagException) {
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                clearAll()
                throw PasscodeLockedOutException()
            }
            throw WrongPasscodeException(MAX_FAILED_ATTEMPTS - attempts)
        }
        secureStorage.setPasscodeFailedAttempts(0)
        return String(plaintext, Charsets.UTF_8)
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
