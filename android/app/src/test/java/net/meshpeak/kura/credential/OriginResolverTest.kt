package net.meshpeak.kura.credential

import android.app.Application
import android.content.pm.Signature
import android.content.pm.SigningInfo
import androidx.credentials.provider.CallingAppInfo
import androidx.test.core.app.ApplicationProvider
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OriginResolverTest {

    private val context = ApplicationProvider.getApplicationContext<Application>()

    private val signingCert = byteArrayOf(0x30, 0x01, 0x02)

    private fun signingInfoOf(vararg certs: ByteArray): SigningInfo = mockk {
        every { apkContentsSigners } returns certs.map { Signature(it) }.toTypedArray()
    }

    @Test
    fun `allowlist経由でoriginが取得できればBROWSERとして解決する`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns "https://Example.com"

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertEquals(OriginResolver.Source.BROWSER, resolved?.source)
        assertEquals("example.com", resolved?.rpId)
        assertEquals("https://Example.com", resolved?.clientDataOrigin)
        assertEquals(listOf("example.com"), resolved?.allRpIds)
    }

    @Test
    fun `originがnullでもPackageDomainMap登録済みパッケージならNATIVE_APPとして解決する`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.github.android"
        every { callingAppInfo.signingInfo } returns signingInfoOf(signingCert)

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertEquals(OriginResolver.Source.NATIVE_APP, resolved?.source)
        assertEquals("github.com", resolved?.rpId)
        assertEquals(listOf("github.com"), resolved?.allRpIds)
    }

    @Test
    fun `NATIVE_APPのclientDataOriginは署名証明書由来のapk-key-hashでありhttpsを名乗らない`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.github.android"
        every { callingAppInfo.signingInfo } returns signingInfoOf(signingCert)

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertEquals(ClientDataJsonBuilder.apkKeyHashOrigin(signingCert), resolved?.clientDataOrigin)
        assertTrue(resolved!!.clientDataOrigin.startsWith("android:apk-key-hash:"))
    }

    @Test
    fun `NATIVE_APPで署名証明書が取得できなければnullを返す`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.github.android"
        every { callingAppInfo.signingInfo } returns signingInfoOf()

        val resolved = OriginResolver.resolve(context, callingAppInfo)

        assertNull(resolved)
    }

    @Test
    fun `複数ドメインが登録されたパッケージは全ドメインをallRpIdsに含める`() = runTest {
        val callingAppInfo = mockk<CallingAppInfo>()
        every { callingAppInfo.getOrigin(any()) } returns null
        every { callingAppInfo.packageName } returns "com.instagram.android"
        every { callingAppInfo.signingInfo } returns signingInfoOf(signingCert)

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
