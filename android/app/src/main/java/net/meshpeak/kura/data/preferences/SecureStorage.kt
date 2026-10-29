package net.meshpeak.kura.data.preferences

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

class SecureStorage(context: Context) {

    companion object {
        private const val FILE_NAME = "kura_secure_prefs"
        private const val KEY_S3_CONFIG = "s3_config"
        private const val KEY_BIO_ENCRYPTED_PW = "biometric_encrypted_password"
        private const val KEY_BIO_IV = "biometric_iv"
        private const val KEY_PASSCODE_ENCRYPTED_PW = "passcode_encrypted_password"
        private const val KEY_PASSCODE_IV = "passcode_iv"
        private const val KEY_PASSCODE_SALT = "passcode_salt"
        private const val KEY_PASSCODE_VERSION = "passcode_version"
        private const val KEY_PASSCODE_FAILED_ATTEMPTS = "passcode_failed_attempts"
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        FILE_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val _s3ConfigFlow = MutableStateFlow<String?>(prefs.getString(KEY_S3_CONFIG, null))
    val s3ConfigFlow: Flow<String?> = _s3ConfigFlow

    fun saveS3Config(configJson: String) {
        prefs.edit().putString(KEY_S3_CONFIG, configJson).apply()
        _s3ConfigFlow.value = configJson
    }

    fun getS3Config(): String? {
        return prefs.getString(KEY_S3_CONFIG, null)
    }

    fun saveBiometricData(encryptedPassword: String, iv: String) {
        prefs.edit()
            .putString(KEY_BIO_ENCRYPTED_PW, encryptedPassword)
            .putString(KEY_BIO_IV, iv)
            .apply()
    }

    fun getBiometricEncryptedPassword(): String? =
        prefs.getString(KEY_BIO_ENCRYPTED_PW, null)

    fun getBiometricIv(): String? =
        prefs.getString(KEY_BIO_IV, null)

    fun hasBiometricData(): Boolean =
        getBiometricEncryptedPassword() != null && getBiometricIv() != null

    fun clearBiometricData() {
        prefs.edit()
            .remove(KEY_BIO_ENCRYPTED_PW)
            .remove(KEY_BIO_IV)
            .apply()
    }

    fun savePasscodeData(encryptedPassword: String, iv: String, salt: String, version: Int) {
        prefs.edit()
            .putString(KEY_PASSCODE_ENCRYPTED_PW, encryptedPassword)
            .putString(KEY_PASSCODE_IV, iv)
            .putString(KEY_PASSCODE_SALT, salt)
            .putInt(KEY_PASSCODE_VERSION, version)
            .remove(KEY_PASSCODE_FAILED_ATTEMPTS)
            .apply()
    }

    /** 未保存（バージョン導入前に保存したデータ）ならnull */
    fun getPasscodeVersion(): Int? =
        if (prefs.contains(KEY_PASSCODE_VERSION)) prefs.getInt(KEY_PASSCODE_VERSION, 0) else null

    /**
     * 失敗回数を1加算して加算後の値を返す。試行の前に呼び、成功したら[resetPasscodeFailedAttempts]で戻す。
     * 試行中にプロセスを終了されても回数が残るよう、同期書き込みする
     */
    fun incrementPasscodeFailedAttempts(): Int {
        val next = prefs.getInt(KEY_PASSCODE_FAILED_ATTEMPTS, 0) + 1
        prefs.edit().putInt(KEY_PASSCODE_FAILED_ATTEMPTS, next).commit()
        return next
    }

    fun resetPasscodeFailedAttempts() {
        prefs.edit().remove(KEY_PASSCODE_FAILED_ATTEMPTS).apply()
    }

    fun getPasscodeEncryptedPassword(): String? =
        prefs.getString(KEY_PASSCODE_ENCRYPTED_PW, null)

    fun getPasscodeIv(): String? =
        prefs.getString(KEY_PASSCODE_IV, null)

    fun getPasscodeSalt(): String? =
        prefs.getString(KEY_PASSCODE_SALT, null)

    fun hasPasscodeData(): Boolean =
        getPasscodeEncryptedPassword() != null && getPasscodeIv() != null && getPasscodeSalt() != null

    fun clearPasscodeData() {
        prefs.edit()
            .remove(KEY_PASSCODE_ENCRYPTED_PW)
            .remove(KEY_PASSCODE_IV)
            .remove(KEY_PASSCODE_SALT)
            .remove(KEY_PASSCODE_VERSION)
            .remove(KEY_PASSCODE_FAILED_ATTEMPTS)
            .apply()
    }

    fun clearAll() {
        prefs.edit().clear().apply()
        _s3ConfigFlow.value = null
    }
}
