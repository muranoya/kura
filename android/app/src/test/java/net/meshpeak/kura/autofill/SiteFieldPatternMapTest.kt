package net.meshpeak.kura.autofill

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class SiteFieldPatternMapTest {

    @Test
    fun `正常なJSONをパースできる`() {
        val text = """{"example.com": {"username": ["login_id"], "password": ["login_pw"]}}"""
        val result = SiteFieldPatternMap.parse(text)
        assertEquals(listOf("login_id"), result["example.com"]?.username)
        assertEquals(listOf("login_pw"), result["example.com"]?.password)
    }

    @Test
    fun `フィールド省略時は空リストになる`() {
        val text = """{"example.com": {"username": ["login_id"]}}"""
        val result = SiteFieldPatternMap.parse(text)
        assertEquals(emptyList<String>(), result["example.com"]?.password)
        assertEquals(emptyList<String>(), result["example.com"]?.totp)
    }

    @Test
    fun `不正なJSONは空マップにフォールバックする`() {
        val result = SiteFieldPatternMap.parse("not valid json")
        assertEquals(emptyMap<String, Any>(), result)
    }

    @Test
    fun `空のJSONオブジェクトは空マップになる`() {
        val result = SiteFieldPatternMap.parse("{}")
        assertEquals(emptyMap<String, Any>(), result)
    }

    @Test
    fun `実際のassets site_field_patterns json は初期状態で空マップである`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val pattern = SiteFieldPatternMap.patternFor(context, "example.com")
        assertNull(pattern)
    }

    @Test
    fun `bestMatch は完全一致するドメインを返す`() {
        val patterns = mapOf("example.com" to SitePatternEntry(username = listOf("uid")))
        val result = SiteFieldPatternMap.bestMatch(patterns, "example.com")
        assertEquals(listOf("uid"), result?.username)
    }

    @Test
    fun `bestMatch はサブドメインもサフィックス一致する`() {
        val patterns = mapOf("example.com" to SitePatternEntry(username = listOf("uid")))
        val result = SiteFieldPatternMap.bestMatch(patterns, "login.example.com")
        assertEquals(listOf("uid"), result?.username)
    }

    @Test
    fun `bestMatch は一致しないドメインでnullを返す`() {
        val patterns = mapOf("example.com" to SitePatternEntry(username = listOf("uid")))
        val result = SiteFieldPatternMap.bestMatch(patterns, "other.com")
        assertNull(result)
    }

    @Test
    fun `bestMatch は複数マッチ時に最長一致のドメインを優先する`() {
        val patterns = mapOf(
            "example.com" to SitePatternEntry(username = listOf("generic_uid")),
            "login.example.com" to SitePatternEntry(username = listOf("specific_uid"))
        )
        val result = SiteFieldPatternMap.bestMatch(patterns, "login.example.com")
        assertEquals(listOf("specific_uid"), result?.username)
    }
}
