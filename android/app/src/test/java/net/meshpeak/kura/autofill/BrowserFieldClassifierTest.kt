package net.meshpeak.kura.autofill

import net.meshpeak.kura.autofill.model.BrowserViewNodeSignals
import net.meshpeak.kura.autofill.model.DetectedFieldType
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class BrowserFieldClassifierTest {

    private fun signals(
        htmlAttributes: Map<String, String> = emptyMap(),
        autofillHints: List<String> = emptyList()
    ) = BrowserViewNodeSignals(htmlAttributes, autofillHints)

    @Test
    fun `ua-autofill-hints PASSWORD が最優先で採用される`() {
        // Chromeのpasswordフィールドはautofillhintsが on としか返らないため
        // （docs 1-6-1(c)）、独自キーが最優先で参照される必要がある
        val result = BrowserFieldClassifier.classify(
            signals(
                htmlAttributes = mapOf("ua-autofill-hints" to "PASSWORD", "type" to "text"),
                autofillHints = listOf("on")
            ),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `computed-autofill-hints USERNAME が採用される`() {
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("computed-autofill-hints" to "USERNAME")),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.USERNAME, result)
    }

    @Test
    fun `Chromium独自キーが小文字値でも一致する`() {
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("ua-autofill-hints" to "password")),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `Chromium独自キーがない場合はautofillHintsにフォールバックする`() {
        // Firefox(Gecko)はautofillHintsに正しく username/password が入る（docs 1-6-1(c)）
        val result = BrowserFieldClassifier.classify(
            signals(autofillHints = listOf(android.view.View.AUTOFILL_HINT_PASSWORD)),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `独自キーもautofillHintsもない場合はtype属性にフォールバックする`() {
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("type" to "password")),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `type email はEMAILと判定される`() {
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("type" to "email")),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.EMAIL, result)
    }

    @Test
    fun `autocomplete one-time-code はTOTPと判定される`() {
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("autocomplete" to "one-time-code", "type" to "text")),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `name属性にotpを含むとTOTPと判定される`() {
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("name" to "otp_code")),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `id属性にverification_codeを含むとTOTPと判定される`() {
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("id" to "verification_code")),
            sitePattern = null
        )
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `どのシグナルもなければNONE`() {
        val result = BrowserFieldClassifier.classify(signals(), sitePattern = null)
        assertEquals(DetectedFieldType.NONE, result)
    }

    @Test
    fun `サイト別パターンでname一致すればusernameと判定される`() {
        val pattern = SitePatternEntry(username = listOf("login_id"))
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("name" to "login_id")),
            sitePattern = pattern
        )
        assertEquals(DetectedFieldType.USERNAME, result)
    }

    @Test
    fun `サイト別パターンでid一致すればpasswordと判定される`() {
        val pattern = SitePatternEntry(password = listOf("pw_field"))
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("id" to "pw_field")),
            sitePattern = pattern
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `サイト別パターンでtotp一致すればtotpと判定される`() {
        val pattern = SitePatternEntry(totp = listOf("code_field"))
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("name" to "code_field")),
            sitePattern = pattern
        )
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `独自キーがあればサイト別パターンより優先される`() {
        val pattern = SitePatternEntry(username = listOf("special_field"))
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("ua-autofill-hints" to "PASSWORD", "name" to "special_field")),
            sitePattern = pattern
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `サイト別パターンに一致しないフィールドはNONE`() {
        val pattern = SitePatternEntry(username = listOf("login_id"))
        val result = BrowserFieldClassifier.classify(
            signals(htmlAttributes = mapOf("name" to "unrelated_field")),
            sitePattern = pattern
        )
        assertEquals(DetectedFieldType.NONE, result)
    }
}
