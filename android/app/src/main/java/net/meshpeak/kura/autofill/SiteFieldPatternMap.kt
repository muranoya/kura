package net.meshpeak.kura.autofill

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class SitePatternEntry(
    val username: List<String> = emptyList(),
    val password: List<String> = emptyList(),
    val totp: List<String> = emptyList()
)

/**
 * Android向けサイト別フィールド検出パターンDB（assets/site_field_patterns.json）を読み込む。
 * ブラウザ由来リクエストのフィールド検出で、標準シグナル（autofillHints/htmlAttributes）
 * だけでは判定できないサイト固有のname/id属性を補完する（docs/android-autofillservice.md 3-2-2）。
 * CSSセレクタは扱わず、name/id属性値の完全一致のみをサポートする単純フォーマット
 * （拡張機能側のCSSセレクタベースのパターンファイルとはスキーマを共有しない）。
 */
object SiteFieldPatternMap {
    private const val ASSET_PATH = "site_field_patterns.json"
    private val json = Json { ignoreUnknownKeys = true }

    @Volatile
    private var cache: Map<String, SitePatternEntry>? = null

    /** [host]に一致するパターンを返す。複数ドメインキーがサフィックス一致する場合は最長一致を採用する。 */
    fun patternFor(context: Context, host: String): SitePatternEntry? = bestMatch(mapFor(context), host)

    /** マッチングアルゴリズム本体。Context非依存の純粋関数としてテスト容易性を確保する。 */
    internal fun bestMatch(patterns: Map<String, SitePatternEntry>, host: String): SitePatternEntry? =
        patterns.entries
            .filter { (domain, _) -> HostMatcher.matches(host, domain) }
            .maxByOrNull { (domain, _) -> domain.length }
            ?.value

    private fun mapFor(context: Context): Map<String, SitePatternEntry> {
        cache?.let { return it }
        synchronized(this) {
            cache?.let { return it }
            val loaded = load(context)
            cache = loaded
            return loaded
        }
    }

    private fun load(context: Context): Map<String, SitePatternEntry> {
        val text = runCatching {
            context.assets.open(ASSET_PATH).bufferedReader().readText()
        }.getOrNull() ?: return emptyMap()
        return parse(text)
    }

    internal fun parse(text: String): Map<String, SitePatternEntry> = runCatching {
        json.decodeFromString<Map<String, SitePatternEntry>>(text)
    }.getOrDefault(emptyMap())
}
