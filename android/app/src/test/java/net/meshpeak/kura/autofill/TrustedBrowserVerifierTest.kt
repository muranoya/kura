package net.meshpeak.kura.autofill

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class TrustedBrowserVerifierTest {

    @Test
    fun `許可リストをパッケージ名ごとの署名フィンガープリント集合に変換する`() {
        val raw = """
            {"apps":[
              {"type":"android","info":{"package_name":"com.example.browser","signatures":[
                {"build":"release","cert_fingerprint_sha256":"aa:bb"},
                {"build":"userdebug","cert_fingerprint_sha256":"CC:DD"}]}},
              {"type":"other","info":{"package_name":"com.example.ignored","signatures":[]}}
            ]}
        """.trimIndent()
        val result = TrustedBrowserVerifier.parse(raw)
        assertEquals(mapOf("com.example.browser" to setOf("AA:BB", "CC:DD")), result)
    }

    @Test
    fun `不正なJSONは空マップになる`() {
        assertTrue(TrustedBrowserVerifier.parse("not json").isEmpty())
    }

    @Test
    fun `フィンガープリントは大文字コロン区切りのSHA-256`() {
        val fp = TrustedBrowserVerifier.formatFingerprint(byteArrayOf())
        assertEquals(
            "E3:B0:C4:42:98:FC:1C:14:9A:FB:F4:C8:99:6F:B9:24:27:AE:41:E4:64:9B:93:4C:A4:95:99:1B:78:52:B8:55",
            fp
        )
    }

    @Test
    fun `許可リストにないパッケージはwebDomainを主張してもブラウザとして扱わない`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        assertFalse(TrustedBrowserVerifier.isTrustedBrowser(context, "com.evil.app"))
    }

    @Test
    fun `許可リストにあっても未インストール（署名を確認できない）なら信用しない`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        assertFalse(TrustedBrowserVerifier.isTrustedBrowser(context, "com.android.chrome"))
    }
}
