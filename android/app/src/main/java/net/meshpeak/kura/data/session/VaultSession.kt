package net.meshpeak.kura.data.session

import android.app.Application
import android.os.SystemClock
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import net.meshpeak.kura.data.preferences.IPreferencesManager
import net.meshpeak.kura.data.preferences.PreferencesManager
import net.meshpeak.kura.data.repository.IVaultRepository
import net.meshpeak.kura.data.repository.VaultRepository
import net.meshpeak.kura.util.ClipboardUtil

/**
 * vaultのアンロック状態（vault-core側のDEK）をプロセス単位で管理し、自動ロックを行う。
 *
 * DEKはrust-jniのグローバルな状態としてプロセス全体で共有されるため、自動ロックも特定の
 * Activityではなくプロセスのライフサイクル（[ProcessLifecycleOwner]）に結び付ける。
 * MainActivityを経由せずオートフィル・Passkeyの画面でアンロックした場合も、そのActivityが
 * 閉じた時点から自動ロックの計測が始まる。
 *
 * タイマー（[delay]）は端末のディープスリープ中に進まないため、それだけに頼らず、
 * アプリの表示・オートフィル要求・Passkey要求といった入口で[lockIfExpired]を呼び、
 * バックグラウンドに移ってからの実経過時間（[SystemClock.elapsedRealtime]）で判定する。
 */
object VaultSession {
    private var app: Application? = null
    private val repository: IVaultRepository by lazy { VaultRepository(requireNotNull(app)) }
    private val preferences: IPreferencesManager by lazy { PreferencesManager(requireNotNull(app)) }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)
    private val lockMutex = Mutex()
    private var autolockJob: Job? = null

    /** 最後にバックグラウンドへ移った時刻（elapsedRealtime）。表示中はnull */
    @Volatile
    private var backgroundedAt: Long? = null

    /** ロック画面でユーザーを認証した時刻（elapsedRealtime） */
    @Volatile
    private var lastUserVerifiedAt: Long? = null

    /**
     * Passkeyの操作直前にロック画面で認証していれば、改めて本人確認を求めない猶予。
     * ロック中のPasskey要求ではアンロック後にシステムの候補選択へ戻ってから再度起動されるため、
     * 二重に認証を求めないようにする
     */
    private const val USER_VERIFICATION_REUSE_MS = 60_000L

    private val _lockEvents = MutableSharedFlow<Unit>(extraBufferCapacity = 1)

    /** [lockNow]でロックするたびに流れる。画面側のAppStateをLOCKEDに切り替えるために購読する */
    val lockEvents: SharedFlow<Unit> = _lockEvents.asSharedFlow()

    fun init(application: Application) {
        app = application
        ProcessLifecycleOwner.get().lifecycle.addObserver(object : DefaultLifecycleObserver {
            override fun onStop(owner: LifecycleOwner) = onBackgrounded()
            override fun onStart(owner: LifecycleOwner) = onForegrounded()
        })
    }

    private fun onBackgrounded() {
        backgroundedAt = SystemClock.elapsedRealtime()
        autolockJob?.cancel()
        autolockJob = scope.launch {
            val minutes = preferences.autolockMinutesFlow.first()
            if (minutes == 0) return@launch
            delay(minutes * 60_000L)
            lockNow()
        }
    }

    private fun onForegrounded() {
        autolockJob?.cancel()
        autolockJob = null
        scope.launch {
            lockIfExpired()
            backgroundedAt = null
        }
    }

    fun markUserVerified() {
        lastUserVerifiedAt = SystemClock.elapsedRealtime()
    }

    fun wasUserVerifiedRecently(): Boolean {
        val at = lastUserVerifiedAt ?: return false
        return SystemClock.elapsedRealtime() - at < USER_VERIFICATION_REUSE_MS
    }

    /**
     * バックグラウンドに移ってから自動ロック時間が過ぎていればロックする。
     * アンロック済みかどうかで処理を分ける入口（オートフィル・Passkey・アプリ起動）の先頭で呼ぶ。
     * @return ロックした場合true
     */
    suspend fun lockIfExpired(): Boolean {
        if (app == null) return false
        val since = backgroundedAt ?: return false
        val minutes = preferences.autolockMinutesFlow.first()
        if (minutes == 0) return false
        if (SystemClock.elapsedRealtime() - since < minutes * 60_000L) return false
        return lockNow()
    }

    /**
     * アンロック中ならロックし、暗号化済みvaultをローカルに書き戻す。
     * 自動クリア待ちのクリップボードも即座にクリアする。
     * @return ロックした場合true
     */
    suspend fun lockNow(): Boolean {
        val application = app ?: return false
        return withContext(NonCancellable) {
            lockMutex.withLock {
                val locked = try {
                    if (repository.isUnlocked()) {
                        lastUserVerifiedAt = null
                        val encryptedBytes = repository.lock()
                        repository.writeVaultFile(encryptedBytes)
                        true
                    } else {
                        false
                    }
                } catch (_: Exception) {
                    // Lock failed - vault remains in current state
                    false
                }
                withContext(Dispatchers.Main) { ClipboardUtil.clearPendingNow(application) }
                if (locked) _lockEvents.emit(Unit)
                locked
            }
        }
    }
}
