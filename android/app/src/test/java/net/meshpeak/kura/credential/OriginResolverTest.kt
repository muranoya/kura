package net.meshpeak.kura.credential

import android.app.Application
import androidx.credentials.provider.CallingAppInfo
import androidx.test.core.app.ApplicationProvider
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
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
    fun `allowlist経由でoriginが取得できればBROWSERとして解決する`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns "https://Example.com"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertEquals(OriginResolver.Source.BROWSER, resolved?.source)
        assertEquals("example.com", resolved?.rpId)
        assertEquals("https://Example.com", resolved?.webOrigin)
        assertEquals(listOf("example.com"), resolved?.allRpIds)
    }

    @Test
    fun `originがnullでもPackageDomainMap登録済みパッケージならNATIVE_APPとして解決する`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.github.android"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertEquals(OriginResolver.Source.NATIVE_APP, resolved?.source)
        assertEquals("github.com", resolved?.rpId)
        assertNull(resolved?.webOrigin)
        assertEquals(listOf("github.com"), resolved?.allRpIds)
    }

    @Test
    fun `複数ドメインが登録されたパッケージは全ドメインをallRpIdsに含める`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.instagram.android"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertEquals(OriginResolver.Source.NATIVE_APP, resolved?.source)
        assertEquals("instagram.com", resolved?.rpId)
        assertEquals(listOf("instagram.com", "facebook.com"), resolved?.allRpIds)
    }

    @Test
    fun `originがnullかつPackageDomainMap未登録パッケージならnullを返す`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.example.unregistered"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertNull(resolved)
    }

    @Test
    fun `getOriginが例外を投げてもクラッシュせずPackageDomainMapにフォールバックする`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } throws IllegalArgumentException("bad allowlist")
        every { callingAppInfo.packageName } returns "com.example.unregistered"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertNull(resolved)
    }
}
