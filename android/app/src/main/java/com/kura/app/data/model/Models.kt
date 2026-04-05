package com.kura.app.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class EntryRow(
    val id: String,
    @SerialName("entry_type") val entryType: String,
    val name: String,
    val subtitle: String? = null,
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
    PASSWORD("password", "パスワード"),
    SOFTWARE_LICENSE("software_license", "ソフトウェアライセンス");

    companion object {
        fun fromValue(value: String): EntryType? = entries.find { it.value == value }
    }
}

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
