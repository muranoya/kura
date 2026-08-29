package net.meshpeak.kura.credential

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

data class CreateRequestInfo(
    val rpName: String?,
    /**
     * サイトが自己申告する`rp.id`（検証前の値。単体では信用せず、必ず
     * [OriginResolver.Resolved.validateClaimedRpId]で検証済みoriginに対する有効性
     * チェックを経由してから使うこと。`rpName`と異なりこちらは実際にPasskeyの
     * 束縛先rp_idとして使われうるため、なりすまし対策が必須）。
     */
    val rpId: String?,
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
        val rp = obj["rp"]?.jsonObject
        val rpName = rp?.get("name")?.jsonPrimitive?.content
        val rpId = rp?.get("id")?.jsonPrimitive?.content
        val excludeIds = obj["excludeCredentials"]?.jsonArray
            ?.mapNotNull { it.jsonObject["id"]?.jsonPrimitive?.content }
            ?: emptyList()
        CreateRequestInfo(rpName, rpId, userHandle, userName, userDisplayName, challenge, excludeIds)
    }.getOrNull()
}
