package net.meshpeak.kura.autofill

/**
 * ホスト名とドメイン文字列の比較。www.除去 + 完全一致 or サブドメイン許容のサフィックス一致という
 * 単純な方式を採る。[SiteFieldPatternMap]（webDomainベースのフィールド種別検出用パターンDB引き当て）
 * が使用する。ログイン候補（vault エントリ）のドメインマッチングはPSL/eTLD+1ベースの判定が必要な
 * ため vault-core 側（`api_list_login_candidates`）に一元化されており、本オブジェクトは使わない
 * （docs/android-autofillservice.md参照）。
 */
internal object HostMatcher {
    fun matches(host: String, domain: String): Boolean {
        val normalizedHost = host.removePrefix("www.").lowercase()
        val normalizedDomain = domain.removePrefix("www.").lowercase()
        if (normalizedDomain.isEmpty()) return false
        return normalizedHost == normalizedDomain || normalizedHost.endsWith(".$normalizedDomain")
    }
}
