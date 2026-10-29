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
class TrustedBrowsersTest {

    @Test
    fun `GPM許可リスト形式をパースしフィンガープリントを大文字で保持する`() {
        val text = """
            {"apps": [
              {"type": "android", "info": {"package_name": "com.example.browser", "signatures": [
                {"build": "release", "cert_fingerprint_sha256": "aa:bb"},
                {"build": "userdebug", "cert_fingerprint_sha256": "CC:DD"}
              ]}}
            ]}
        """.trimIndent()
        assertEquals(mapOf("com.example.browser" to setOf("AA:BB", "CC:DD")), TrustedBrowsers.parse(text))
    }

    @Test
    fun `同じパッケージが複数回現れたらフィンガープリントを統合する`() {
        val text = """
            {"apps": [
              {"type": "android", "info": {"package_name": "com.example.browser", "signatures": [{"cert_fingerprint_sha256": "AA"}]}},
              {"type": "android", "info": {"package_name": "com.example.browser", "signatures": [{"cert_fingerprint_sha256": "BB"}]}}
            ]}
        """.trimIndent()
        assertEquals(setOf("AA", "BB"), TrustedBrowsers.parse(text)["com.example.browser"])
    }

    @Test
    fun `android以外のtypeは無視する`() {
        val text = """{"apps": [{"type": "web", "info": {"package_name": "x", "signatures": []}}]}"""
        assertTrue(TrustedBrowsers.parse(text).isEmpty())
    }

    @Test
    fun `不正なJSONは空マップ`() {
        assertTrue(TrustedBrowsers.parse("not json").isEmpty())
    }

    @Test
    fun `フィンガープリントはSHA-256の大文字コロン区切り`() {
        val fp = TrustedBrowsers.fingerprint(byteArrayOf())
        assertEquals(
            "E3:B0:C4:42:98:FC:1C:14:9A:FB:F4:C8:99:6F:B9:24:27:AE:41:E4:64:9B:93:4C:A4:95:99:1B:78:52:B8:55",
            fp
        )
    }

    @Test
    fun `許可リストにないパッケージや未インストールのパッケージは信用しない`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        assertFalse(TrustedBrowsers.isTrusted(context, "com.example.unknown"))
        assertFalse(TrustedBrowsers.isTrusted(context, null))
        // 許可リストには載っているが端末に存在しない（署名を取得できない）
        assertFalse(TrustedBrowsers.isTrusted(context, "com.android.chrome"))
    }
}
