package net.meshpeak.kura.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "kura_settings")

interface IPreferencesManager {
    val s3ConfigFlow: Flow<String?>
    val lastSyncTimeFlow: Flow<Long?>
    val clipboardClearSecondsFlow: Flow<Int>
    val biometricEnabledFlow: Flow<Boolean>
    val sortFieldFlow: Flow<String>
    val sortOrderFlow: Flow<String>
    val autolockMinutesFlow: Flow<Int>
    val filterTypeFlow: Flow<String?>
    val filterLabelIdFlow: Flow<String?>
    val filterFavoritesOnlyFlow: Flow<Boolean>

    suspend fun saveS3Config(configJson: String)
    suspend fun getS3Config(): String?
    suspend fun saveLastSyncTime(ts: Long)
    suspend fun setBiometricEnabled(enabled: Boolean)
    suspend fun saveSortConfig(field: String, order: String)
    suspend fun saveAutolockMinutes(minutes: Int)
    suspend fun saveClipboardClearSeconds(seconds: Int)
    suspend fun saveFilterType(type: String?)
    suspend fun saveFilterLabelId(labelId: String?)
    suspend fun saveFilterFavoritesOnly(favoritesOnly: Boolean)
    fun hasBiometricData(): Boolean
    suspend fun clearAll()
}

class PreferencesManager(private val context: Context) : IPreferencesManager {

    private val secureStorage by lazy { SecureStorage(context) }

    companion object {
        val LAST_SYNC_TIME = longPreferencesKey("last_sync_time")
        val CLIPBOARD_CLEAR_SECONDS = intPreferencesKey("clipboard_clear_seconds")
        val BIOMETRIC_ENABLED = booleanPreferencesKey("biometric_enabled")
        val SORT_FIELD = stringPreferencesKey("entry_sort_field")
        val SORT_ORDER = stringPreferencesKey("entry_sort_order")
        val AUTOLOCK_MINUTES = intPreferencesKey("autolock_minutes")
        val FILTER_TYPE = stringPreferencesKey("filter_type")
        val FILTER_LABEL_ID = stringPreferencesKey("filter_label_id")
        val FILTER_FAVORITES_ONLY = booleanPreferencesKey("filter_favorites_only")
    }

    override val s3ConfigFlow: Flow<String?> get() = secureStorage.s3ConfigFlow
    override val lastSyncTimeFlow: Flow<Long?> = context.dataStore.data.map { it[LAST_SYNC_TIME] }
    override val clipboardClearSecondsFlow: Flow<Int> = context.dataStore.data.map { it[CLIPBOARD_CLEAR_SECONDS] ?: 30 }
    override val biometricEnabledFlow: Flow<Boolean> = context.dataStore.data.map { it[BIOMETRIC_ENABLED] ?: false }
    override val sortFieldFlow: Flow<String> = context.dataStore.data.map { it[SORT_FIELD] ?: "created_at" }
    override val sortOrderFlow: Flow<String> = context.dataStore.data.map { it[SORT_ORDER] ?: "desc" }
    override val autolockMinutesFlow: Flow<Int> = context.dataStore.data.map { it[AUTOLOCK_MINUTES] ?: 5 }
    override val filterTypeFlow: Flow<String?> = context.dataStore.data.map { it[FILTER_TYPE] }
    override val filterLabelIdFlow: Flow<String?> = context.dataStore.data.map { it[FILTER_LABEL_ID] }
    override val filterFavoritesOnlyFlow: Flow<Boolean> = context.dataStore.data.map { it[FILTER_FAVORITES_ONLY] ?: false }

    override suspend fun saveS3Config(configJson: String) {
        secureStorage.saveS3Config(configJson)
    }

    override suspend fun getS3Config(): String? {
        return secureStorage.getS3Config()
    }

    override suspend fun saveLastSyncTime(ts: Long) {
        context.dataStore.edit { it[LAST_SYNC_TIME] = ts }
    }

    override suspend fun setBiometricEnabled(enabled: Boolean) {
        context.dataStore.edit { it[BIOMETRIC_ENABLED] = enabled }
    }

    override suspend fun saveSortConfig(field: String, order: String) {
        context.dataStore.edit {
            it[SORT_FIELD] = field
            it[SORT_ORDER] = order
        }
    }

    override suspend fun saveAutolockMinutes(minutes: Int) {
        context.dataStore.edit { it[AUTOLOCK_MINUTES] = minutes }
    }

    override suspend fun saveClipboardClearSeconds(seconds: Int) {
        context.dataStore.edit { it[CLIPBOARD_CLEAR_SECONDS] = seconds }
    }

    override suspend fun saveFilterType(type: String?) {
        context.dataStore.edit {
            if (type != null) it[FILTER_TYPE] = type else it.remove(FILTER_TYPE)
        }
    }

    override suspend fun saveFilterLabelId(labelId: String?) {
        context.dataStore.edit {
            if (labelId != null) it[FILTER_LABEL_ID] = labelId else it.remove(FILTER_LABEL_ID)
        }
    }

    override suspend fun saveFilterFavoritesOnly(favoritesOnly: Boolean) {
        context.dataStore.edit { it[FILTER_FAVORITES_ONLY] = favoritesOnly }
    }

    override fun hasBiometricData(): Boolean = secureStorage.hasBiometricData()

    override suspend fun clearAll() {
        context.dataStore.edit { it.clear() }
        secureStorage.clearAll()
    }
}
