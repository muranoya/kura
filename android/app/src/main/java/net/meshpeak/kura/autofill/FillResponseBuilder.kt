package net.meshpeak.kura.autofill

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.util.Log
import android.view.autofill.AutofillId
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.R
import net.meshpeak.kura.autofill.log.AutofillLogEvent
import net.meshpeak.kura.autofill.log.AutofillLogOutcome
import net.meshpeak.kura.autofill.log.AutofillLogStore
import net.meshpeak.kura.autofill.model.ParsedLoginForm
import net.meshpeak.kura.autofill.model.TotpResolveRequest
import net.meshpeak.kura.autofill.model.putParsedLoginForm
import net.meshpeak.kura.autofill.model.putTotpResolveRequest
import net.meshpeak.kura.data.model.AutofillCandidate
import net.meshpeak.kura.data.model.CustomField
import net.meshpeak.kura.data.model.CustomFieldType
import net.meshpeak.kura.data.model.Entry
import net.meshpeak.kura.data.repository.IVaultRepository
import java.util.concurrent.atomic.AtomicInteger

private const val TAG = "KuraAutofill"

/**
 * 認証プレースホルダー用PendingIntentのrequestCode採番。PendingIntentの同一性は
 * component/action/data/type/categories/flagsのみで決まりextraは無視されるため、
 * requestCode固定だと複数のonFillRequestが未解決のまま重なった際に古いリクエストの
 * フィールドID情報が新しいものに上書きされてしまう。リクエストごとに一意なrequestCode
 * を割り当てることでこれを防ぐ。
 */
private val authRequestCodeSeq = AtomicInteger()

/**
 * FillResponse/Dataset の構築。「クレデンシャルの最小露出」原則を維持するため、
 * パスワードはDataset構築の直前にのみ復号し、参照を長く保持しない
 * （docs/android-autofillservice.md 2-3）。
 */
object FillResponseBuilder {

