package net.meshpeak.kura.credential

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/**
 * clientDataJSONの構築責務の分岐（docs/android-passkey.md 5-3）:
 * - ブラウザ発（`clientDataHash`が渡される）: システムが既に計算済みのハッシュを
 *   そのまま署名に使う（呼び出し側が`repository.webauthnGetAssertionWithHash`を
 *   直接呼ぶ。Kotlin側でJSON文字列は一切組み立てない）
 * - ネイティブアプリ発（`clientDataHash`がnull）: `requestJson`からchallengeを取り出し、
 *   [OriginResolver] で確定したrp_idベースの疑似origin（`https://{rp_id}`、ブラウザ発と
 *   同じorigin検証をRP側に期待する設計）から `{type, challenge, origin}` を組み立てる
 */
object ClientDataJsonBuilder {

    private val json = Json { ignoreUnknownKeys = true }

    /** WebAuthn Level 3 `PublicKeyCredentialRequestOptionsJSON`の`challenge`フィールドを抽出する */
    fun extractChallenge(requestJson: String): String? = runCatching {
        json.parseToJsonElement(requestJson).jsonObject["challenge"]?.jsonPrimitive?.content
    }.getOrNull()

    /** ネイティブアプリ発（`clientDataHash`なし）経路専用のclientDataJSON組み立て（get） */
    fun buildForGet(challenge: String, rpId: String): String = build("webauthn.get", challenge, rpId)

    /** ネイティブアプリ発（`clientDataHash`なし）経路専用のclientDataJSON組み立て（create） */
    fun buildForCreate(challenge: String, rpId: String): String = build("webauthn.create", challenge, rpId)

    private fun build(type: String, challenge: String, rpId: String): String =
        buildJsonObject {
            put("type", type)
            put("challenge", challenge)
            put("origin", "https://$rpId")
        }.toString()
}
