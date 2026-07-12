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
        val packageName = parsed.packageName ?: return null
        val domain = PackageDomainMap.domainFor(context, packageName)
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "buildUnlocked: packageName=$packageName -> domain=$domain")
        }
        if (domain == null) {
            if (BuildConfig.DEBUG) Log.d(TAG, "packageName=$packageName not in package_domains.json -> no candidates")
            return null
        }

        val allCandidates = try {
            repository.listLoginUrls()
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "listLoginUrls failed", e)
            return null
        }
        val matched = LoginCandidateMatcher.filter(allCandidates, domain)
        if (BuildConfig.DEBUG) {
            Log.d(TAG, "listLoginUrls returned ${allCandidates.size} entries, ${matched.size} matched domain=$domain")
        }
        if (matched.isEmpty()) return null

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
        if (!added) return null
        return responseBuilder.build()
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
    ): Dataset? {
        val typedValue = try {
            Json.parseToJsonElement(entry.typedValue).jsonObject
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "failed to parse typedValue for entry=${candidate.id}", e)
            return null
        }

        val username = (typedValue["username"] as? JsonPrimitive)?.contentOrNull
        val password = (typedValue["password"] as? JsonPrimitive)?.contentOrNull

        val presentation = simplePresentation(context, candidate.name)
        val datasetBuilder = Dataset.Builder(presentation)
        var hasValue = false

        parsed.usernameFieldId?.let { id ->
            username?.let {
                datasetBuilder.setValue(id, AutofillValue.forText(it))
                hasValue = true
            }
        }
        parsed.passwordFieldId?.let { id ->
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
