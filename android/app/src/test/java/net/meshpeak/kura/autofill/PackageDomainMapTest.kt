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
class PackageDomainMapTest {

    @Test
    fun `正常なJSONをパースできる`() {
        val text = """{"com.example.app": {"domain": "example.com"}}"""
        val result = PackageDomainMap.parse(text)
        assertEquals("example.com", result["com.example.app"]?.domain)
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
}
