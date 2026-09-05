package net.meshpeak.kura.autofill.log

import android.app.Application
import android.content.ContentValues
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * [AutofillLogStore]の保持ポリシー（24時間/500件上限）とスキーマ（秘匿値カラムが
 * 存在しないこと）を検証する。record()は内部でfire-and-forgetのコルーチンへ処理を
 * 逃がすため、[AutofillLogStore.awaitIdleForTest]で書き込み完了を待ってからlist()を呼ぶ。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class AutofillLogStoreTest {

    private val context = ApplicationProvider.getApplicationContext<Application>()

    @Before
    fun resetStore() {
        // Robolectricはテストメソッドごとに新しいApplication/データディレクトリを割り当てるが、
        // AutofillLogStoreはobjectシングルトンでヘルパーをキャッシュするため、前のテスト
        // （他のテストクラス経由の間接呼び出しを含む）のヘルパーを持ち越さないよう、
        // 明示的に破棄してから始める。
        AutofillLogStore.resetForTest()
    }

    @Test
    fun `recordしたログをlistで取得できる`() {
        AutofillLogStore.record(
            context,
            AutofillLogEvent(target = "example.com", isBrowserRequest = true, outcome = AutofillLogOutcome.SUCCESS, candidateCount = 1)
        )
        AutofillLogStore.awaitIdleForTest()

        val logs = AutofillLogStore.list(context)
        assertEquals(1, logs.size)
        assertEquals("example.com", logs[0].target)
        assertEquals(AutofillLogOutcome.SUCCESS, logs[0].outcome)
        assertEquals(1, logs[0].candidateCount)
    }

    @Test
    fun `clearAllで全件消去できる`() {
        AutofillLogStore.record(
            context,
            AutofillLogEvent(target = "example.com", isBrowserRequest = true, outcome = AutofillLogOutcome.SUCCESS)
        )
        AutofillLogStore.awaitIdleForTest()

        AutofillLogStore.clearAll(context)

        assertTrue(AutofillLogStore.list(context).isEmpty())
    }

    @Test
    fun `保持期間を過ぎた行はrecordのたびに削除される`() {
        AutofillLogStore.list(context) // テーブルが未作成の場合に備えて先にアクセスしておく

        // record()経由では現在時刻しか書けないため、24時間より古い行は直接INSERTする。
        val db = context.openOrCreateDatabase("autofill_log.db", 0, null)
        val oldTimestamp = System.currentTimeMillis() - (25L * 60 * 60 * 1000)
        db.insert(
            "autofill_log", null,
            ContentValues().apply {
                put("timestamp_millis", oldTimestamp)
                put("target", "old.example.com")
                put("is_browser_request", 1)
                put("outcome", AutofillLogOutcome.SUCCESS.dbValue)
                put("candidate_count", 0)
            }
        )
        db.close()
        assertEquals(1, AutofillLogStore.list(context).size)

        // 新規record()の副作用として保持期間切れの行が掃除される。
        AutofillLogStore.record(
            context,
            AutofillLogEvent(target = "new.example.com", isBrowserRequest = true, outcome = AutofillLogOutcome.SUCCESS)
        )
        AutofillLogStore.awaitIdleForTest()

        val logs = AutofillLogStore.list(context)
        assertEquals(1, logs.size)
        assertEquals("new.example.com", logs[0].target)
    }

    @Test
    fun `件数上限を超えると古い順に削除される`() {
        repeat(510) { i ->
            AutofillLogStore.record(
                context,
                AutofillLogEvent(target = "site-$i.example.com", isBrowserRequest = true, outcome = AutofillLogOutcome.SUCCESS)
            )
        }
        AutofillLogStore.awaitIdleForTest()

        val logs = AutofillLogStore.list(context)
        assertEquals(500, logs.size)
        // 古い順(site-0〜site-9)が消え、新しい方(site-500〜509)が残っているはず。
        assertFalse(logs.any { it.target == "site-0.example.com" })
        assertTrue(logs.any { it.target == "site-509.example.com" })
    }

    @Test
    fun `秘匿値カラムを一切持たない`() {
        AutofillLogStore.list(context) // テーブルが未作成の場合に備えて先にアクセスしておく

        val db = context.openOrCreateDatabase("autofill_log.db", 0, null)
        db.rawQuery("PRAGMA table_info(autofill_log)", null).use { cursor ->
            val nameIdx = cursor.getColumnIndexOrThrow("name")
            val columns = generateSequence { if (cursor.moveToNext()) cursor.getString(nameIdx) else null }.toList()
            val forbidden = setOf("username", "password", "typed_value", "totp", "secret", "value")
            assertFalse(
                "秘匿値らしきカラムが含まれている: $columns",
                columns.any { col -> forbidden.any { col.contains(it, ignoreCase = true) } }
            )
        }
        db.close()
    }
}
