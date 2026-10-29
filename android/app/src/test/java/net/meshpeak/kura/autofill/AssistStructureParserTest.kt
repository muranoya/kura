package net.meshpeak.kura.autofill

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AssistStructureParserTest {

    @Test
    fun `大きさのある通常の欄は入力対象`() {
        assertTrue(AssistStructureParser.isUserVisibleField(300, 48, mapOf("type" to "password")))
        assertTrue(AssistStructureParser.isUserVisibleField(300, 48, emptyMap()))
    }

    @Test
    fun `幅か高さが0の欄は入力対象外`() {
        assertFalse(AssistStructureParser.isUserVisibleField(0, 48, emptyMap()))
        assertFalse(AssistStructureParser.isUserVisibleField(300, 0, emptyMap()))
    }

    @Test
    fun `type=hiddenのinputは入力対象外`() {
        assertFalse(AssistStructureParser.isUserVisibleField(300, 48, mapOf("type" to "hidden")))
        assertFalse(AssistStructureParser.isUserVisibleField(300, 48, mapOf("type" to "HIDDEN")))
    }
}
