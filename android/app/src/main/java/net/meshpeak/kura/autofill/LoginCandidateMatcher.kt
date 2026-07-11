package net.meshpeak.kura.autofill

import net.meshpeak.kura.data.model.AutofillCandidate
import java.net.URI

/**
 * AutofillCandidate.url のホストと、パッケージ名マッピングDBのdomainを比較する。
 * ホスト正規化は www. 除去 + 完全一致 or サブドメイン許容のサフィックス一致という
 * 単純な方式を採る（docs/android-autofillservice.mdに詳細規定なし、この実装で確定）。
 */
object LoginCandidateMatcher {

    fun filter(candidates: List<AutofillCandidate>, domain: String): List<AutofillCandidate> =
        candidates.filter { matches(it.url, domain) }

    fun matches(candidateUrl: String, domain: String): Boolean {
        val host = extractHost(candidateUrl)?.removePrefix("www.")?.lowercase() ?: return false
        val normalizedDomain = domain.removePrefix("www.").lowercase()
        if (normalizedDomain.isEmpty()) return false
        return host == normalizedDomain || host.endsWith(".$normalizedDomain")
    }

    private fun extractHost(url: String): String? = runCatching {
        val withScheme = if (url.contains("://")) url else "https://$url"
        URI(withScheme).host
    }.getOrNull()
}
