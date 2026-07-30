package net.meshpeak.kura.credential

import android.os.CancellationSignal
import android.os.OutcomeReceiver
import androidx.credentials.exceptions.ClearCredentialException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginGetCredentialRequest
import androidx.credentials.provider.BeginGetCredentialResponse
import androidx.credentials.provider.CredentialProviderService
import androidx.credentials.provider.ProviderClearCredentialStateRequest
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import net.meshpeak.kura.data.repository.IVaultRepository
import net.meshpeak.kura.data.repository.VaultRepository

/**
 * ブラウザ・ネイティブアプリからのPasskey create/getリクエストに応答する
 * Credential Provider本体。Query（Begin）フェーズでは復号を伴わない候補件数のみを
 * 返し、実際の署名・復号はユーザーが候補を選択した後の Selection フェーズ
 * （[PasskeyGetActivity]/[PasskeyCreateActivity]）で行う
 * （docs/android-passkey.md 1-2の2段階リクエストモデル）。
 */
class KuraCredentialProviderService : CredentialProviderService() {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private val repository: IVaultRepository by lazy { VaultRepository(applicationContext) }

    override fun onDestroy() {
        serviceJob.cancel()
        super.onDestroy()
    }

    override fun onBeginCreateCredentialRequest(
        request: BeginCreateCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginCreateCredentialResponse, CreateCredentialException>
    ) {
        callback.onResult(CreateCredentialQueryBuilder.build(applicationContext, request))
    }

    override fun onBeginGetCredentialRequest(
        request: BeginGetCredentialRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<BeginGetCredentialResponse, GetCredentialException>
    ) {
        val job = serviceScope.launch {
            val response = try {
                GetCredentialQueryBuilder.build(applicationContext, repository, request)
            } catch (_: Exception) {
                BeginGetCredentialResponse()
            }
            withContext(Dispatchers.Main) {
                callback.onResult(response)
            }
        }
        cancellationSignal.setOnCancelListener { job.cancel() }
    }

    override fun onClearCredentialStateRequest(
        request: ProviderClearCredentialStateRequest,
        cancellationSignal: CancellationSignal,
        callback: OutcomeReceiver<Void?, ClearCredentialException>
    ) {
        callback.onResult(null)
    }
}
