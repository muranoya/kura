package net.meshpeak.kura.autofill

import android.content.pm.verify.domain.DomainVerificationManager
import android.content.pm.verify.domain.DomainVerificationUserState
import android.content.Context
import android.os.Build
import android.util.Log
import net.meshpeak.kura.BuildConfig

private const val TAG = "KuraAutofill"

/**
 * パッケージ名からドメインを解決する2段階リゾルバー。
 *
 * 1. [DomainVerificationManager]（API 31+、主解決手段）:
 *    アプリがApp Linksで検証済みのホスト一覧を取得する
 * 2. [PackageDomainMap]（フォールバック）:
 *    手動キュレーションDBからドメインを取得する
 *
 * プロセス生存中に値は不変のため、各解決結果をキャッシュする
 * （docs/android-autofillservice.md 3-2-1, 3-2-2）。
 */
object PackageDomainResolver {

    @Volatile
    private var verifiedHostsCache: Map<String, Set<String>> = emptyMap()

    /** テスト用: キャッシュをリセットする */
    internal fun resetCacheForTesting() {
        verifiedHostsCache = emptyMap()
    }

    /**
     * パッケージ名に対応するドメイン一覧を返す。
     * マッチング候補は複数存在しうるため [List] で返す。
     * 両方の手段でドメインが解決できなかった場合は空リストを返す
     * （未登録パッケージは候補なしとする安全側デフォルト）。
     */
    fun resolveDomains(context: Context, packageName: String): List<String> {
        // Step 1: DomainVerificationManager（主解決手段）
        val verifiedHosts = resolveViaDomainVerificationManager(context, packageName)
        if (verifiedHosts.isNotEmpty()) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "resolveDomains: $packageName -> verified hosts: $verifiedHosts")
            }
            return verifiedHosts.toList()
        }

        // Step 2: package_domains.json（フォールバック）
        val fallbackDomain = PackageDomainMap.domainFor(context, packageName)
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "resolveDomains: $packageName -> fallback domain: $fallbackDomain")
        }
        return listOfNotNull(fallbackDomain)
    }

    @Suppress("WrongConstant")
    private fun resolveViaDomainVerificationManager(
        context: Context,
        packageName: String
    ): Set<String> {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return emptySet()

        verifiedHostsCache[packageName]?.let { return it }

        val manager = try {
            context.getSystemService(Context.DOMAIN_VERIFICATION_SERVICE) as? DomainVerificationManager
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "DomainVerificationManager not available", e)
            }
            return emptySet()
        } ?: return emptySet()

        // getDomainVerificationUserState はパッケージが存在しない場合や
        // App Links未宣言の場合は NameNotFoundException を投げる
        val userState = try {
            manager.getDomainVerificationUserState(packageName)
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) {
                Log.d(TAG, "getDomainVerificationUserState failed for $packageName", e)
            }
            return emptySet()
        } ?: return emptySet()

        val verified = userState.hostToStateMap.entries
            .filter { it.value == DomainVerificationUserState.DOMAIN_STATE_VERIFIED }
            .map { it.key }
            .toSet()

        verifiedHostsCache += packageName to verified
        return verified
    }
}
