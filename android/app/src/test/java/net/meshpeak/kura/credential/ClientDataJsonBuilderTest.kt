package net.meshpeak.kura.credential

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// encodeBase64Urlがandroid.util.Base64に依存するためRobolectricが必要
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ClientDataJsonBuilderTest {

    @Test
    fun `extractChallengeはchallengeフィールドを取り出す`() {
        val requestJson = """{"challenge": "Y2hhbGxlbmdl", "rpId": "example.com"}"""
        assertEquals("Y2hhbGxlbmdl", ClientDataJsonBuilder.extractChallenge(requestJson))
    }

    @Test
    fun `extractChallengeは不正なJSONでnullを返す`() {
        assertNull(ClientDataJsonBuilder.extractChallenge("not json"))
    }

    @Test
    fun `buildForGetはtype challenge originを含むJSONを組み立てる`() {
        val json = ClientDataJsonBuilder.buildForGet("Y2hhbGxlbmdl", "example.com")
        val obj = Json.parseToJsonElement(json).jsonObject

        assertEquals("webauthn.get", obj["type"]?.jsonPrimitive?.content)
        assertEquals("Y2hhbGxlbmdl", obj["challenge"]?.jsonPrimitive?.content)
        assertEquals("https://example.com", obj["origin"]?.jsonPrimitive?.content)
    }

    @Test
    fun `buildForCreateはtypeがwebauthn_createになる`() {
        val json = ClientDataJsonBuilder.buildForCreate("Y2hhbGxlbmdl", "example.com")
        val obj = Json.parseToJsonElement(json).jsonObject

        assertEquals("webauthn.create", obj["type"]?.jsonPrimitive?.content)
        assertEquals("https://example.com", obj["origin"]?.jsonPrimitive?.content)
    }

    @Test
    fun `parseCredentialIdsは指定フィールドのid一覧を取り出す`() {
        val requestJson = """{"allowCredentials": [{"type": "public-key", "id": "aWQx"}, {"type": "public-key", "id": "aWQy"}]}"""
        assertEquals(listOf("aWQx", "aWQy"), ClientDataJsonBuilder.parseCredentialIds(requestJson, "allowCredentials"))
    }

    @Test
    fun `parseCredentialIdsは対象フィールドが無ければ空リストを返す`() {
        assertEquals(emptyList<String>(), ClientDataJsonBuilder.parseCredentialIds("""{}""", "allowCredentials"))
    }

    @Test(expected = Exception::class)
    fun `parseCredentialIdsは不正なJSONで例外を投げる`() {
        ClientDataJsonBuilder.parseCredentialIds("not json", "allowCredentials")
    }

    @Test(expected = Exception::class)
    fun `parseCredentialIdsは対象フィールドが配列でなければ例外を投げる`() {
        ClientDataJsonBuilder.parseCredentialIds("""{"allowCredentials": "not an array"}""", "allowCredentials")
    }

    @Test
    fun `encodeBase64Urlはbase64url no-padでエンコードする`() {
        val encoded = ClientDataJsonBuilder.encodeBase64Url("""{"type":"webauthn.get"}""")
        assertEquals(-1, encoded.indexOf('='))
        assertEquals(-1, encoded.indexOf('+'))
        assertEquals(-1, encoded.indexOf('/'))
    }
}
