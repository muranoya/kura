package net.meshpeak.kura.credential

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.credentials.provider.CallingAppInfo
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.autofill.PackageDomainMap
import net.meshpeak.kura.data.model.WebAuthnCredentialCandidate
import net.meshpeak.kura.data.repository.IVaultRepository

/**
 * `rp_id`解決の唯一の入口。信頼の起点は`CallingAppInfo`のみ
 * （`getOrigin(allowlist)`の戻り値、または署名検証済みの`packageName`）とする
 * （docs/android-passkey.md Part 8-2「リクエストJSON内のフィールドを無条件に信用しない」）。
 *
 * 【実装時の訂正】BROWSERの場合、リクエストJSON内の`rp.id`/`rpId`は依然として
 * それ単体では信用しないが、[Resolved.validateClaimedRpId]経由で検証済みoriginに対する
 * WebAuthn仕様の"registrable domain suffix"チェック（vault-core `domain_match::
 * is_valid_webauthn_rp_id`、PSL/eTLD+1ベース）を通した上でなら検索対象に加える。
 * これを行わないと、サイトがログインページ（例: `login.example.com`）とは別の
 * 親ドメイン（例: `example.com`）をrp.idとして正当に登録しているケース
 * （多くのサイトがサブドメイン間でPasskeyを共有するために採用する一般的な構成）で
 * 既存Passkeyが一切見つからず、無限ループの原因になっていた（実機検証で発覚）。
 * NATIVE_APPは引き続きrequestJSONのrp.id/rpIdを一切参照しない
 * （`package_domains.json`による手動キュレーションのみが信頼の起点）。
 */
private const val TAG = "KuraPasskey"

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
    ) {
        /**
         * requestJsonが自己申告する`rp.id`（[ClientDataJsonBuilder.extractRpId]や
         * [CreateRequestInfo.rpId]で抽出した、検証前の値）を、検証済みoriginに対する
         * WebAuthn仕様の"registrable domain suffix"チェックを通した上で採用可否を判定する。
         * 有効なら（[allRpIds]に追加すべき）その値自身を、無効・null・[rpId]と同じ・
         * NATIVE_APP（requestJsonのrp.idは自己申告であり検証手段がないため常に無視）
         * のいずれかならnullを返す。
         */
        suspend fun validateClaimedRpId(repository: IVaultRepository, claimedRpId: String?): String? {
            if (source != Source.BROWSER || claimedRpId.isNullOrBlank()) return null
            val claimed = claimedRpId.lowercase()
            if (claimed == rpId) return null
            val valid = try {
                repository.isValidWebauthnRpId(rpId, claimed)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) Log.d(TAG, "validateClaimedRpId: isValidWebauthnRpId failed for origin=$rpId claimed=$claimed", e)
                false
            }
            if (BuildConfig.DEBUG) Log.d(TAG, "validateClaimedRpId: origin=$rpId claimed=$claimed valid=$valid")
            return if (valid) claimed else null
        }
    }

    /**
     * `PrivilegedAllowlist`の読み込み（初回はassetの同期I/O）を伴うため、
     * メインスレッドをブロックしないよう`Dispatchers.IO`上で実行する。
     */
    suspend fun resolve(context: Context, callingAppInfo: CallingAppInfo): Resolved? =
        withContext(Dispatchers.IO) {
            val allowlist = PrivilegedAllowlist.raw(context)
            val originResult = runCatching { callingAppInfo.getOrigin(allowlist) }
            if (BuildConfig.DEBUG) {
                originResult.exceptionOrNull()?.let {
                    Log.d(TAG, "resolve: getOrigin threw for package=${callingAppInfo.packageName}", it)
                }
            }
            val origin = originResult.getOrNull()
            if (origin != null) {
                val host = Uri.parse(origin).host
                if (host == null) {
                    if (BuildConfig.DEBUG) Log.d(TAG, "resolve: origin=$origin has no host -> null")
                    return@withContext null
                }
                val rpId = host.lowercase()
                return@withContext Resolved(
                    rpId = rpId,
                    source = Source.BROWSER,
                    webOrigin = origin,
                    allRpIds = listOf(rpId)
                )
            }

            val domains = PackageDomainMap.domainsFor(context, callingAppInfo.packageName)
            if (domains.isEmpty()) {
                if (BuildConfig.DEBUG) Log.d(TAG, "resolve: no origin and no package_domains.json entry for package=${callingAppInfo.packageName} -> null")
                return@withContext null
            }
            val rpIds = domains.map { it.lowercase() }
            Resolved(rpId = rpIds.first(), source = Source.NATIVE_APP, webOrigin = null, allRpIds = rpIds)
        }
}

/**
 * [OriginResolver.Resolved.allRpIds]（+ 検証済みなら[extraRpId]）の全ドメインを横断して
 * Passkey候補を検索し、credential_idで重複排除して返す。1パッケージに複数ドメインが
 * 登録されている場合（例: com.instagram.android → instagram.com/facebook.com）、
 * rp_idを1つだけ使う検索では一部の候補を取りこぼしてしまうため、必ずこの関数経由で検索すること。
 *
 * @param extraRpId [OriginResolver.Resolved.validateClaimedRpId]で検証済みの、
 * サイトが自己申告する親ドメインrp.id（例: ログインページ`login.example.com`に対する
 * `example.com`）。呼び出し元で未検証の値を渡さないこと。
 */
suspend fun OriginResolver.Resolved.findCredentialsAcrossDomains(
    repository: IVaultRepository,
    allowCredentialIds: List<String>,
    extraRpId: String? = null
): List<WebAuthnCredentialCandidate> {
    val searchRpIds = if (extraRpId != null) allRpIds + extraRpId else allRpIds
    val seenCredentialIds = HashSet<String>()
    val result = mutableListOf<WebAuthnCredentialCandidate>()
    for (rpId in searchRpIds) {
        val found = try {
            repository.webauthnFindCredentials(rpId, allowCredentialIds)
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "findCredentialsAcrossDomains: webauthnFindCredentials failed for rpId=$rpId", e)
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
