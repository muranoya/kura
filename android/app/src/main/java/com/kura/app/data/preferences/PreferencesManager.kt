package com.kura.app.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "kura_settings")

class PreferencesManager(private val context: Context) {

    companion object {
        val S3_CONFIG = stringPreferencesKey("s3_config")
        val THEME = stringPreferencesKey("theme")
        val LAST_SYNC_TIME = longPreferencesKey("last_sync_time")
        val CLIPBOARD_CLEAR_SECONDS = intPreferencesKey("clipboard_clear_seconds")
    }

    val s3ConfigFlow: Flow<String?> = context.dataStore.data.map { it[S3_CONFIG] }
    val themeFlow: Flow<String> = context.dataStore.data.map { it[THEME] ?: "system" }
    val lastSyncTimeFlow: Flow<Long?> = context.dataStore.data.map { it[LAST_SYNC_TIME] }
    val clipboardClearSecondsFlow: Flow<Int> = context.dataStore.data.map { it[CLIPBOARD_CLEAR_SECONDS] ?: 30 }

    suspend fun saveS3Config(configJson: String) {
        context.dataStore.edit { it[S3_CONFIG] = configJson }
    }

    suspend fun getS3Config(): String? {
        var result: String? = null
        context.dataStore.data.collect { result = it[S3_CONFIG]; return@collect }
        return result
    }

    suspend fun saveTheme(theme: String) {
        context.dataStore.edit { it[THEME] = theme }
    }

    suspend fun saveLastSyncTime(ts: Long) {
        context.dataStore.edit { it[LAST_SYNC_TIME] = ts }
    }

    suspend fun clearAll() {
        context.dataStore.edit { it.clear() }
    }
}
