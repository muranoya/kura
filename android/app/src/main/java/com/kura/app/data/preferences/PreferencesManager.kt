package com.kura.app.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "kura_settings")

class PreferencesManager(private val context: Context) {

    private val secureStorage by lazy { SecureStorage(context) }

    companion object {
        val THEME = stringPreferencesKey("theme")
        val LAST_SYNC_TIME = longPreferencesKey("last_sync_time")
        val CLIPBOARD_CLEAR_SECONDS = intPreferencesKey("clipboard_clear_seconds")
        val BIOMETRIC_ENABLED = booleanPreferencesKey("biometric_enabled")
        val SORT_FIELD = stringPreferencesKey("entry_sort_field")
        val SORT_ORDER = stringPreferencesKey("entry_sort_order")
        val FAVORITES_EXPANDED = booleanPreferencesKey("favorites_expanded")
        val AUTOLOCK_MINUTES = intPreferencesKey("autolock_minutes")
    }

    val s3ConfigFlow: Flow<String?> get() = secureStorage.s3ConfigFlow
    val themeFlow: Flow<String> = context.dataStore.data.map { it[THEME] ?: "system" }
    val lastSyncTimeFlow: Flow<Long?> = context.dataStore.data.map { it[LAST_SYNC_TIME] }
    val clipboardClearSecondsFlow: Flow<Int> = context.dataStore.data.map { it[CLIPBOARD_CLEAR_SECONDS] ?: 30 }
    val biometricEnabledFlow: Flow<Boolean> = context.dataStore.data.map { it[BIOMETRIC_ENABLED] ?: false }
    val sortFieldFlow: Flow<String> = context.dataStore.data.map { it[SORT_FIELD] ?: "created_at" }
    val sortOrderFlow: Flow<String> = context.dataStore.data.map { it[SORT_ORDER] ?: "desc" }
    val favoritesExpandedFlow: Flow<Boolean> = context.dataStore.data.map { it[FAVORITES_EXPANDED] ?: true }
    val autolockMinutesFlow: Flow<Int> = context.dataStore.data.map { it[AUTOLOCK_MINUTES] ?: 5 }

    suspend fun saveS3Config(configJson: String) {
        secureStorage.saveS3Config(configJson)
    }

    suspend fun getS3Config(): String? {
        return secureStorage.getS3Config()
    }

    suspend fun saveTheme(theme: String) {
        context.dataStore.edit { it[THEME] = theme }
    }

    suspend fun saveLastSyncTime(ts: Long) {
        context.dataStore.edit { it[LAST_SYNC_TIME] = ts }
    }

    suspend fun setBiometricEnabled(enabled: Boolean) {
        context.dataStore.edit { it[BIOMETRIC_ENABLED] = enabled }
    }

    suspend fun saveFavoritesExpanded(expanded: Boolean) {
        context.dataStore.edit { it[FAVORITES_EXPANDED] = expanded }
    }

    suspend fun saveSortConfig(field: String, order: String) {
        context.dataStore.edit {
            it[SORT_FIELD] = field
            it[SORT_ORDER] = order
        }
    }

    suspend fun saveAutolockMinutes(minutes: Int) {
        context.dataStore.edit { it[AUTOLOCK_MINUTES] = minutes }
    }

    fun hasBiometricData(): Boolean = secureStorage.hasBiometricData()

    suspend fun clearAll() {
        context.dataStore.edit { it.clear() }
        secureStorage.clearAll()
    }
}
