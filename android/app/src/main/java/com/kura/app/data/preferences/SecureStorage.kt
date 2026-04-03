package com.kura.app.data.preferences

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

    fun clearAll() {
        prefs.edit().clear().apply()
        _s3ConfigFlow.value = null
    }
}
