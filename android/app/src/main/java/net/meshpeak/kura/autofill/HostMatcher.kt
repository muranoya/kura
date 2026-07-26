package net.meshpeak.kura.autofill

/**
 * ホスト名とドメイン文字列の比較。www.除去 + 完全一致 or サブドメイン許容のサフィックス一致という
 * 単純な方式を採る（docs/android-autofillservice.mdに詳細規定なし、この実装で確定）。
 * [LoginCandidateMatcher]（URLベース）と[SiteFieldPatternMap]（webDomainベース）で共有する。
 */
internal object HostMatcher {
    fun matches(host: String, domain: String): Boolean {
        val normalizedHost = host.removePrefix("www.").lowercase()
        val normalizedDomain = domain.removePrefix("www.").lowercase()
        if (normalizedDomain.isEmpty()) return false
        return normalizedHost == normalizedDomain || normalizedHost.endsWith(".$normalizedDomain")
    }
}
