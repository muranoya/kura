package net.meshpeak.kura.autofill

import android.app.Application
import android.content.pm.ApplicationInfo
import android.content.pm.PackageInfo
import android.content.pm.Signature
import android.content.pm.SigningInfo
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.security.MessageDigest

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PackageDomainMapTest {

    @Test
    fun `正常なJSONをパースできる`() {
        val text = """{"com.example.app": {"domain": "example.com"}}"""
        val result = PackageDomainMap.parse(text)
        assertEquals("example.com", result["com.example.app"]?.domain)
    }

    @Test
    fun `certSha256未設定のエントリはnullとしてパースされる`() {
        val text = """{"com.example.app": {"domain": "example.com"}}"""
        val result = PackageDomainMap.parse(text)
        assertNull(result["com.example.app"]?.certSha256)
    }

    @Test
    fun `certSha256を含むJSONをパースできる`() {
        val text = """{"com.example.app": {"domain": "example.com", "certSha256": ["AB:CD"]}}"""
        val result = PackageDomainMap.parse(text)
        assertEquals(listOf("AB:CD"), result["com.example.app"]?.certSha256)
    }

    @Test
    fun `fingerprintが完全一致すればtrue`() {
        assertTrue(PackageDomainMap.matchesAnyFingerprint(listOf("AB:CD:EF"), listOf("AB:CD:EF")))
    }

    @Test
    fun `大文字小文字を無視して一致する`() {
        assertTrue(PackageDomainMap.matchesAnyFingerprint(listOf("ab:cd:ef"), listOf("AB:CD:EF")))
    }

    @Test
    fun `コロンの有無を無視して一致する`() {
        assertTrue(PackageDomainMap.matchesAnyFingerprint(listOf("ABCDEF"), listOf("AB:CD:EF")))
    }

    @Test
    fun `複数の許容fingerprintのいずれかに一致すればtrue`() {
        assertTrue(
            PackageDomainMap.matchesAnyFingerprint(listOf("11:22:33"), listOf("AA:BB:CC", "11:22:33"))
        )
    }

    @Test
    fun `複数の実際の署名のいずれかが一致すればtrue`() {
        assertTrue(
            PackageDomainMap.matchesAnyFingerprint(listOf("AA:BB:CC", "11:22:33"), listOf("11:22:33"))
        )
    }

    @Test
    fun `一致するfingerprintが無ければfalse`() {
        assertFalse(PackageDomainMap.matchesAnyFingerprint(listOf("AA:BB:CC"), listOf("11:22:33")))
    }

    @Test
    fun `不正なJSONは空マップにフォールバックする`() {
        val result = PackageDomainMap.parse("not valid json")
        assertEquals(emptyMap<String, Any>(), result)
    }

    @Test
    fun `空のJSONオブジェクトは空マップになる`() {
        val result = PackageDomainMap.parse("{}")
        assertEquals(emptyMap<String, Any>(), result)
    }

    @Test
    fun `実際のassets package_domains json は初期状態で空マップである`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val domain = PackageDomainMap.domainFor(context, "com.example.unregistered")
        assertNull(domain)
    }

    @Test
    fun `certSha256未設定のエントリはfail-closedで候補を返さない`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        // jp.co.sbisec.hyperkabu2 は assets/package_domains.json 上でdomainのみ登録されており
        // certSha256は未設定（対象ドメインがassetlinks.jsonを公開していないため）。
        // 未検証のまま候補を出すと squatting 対策の意味が失われるため、候補なしが正しい。
        val domain = PackageDomainMap.domainFor(context, "jp.co.sbisec.hyperkabu2")
        assertNull(domain)
    }

    @Test
    fun `certSha256登録済みでもテスト環境に未インストールなら候補を返さない`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        // com.github.android は certSha256 が登録済みだが、テスト実行環境には
        // 実際にインストールされていないため署名を取得できず、フェイルクローズする。
        val domain = PackageDomainMap.domainFor(context, "com.github.android")
        assertNull(domain)
    }

    @Test
    fun `GET_SIGNING_CERTIFICATESで取得した実際の署名がfingerprintと一致すればtrue`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val packageName = "com.example.signed"
        val signature = Signature("0102030405060708")
        installFakeSignedPackage(context, packageName, signature)

        val expectedFingerprint = sha256Hex(signature.toByteArray())
        assertTrue(PackageDomainMap.isTrustedSigner(context, packageName, listOf(expectedFingerprint)))
    }

    @Test
    fun `GET_SIGNING_CERTIFICATESで取得した実際の署名がfingerprintと一致しなければfalse`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val packageName = "com.example.signed"
        installFakeSignedPackage(context, packageName, Signature("0102030405060708"))

        assertFalse(PackageDomainMap.isTrustedSigner(context, packageName, listOf("00:00:00")))
    }

    @Test
    fun `未インストールのパッケージはfalse`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        assertFalse(
            PackageDomainMap.isTrustedSigner(context, "com.example.not.installed", listOf("00:00:00"))
        )
    }

    private fun installFakeSignedPackage(context: Application, packageName: String, signature: Signature) {
        val signingInfo = SigningInfo()
        shadowOf(signingInfo).setSignatures(arrayOf(signature))
        val packageInfo = PackageInfo().apply {
            this.packageName = packageName
            applicationInfo = ApplicationInfo().apply {
                this.packageName = packageName
                sourceDir = "/test/$packageName.apk"
            }
            this.signingInfo = signingInfo
        }
        shadowOf(context.packageManager).installPackage(packageInfo)
    }

    private fun sha256Hex(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(":") { "%02X".format(it) }
}
