package net.meshpeak.kura.autofill

import android.content.Context
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

@Serializable
data class PackageDomainEntry(val domain: String)

/**
 * パッケージ名⇔ドメインの手動キュレーションDB（assets/package_domains.json）を読み込む。
 * 未登録パッケージは常に候補なしとする安全側デフォルトのため、ロード失敗時も
 * 例外を投げず空マップにフォールバックする（docs/android-autofillservice.md 3-2-2）。
 */
object PackageDomainMap {
    private const val ASSET_PATH = "package_domains.json"
    private val json = Json { ignoreUnknownKeys = true }

    @Volatile
    private var cache: Map<String, PackageDomainEntry>? = null

    fun domainFor(context: Context, packageName: String): String? {
        return mapFor(context)[packageName]?.domain
    }

    private fun mapFor(context: Context): Map<String, PackageDomainEntry> {
        cache?.let { return it }
        synchronized(this) {
            cache?.let { return it }
            val loaded = load(context)
            cache = loaded
            return loaded
        }
    }

    private fun load(context: Context): Map<String, PackageDomainEntry> {
        val text = runCatching {
            context.assets.open(ASSET_PATH).bufferedReader().readText()
        }.getOrNull() ?: return emptyMap()
        return parse(text)
    }

    internal fun parse(text: String): Map<String, PackageDomainEntry> = runCatching {
        json.decodeFromString<Map<String, PackageDomainEntry>>(text)
    }.getOrDefault(emptyMap())
}
