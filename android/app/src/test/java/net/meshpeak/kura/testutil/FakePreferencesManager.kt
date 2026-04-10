package net.meshpeak.kura.testutil

import net.meshpeak.kura.data.preferences.IPreferencesManager
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow

class FakePreferencesManager : IPreferencesManager {

    private val _s3ConfigFlow = MutableStateFlow<String?>(null)
    private val _lastSyncTimeFlow = MutableStateFlow<Long?>(null)
    private val _clipboardClearSecondsFlow = MutableStateFlow(30)
    private val _biometricEnabledFlow = MutableStateFlow(false)
    private val _sortFieldFlow = MutableStateFlow("created_at")
    private val _sortOrderFlow = MutableStateFlow("desc")
    private val _autolockMinutesFlow = MutableStateFlow(5)
    private val _filterTypeFlow = MutableStateFlow<String?>(null)
    private val _filterLabelIdFlow = MutableStateFlow<String?>(null)
    private val _filterFavoritesOnlyFlow = MutableStateFlow(false)

    override val s3ConfigFlow: Flow<String?> = _s3ConfigFlow
    override val lastSyncTimeFlow: Flow<Long?> = _lastSyncTimeFlow
    override val clipboardClearSecondsFlow: Flow<Int> = _clipboardClearSecondsFlow
    override val biometricEnabledFlow: Flow<Boolean> = _biometricEnabledFlow
    override val sortFieldFlow: Flow<String> = _sortFieldFlow
    override val sortOrderFlow: Flow<String> = _sortOrderFlow
    override val autolockMinutesFlow: Flow<Int> = _autolockMinutesFlow
    override val filterTypeFlow: Flow<String?> = _filterTypeFlow
    override val filterLabelIdFlow: Flow<String?> = _filterLabelIdFlow
    override val filterFavoritesOnlyFlow: Flow<Boolean> = _filterFavoritesOnlyFlow

    // Tracking calls
    var saveS3ConfigCalledWith: String? = null

    override suspend fun saveS3Config(configJson: String) {
        saveS3ConfigCalledWith = configJson
        _s3ConfigFlow.value = configJson
    }

    override suspend fun getS3Config(): String? = _s3ConfigFlow.value

    override suspend fun saveLastSyncTime(ts: Long) {
        _lastSyncTimeFlow.value = ts
    }

    override suspend fun setBiometricEnabled(enabled: Boolean) {
        _biometricEnabledFlow.value = enabled
    }

    override suspend fun saveSortConfig(field: String, order: String) {
        _sortFieldFlow.value = field
        _sortOrderFlow.value = order
    }

    override suspend fun saveAutolockMinutes(minutes: Int) {
        _autolockMinutesFlow.value = minutes
    }

    override suspend fun saveClipboardClearSeconds(seconds: Int) {
        _clipboardClearSecondsFlow.value = seconds
    }

    override suspend fun saveFilterType(type: String?) {
        _filterTypeFlow.value = type
    }

    override suspend fun saveFilterLabelId(labelId: String?) {
        _filterLabelIdFlow.value = labelId
    }

    override suspend fun saveFilterFavoritesOnly(favoritesOnly: Boolean) {
        _filterFavoritesOnlyFlow.value = favoritesOnly
    }

    override fun hasBiometricData(): Boolean = false

    override suspend fun clearAll() {
        _s3ConfigFlow.value = null
        _lastSyncTimeFlow.value = null
        _clipboardClearSecondsFlow.value = 30
        _biometricEnabledFlow.value = false
    }
}
