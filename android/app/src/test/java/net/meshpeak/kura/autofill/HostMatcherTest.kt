package net.meshpeak.kura.autofill

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HostMatcherTest {

    @Test
    fun `完全一致でtrue`() {
        assertTrue(HostMatcher.matches("example.com", "example.com"))
    }

    @Test
    fun `www 有無を無視して一致する`() {
        assertTrue(HostMatcher.matches("www.example.com", "example.com"))
        assertTrue(HostMatcher.matches("example.com", "www.example.com"))
    }

    @Test
    fun `サブドメインは許容される`() {
        assertTrue(HostMatcher.matches("accounts.example.com", "example.com"))
    }

    @Test
    fun `異なるドメインはfalse`() {
        assertFalse(HostMatcher.matches("example.com", "other.com"))
    }

    @Test
    fun `ドメイン名を接尾辞に含むだけの別ドメインは誤マッチしない`() {
        assertFalse(HostMatcher.matches("notexample.com", "example.com"))
        assertFalse(HostMatcher.matches("myexample.com.evil.com", "example.com"))
    }

    @Test
    fun `大文字小文字を無視して一致する`() {
        assertTrue(HostMatcher.matches("EXAMPLE.com", "example.COM"))
    }

    @Test
    fun `ドメインが空文字ならfalse`() {
        assertFalse(HostMatcher.matches("example.com", ""))
    }
}
