package net.meshpeak.kura.autofill

import android.content.Context
import android.content.pm.PackageManager
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.security.MessageDigest

@Serializable
data class PackageDomainEntry(val domain: String, val certSha256: List<String>? = null)

/**
 * パッケージ名⇔ドメインの手動キュレーションDB（assets/package_domains.json）を読み込む。
 * 未登録パッケージは常に候補なしとする安全側デフォルトのため、ロード失敗時も
 * 例外を投げず空マップにフォールバックする。
 *
 * インストール済みアプリの実際の署名証明書は`certSha256`と突き合わせる
 * （パッケージ名squattingによるなりすまし対策）。
 * `certSha256`が未設定のエントリは検証手段が無いため、不一致の場合と同じ安全側デフォルト
 * （候補を一切出さない）として扱う。ドメイン名一致のみで通すような弱いフォールバックは
 * 用意しない。squatting対策という目的上、未検証のエントリを黙って許可すると対策の意味が
 * 失われるため。
 */
object PackageDomainMap {
    private const val ASSET_PATH = "package_domains.json"
    private val json = Json { ignoreUnknownKeys = true }

    @Volatile
    private var cache: Map<String, PackageDomainEntry>? = null

    fun domainFor(context: Context, packageName: String): String? {
        val entry = mapFor(context)[packageName] ?: return null
        val expectedFingerprints = entry.certSha256
        if (expectedFingerprints.isNullOrEmpty()) return null
        if (!isTrustedSigner(context, packageName, expectedFingerprints)) return null
        return entry.domain
    }

    internal fun isTrustedSigner(
        context: Context,
        packageName: String,
        expectedFingerprints: List<String>
    ): Boolean {
        val actualFingerprints = currentSigningCertFingerprints(context, packageName) ?: return false
        return matchesAnyFingerprint(actualFingerprints, expectedFingerprints)
    }

    internal fun matchesAnyFingerprint(actual: List<String>, expected: List<String>): Boolean {
        val normalizedExpected = expected.map(::normalizeFingerprint).toSet()
        return actual.any { normalizeFingerprint(it) in normalizedExpected }
    }

    private fun normalizeFingerprint(fingerprint: String): String =
        fingerprint.uppercase().replace(":", "")

    private fun currentSigningCertFingerprints(context: Context, packageName: String): List<String>? =
        runCatching {
            val packageInfo = context.packageManager.getPackageInfo(
                packageName,
                PackageManager.GET_SIGNING_CERTIFICATES
            )
            packageInfo.signingInfo?.apkContentsSigners?.map { sha256Hex(it.toByteArray()) }
        }.getOrNull()

    private fun sha256Hex(bytes: ByteArray): String {
        val digestBytes = MessageDigest.getInstance("SHA-256").digest(bytes)
        return digestBytes.joinToString(":") { "%02X".format(it) }
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
