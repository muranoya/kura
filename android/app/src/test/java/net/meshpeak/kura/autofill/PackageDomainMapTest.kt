package net.meshpeak.kura.autofill

import android.app.Application
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PackageDomainMapTest {

    @Test
    fun `正常なJSONをパースできる`() {
        val text = """{"com.example.app": {"domains": ["example.com"]}}"""
        val result = PackageDomainMap.parse(text)
        assertEquals(listOf("example.com"), result["com.example.app"]?.domains)
    }

    @Test
    fun `1パッケージに複数ドメインを登録できる`() {
        val text = """{"com.example.app": {"domains": ["a.example.com", "b.example.com"]}}"""
        val result = PackageDomainMap.parse(text)
        assertEquals(listOf("a.example.com", "b.example.com"), result["com.example.app"]?.domains)
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
    fun `未登録パッケージのdomainsForは空リストを返す`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val domains = PackageDomainMap.domainsFor(context, "com.example.unregistered")
        assertTrue(domains.isEmpty())
    }
}
