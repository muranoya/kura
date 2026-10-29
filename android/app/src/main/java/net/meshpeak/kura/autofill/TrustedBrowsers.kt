package net.meshpeak.kura.autofill

import android.content.Context
import android.content.pm.PackageManager
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import net.meshpeak.kura.credential.PrivilegedAllowlist
import java.security.MessageDigest

@Serializable
private data class AllowlistFile(val apps: List<AllowlistApp> = emptyList())

@Serializable
private data class AllowlistApp(val type: String = "", val info: AllowlistInfo? = null)

@Serializable
private data class AllowlistInfo(
    @SerialName("package_name") val packageName: String = "",
    val signatures: List<AllowlistSignature> = emptyList()
)

@Serializable
private data class AllowlistSignature(
    @SerialName("cert_fingerprint_sha256") val certFingerprintSha256: String = ""
)

/**
 * AssistStructureの`webDomain`を信用してよいブラウザかどうかを、リクエスト元パッケージの
 * 署名証明書で判定する。`webDomain`はアプリ自身が`ViewStructure.setWebDomain()`で任意に
 * 設定できる値のため、署名を検証できないアプリの`webDomain`を信用すると、`package_domains.json`
 * による未登録パッケージの除外を素通りして任意ドメインのクレデンシャルを取得されてしまう
 * （docs/android-autofillservice.md 3-1-2）。
 *
 * 許可リストはPasskeyと同じGPM特権アプリリスト（[PrivilegedAllowlist]）を流用する。
 * Googleが証明書フィンガープリントを含めて保守しているため、Kura側で追従する必要がない。
 * ロード失敗時は空（どのブラウザも信用しない）にフォールバックする。
 */
object TrustedBrowsers {
    private val json = Json { ignoreUnknownKeys = true }

    @Volatile
    private var cache: Map<String, Set<String>>? = null

    fun isTrusted(context: Context, packageName: String?): Boolean {
        if (packageName.isNullOrEmpty()) return false
        val allowed = allowlist(context)[packageName] ?: return false
        return signingCertFingerprints(context, packageName).any { it in allowed }
    }

    private fun allowlist(context: Context): Map<String, Set<String>> {
        cache?.let { return it }
        synchronized(this) {
            cache?.let { return it }
            val loaded = parse(PrivilegedAllowlist.raw(context))
            cache = loaded
            return loaded
        }
    }

    /** パッケージ名 → 許可する署名証明書SHA-256（大文字・コロン区切り）の集合 */
    internal fun parse(text: String): Map<String, Set<String>> = runCatching {
        json.decodeFromString<AllowlistFile>(text).apps
            .filter { it.type == "android" }
            .mapNotNull { it.info }
            .filter { it.packageName.isNotEmpty() }
            .groupBy({ it.packageName }) { info ->
                info.signatures.map { it.certFingerprintSha256.uppercase() }.filter { it.isNotEmpty() }
            }
            .mapValues { (_, lists) -> lists.flatten().toSet() }
    }.getOrDefault(emptyMap())

    private fun signingCertFingerprints(context: Context, packageName: String): Set<String> = try {
        val signingInfo = context.packageManager
            .getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            .signingInfo ?: return emptySet()
        val certs = if (signingInfo.hasMultipleSigners()) {
            signingInfo.apkContentsSigners
        } else {
            signingInfo.signingCertificateHistory
        }
        certs.map { fingerprint(it.toByteArray()) }.toSet()
    } catch (_: PackageManager.NameNotFoundException) {
        emptySet()
    }

    internal fun fingerprint(cert: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(cert).joinToString(":") { "%02X".format(it) }
}
