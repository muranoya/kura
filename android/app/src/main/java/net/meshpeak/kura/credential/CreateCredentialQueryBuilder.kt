package net.meshpeak.kura.credential

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.credentials.provider.BeginCreateCredentialRequest
import androidx.credentials.provider.BeginCreateCredentialResponse
import androidx.credentials.provider.BeginCreatePublicKeyCredentialRequest
import androidx.credentials.provider.CreateEntry
import net.meshpeak.kura.R
import java.util.concurrent.atomic.AtomicInteger

private val requestCodeSeq = AtomicInteger()

/**
 * `onBeginCreateCredentialRequest`本体。Createは「作成する」という単一アクションであり
 * Getと異なり候補の有無を露出する必要がないため、ロック中でも常に`CreateEntry`を1件
 * 返す（docs/android-passkey.md 3-1）。実際のOrigin検証・紐付け先解決・
 * `excludeCredentials`チェックはSelectionフェーズの[PasskeyCreateActivity]で行う。
 */
object CreateCredentialQueryBuilder {

    fun build(context: Context, request: BeginCreateCredentialRequest): BeginCreateCredentialResponse {
        if (request !is BeginCreatePublicKeyCredentialRequest) {
            return BeginCreateCredentialResponse(createEntries = emptyList())
        }

        val intent = Intent(context, PasskeyCreateActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCodeSeq.incrementAndGet(),
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val entry = CreateEntry.Builder(context.getString(R.string.app_name), pendingIntent).build()
        return BeginCreateCredentialResponse(createEntries = listOf(entry))
    }
}
