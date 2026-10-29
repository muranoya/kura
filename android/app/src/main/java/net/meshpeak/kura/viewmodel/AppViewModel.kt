package net.meshpeak.kura.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewmodel.CreationExtras
import androidx.lifecycle.viewModelScope
import net.meshpeak.kura.autofill.log.AutofillLogStore
import net.meshpeak.kura.data.auth.BiometricHelper
import net.meshpeak.kura.data.auth.PasscodeHelper
import net.meshpeak.kura.data.preferences.IPreferencesManager
import net.meshpeak.kura.data.preferences.PreferencesManager
import net.meshpeak.kura.data.preferences.SecureStorage
import net.meshpeak.kura.data.repository.IVaultRepository
import net.meshpeak.kura.data.repository.VaultRepository
import net.meshpeak.kura.data.session.VaultSession
import net.meshpeak.kura.util.ClipboardUtil
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

enum class AppState {
    LOADING, ONBOARDING, LOCKED, UNLOCKED
}

class AppViewModel(
    application: Application,
    val repository: IVaultRepository = VaultRepository(application),
    val preferences: IPreferencesManager = PreferencesManager(application),
    val biometricHelper: BiometricHelper = BiometricHelper(SecureStorage(application)),
    val passcodeHelper: PasscodeHelper = PasscodeHelper(SecureStorage(application))
) : AndroidViewModel(application) {

    companion object {
        val Factory: ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>, extras: CreationExtras): T {
                val application = extras[ViewModelProvider.AndroidViewModelFactory.APPLICATION_KEY]!!
                return AppViewModel(application) as T
            }
        }
    }

    private val _appState = MutableStateFlow(AppState.LOADING)
    val appState: StateFlow<AppState> = _appState

    private val _syncVersion = MutableStateFlow(0)
    val syncVersion: StateFlow<Int> = _syncVersion.asStateFlow()

    /** オンボーディング時にリカバリーキーを一時保持（ナビゲーションURLに露出させない） */
    var pendingRecoveryKey: String? = null

    init {
        viewModelScope.launch {
            // 自動ロック・手動ロックはプロセス単位のVaultSessionが行うので、その結果を画面に反映する
            VaultSession.lockEvents.collect {
                if (_appState.value == AppState.UNLOCKED) _appState.value = AppState.LOCKED
            }
        }
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

                VaultSession.lockIfExpired()
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

    /**
     * マスターパスワードを忘れた場合の復旧。リカバリーキーでアンロックしてマスターパスワードを
     * 再設定し、ローカルに保存する。同期はアンロック後の画面に入ったときの自動同期で行う
     * （再設定したスロットは更新時刻が新しいので、リモートの古いスロットに負けない）。
     * 再設定できなかった場合はロックし直して例外を投げる。
     */
    suspend fun recoverWithRecoveryKey(recoveryKey: String, newPassword: String) {
        repository.unlockWithRecoveryKey(recoveryKey)
        withContext(NonCancellable) {
            try {
                repository.resetMasterPasswordWithRecoveryKey(recoveryKey, newPassword)
                repository.saveLocally()
            } catch (e: Exception) {
                // 再設定できていないのにアンロックしたままにすると、次のロックで締め出されたと気付くことになる
                try {
                    repository.lock()
                } catch (_: Exception) {
                }
                throw e
            }
            // 生体認証・パスコードは古いパスワードを保存しているので無効にする
            biometricHelper.clearAll()
            preferences.setBiometricEnabled(false)
            passcodeHelper.clearAll()
            preferences.setPasscodeEnabled(false)
        }
    }

    /**
     * ログアウト。メモリ上のDEKを破棄し、端末上のvault・S3認証情報・生体認証/パスコードの鍵と
     * データ・設定・オートフィルログをすべて削除する。S3上のvaultには触れない。
     */
    suspend fun logout() {
        withContext(NonCancellable) {
            try {
                if (repository.isUnlocked()) repository.lock()
            } catch (_: Exception) {
                // 破棄で消えるので続行する
            }
            try {
                repository.unloadVault()
            } catch (_: Exception) {
                // 端末上のデータ削除は続行する
            }
            biometricHelper.clearAll()
            passcodeHelper.clearAll()
            preferences.clearAll()
            repository.deleteVaultFile()
            AutofillLogStore.clearAll(getApplication())
            ClipboardUtil.clearPendingNow(getApplication())
            _appState.value = AppState.ONBOARDING
        }
    }

    /** 「今すぐロック」。ロック後の画面切り替えは[VaultSession.lockEvents]経由で行われる */
    fun lockNow() {
        viewModelScope.launch { VaultSession.lockNow() }
    }

}