    suspend fun buildUnlocked(
        context: Context,
        repository: IVaultRepository,
        parsed: ParsedLoginForm
    ): FillResponse? {
        val target = if (parsed.isBrowserRequest) parsed.webDomain else parsed.packageName

        val domain = if (parsed.isBrowserRequest) {
            parsed.webDomain
        } else {
            // 1パッケージに複数ドメインが登録されている場合（PackageDomainMap参照）も
            // オートフィルは先頭のドメインのみを候補解決に使う（Passkeyの検索と異なり
            // 全ドメイン横断はまだ行っていない）。
            parsed.packageName?.let { PackageDomainMap.domainsFor(context, it).firstOrNull() }
        }
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "buildUnlocked: packageName=${parsed.packageName} webDomain=${parsed.webDomain} -> domain=$domain")
        }
        if (domain == null) {
            if (BuildConfig.DEBUG) Log.d(TAG, "no domain resolved (packageName=${parsed.packageName}) -> manual search fallback")
            return manualSearchResponse(context, parsed, target, AutofillLogOutcome.NO_DOMAIN_RESOLVED)
        }

        val matched = try {
            repository.listLoginCandidates(domain)
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "listLoginCandidates failed", e)
            return manualSearchResponse(
                context, parsed, target, AutofillLogOutcome.ERROR,
                errorClass = e::class.simpleName
            )
        }
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "listLoginCandidates matched ${matched.size} entries for domain=$domain")
        }
        if (matched.isEmpty()) {
            return manualSearchResponse(context, parsed, target, AutofillLogOutcome.NO_MATCHING_ENTRY)
        }

        val responseBuilder = FillResponse.Builder()
        var added = false
        for (candidate in matched) {
            val entry = try {
                repository.getEntry(candidate.id)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) Log.d(TAG, "getEntry(${candidate.id}) failed", e)
                continue
            }

            buildDatasetForCandidate(context, candidate, entry, parsed)?.let {
                responseBuilder.addDataset(it)
                added = true
            }

            parsed.totpFieldId?.let { totpFieldId ->
                buildTotpDataset(context, candidate, entry, totpFieldId)?.let {
                    responseBuilder.addDataset(it)
                    added = true
                }
            }
        }
        if (BuildConfig.DEBUG) Log.d(TAG, "buildUnlocked: datasets added=$added")
        if (!added) {
            return manualSearchResponse(context, parsed, target, AutofillLogOutcome.DATASET_BUILD_FAILED)
        }
        AutofillLogStore.record(
            context,
            AutofillLogEvent(
                target = target,
                isBrowserRequest = parsed.isBrowserRequest,
                outcome = AutofillLogOutcome.SUCCESS,
                candidateCount = matched.size,
                detectedFields = detectedFieldsSummary(parsed)
            )
        )
        return responseBuilder.build()
    }

    /**
     * ログインフィールドは検出できたが埋める値が見つからなかった場合のフォールバック。
     * [buildManualSearchDataset] が非nullを返せる場合（＝usernameまたはpasswordの
     * AutofillIdが分かっている場合）のみ、その1件だけを持つ[FillResponse]を返す。
     * それ以外（フィールド自体が未検出）はnullのまま＝候補なしで終わる。
     */
    private fun manualSearchResponse(
        context: Context,
        parsed: ParsedLoginForm,
        target: String?,
        outcome: AutofillLogOutcome,
        errorClass: String? = null
    ): FillResponse? {
        val fallback = buildManualSearchDataset(context, parsed)
        AutofillLogStore.record(
            context,
            AutofillLogEvent(
                target = target,
                isBrowserRequest = parsed.isBrowserRequest,
                outcome = if (fallback != null) AutofillLogOutcome.MANUAL_SEARCH_OFFERED else outcome,
                detectedFields = detectedFieldsSummary(parsed),
                errorClass = errorClass
            )
        )
        return fallback?.let { FillResponse.Builder().addDataset(it).build() }
    }

    private fun detectedFieldsSummary(parsed: ParsedLoginForm): String =
        listOfNotNull(
            "username".takeIf { parsed.usernameFieldId != null },
            "password".takeIf { parsed.passwordFieldId != null },
            "totp".takeIf { parsed.totpFieldId != null }
        ).joinToString(",")

    /**
     * 「アイテムを探す」手動検索候補（Dataset単位認証、[buildTotpDataset]と同型）。
     * usernameFieldId/passwordFieldIdが両方nullの場合は埋める対象が分からないためnull
     * （フィールドが全く検出できていない場合にまでKura起動候補を出すことはしない、
     * field-classifierの保守的方針との整合、docs/android-autofillservice.md参照）。
     */
    private fun buildManualSearchDataset(context: Context, parsed: ParsedLoginForm): Dataset? {
        if (parsed.usernameFieldId == null && parsed.passwordFieldId == null) return null

        val intent = Intent(context, AutofillPickerActivity::class.java).apply {
            putParsedLoginForm(parsed)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            authRequestCodeSeq.incrementAndGet(),
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val presentation = simplePresentation(context, context.getString(R.string.autofill_manual_search_label))
        val datasetBuilder = Dataset.Builder(presentation)
        parsed.usernameFieldId?.let { datasetBuilder.setValue(it, null) }
        parsed.passwordFieldId?.let { datasetBuilder.setValue(it, null) }
        return datasetBuilder.setAuthentication(pendingIntent.intentSender).build()
    }

    fun buildLockedAuthPlaceholder(context: Context, parsed: ParsedLoginForm): FillResponse? {
        val autofillIds = listOfNotNull(parsed.usernameFieldId, parsed.passwordFieldId, parsed.totpFieldId)
        if (autofillIds.isEmpty()) return null
        if (BuildConfig.DEBUG) Log.d(TAG, "buildLockedAuthPlaceholder: presenting unlock placeholder")

        val intent = Intent(context, AutofillUnlockActivity::class.java).apply {
            putParsedLoginForm(parsed)
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            authRequestCodeSeq.incrementAndGet(),
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val presentation = simplePresentation(context, context.getString(R.string.autofill_unlock_prompt))

        return FillResponse.Builder()
            .setAuthentication(autofillIds.toTypedArray(), pendingIntent.intentSender, presentation)
            .build()
    }

    private fun buildDatasetForCandidate(
        context: Context,
        candidate: AutofillCandidate,
        entry: Entry,
        parsed: ParsedLoginForm
    ): Dataset? = buildLoginDataset(
        context, candidate.name, entry.typedValue, parsed.usernameFieldId, parsed.passwordFieldId
    )

    /**
     * エントリのtypedValueからusername/passwordを取り出し、指定されたAutofillIdへ値を
     * セットしたDatasetを構築する。通常の候補一覧（[buildDatasetForCandidate]）と、
     * 手動検索フォールバックで選択されたエントリ（[AutofillPickerActivity]）の両方から
     * 共通で使う。
     */
    internal fun buildLoginDataset(
        context: Context,
        label: String,
        typedValueJson: String,
        usernameFieldId: AutofillId?,
        passwordFieldId: AutofillId?
    ): Dataset? {
        val typedValue = try {
            Json.parseToJsonElement(typedValueJson).jsonObject
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "failed to parse typedValue", e)
            return null
        }

        val username = (typedValue["username"] as? JsonPrimitive)?.contentOrNull
        val password = (typedValue["password"] as? JsonPrimitive)?.contentOrNull

        val presentation = simplePresentation(context, label)
        val datasetBuilder = Dataset.Builder(presentation)
        var hasValue = false

        usernameFieldId?.let { id ->
            username?.let {
                datasetBuilder.setValue(id, AutofillValue.forText(it))
                hasValue = true
            }
        }
        passwordFieldId?.let { id ->
            password?.let {
                datasetBuilder.setValue(id, AutofillValue.forText(it))
                hasValue = true
            }
        }
        if (!hasValue) return null
        return datasetBuilder.build()
    }

    /**
     * TOTP専用Dataset（Dataset単位認証）を構築する。コード自体はここでは生成せず、
     * エントリがTOTPカスタムフィールドを持つかどうかのみを確認する（クレデンシャルの
     * 最小露出原則、docs/android-autofillservice.md 2-3）。実際のコード生成は選択時に
     * [AutofillTotpResolveActivity] が行う（コードは短時間で失効するため）。
     */
    private fun buildTotpDataset(
        context: Context,
        candidate: AutofillCandidate,
        entry: Entry,
        totpFieldId: AutofillId
    ): Dataset? {
        val hasTotpField = try {
            val customFields = entry.customFields?.let {
                Json.decodeFromString<List<CustomField>>(it)
            } ?: emptyList()
            customFields.any { it.fieldType == CustomFieldType.TOTP.value }
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "failed to parse customFields for entry=${candidate.id}", e)
            false
        }
        if (!hasTotpField) return null

        val intent = Intent(context, AutofillTotpResolveActivity::class.java).apply {
            putTotpResolveRequest(TotpResolveRequest(candidate.id, totpFieldId))
        }
        val pendingIntent = PendingIntent.getActivity(
            context,
            authRequestCodeSeq.incrementAndGet(),
            intent,
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val label = context.getString(R.string.autofill_totp_dataset_label, candidate.name)
        val presentation = simplePresentation(context, label)
        return Dataset.Builder(presentation)
            .setValue(totpFieldId, null)
            .setAuthentication(pendingIntent.intentSender)
            .build()
    }

    /** [AutofillTotpResolveActivity] 等、同パッケージ内の他クラスからも共有する */
    internal fun simplePresentation(context: Context, label: String): RemoteViews =
        RemoteViews(context.packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, label)
        }
}
