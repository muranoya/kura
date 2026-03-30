package com.kura.app.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.kura.app.data.preferences.PreferencesManager
import com.kura.app.data.repository.VaultRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

enum class AppState {
    LOADING, ONBOARDING, LOCKED, UNLOCKED
}

class AppViewModel(application: Application) : AndroidViewModel(application) {

    val repository = VaultRepository(application)
    val preferences = PreferencesManager(application)

    private val _appState = MutableStateFlow(AppState.LOADING)
    val appState: StateFlow<AppState> = _appState

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

    fun getS3ConfigJson(): String? {
        var result: String? = null
        // Synchronous read from flow - used only for simple lookups
        viewModelScope.launch {
            result = preferences.s3ConfigFlow.first()
        }
        return result
    }
}
