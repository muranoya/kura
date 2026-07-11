package net.meshpeak.kura.autofill.model

import android.content.Intent
import android.view.autofill.AutofillId
import androidx.core.content.IntentCompat

/** ViewNodeから抽出した、フィールド分類判定に必要なシグナルのみを保持する純粋データクラス */
data class ViewNodeSignals(
    val autofillHints: List<String>,
    val hint: String?,
    val idEntry: String?,
    val inputType: Int
)

enum class DetectedFieldType { USERNAME, PASSWORD, EMAIL, NONE }

/** AssistStructure解析結果。ブラウザ由来リクエストの場合はフィールドID系は空になる */
data class ParsedLoginForm(
    val packageName: String?,
    val isBrowserRequest: Boolean,
    val usernameFieldId: AutofillId?,
    val passwordFieldId: AutofillId?
)

private const val EXTRA_PACKAGE_NAME = "net.meshpeak.kura.autofill.EXTRA_PACKAGE_NAME"
private const val EXTRA_USERNAME_FIELD_ID = "net.meshpeak.kura.autofill.EXTRA_USERNAME_FIELD_ID"
private const val EXTRA_PASSWORD_FIELD_ID = "net.meshpeak.kura.autofill.EXTRA_PASSWORD_FIELD_ID"

/**
 * AutofillId は Parcelable のため、専用ラッパーを介さず Intent extra として直接受け渡す
 * （kotlin-parcelize プラグイン未導入のプロジェクトに新規依存を増やさないため）。
 */
fun Intent.putParsedLoginForm(parsed: ParsedLoginForm) {
    putExtra(EXTRA_PACKAGE_NAME, parsed.packageName)
    parsed.usernameFieldId?.let { putExtra(EXTRA_USERNAME_FIELD_ID, it) }
    parsed.passwordFieldId?.let { putExtra(EXTRA_PASSWORD_FIELD_ID, it) }
}

fun Intent.getParsedLoginForm(): ParsedLoginForm = ParsedLoginForm(
    packageName = getStringExtra(EXTRA_PACKAGE_NAME),
    isBrowserRequest = false,
    usernameFieldId = IntentCompat.getParcelableExtra(this, EXTRA_USERNAME_FIELD_ID, AutofillId::class.java),
    passwordFieldId = IntentCompat.getParcelableExtra(this, EXTRA_PASSWORD_FIELD_ID, AutofillId::class.java)
)
