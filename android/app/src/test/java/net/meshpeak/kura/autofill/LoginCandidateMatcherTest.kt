package net.meshpeak.kura.autofill

import net.meshpeak.kura.data.model.AutofillCandidate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LoginCandidateMatcherTest {

    @Test
    fun `完全一致でtrue`() {
        assertTrue(LoginCandidateMatcher.matches("https://example.com/login", "example.com"))
    }

    @Test
    fun `www 有無を無視して一致する`() {
        assertTrue(LoginCandidateMatcher.matches("https://www.example.com", "example.com"))
        assertTrue(LoginCandidateMatcher.matches("https://example.com", "www.example.com"))
    }

    @Test
    fun `サブドメインは許容される`() {
        assertTrue(LoginCandidateMatcher.matches("https://accounts.example.com/login", "example.com"))
    }

    @Test
    fun `異なるドメインはfalse`() {
        assertFalse(LoginCandidateMatcher.matches("https://example.com", "other.com"))
    }

    @Test
    fun `ドメイン名を接尾辞に含むだけの別ドメインは誤マッチしない`() {
        assertFalse(LoginCandidateMatcher.matches("https://notexample.com", "example.com"))
        assertFalse(LoginCandidateMatcher.matches("https://myexample.com.evil.com", "example.com"))
    }

    @Test
    fun `スキームなしURLでも解決できる`() {
        assertTrue(LoginCandidateMatcher.matches("example.com/login", "example.com"))
    }

    @Test
    fun `ポート番号があってもホスト部分だけで比較する`() {
        assertTrue(LoginCandidateMatcher.matches("https://example.com:8443/login", "example.com"))
    }

    @Test
    fun `不正なURLはfalseを返し例外を投げない`() {
        assertFalse(LoginCandidateMatcher.matches("not a url \n", "example.com"))
    }

    @Test
    fun `大文字小文字を無視して一致する`() {
        assertTrue(LoginCandidateMatcher.matches("https://EXAMPLE.com", "example.COM"))
    }

    @Test
    fun `filterはマッチする候補のみ返す`() {
        val candidates = listOf(
            AutofillCandidate(id = "1", name = "A", url = "https://example.com", username = "a"),
            AutofillCandidate(id = "2", name = "B", url = "https://other.com", username = "b"),
            AutofillCandidate(id = "3", name = "C", url = "https://sub.example.com", username = "c")
        )
        val result = LoginCandidateMatcher.filter(candidates, "example.com")
        assertEquals(listOf("1", "3"), result.map { it.id })
    }
}
