package net.meshpeak.kura.credential

import android.content.Context
import android.net.Uri
import androidx.credentials.provider.CallingAppInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.meshpeak.kura.autofill.PackageDomainMap
import net.meshpeak.kura.data.model.WebAuthnCredentialCandidate
import net.meshpeak.kura.data.repository.IVaultRepository

/**
 * `rp_id`解決の唯一の入口。信頼の起点は`CallingAppInfo`のみ
 * （`getOrigin(allowlist)`の戻り値、または署名検証済みの`packageName`）とし、
 * リクエストJSON内の`rp.id`/`origin`は一切参照しない
 * （docs/android-passkey.md Part 8-2「リクエストJSON内のフィールドを無条件に信用しない」）。
 */
object OriginResolver {
    enum class Source { BROWSER, NATIVE_APP }

    data class Resolved(
        /** 新規作成時に使う代表rp_id。BROWSERは検証済みorigin由来、NATIVE_APPは[allRpIds]の先頭。 */
        val rpId: String,
        val source: Source,
        /** BROWSERの場合のみ非null。"https://example.com" 形式。clientDataJSON組み立てに使う。 */
        val webOrigin: String?,
        /**
         * このアプリに紐づく全てのrp_id候補。BROWSERの場合は[rpId]のみを含む1要素のリスト。
         * NATIVE_APPの場合、package_domains.jsonで1パッケージに複数ドメインが登録されている
         * ケース（例: com.instagram.androidはinstagram.com/facebook.comどちらのアカウントでも
         * ログインできる）に対応するため、Passkeyの検索（find/exclude）はこのリスト全体に
         * 対して行う必要がある。新規作成のrp_idには[rpId]（先頭要素）を使う。
         */
        val allRpIds: List<String>
    )

    /**
     * `PrivilegedAllowlist`の読み込み（初回はassetの同期I/O）を伴うため、
     * メインスレッドをブロックしないよう`Dispatchers.IO`上で実行する。
     */
    suspend fun resolve(context: Context, callingAppInfo: CallingAppInfo): Resolved? =
        withContext(Dispatchers.IO) {
            val allowlist = PrivilegedAllowlist.raw(context)
            val origin = runCatching { callingAppInfo.getOrigin(allowlist) }.getOrNull()
            if (origin != null) {
                val host = Uri.parse(origin).host ?: return@withContext null
                val rpId = host.lowercase()
                return@withContext Resolved(
                    rpId = rpId,
                    source = Source.BROWSER,
                    webOrigin = origin,
                    allRpIds = listOf(rpId)
                )
            }

            val domains = PackageDomainMap.domainsFor(context, callingAppInfo.packageName)
            if (domains.isEmpty()) return@withContext null
            val rpIds = domains.map { it.lowercase() }
            Resolved(rpId = rpIds.first(), source = Source.NATIVE_APP, webOrigin = null, allRpIds = rpIds)
        }
}

/**
 * [OriginResolver.Resolved.allRpIds]の全ドメインを横断してPasskey候補を検索し、
 * credential_idで重複排除して返す。1パッケージに複数ドメインが登録されている場合
 * （例: com.instagram.android → instagram.com/facebook.com）、rp_idを1つだけ使う検索では
 * 一部の候補を取りこぼしてしまうため、必ずこの関数経由で検索すること。
 */
suspend fun OriginResolver.Resolved.findCredentialsAcrossDomains(
    repository: IVaultRepository,
    allowCredentialIds: List<String>
): List<WebAuthnCredentialCandidate> {
    val seenCredentialIds = HashSet<String>()
    val result = mutableListOf<WebAuthnCredentialCandidate>()
    for (rpId in allRpIds) {
        val found = try {
            repository.webauthnFindCredentials(rpId, allowCredentialIds)
        } catch (_: Exception) {
            emptyList()
        }
        for (candidate in found) {
            if (seenCredentialIds.add(candidate.credentialId)) {
                result += candidate
            }
        }
    }
    return result
}
