package net.meshpeak.kura.credential

import android.util.Base64
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonArray
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

    /**
     * WebAuthn Level 3の`allowCredentials`/`excludeCredentials`配列から`id`一覧を抽出する。
     * `fieldName`が存在しない場合は空リスト（＝制限なし。WebAuthn仕様上、
     * discoverable/usernameless credentialフローでは`allowCredentials`が空/省略される
     * のが正当な状態であるため）を返す。ただし`requestJson`自体が不正なJSON、または
     * `fieldName`は存在するのに配列として読めない等、"壊れていて読めない"場合は
     * 例外を投げる（fail-closed）。ここで例外をcatchして空リストにフォールバックすると、
     * 「本当に無制限」と「パースできず本来の絞り込みを失った」を呼び出し元が区別できず、
     * RP指定の絞り込みが意図せず無効化されてしまうため、呼び出し元で必ずcatchして
     * エラー扱いにすること（空リストとして黙って処理を続けてはいけない）。
     */
    fun parseCredentialIds(requestJson: String, fieldName: String): List<String> {
        val field = json.parseToJsonElement(requestJson).jsonObject[fieldName] ?: return emptyList()
        return field.jsonArray.mapNotNull { it.jsonObject["id"]?.jsonPrimitive?.content }
    }

    /** レスポンスJSONに埋め込む際のclientDataJSON文字列のbase64url(no-pad)エンコード。 */
    fun encodeBase64Url(text: String): String =
        Base64.encodeToString(text.toByteArray(Charsets.UTF_8), Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

    private fun build(type: String, challenge: String, rpId: String): String =
        buildJsonObject {
            put("type", type)
            put("challenge", challenge)
            put("origin", "https://$rpId")
        }.toString()
}
