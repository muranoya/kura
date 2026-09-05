package net.meshpeak.kura.data.model

import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * `CustomField.autofillSelector` 追加後も、strict Json（デフォルト設定、
 * ignoreUnknownKeys = false）で既存のRust側JSON形状をデコードできることを確認する。
 * 詳細: docs/extension-custom-field-autofill.md 5-3節
 */
class ModelsTest {
    @Test
    fun `decodes CustomField without autofill_selector (old vault data)`() {
        val json = """{"id":"cf1","name":"Note","field_type":"text","value":"hello"}"""
        val field = Json.decodeFromString<CustomField>(json)
        assertNull(field.autofillSelector)
    }

    @Test
    fun `decodes CustomField with autofill_selector`() {
        val json =
            """{"id":"cf1","name":"Account ID","field_type":"text","value":"abc",
              |"autofill_selector":{"name":"account_id","type":"text"}}"""
                .trimMargin()
        val field = Json.decodeFromString<CustomField>(json)
        assertEquals("account_id", field.autofillSelector?.name)
        assertEquals("text", field.autofillSelector?.type)
        assertNull(field.autofillSelector?.tag)
        assertNull(field.autofillSelector?.id)
    }

    @Test
    fun `decodes a list of CustomField mixing entries with and without a selector`() {
        val json =
            """[
              |{"id":"cf1","name":"Account ID","field_type":"text","value":"abc",
              | "autofill_selector":{"name":"account_id"}},
              |{"id":"cf2","name":"Note","field_type":"text","value":"note"}
              |]"""
                .trimMargin()
        val fields = Json.decodeFromString<List<CustomField>>(json)
        assertEquals(2, fields.size)
        assertEquals("account_id", fields[0].autofillSelector?.name)
        assertNull(fields[1].autofillSelector)
    }
}
