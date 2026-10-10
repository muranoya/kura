package net.meshpeak.kura.data.preferences

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

/** パスコードアンロック用データの保存先（[net.meshpeak.kura.data.auth.PasscodeHelper]が使用） */
interface PasscodeStore {
    fun savePasscodeData(encryptedPassword: String, iv: String, salt: String)
    fun getPasscodeEncryptedPassword(): String?
    fun getPasscodeIv(): String?
    fun getPasscodeSalt(): String?
    fun hasPasscodeData(): Boolean
    fun clearPasscodeData()
    fun getPasscodeFailedAttempts(): Int

    /** 試行回数の改ざん回避のため、呼び出しから戻った時点でディスクへ書き込み済みであること */
    fun setPasscodeFailedAttempts(count: Int)
}

class SecureStorage(context: Context) : PasscodeStore {

    companion object {
        private const val FILE_NAME = "kura_secure_prefs"
        private const val KEY_S3_CONFIG = "s3_config"
        private const val KEY_BIO_ENCRYPTED_PW = "biometric_encrypted_password"
        private const val KEY_BIO_IV = "biometric_iv"
        private const val KEY_PASSCODE_ENCRYPTED_PW = "passcode_encrypted_password"
        private const val KEY_PASSCODE_IV = "passcode_iv"
        private const val KEY_PASSCODE_SALT = "passcode_salt"
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

    override fun savePasscodeData(encryptedPassword: String, iv: String, salt: String) {
        prefs.edit()
            .putString(KEY_PASSCODE_ENCRYPTED_PW, encryptedPassword)
            .putString(KEY_PASSCODE_IV, iv)
            .putString(KEY_PASSCODE_SALT, salt)
            .remove(KEY_PASSCODE_FAILED_ATTEMPTS)
            .apply()
    }

    override fun getPasscodeEncryptedPassword(): String? =
        prefs.getString(KEY_PASSCODE_ENCRYPTED_PW, null)

    override fun getPasscodeIv(): String? =
        prefs.getString(KEY_PASSCODE_IV, null)

    override fun getPasscodeSalt(): String? =
        prefs.getString(KEY_PASSCODE_SALT, null)

    override fun hasPasscodeData(): Boolean =
        getPasscodeEncryptedPassword() != null && getPasscodeIv() != null && getPasscodeSalt() != null

    override fun clearPasscodeData() {
        prefs.edit()
            .remove(KEY_PASSCODE_ENCRYPTED_PW)
            .remove(KEY_PASSCODE_IV)
            .remove(KEY_PASSCODE_SALT)
            .remove(KEY_PASSCODE_FAILED_ATTEMPTS)
            .commit()
    }

    override fun getPasscodeFailedAttempts(): Int =
        prefs.getInt(KEY_PASSCODE_FAILED_ATTEMPTS, 0)

    override fun setPasscodeFailedAttempts(count: Int) {
        // apply()は非同期書き込みのため、プロセス強制終了で加算が失われないようcommit()を使う
        prefs.edit().putInt(KEY_PASSCODE_FAILED_ATTEMPTS, count).commit()
    }

    fun clearAll() {
        prefs.edit().clear().apply()
        _s3ConfigFlow.value = null
    }
}
