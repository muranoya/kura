package com.kura.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.kura.app.data.auth.BiometricHelper
import com.kura.app.data.preferences.PreferencesManager
import com.kura.app.data.preferences.SecureStorage
import com.kura.app.data.repository.VaultRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

enum class AppState {
    LOADING, ONBOARDING, LOCKED, UNLOCKED
}

class AppViewModel(application: Application) : AndroidViewModel(application) {

    val repository = VaultRepository(application)
    val preferences = PreferencesManager(application)
    val biometricHelper = BiometricHelper(SecureStorage(application))

    private val _appState = MutableStateFlow(AppState.LOADING)
    val appState: StateFlow<AppState> = _appState

    private val _syncVersion = MutableStateFlow(0)
    val syncVersion: StateFlow<Int> = _syncVersion.asStateFlow()

    init {
        initializeApp()
    }

    fun initializeApp() {
        viewModelScope.launch {
            try {
                val exists = repository.vaultFileExists()
                if (!exists) {
                    _appState.value = AppState.ONBOARDING
                    return@launch
                }

                val alreadyUnlocked = try { repository.isUnlocked() } catch (_: Exception) { false }
                if (alreadyUnlocked) {
                    _appState.value = AppState.UNLOCKED
                    return@launch
                }

                val bytes = repository.readVaultFile()
                if (bytes != null) {
                    repository.loadVault(bytes)
                }

                val unlocked = try { repository.isUnlocked() } catch (_: Exception) { false }
                _appState.value = if (unlocked) AppState.UNLOCKED else AppState.LOCKED
            } catch (e: Exception) {
                _appState.value = AppState.ONBOARDING
            }
        }
    }

    fun setAppState(state: AppState) {
        _appState.value = state
    }

    suspend fun backgroundSync(): Boolean {
        val config = preferences.s3ConfigFlow.first() ?: return false
        val result = repository.syncVault(config)
        if (result.synced) {
            val vaultBytes = repository.getVaultBytes()
            repository.writeVaultFile(vaultBytes)
            result.lastSyncedAt?.let { ts ->
                preferences.saveLastSyncTime(ts)
            }
            _syncVersion.value++
        }
        return result.synced
    }

    fun getS3ConfigJson(): String? {
        var result: String? = null
        // Synchronous read from flow - used only for simple lookups
        viewModelScope.launch {
            result = preferences.s3ConfigFlow.first()
        }
        return result
    }
}
