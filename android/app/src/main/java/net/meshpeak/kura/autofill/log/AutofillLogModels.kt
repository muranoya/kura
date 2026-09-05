package net.meshpeak.kura.autofill.log

import androidx.annotation.StringRes
import net.meshpeak.kura.R

/**
 * オートフィル処理が「なぜ候補を出さなかったか / 出したか」を診断するための結果種別。
 * 秘匿値（username/password/TOTP値）は一切含めない。
 */
enum class AutofillLogOutcome(val dbValue: String, @StringRes val labelResId: Int) {
    NO_STRUCTURE("no_structure", R.string.autofill_log_outcome_no_structure),
    UNKNOWN_PACKAGE("unknown_package", R.string.autofill_log_outcome_unknown_package),
    NO_FIELDS_DETECTED("no_fields_detected", R.string.autofill_log_outcome_no_fields_detected),
    LOCKED_PLACEHOLDER("locked_placeholder", R.string.autofill_log_outcome_locked_placeholder),
    NO_DOMAIN_RESOLVED("no_domain_resolved", R.string.autofill_log_outcome_no_domain_resolved),
    NO_MATCHING_ENTRY("no_matching_entry", R.string.autofill_log_outcome_no_matching_entry),
    DATASET_BUILD_FAILED("dataset_build_failed", R.string.autofill_log_outcome_dataset_build_failed),
    MANUAL_SEARCH_OFFERED("manual_search_offered", R.string.autofill_log_outcome_manual_search_offered),
    SUCCESS("success", R.string.autofill_log_outcome_success),
    ERROR("error", R.string.autofill_log_outcome_error);

    companion object {
        fun fromDbValue(value: String): AutofillLogOutcome? = entries.find { it.dbValue == value }
    }
}

/** [AutofillLogStore] に記録する1件分のイベント。書き込み専用（idやtimestampはストア側で採番）。 */
data class AutofillLogEvent(
    val target: String?,
    val isBrowserRequest: Boolean,
    val outcome: AutofillLogOutcome,
    val candidateCount: Int = 0,
    val detectedFields: String? = null,
    val errorClass: String? = null
)

/** [AutofillLogStore] から読み出した1件分のログ。 */
data class AutofillLogEntry(
    val id: Long,
    val timestampMillis: Long,
    val target: String?,
    val isBrowserRequest: Boolean,
    val outcome: AutofillLogOutcome,
    val candidateCount: Int,
    val detectedFields: String?,
    val errorClass: String?
)
