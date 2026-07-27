package net.meshpeak.kura.autofill

import net.meshpeak.kura.autofill.model.BrowserViewNodeSignals
import net.meshpeak.kura.autofill.model.DetectedFieldType

/**
 * ブラウザ由来リクエスト（`structure.getWebDomain()`が非null）のフィールド判定。
 * ネイティブアプリ向け[FieldClassifier]とはデータ源（ViewNodeネイティブ属性 vs
 * htmlTag/htmlAttributes）が異なるため独立したロジックとする（docs/android-autofillservice.md 3-1）。
 *
 * 優先順位（docs 1-6-2, 1-5）:
 * 1. Chromium系ブラウザ独自キー（ua-autofill-hints/computed-autofill-hints）
 * 2. ViewNode.getAutofillHints()（Firefoxで正確）
 * 3. htmlAttributes.type（password/emailのみ、両エンジン共通で正確）
 * 4. TOTP: autocomplete="one-time-code" / name・idの正規表現
 * 5. サイト別パターンファイル（name/id完全一致）
 */
object BrowserFieldClassifier {

    // ネイティブ側FieldClassifierのTOTP正規表現と同じ語彙を採用するが、シグナル源
    // （htmlAttributesのname/id）が異なるため独立して定義する（docs 1-5）。
    private val TOTP_NAME_ID_REGEX =
        Regex("otp|totp|verification.?code|verify.?code|auth.?code|mfa|2fa|security.?code", RegexOption.IGNORE_CASE)

    fun classify(signals: BrowserViewNodeSignals, sitePattern: SitePatternEntry?): DetectedFieldType {
        classifyByChromiumHints(signals.htmlAttributes)?.let { return it }
        FieldClassifier.classifyByAutofillHints(signals.autofillHints)?.let { return it }
        classifyByType(signals.htmlAttributes)?.let { return it }
        classifyTotp(signals.htmlAttributes)?.let { return it }
        sitePattern?.let { pattern -> classifyBySitePattern(signals.htmlAttributes, pattern)?.let { return it } }
        return DetectedFieldType.NONE
    }

    private fun classifyByChromiumHints(attrs: Map<String, String>): DetectedFieldType? {
        val hint = (attrs["ua-autofill-hints"] ?: attrs["computed-autofill-hints"])?.uppercase()
        return when (hint) {
            "PASSWORD" -> DetectedFieldType.PASSWORD
            "USERNAME" -> DetectedFieldType.USERNAME
            else -> null
        }
    }

    private fun classifyByType(attrs: Map<String, String>): DetectedFieldType? =
        when (attrs["type"]?.lowercase()) {
            "password" -> DetectedFieldType.PASSWORD
            "email" -> DetectedFieldType.EMAIL
            else -> null
        }

    private fun classifyTotp(attrs: Map<String, String>): DetectedFieldType? {
        if (attrs["autocomplete"]?.lowercase() == "one-time-code") return DetectedFieldType.TOTP
        val nameOrId = listOfNotNull(attrs["name"], attrs["id"])
        if (nameOrId.any { TOTP_NAME_ID_REGEX.containsMatchIn(it) }) return DetectedFieldType.TOTP
        return null
    }

    private fun classifyBySitePattern(attrs: Map<String, String>, pattern: SitePatternEntry): DetectedFieldType? {
        val name = attrs["name"]
        val id = attrs["id"]
        fun anyMatches(values: List<String>) = values.any { it == name || it == id }
        return when {
            anyMatches(pattern.password) -> DetectedFieldType.PASSWORD
            anyMatches(pattern.username) -> DetectedFieldType.USERNAME
            anyMatches(pattern.totp) -> DetectedFieldType.TOTP
            else -> null
        }
    }
}
