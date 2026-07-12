package net.meshpeak.kura.autofill

import android.text.InputType
import android.view.View
import net.meshpeak.kura.autofill.model.DetectedFieldType
import net.meshpeak.kura.autofill.model.ViewNodeSignals

/**
 * ViewNodeのシグナルからフィールド種別を判定する純粋ロジック。
 *
 * 優先順位: autofillHints（開発者による明示的なヒント）を最優先で採用し、
 * 未設定の場合のみヒューリスティックなスコアリングにフォールバックする。
 * 誤検出（false positive）を避けるため、閾値未満は分類不能として無視する
 * （検出漏れは許容し、field-classifierと同様に保守的に保つ方針。docs/android-autofillservice.md 3-1-1参照）。
 */
object FieldClassifier {

    private const val SCORE_THRESHOLD = 6

    private val PASSWORD_ID_REGEX = Regex("password|pwd|passwd", RegexOption.IGNORE_CASE)
    private val USERNAME_ID_REGEX = Regex("username|user_id|userid|login|email|mail", RegexOption.IGNORE_CASE)
    private val PASSWORD_HINT_REGEX = Regex("password|パスワード", RegexOption.IGNORE_CASE)
    private val USERNAME_HINT_REGEX = Regex("username|email|user id|ユーザー|メール|アカウント", RegexOption.IGNORE_CASE)

    // TOTP（2段階認証コード）用の識別子・プレースホルダー文字列。password/username用の正規表現とは
    // 語彙が重ならないよう独立させる（例: "token"はAPIキー等の別カスタムフィールドと将来衝突しうるため
    // TOTP文脈限定で扱う）。
    private val TOTP_ID_REGEX = Regex("otp|totp|verification.?code|verify.?code|auth.?code|mfa|2fa|security.?code", RegexOption.IGNORE_CASE)
    private val TOTP_HINT_REGEX = Regex("otp|verification code|認証コード|確認コード|確認番号|ワンタイム", RegexOption.IGNORE_CASE)

    fun classify(signals: ViewNodeSignals): DetectedFieldType {
        classifyByAutofillHints(signals.autofillHints)?.let { return it }

        var passwordScore = 0
        var usernameScore = 0
        var totpScore = 0

        // variationの値域はクラス（TYPE_CLASS_TEXT/TYPE_CLASS_NUMBER等）を跨いで共有されており、
        // 例えばTYPE_NUMBER_VARIATION_PASSWORDとTYPE_TEXT_VARIATION_URIはビット値が衝突する。
        // クラスを併せて判定しないと、TEXTクラスのURLフィールド等をpasswordと誤検出してしまう。
        val fieldClass = signals.inputType and InputType.TYPE_MASK_CLASS
        val variation = signals.inputType and InputType.TYPE_MASK_VARIATION
        if ((fieldClass == InputType.TYPE_CLASS_TEXT &&
                (variation == InputType.TYPE_TEXT_VARIATION_PASSWORD ||
                    variation == InputType.TYPE_TEXT_VARIATION_WEB_PASSWORD ||
                    variation == InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD)) ||
            (fieldClass == InputType.TYPE_CLASS_NUMBER && variation == InputType.TYPE_NUMBER_VARIATION_PASSWORD)
        ) {
            passwordScore += 10
        }
        if (fieldClass == InputType.TYPE_CLASS_TEXT &&
            (variation == InputType.TYPE_TEXT_VARIATION_WEB_EMAIL_ADDRESS ||
                variation == InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        ) {
            usernameScore += 8
        }
        // TOTPフィールドはTYPE_CLASS_NUMBER（またはvariationなしのTEXT）であることが多いが、
        // これは電話番号・郵便番号等の一般的な数値入力欄と区別がつかない極めて弱いシグナル。
        // 単独では閾値に届かせず、idEntry/hintのいずれかと組み合わさった場合のみ後押しする程度に留める。
        if ((fieldClass == InputType.TYPE_CLASS_NUMBER && variation == 0) ||
            (fieldClass == InputType.TYPE_CLASS_TEXT && variation == InputType.TYPE_TEXT_VARIATION_NORMAL)
        ) {
            totpScore += 2
        }

        signals.idEntry?.let { id ->
            if (PASSWORD_ID_REGEX.containsMatchIn(id)) passwordScore += 6
            if (USERNAME_ID_REGEX.containsMatchIn(id)) usernameScore += 6
            if (TOTP_ID_REGEX.containsMatchIn(id)) totpScore += 8
        }

        signals.hint?.let { hint ->
            // idEntryはフレームワーク由来の汎用コンポーネントID（例: smart_text_field_edit_text）
            // になっているアプリが多く、その場合hintだけが唯一の意味あるシグナルになる。
            // idEntry一致と同格の重みとし、hint単独でも閾値を超えられるようにする。
            if (PASSWORD_HINT_REGEX.containsMatchIn(hint)) passwordScore += 6
            if (USERNAME_HINT_REGEX.containsMatchIn(hint)) usernameScore += 6
            if (TOTP_HINT_REGEX.containsMatchIn(hint)) totpScore += 8
        }

        return when {
            passwordScore >= SCORE_THRESHOLD && passwordScore >= usernameScore && passwordScore >= totpScore ->
                DetectedFieldType.PASSWORD
            usernameScore >= SCORE_THRESHOLD && usernameScore >= totpScore -> DetectedFieldType.USERNAME
            totpScore >= SCORE_THRESHOLD -> DetectedFieldType.TOTP
            else -> DetectedFieldType.NONE
        }
    }

    private fun classifyByAutofillHints(hints: List<String>): DetectedFieldType? {
        if (hints.any { it == View.AUTOFILL_HINT_PASSWORD }) return DetectedFieldType.PASSWORD
        if (hints.any { it == View.AUTOFILL_HINT_USERNAME }) return DetectedFieldType.USERNAME
        if (hints.any { it == View.AUTOFILL_HINT_EMAIL_ADDRESS }) return DetectedFieldType.EMAIL
        // TOTP用の標準autofillHint（Android FrameworkにはUSERNAME/PASSWORD/EMAIL等はあるが
        // ワンタイムコード用のヒント定数は存在しない）はないため、TOTPはヒューリスティック
        // スコアリングのみで判定する。
        return null
    }
}
