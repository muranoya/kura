package net.meshpeak.kura.autofill

import android.app.assist.AssistStructure
import android.content.Context
import android.util.Log
import android.view.View
import android.view.autofill.AutofillId
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.autofill.model.BrowserViewNodeSignals
import net.meshpeak.kura.autofill.model.DetectedFieldType
import net.meshpeak.kura.autofill.model.ParsedLoginForm
import net.meshpeak.kura.autofill.model.ViewNodeSignals

private const val TAG = "KuraAutofill"

/** 走査中に集めた、テキストフィールド候補ノードのシグナル（ネイティブ/ブラウザ両対応分をまとめて保持） */
private data class CandidateNode(
    val autofillId: AutofillId,
    val autofillHints: List<String>,
    val hint: String?,
    val idEntry: String?,
    val inputType: Int,
    val htmlTag: String?,
    val htmlAttributes: Map<String, String>
)

private data class ClassifiedFields(
    val usernameFieldId: AutofillId?,
    val passwordFieldId: AutofillId?,
    val totpFieldId: AutofillId?
)

/**
 * AssistStructureを再帰的に走査し、ログインフォームのusername/password/totpフィールドを検出する。
 * リクエスト元（ネイティブアプリ/ブラウザ）はいずれかのノードのgetWebDomain()の有無で判定する
 * （docs/android-autofillservice.md 3-1-2）。祖先ノードではwebDomainが空/nullになるケースがある
 * （1-6-1(d)）ため、走査は打ち切らずに全ノードを収集してから判定する。判定結果に応じて
 * ネイティブ向け（[FieldClassifier], Section 3-1-1）とブラウザ向け（[BrowserFieldClassifier],
 * Section 1-6-2, 1-5）の別ロジックに振り分ける。
 */
object AssistStructureParser {

    fun parse(structure: AssistStructure, context: Context): ParsedLoginForm {
        var webDomain: String? = null
        val candidates = mutableListOf<CandidateNode>()

        fun walk(node: AssistStructure.ViewNode) {
            if (webDomain == null && !node.webDomain.isNullOrEmpty()) {
                webDomain = node.webDomain
            }

            val autofillId = node.autofillId
            if (autofillId != null && node.autofillType == View.AUTOFILL_TYPE_TEXT) {
                val htmlInfo = node.htmlInfo
                candidates += CandidateNode(
                    autofillId = autofillId,
                    autofillHints = node.autofillHints?.toList() ?: emptyList(),
                    hint = node.hint,
                    idEntry = node.idEntry,
                    inputType = node.inputType,
                    htmlTag = htmlInfo?.tag,
                    htmlAttributes = htmlInfo?.attributes?.associate { it.first to it.second } ?: emptyMap()
                )
            }

            for (i in 0 until node.childCount) {
                walk(node.getChildAt(i))
            }
        }

        for (i in 0 until structure.windowNodeCount) {
            walk(structure.getWindowNodeAt(i).rootViewNode)
        }

        val resolvedWebDomain = webDomain
        val isBrowserRequest = resolvedWebDomain != null
        val classified = if (resolvedWebDomain != null) {
            classifyBrowserCandidates(context, resolvedWebDomain, candidates)
        } else {
            classifyNativeCandidates(candidates)
        }

        val result = ParsedLoginForm(
            packageName = structure.activityComponent?.packageName,
            isBrowserRequest = isBrowserRequest,
            webDomain = webDomain,
            usernameFieldId = classified.usernameFieldId,
            passwordFieldId = classified.passwordFieldId,
            totpFieldId = classified.totpFieldId
        )

        if (BuildConfig.DEBUG) {
            Log.d(
                TAG,
                "parse result: packageName=${result.packageName} isBrowserRequest=${result.isBrowserRequest} " +
                    "webDomain=${result.webDomain} usernameFieldFound=${result.usernameFieldId != null} " +
                    "passwordFieldFound=${result.passwordFieldId != null} totpFieldFound=${result.totpFieldId != null}"
            )
        }

        return result
    }

    private fun classifyNativeCandidates(candidates: List<CandidateNode>): ClassifiedFields {
        var usernameFieldId: AutofillId? = null
        var passwordFieldId: AutofillId? = null
        var totpFieldId: AutofillId? = null

        for (candidate in candidates) {
            val signals = ViewNodeSignals(
                autofillHints = candidate.autofillHints,
                hint = candidate.hint,
                idEntry = candidate.idEntry,
                inputType = candidate.inputType
            )
            when (FieldClassifier.classify(signals)) {
                DetectedFieldType.PASSWORD -> if (passwordFieldId == null) passwordFieldId = candidate.autofillId
                DetectedFieldType.USERNAME, DetectedFieldType.EMAIL ->
                    if (usernameFieldId == null) usernameFieldId = candidate.autofillId
                DetectedFieldType.TOTP -> if (totpFieldId == null) totpFieldId = candidate.autofillId
                DetectedFieldType.NONE -> {}
            }
            if (BuildConfig.DEBUG) {
                Log.d(
                    TAG,
                    "node: idEntry=${candidate.idEntry} hint=${candidate.hint} " +
                        "autofillHints=${candidate.autofillHints.joinToString()} " +
                        "inputType=${candidate.inputType}"
                )
            }
        }

        return ClassifiedFields(usernameFieldId, passwordFieldId, totpFieldId)
    }

    private fun classifyBrowserCandidates(
        context: Context,
        webDomain: String,
        candidates: List<CandidateNode>
    ): ClassifiedFields {
        val sitePattern = SiteFieldPatternMap.patternFor(context, webDomain)
        var usernameFieldId: AutofillId? = null
        var passwordFieldId: AutofillId? = null
        var totpFieldId: AutofillId? = null

        for (candidate in candidates) {
            // Chrome/WebViewはhtmlTag="input"、Firefoxもinput自体はhtmlTag="input"を持つ（1-6-1(a)）。
            // htmlInfoが取得できないノードは安全側でスキップせず、autofillHints等の他シグナルに委ねる。
            if (candidate.htmlTag != null && candidate.htmlTag != "input") continue

            val signals = BrowserViewNodeSignals(
                htmlAttributes = candidate.htmlAttributes,
                autofillHints = candidate.autofillHints
            )
            when (BrowserFieldClassifier.classify(signals, sitePattern)) {
                DetectedFieldType.PASSWORD -> if (passwordFieldId == null) passwordFieldId = candidate.autofillId
                DetectedFieldType.USERNAME, DetectedFieldType.EMAIL ->
                    if (usernameFieldId == null) usernameFieldId = candidate.autofillId
                DetectedFieldType.TOTP -> if (totpFieldId == null) totpFieldId = candidate.autofillId
                DetectedFieldType.NONE -> {}
            }
            if (BuildConfig.DEBUG) {
                Log.d(
                    TAG,
                    "browser node: htmlTag=${candidate.htmlTag} htmlAttributes=${candidate.htmlAttributes} " +
                        "autofillHints=${candidate.autofillHints.joinToString()}"
                )
            }
        }

        return ClassifiedFields(usernameFieldId, passwordFieldId, totpFieldId)
    }
}
