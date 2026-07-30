package net.meshpeak.kura.credential

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

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
}
