package net.meshpeak.kura.autofill

import android.app.assist.AssistStructure
import android.util.Log
import android.view.View
import android.view.autofill.AutofillId
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.autofill.model.DetectedFieldType
import net.meshpeak.kura.autofill.model.ParsedLoginForm
import net.meshpeak.kura.autofill.model.ViewNodeSignals

private const val TAG = "KuraAutofill"

/**
 * AssistStructureを再帰的に走査し、ログインフォームのusername/passwordフィールドを検出する。
 * ブラウザ由来リクエスト（いずれかのノードでgetWebDomain()が非null）を検出した時点で
 * 走査を打ち切る（docs/android-autofillservice.md 3-1-2、ブラウザ経由のオートフィルは対象外）。
 */
object AssistStructureParser {

    fun parse(structure: AssistStructure): ParsedLoginForm {
        var isBrowserRequest = false
        var usernameFieldId: AutofillId? = null
        var passwordFieldId: AutofillId? = null

        fun walk(node: AssistStructure.ViewNode) {
            if (isBrowserRequest) return

            if (node.webDomain != null) {
                isBrowserRequest = true
                if (BuildConfig.DEBUG) {
                    Log.d(TAG, "browser-origin node detected: webDomain=${node.webDomain} className=${node.className} -> aborting parse")
                }
                return
            }

            val autofillId = node.autofillId
            val isTextField = autofillId != null && node.autofillType == View.AUTOFILL_TYPE_TEXT
            var classified: DetectedFieldType? = null

            if (isTextField) {
                val signals = ViewNodeSignals(
                    autofillHints = node.autofillHints?.toList() ?: emptyList(),
                    hint = node.hint,
                    idEntry = node.idEntry,
                    inputType = node.inputType
                )
                classified = FieldClassifier.classify(signals)
                when (classified) {
                    DetectedFieldType.PASSWORD -> if (passwordFieldId == null) passwordFieldId = autofillId
                    DetectedFieldType.USERNAME, DetectedFieldType.EMAIL ->
                        if (usernameFieldId == null) usernameFieldId = autofillId
                    DetectedFieldType.NONE -> {}
                }
            }

            if (BuildConfig.DEBUG && isTextField) {
                Log.d(
                    TAG,
                    "node: idEntry=${node.idEntry} hint=${node.hint} " +
                        "autofillHints=${node.autofillHints?.joinToString()} " +
                        "inputType=${node.inputType} className=${node.className} " +
                        "-> classifiedAs=$classified"
                )
            }

            for (i in 0 until node.childCount) {
                walk(node.getChildAt(i))
                if (isBrowserRequest) return
            }
        }

        for (i in 0 until structure.windowNodeCount) {
            walk(structure.getWindowNodeAt(i).rootViewNode)
            if (isBrowserRequest) break
        }

        val result = ParsedLoginForm(
            packageName = structure.activityComponent?.packageName,
            isBrowserRequest = isBrowserRequest,
            usernameFieldId = usernameFieldId,
            passwordFieldId = passwordFieldId
        )

        if (BuildConfig.DEBUG) {
            Log.d(
                TAG,
                "parse result: packageName=${result.packageName} isBrowserRequest=${result.isBrowserRequest} " +
                    "usernameFieldFound=${result.usernameFieldId != null} passwordFieldFound=${result.passwordFieldId != null}"
            )
        }

        return result
    }
}
