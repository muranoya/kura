package com.kura.app.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class EntryRow(
    val id: String,
    @SerialName("entry_type") val entryType: String,
    val name: String,
    @SerialName("is_favorite") val isFavorite: Boolean,
    @SerialName("created_at") val createdAt: Long = 0,
    @SerialName("updated_at") val updatedAt: Long,
    @SerialName("deleted_at") val deletedAt: Long? = null
)

@Serializable
data class Entry(
    val id: String,
    @SerialName("entry_type") val entryType: String,
    val name: String,
    @SerialName("is_favorite") val isFavorite: Boolean,
    @SerialName("created_at") val createdAt: Long = 0,
    @SerialName("updated_at") val updatedAt: Long,
    @SerialName("deleted_at") val deletedAt: Long? = null,
    val notes: String? = null,
    @SerialName("typed_value") val typedValue: String = "{}",
    val labels: List<String> = emptyList(),
    @SerialName("custom_fields") val customFields: String? = null
)

@Serializable
data class Label(
    val id: String,
    val name: String
)

@Serializable
data class CustomField(
    val id: String,
    val name: String,
    @SerialName("field_type") val fieldType: String,
    val value: String
)

@Serializable
data class SyncResult(
    val synced: Boolean,
    @SerialName("last_synced_at") val lastSyncedAt: Long? = null
)

@Serializable
data class S3Config(
    val region: String,
    val bucket: String,
    val key: String,
    val accessKeyId: String,
    val secretAccessKey: String,
    val endpoint: String? = null
)

enum class EntryType(val value: String, val displayName: String) {
    LOGIN("login", "ログイン"),
    BANK("bank", "銀行口座"),
    SSH_KEY("ssh_key", "SSHキー"),
    SECURE_NOTE("secure_note", "セキュアノート"),
    CREDIT_CARD("credit_card", "クレジットカード"),
    PASSKEY("passkey", "Passkey"),
    PASSWORD("password", "パスワード"),
    SOFTWARE_LICENSE("software_license", "ソフトウェアライセンス");

    companion object {
        fun fromValue(value: String): EntryType? = entries.find { it.value == value }
    }
}

// ============================================================================
// Import types
// ============================================================================

@Serializable
data class ImportPreview(
    val stats: ImportPreviewStats,
    val items: List<ImportPreviewItem>,
    @SerialName("source_account_name") val sourceAccountName: String,
    @SerialName("source_vault_names") val sourceVaultNames: List<String>
)

@Serializable
data class ImportPreviewStats(
    @SerialName("total_items") val totalItems: Int,
    @SerialName("by_target_type") val byTargetType: List<List<kotlinx.serialization.json.JsonElement>>,
    @SerialName("duplicate_count") val duplicateCount: Int,
    @SerialName("attachment_warning_count") val attachmentWarningCount: Int,
    @SerialName("indirect_mapping_count") val indirectMappingCount: Int
)

@Serializable
data class ImportPreviewItem(
    @SerialName("source_id") val sourceId: String,
    @SerialName("source_name") val sourceName: String,
    @SerialName("source_category") val sourceCategory: SourceCategory,
    @SerialName("source_vault_name") val sourceVaultName: String,
    @SerialName("target_entry_type") val targetEntryType: String,
    @SerialName("target_name") val targetName: String,
    val duplicates: List<DuplicateCandidate>,
    @SerialName("default_action") val defaultAction: kotlinx.serialization.json.JsonElement,
    @SerialName("has_attachments") val hasAttachments: Boolean,
    val tags: List<String>,
    @SerialName("field_count") val fieldCount: Int
)

@Serializable
data class SourceCategory(
    @SerialName("category_uuid") val categoryUuid: String,
    @SerialName("category_name") val categoryName: String,
    @SerialName("is_direct_mapping") val isDirectMapping: Boolean
)

@Serializable
data class DuplicateCandidate(
    @SerialName("existing_entry_id") val existingEntryId: String,
    @SerialName("existing_entry_name") val existingEntryName: String,
    @SerialName("existing_entry_type") val existingEntryType: String,
    val confidence: String,
    val reason: String
)

@Serializable
data class ImportItemAction(
    @SerialName("source_id") val sourceId: String,
    val action: kotlinx.serialization.json.JsonElement,
    @SerialName("target_entry_type") val targetEntryType: String? = null
)

@Serializable
data class ImportResult(
    @SerialName("created_count") val createdCount: Int,
    @SerialName("overwritten_count") val overwrittenCount: Int,
    @SerialName("skipped_count") val skippedCount: Int,
    @SerialName("error_count") val errorCount: Int,
    @SerialName("labels_created") val labelsCreated: List<String>,
    val items: List<ImportItemResult>
)

@Serializable
data class ImportItemResult(
    @SerialName("source_id") val sourceId: String,
    @SerialName("source_name") val sourceName: String,
    val success: Boolean,
    @SerialName("action_taken") val actionTaken: String,
    @SerialName("created_entry_id") val createdEntryId: String? = null,
    val error: String? = null
)

enum class CustomFieldType(val value: String, val displayName: String) {
    TEXT("text", "テキスト"),
    PASSWORD("password", "パスワード"),
    EMAIL("email", "メール"),
    URL("url", "URL"),
    PHONE("phone", "電話番号"),
    TOTP("totp", "ワンタイムパスワード");

    companion object {
        fun fromValue(value: String): CustomFieldType? = entries.find { it.value == value }
    }
}
