package net.meshpeak.kura.data.model

import androidx.annotation.StringRes
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import net.meshpeak.kura.R

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

enum class EntryType(val value: String, @StringRes val displayNameResId: Int) {
    LOGIN("login", R.string.entry_type_login),
    BANK("bank", R.string.entry_type_bank),
    SSH_KEY("ssh_key", R.string.entry_type_ssh_key),
    SECURE_NOTE("secure_note", R.string.entry_type_secure_note),
    CREDIT_CARD("credit_card", R.string.entry_type_credit_card),
    PASSWORD("password", R.string.entry_type_password),
    SOFTWARE_LICENSE("software_license", R.string.entry_type_software_license);

    companion object {
        fun fromValue(value: String): EntryType? = entries.find { it.value == value }
    }
}

enum class CustomFieldType(val value: String, @StringRes val displayNameResId: Int) {
    TEXT("text", R.string.custom_field_text),
    PASSWORD("password", R.string.custom_field_password),
    EMAIL("email", R.string.custom_field_email),
    URL("url", R.string.custom_field_url),
    PHONE("phone", R.string.custom_field_phone),
    TOTP("totp", R.string.custom_field_totp);

    companion object {
        fun fromValue(value: String): CustomFieldType? = entries.find { it.value == value }
    }
}
