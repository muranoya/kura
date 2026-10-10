package net.meshpeak.kura.autofill

import android.content.Context
import android.content.pm.PackageManager
import android.util.Log
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.credential.PrivilegedAllowlist
import java.security.MessageDigest

/**
 * オートフィル要求元が「webDomainを代弁してよいブラウザ」かを判定する。
 *
 * `ViewNode.getWebDomain()`はアプリ側が`ViewStructure.setWebDomain()`で自由に設定できるため、
 * 任意のアプリが「bank.com」を名乗って銀行の認証情報を候補に出させることができてしまう。
 * そこでPasskeyと同じGoogle公開の特権ブラウザ許可リスト（[PrivilegedAllowlist]）を信頼の起点とし、
 * パッケージ名が掲載されていて、かつインストール済みアプリの署名証明書が掲載フィンガープリントと
 * 一致する場合のみブラウザとして扱う（docs/android-autofillservice.md 3-1-2）。
 */
object TrustedBrowserVerifier {
    private const val TAG = "KuraAutofill"
    private val json = Json { ignoreUnknownKeys = true }

    @Serializable
    private data class Allowlist(val apps: List<App> = emptyList())

    @Serializable
    private data class App(val type: String = "", val info: Info? = null)

    @Serializable
    private data class Info(
        @SerialName("package_name") val packageName: String = "",
        val signatures: List<Signature> = emptyList()
    )

    @Serializable
    private data class Signature(
        @SerialName("cert_fingerprint_sha256") val fingerprint: String = ""
    )

    @Volatile
    private var cache: Map<String, Set<String>>? = null

    fun isTrustedBrowser(context: Context, packageName: String): Boolean {
        val allowed = fingerprintsByPackage(context)[packageName] ?: return false
        val actual = signingCertFingerprints(context, packageName)
        val trusted = actual.any { it in allowed }
        if (BuildConfig.DEBUG && !trusted) {
            Log.d(TAG, "untrusted browser: package=$packageName signatures do not match allowlist")
        }
        return trusted
    }

    /** 許可リストJSONを「パッケージ名 → 許可された署名フィンガープリント（大文字・コロン区切り）」に変換する */
    internal fun parse(raw: String): Map<String, Set<String>> = runCatching {
        json.decodeFromString<Allowlist>(raw).apps
            .filter { it.type == "android" }
            .mapNotNull { it.info }
            .filter { it.packageName.isNotEmpty() }
            .groupBy({ it.packageName }, { info -> info.signatures.map { it.fingerprint.uppercase() } })
            .mapValues { (_, lists) -> lists.flatten().toSet() }
    }.getOrDefault(emptyMap())

    internal fun formatFingerprint(certBytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(certBytes)
            .joinToString(":") { "%02X".format(it) }

    private fun fingerprintsByPackage(context: Context): Map<String, Set<String>> {
        cache?.let { return it }
        synchronized(this) {
            cache?.let { return it }
            val loaded = parse(PrivilegedAllowlist.raw(context))
            cache = loaded
            return loaded
        }
    }

    /**
     * インストール済みアプリの署名証明書フィンガープリント。
     * 他アプリの参照にはパッケージ可視性が必要（AndroidManifestの`<queries>`でブラウザを可視化している）。
     * 参照できない場合は空リスト（＝信頼しない）を返す。
     */
    private fun signingCertFingerprints(context: Context, packageName: String): List<String> = try {
        val info = context.packageManager.getPackageInfo(packageName, PackageManager.GET_SIGNING_CERTIFICATES)
        val signingInfo = info.signingInfo ?: return emptyList()
        val certs = if (signingInfo.hasMultipleSigners()) {
            signingInfo.apkContentsSigners
        } else {
            signingInfo.signingCertificateHistory
        }
        certs.map { formatFingerprint(it.toByteArray()) }
    } catch (e: PackageManager.NameNotFoundException) {
        emptyList()
    }
}
