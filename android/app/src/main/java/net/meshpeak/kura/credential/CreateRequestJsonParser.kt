package net.meshpeak.kura.credential

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class CreateRequestInfo(
    val rpName: String?,
    val userHandle: String,
    val userName: String,
    val userDisplayName: String,
    val challenge: String,
    val excludeCredentialIds: List<String>
)

/** WebAuthn Level 3 `PublicKeyCredentialCreationOptionsJSON`のパース */
object CreateRequestJsonParser {
    private val json = Json { ignoreUnknownKeys = true }

    fun parse(requestJson: String): CreateRequestInfo? = runCatching {
        val obj = json.parseToJsonElement(requestJson).jsonObject
        val user = obj["user"]?.jsonObject ?: return@runCatching null
        val challenge = obj["challenge"]?.jsonPrimitive?.content ?: return@runCatching null
        val userHandle = user["id"]?.jsonPrimitive?.content ?: return@runCatching null
        val userName = user["name"]?.jsonPrimitive?.content ?: ""
        val userDisplayName = user["displayName"]?.jsonPrimitive?.content ?: ""
        val rpName = obj["rp"]?.jsonObject?.get("name")?.jsonPrimitive?.content
        val excludeIds = obj["excludeCredentials"]?.jsonArray
            ?.mapNotNull { it.jsonObject["id"]?.jsonPrimitive?.content }
            ?: emptyList()
        CreateRequestInfo(rpName, userHandle, userName, userDisplayName, challenge, excludeIds)
    }.getOrNull()
}
