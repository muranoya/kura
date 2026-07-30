package net.meshpeak.kura.credential

import android.content.Context
import android.net.Uri
import androidx.credentials.provider.CallingAppInfo
import net.meshpeak.kura.autofill.PackageDomainMap

/**
 * `rp_id`解決の唯一の入口。信頼の起点は`CallingAppInfo`のみ
 * （`getOrigin(allowlist)`の戻り値、または署名検証済みの`packageName`）とし、
 * リクエストJSON内の`rp.id`/`origin`は一切参照しない
 * （docs/android-passkey.md Part 8-2「リクエストJSON内のフィールドを無条件に信用しない」）。
 */
object OriginResolver {
    enum class Source { BROWSER, NATIVE_APP }

    data class Resolved(
        val rpId: String,
        val source: Source,
        /** BROWSERの場合のみ非null。"https://example.com" 形式。clientDataJSON組み立てに使う。 */
        val webOrigin: String?
    )

    fun resolve(context: Context, callingAppInfo: CallingAppInfo): Resolved? {
        val allowlist = PrivilegedAllowlist.raw(context)
        val origin = runCatching { callingAppInfo.getOrigin(allowlist) }.getOrNull()
        if (origin != null) {
            val host = Uri.parse(origin).host ?: return null
            return Resolved(rpId = host.lowercase(), source = Source.BROWSER, webOrigin = origin)
        }

        val domain = PackageDomainMap.domainFor(context, callingAppInfo.packageName) ?: return null
        return Resolved(rpId = domain.lowercase(), source = Source.NATIVE_APP, webOrigin = null)
    }
}
