package net.meshpeak.kura.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import net.meshpeak.kura.data.auth.BiometricHelper
import net.meshpeak.kura.data.preferences.PreferencesManager
import net.meshpeak.kura.data.preferences.SecureStorage
import net.meshpeak.kura.data.repository.VaultRepository
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class AppState {
    LOADING, ONBOARDING, LOCKED, UNLOCKED
}

class AppViewModel(application: Application) : AndroidViewModel(application) {

    val repository = VaultRepository(application)
    val preferences = PreferencesManager(application)
    val biometricHelper = BiometricHelper(SecureStorage(application))

    private val _appState = MutableStateFlow(AppState.LOADING)
    val appState: StateFlow<AppState> = _appState

    private var autolockJob: Job? = null

    private val _syncVersion = MutableStateFlow(0)
    val syncVersion: StateFlow<Int> = _syncVersion.asStateFlow()

    /** オンボーディング時にリカバリーキーを一時保持（ナビゲーションURLに露出させない） */
    var pendingRecoveryKey: String? = null

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

    fun onAppBackgrounded() {
        if (_appState.value != AppState.UNLOCKED) return
        autolockJob?.cancel()
        autolockJob = viewModelScope.launch {
            val minutes = preferences.autolockMinutesFlow.first()
            if (minutes == 0) return@launch
            delay(minutes * 60 * 1000L)
            performAutoLock()
        }
    }

    fun onAppForegrounded() {
        autolockJob?.cancel()
        autolockJob = null
        if (_appState.value == AppState.UNLOCKED) {
            viewModelScope.launch {
                val unlocked = try { repository.isUnlocked() } catch (_: Exception) { false }
                if (!unlocked) {
                    _appState.value = AppState.LOCKED
                }
            }
        }
    }

    private suspend fun performAutoLock() {
        withContext(NonCancellable) {
            try {
                val encryptedBytes = repository.lock()
                repository.writeVaultFile(encryptedBytes)
                _appState.value = AppState.LOCKED
            } catch (_: Exception) {
                // Lock failed - vault remains in current state
            }
        }
    }

}
