package net.meshpeak.kura.credential

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class CreateRequestJsonParserTest {

    @Test
    fun `一般的なcreation optionsをパースできる`() {
        val json = """
            {
              "rp": {"id": "example.com", "name": "Example"},
              "user": {"id": "dXNlci1oYW5kbGU", "name": "user@example.com", "displayName": "Example User"},
              "challenge": "Y2hhbGxlbmdl",
              "excludeCredentials": [{"type": "public-key", "id": "Y3JlZGVudGlhbC1pZA"}]
            }
        """.trimIndent()

        val info = CreateRequestJsonParser.parse(json)

        assertEquals("Example", info?.rpName)
        assertEquals("dXNlci1oYW5kbGU", info?.userHandle)
        assertEquals("user@example.com", info?.userName)
        assertEquals("Example User", info?.userDisplayName)
        assertEquals("Y2hhbGxlbmdl", info?.challenge)
        assertEquals(listOf("Y3JlZGVudGlhbC1pZA"), info?.excludeCredentialIds)
    }

    @Test
    fun `excludeCredentialsとrp名省略時は空リストとnullになる`() {
        val json = """
            {
              "rp": {"id": "example.com"},
              "user": {"id": "dXNlci1oYW5kbGU"},
              "challenge": "Y2hhbGxlbmdl"
            }
        """.trimIndent()

        val info = CreateRequestJsonParser.parse(json)

        assertNull(info?.rpName)
        assertTrue(info?.excludeCredentialIds?.isEmpty() == true)
        assertEquals("", info?.userName)
        assertEquals("", info?.userDisplayName)
    }

    @Test
    fun `challengeまたはuser_idが欠落していればnullを返す`() {
        assertNull(CreateRequestJsonParser.parse("""{"user": {"id": "x"}}"""))
        assertNull(CreateRequestJsonParser.parse("""{"challenge": "x"}"""))
    }

    @Test
    fun `不正なJSONはnullを返す`() {
        assertNull(CreateRequestJsonParser.parse("not json"))
    }
}
