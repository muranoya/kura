package net.meshpeak.kura.autofill

import android.app.Application
import android.content.Context
import android.content.pm.verify.domain.DomainVerificationManager
import android.content.pm.verify.domain.DomainVerificationUserState
import androidx.test.core.app.ApplicationProvider
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PackageDomainResolverTest {

    @Before
    fun setUp() {
        // キャッシュをリセットしてテスト間の独立性を確保
        PackageDomainResolver.resetCacheForTesting()
    }

    @Test
    fun `未登録パッケージは空リストを返す`() {
        val context = ApplicationProvider.getApplicationContext<Application>()
        val result = PackageDomainResolver.resolveDomains(context, "com.example.unregistered")
        assertTrue(result.isEmpty())
    }

    @Test
    fun `フォールバックで登録済みドメインが解決される`() {
        // Robolectric環境ではDomainVerificationManagerがnullを返すため
        // フォールバック経路がexercisedされる
        val context = ApplicationProvider.getApplicationContext<Application>()
        val result = PackageDomainResolver.resolveDomains(context, "com.github.android")
        assertEquals(listOf("github.com"), result)
    }

    @Test
    fun `2回目の呼び出しではキャッシュから結果が返される`() {
        val realContext = ApplicationProvider.getApplicationContext<Application>()
        val mockContext = mockk<Context>(relaxed = true)
        val mockManager = mockk<DomainVerificationManager>()
        val mockUserState = mockk<DomainVerificationUserState>()

        every { mockContext.assets } returns realContext.assets
        every { mockContext.getSystemService(Context.DOMAIN_VERIFICATION_SERVICE) } returns mockManager
        every { mockManager.getDomainVerificationUserState("com.test.cached") } returns mockUserState
        every { mockUserState.hostToStateMap } returns mapOf(
            "verified.example.com" to DomainVerificationUserState.DOMAIN_STATE_VERIFIED
        )

        val result1 = PackageDomainResolver.resolveDomains(mockContext, "com.test.cached")
        val result2 = PackageDomainResolver.resolveDomains(mockContext, "com.test.cached")

        assertEquals(listOf("verified.example.com"), result1)
        assertEquals(result1, result2)
        // キャッシュヒットにより、getDomainVerificationUserStateは1回のみ呼ばれる
        verify(exactly = 1) { mockManager.getDomainVerificationUserState("com.test.cached") }
    }
}
