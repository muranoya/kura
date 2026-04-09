package net.meshpeak.kura.data.auth

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import net.meshpeak.kura.data.preferences.SecureStorage
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class BiometricHelper(private val secureStorage: SecureStorage) {

    companion object {
        private const val KEYSTORE_PROVIDER = "AndroidKeyStore"
        private const val KEY_ALIAS = "kura_biometric_key"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
        private const val GCM_TAG_LENGTH = 128
    }

    private fun getKeyStore(): KeyStore {
        return KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
    }

    private fun getSecretKey(): SecretKey? {
        val keyStore = getKeyStore()
        return keyStore.getKey(KEY_ALIAS, null) as? SecretKey
    }

    fun hasValidKey(): Boolean {
        return try {
            val key = getSecretKey() ?: return false
            // キーが有効か確認するためにCipherを初期化してみる
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            true
        } catch (_: KeyPermanentlyInvalidatedException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    fun generateKey() {
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setUserAuthenticationRequired(true)
            .apply {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
                } else {
                    @Suppress("DEPRECATION")
                    setUserAuthenticationValidityDurationSeconds(-1)
                }
            }
            .setInvalidatedByBiometricEnrollment(true)
            .build()

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            KEYSTORE_PROVIDER
        )
        keyGenerator.init(spec)
        keyGenerator.generateKey()
    }

    fun clearAll() {
        try {
            val keyStore = getKeyStore()
            if (keyStore.containsAlias(KEY_ALIAS)) {
                keyStore.deleteEntry(KEY_ALIAS)
            }
        } catch (_: Exception) {
            // キー削除失敗は無視
        }
        secureStorage.clearBiometricData()
    }

    /**
     * 登録時: ENCRYPT modeのCipherを返す。BiometricPromptのCryptoObjectに渡す。
     * @throws KeyPermanentlyInvalidatedException デバイスの生体情報が変更された場合
     */
    fun getEncryptCipher(): Cipher {
        val key = getSecretKey() ?: throw IllegalStateException("Biometric key not found")
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        return cipher
    }

    /**
     * アンロック時: DECRYPT modeのCipherを返す。保存済みIVを使用。
     * @throws KeyPermanentlyInvalidatedException デバイスの生体情報が変更された場合
     */
    fun getDecryptCipher(): Cipher {
        val key = getSecretKey() ?: throw IllegalStateException("Biometric key not found")
        val ivBase64 = secureStorage.getBiometricIv()
            ?: throw IllegalStateException("Biometric IV not found")
        val iv = Base64.decode(ivBase64, Base64.NO_WRAP)

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH, iv))
        return cipher
    }

    /**
     * 生体認証成功後、マスターパスワードを暗号化して保存する。
     * @param cipher BiometricPromptが認証済みのCipher（ENCRYPT mode）
     */
    fun encryptAndStore(cipher: Cipher, masterPassword: String) {
        val encrypted = cipher.doFinal(masterPassword.toByteArray(Charsets.UTF_8))
        val iv = cipher.iv
        secureStorage.saveBiometricData(
            encryptedPassword = Base64.encodeToString(encrypted, Base64.NO_WRAP),
            iv = Base64.encodeToString(iv, Base64.NO_WRAP)
        )
    }

    /**
     * 生体認証成功後、保存済みマスターパスワードを復号して返す。
     * @param cipher BiometricPromptが認証済みのCipher（DECRYPT mode）
     */
    fun decryptPassword(cipher: Cipher): String {
        val encryptedBase64 = secureStorage.getBiometricEncryptedPassword()
            ?: throw IllegalStateException("Biometric encrypted password not found")
        val encrypted = Base64.decode(encryptedBase64, Base64.NO_WRAP)
        val decrypted = cipher.doFinal(encrypted)
        return String(decrypted, Charsets.UTF_8)
    }

    fun isSetUp(): Boolean = secureStorage.hasBiometricData()
}
