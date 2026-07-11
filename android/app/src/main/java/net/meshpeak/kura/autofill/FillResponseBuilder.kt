package net.meshpeak.kura.autofill

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.service.autofill.Dataset
import android.service.autofill.FillResponse
import android.util.Log
import android.view.autofill.AutofillValue
import android.widget.RemoteViews
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import net.meshpeak.kura.BuildConfig
import net.meshpeak.kura.R
import net.meshpeak.kura.autofill.model.ParsedLoginForm
import net.meshpeak.kura.autofill.model.putParsedLoginForm
import net.meshpeak.kura.data.model.AutofillCandidate
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
            val dataset = buildDatasetForCandidate(context, repository, candidate, parsed) ?: continue
            responseBuilder.addDataset(dataset)
            added = true
        }
        if (BuildConfig.DEBUG) Log.d(TAG, "buildUnlocked: datasets added=$added")
        if (!added) return null
        return responseBuilder.build()
    }

    fun buildLockedAuthPlaceholder(context: Context, parsed: ParsedLoginForm): FillResponse? {
        val autofillIds = listOfNotNull(parsed.usernameFieldId, parsed.passwordFieldId)
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

    private suspend fun buildDatasetForCandidate(
        context: Context,
        repository: IVaultRepository,
        candidate: AutofillCandidate,
        parsed: ParsedLoginForm
    ): Dataset? {
        val entry = try {
            repository.getEntry(candidate.id)
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "getEntry(${candidate.id}) failed", e)
            return null
        }
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

    private fun simplePresentation(context: Context, label: String): RemoteViews =
        RemoteViews(context.packageName, android.R.layout.simple_list_item_1).apply {
            setTextViewText(android.R.id.text1, label)
        }
}
