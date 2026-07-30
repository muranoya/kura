package net.meshpeak.kura.credential

import android.app.Application
import androidx.credentials.provider.CallingAppInfo
import androidx.test.core.app.ApplicationProvider
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OriginResolverTest {

    private val context = ApplicationProvider.getApplicationContext<Application>()

    @Test
    fun `allowlist経由でoriginが取得できればBROWSERとして解決する`() {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns "https://Example.com"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertEquals(OriginResolver.Source.BROWSER, resolved?.source)
        assertEquals("example.com", resolved?.rpId)
        assertEquals("https://Example.com", resolved?.webOrigin)
    }

    @Test
    fun `originがnullでもPackageDomainMap登録済みパッケージならNATIVE_APPとして解決する`() {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.github.android"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertEquals(OriginResolver.Source.NATIVE_APP, resolved?.source)
        assertEquals("github.com", resolved?.rpId)
        assertNull(resolved?.webOrigin)
    }

    @Test
    fun `originがnullかつPackageDomainMap未登録パッケージならnullを返す`() {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.example.unregistered"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertNull(resolved)
    }

    @Test
    fun `getOriginが例外を投げてもクラッシュせずPackageDomainMapにフォールバックする`() {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } throws IllegalArgumentException("bad allowlist")
        every { callingAppInfo.packageName } returns "com.example.unregistered"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertNull(resolved)
    }
}
