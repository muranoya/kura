package net.meshpeak.kura.autofill

import android.text.InputType
import android.view.View
import net.meshpeak.kura.autofill.model.DetectedFieldType
import net.meshpeak.kura.autofill.model.ViewNodeSignals
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FieldClassifierTest {

    private fun signals(
        autofillHints: List<String> = emptyList(),
        hint: String? = null,
        idEntry: String? = null,
        inputType: Int = InputType.TYPE_CLASS_TEXT
    ) = ViewNodeSignals(autofillHints, hint, idEntry, inputType)

    @Test
    fun `autofillHint password が最優先で採用される`() {
        val result = FieldClassifier.classify(
            signals(autofillHints = listOf(View.AUTOFILL_HINT_PASSWORD), idEntry = "username_field")
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `autofillHint username が最優先で採用される`() {
        val result = FieldClassifier.classify(
            signals(autofillHints = listOf(View.AUTOFILL_HINT_USERNAME))
        )
        assertEquals(DetectedFieldType.USERNAME, result)
    }

    @Test
    fun `autofillHint email が採用される`() {
        val result = FieldClassifier.classify(
            signals(autofillHints = listOf(View.AUTOFILL_HINT_EMAIL_ADDRESS))
        )
        assertEquals(DetectedFieldType.EMAIL, result)
    }

    @Test
    fun `inputType password variation でpasswordと判定される`() {
        val result = FieldClassifier.classify(
            signals(inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD)
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `idEntry に password を含むとpasswordと判定される`() {
        val result = FieldClassifier.classify(signals(idEntry = "login_password_input"))
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `idEntry に username を含むとusernameと判定される`() {
        val result = FieldClassifier.classify(signals(idEntry = "username_field"))
        assertEquals(DetectedFieldType.USERNAME, result)
    }

    @Test
    fun `hint のみでもpasswordと判定される`() {
        // idEntryがフレームワーク由来の汎用IDになっているアプリではhintのみが頼りになる
        // ケースがあるため、hint単独一致でも閾値を超える（実機のSBI証券アプリで確認）
        val result = FieldClassifier.classify(signals(hint = "パスワード"))
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `hint のみでもusernameと判定される`() {
        val result = FieldClassifier.classify(signals(hint = "ユーザーネーム"))
        assertEquals(DetectedFieldType.USERNAME, result)
    }

    @Test
    fun `関連のない短いhintはNONEのまま`() {
        val result = FieldClassifier.classify(signals(hint = "検索"))
        assertEquals(DetectedFieldType.NONE, result)
    }

    @Test
    fun `シグナルが一切ない場合はNONE`() {
        val result = FieldClassifier.classify(signals())
        assertEquals(DetectedFieldType.NONE, result)
    }

    @Test
    fun `idEntryとhint両方のシグナルが揃うとpasswordと判定される`() {
        val result = FieldClassifier.classify(
            signals(idEntry = "pwd", hint = "パスワードを入力")
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `inputType password と idEntry usernameが両方あればスコアの高いpasswordが優先される`() {
        val result = FieldClassifier.classify(
            signals(
                inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,
                idEntry = "username_field"
            )
        )
        assertEquals(DetectedFieldType.PASSWORD, result)
    }

    @Test
    fun `idEntry に otp を含むとtotpと判定される`() {
        val result = FieldClassifier.classify(signals(idEntry = "otp_input"))
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `idEntry に verification_code を含むとtotpと判定される`() {
        val result = FieldClassifier.classify(signals(idEntry = "verification_code_input"))
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `hint のみでも認証コードでtotpと判定される`() {
        val result = FieldClassifier.classify(signals(hint = "認証コード"))
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `hint のみでも確認コードでtotpと判定される`() {
        val result = FieldClassifier.classify(signals(hint = "確認コードを入力してください"))
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `inputType numberのみでは単独でtotp閾値に届かずNONE`() {
        // 電話番号・郵便番号等の一般的な数値入力欄と区別がつかないため、
        // idEntry/hintの裏付けなしにTOTPと判定してはならない
        val result = FieldClassifier.classify(
            signals(inputType = InputType.TYPE_CLASS_NUMBER)
        )
        assertEquals(DetectedFieldType.NONE, result)
    }

    @Test
    fun `inputType numberとidEntryのotpが組み合わさるとtotpと判定される`() {
        val result = FieldClassifier.classify(
            signals(inputType = InputType.TYPE_CLASS_NUMBER, idEntry = "otp_code")
        )
        assertEquals(DetectedFieldType.TOTP, result)
    }

    @Test
    fun `idEntry password と idEntry otp相当の語が競合しないことを確認する`() {
        // "code"のような汎用的すぎる語をTOTP正規表現に含めていないため、
        // password関連のidEntryがTOTPと誤検出されない
        val result = FieldClassifier.classify(signals(idEntry = "password_input"))
        assertEquals(DetectedFieldType.PASSWORD, result)
    }
}
