package net.meshpeak.kura.autofill.log

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import net.meshpeak.kura.BuildConfig

private const val TAG = "KuraAutofill"

private const val DB_NAME = "autofill_log.db"
private const val DB_VERSION = 1
private const val TABLE = "autofill_log"

private const val COL_ID = "id"
private const val COL_TIMESTAMP = "timestamp_millis"
private const val COL_TARGET = "target"
private const val COL_IS_BROWSER = "is_browser_request"
private const val COL_OUTCOME = "outcome"
private const val COL_CANDIDATE_COUNT = "candidate_count"
private const val COL_DETECTED_FIELDS = "detected_fields"
private const val COL_ERROR_CLASS = "error_class"

/** 保持期間。オートフィル動作ログはあくまで直近の診断用であり、長期保存はしない。 */
private const val RETENTION_MILLIS = 24L * 60 * 60 * 1000
/** ログイン試行が短時間に集中した場合でもDBサイズを頭打ちにするための件数上限。 */
private const val MAX_ROWS = 500

/**
 * オートフィルの処理結果を診断用に端末内へ保存する軽量ストア。
 *
 * Room等は導入せず、単一テーブルの[SQLiteOpenHelper]で完結させる（本アプリはRoom/WorkManagerを
 * 一切使っておらず、このためだけに導入するのは過剰と判断）。書き込みのたびに保持期間・件数上限を
 * 超えた行を削除するため、専用の定期実行の仕組みは不要。
 *
 * **重要**: username/password/TOTP値など秘匿値は列として一切持たない。テーブルに保持するのは
 * 診断に必要な構造情報（対象ドメイン/パッケージ名、検出結果の種別、件数）のみ。
 */
object AutofillLogStore {

    // record()の呼び出し元（KuraAutofillServiceのDispatchers.IOコルーチン、
    // AutofillUnlockActivity/AutofillPickerActivityのMainディスパッチのlifecycleScope等）
    // ごとにディスパッチャの扱いを揃えるのは煩雑なため、書き込みは常にこのスコープでIOへ
    // 逃がすfire-and-forget方式にする。ログ書き込みはベストエフォートでよく、完了を待つ
    // 必要がないため（呼び出し元をブロックしない＝オートフィル本体の応答性を優先）。
    // 単一スレッドに限定するのは、複数のonFillRequest/トランポリンActivityから同時に
    // 書き込まれてもSQLiteへの書き込みが競合しないようにするため（副次的に、書き込み順序も
    // 呼び出し順どおりに保たれる）。
    private val logScope = CoroutineScope(SupervisorJob() + Dispatchers.IO.limitedParallelism(1))

    // record()が発行した直近のJob。単一スレッドのディスパッチャはタスクを発行順(FIFO)に
    // 処理するため、このJobの完了を待てば「それ以前に発行されたrecord()もすべて完了済み」
    // であることが保証できる。テストの同期待ちにのみ使う（本番コードはfire-and-forgetのまま）。
    @Volatile
    private var lastJob: Job? = null

    @Volatile
    private var helper: DbHelper? = null

    private fun helper(context: Context): DbHelper =
        helper ?: synchronized(this) {
            helper ?: DbHelper(context.applicationContext).also { helper = it }
        }

    /**
     * テスト専用: 直近のrecord()の完了を待ってからキャッシュしたヘルパーを破棄する。
     * 本番実行時はプロセス寿命の間Contextが変わらないため不要だが、Robolectricはテスト
     * メソッドごとに新しいApplication/データディレクトリを割り当てるため、このobject
     * シングルトンが前のテストのヘルパーを持ち越すと別ファイルを見続けてしまう。
     * テストの`@Before`から呼び出すこと。
     */
    @androidx.annotation.VisibleForTesting
    internal fun resetForTest() {
        awaitIdleForTest()
        synchronized(this) {
            helper?.close()
            helper = null
        }
    }

    /**
     * テスト専用: それまでに発行したrecord()の書き込みがすべて完了するのを待つ。
     * record()はfire-and-forgetのため、テストが結果を検証する前にこれを呼ぶこと。
     */
    @androidx.annotation.VisibleForTesting
    internal fun awaitIdleForTest() {
        runBlocking { lastJob?.join() }
    }

    /**
     * ログを1件記録する。呼び出し元のスレッド/ディスパッチャに関わらず即座にreturnし、
     * 実際の書き込みはバックグラウンドで行う。失敗してもオートフィル本体の応答を
     * 妨げないよう例外は握りつぶす。
     */
    fun record(context: Context, event: AutofillLogEvent) {
        val appContext = context.applicationContext
        lastJob = logScope.launch {
            try {
                val db = helper(appContext).writableDatabase
                val values = ContentValues().apply {
                    put(COL_TIMESTAMP, System.currentTimeMillis())
                    put(COL_TARGET, event.target)
                    put(COL_IS_BROWSER, if (event.isBrowserRequest) 1 else 0)
                    put(COL_OUTCOME, event.outcome.dbValue)
                    put(COL_CANDIDATE_COUNT, event.candidateCount)
                    put(COL_DETECTED_FIELDS, event.detectedFields)
                    put(COL_ERROR_CLASS, event.errorClass)
                }
                db.insert(TABLE, null, values)
                prune(db)
            } catch (e: Exception) {
                if (BuildConfig.DEBUG) Log.d(TAG, "AutofillLogStore.record failed", e)
            }
        }
    }

    private fun prune(db: SQLiteDatabase) {
        val cutoff = System.currentTimeMillis() - RETENTION_MILLIS
        db.delete(TABLE, "$COL_TIMESTAMP < ?", arrayOf(cutoff.toString()))
        db.execSQL(
            """DELETE FROM $TABLE WHERE $COL_ID NOT IN
               (SELECT $COL_ID FROM $TABLE ORDER BY $COL_ID DESC LIMIT $MAX_ROWS)"""
        )
    }

    /** 新しい順に全ログを返す。読み取り失敗時は空リスト（ログ閲覧はベストエフォート機能のため）。 */
    fun list(context: Context): List<AutofillLogEntry> = try {
        val db = helper(context).readableDatabase
        db.query(
            TABLE, null, null, null, null, null, "$COL_TIMESTAMP DESC"
        ).use { cursor ->
            val result = ArrayList<AutofillLogEntry>(cursor.count)
            val idIdx = cursor.getColumnIndexOrThrow(COL_ID)
            val tsIdx = cursor.getColumnIndexOrThrow(COL_TIMESTAMP)
            val targetIdx = cursor.getColumnIndexOrThrow(COL_TARGET)
            val browserIdx = cursor.getColumnIndexOrThrow(COL_IS_BROWSER)
            val outcomeIdx = cursor.getColumnIndexOrThrow(COL_OUTCOME)
            val countIdx = cursor.getColumnIndexOrThrow(COL_CANDIDATE_COUNT)
            val fieldsIdx = cursor.getColumnIndexOrThrow(COL_DETECTED_FIELDS)
            val errorIdx = cursor.getColumnIndexOrThrow(COL_ERROR_CLASS)
            while (cursor.moveToNext()) {
                val outcome = AutofillLogOutcome.fromDbValue(cursor.getString(outcomeIdx)) ?: continue
                result.add(
                    AutofillLogEntry(
                        id = cursor.getLong(idIdx),
                        timestampMillis = cursor.getLong(tsIdx),
                        target = if (cursor.isNull(targetIdx)) null else cursor.getString(targetIdx),
                        isBrowserRequest = cursor.getInt(browserIdx) != 0,
                        outcome = outcome,
                        candidateCount = cursor.getInt(countIdx),
                        detectedFields = if (cursor.isNull(fieldsIdx)) null else cursor.getString(fieldsIdx),
                        errorClass = if (cursor.isNull(errorIdx)) null else cursor.getString(errorIdx)
                    )
                )
            }
            result
        }
    } catch (e: Exception) {
        if (BuildConfig.DEBUG) Log.d(TAG, "AutofillLogStore.list failed", e)
        emptyList()
    }

    /** ログを全消去する（設定画面からユーザーが明示的に実行する）。 */
    fun clearAll(context: Context) {
        try {
            helper(context).writableDatabase.delete(TABLE, null, null)
        } catch (e: Exception) {
            if (BuildConfig.DEBUG) Log.d(TAG, "AutofillLogStore.clearAll failed", e)
        }
    }

    private class DbHelper(context: Context) : SQLiteOpenHelper(context, DB_NAME, null, DB_VERSION) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                """CREATE TABLE $TABLE (
                    $COL_ID INTEGER PRIMARY KEY AUTOINCREMENT,
                    $COL_TIMESTAMP INTEGER NOT NULL,
                    $COL_TARGET TEXT,
                    $COL_IS_BROWSER INTEGER NOT NULL,
                    $COL_OUTCOME TEXT NOT NULL,
                    $COL_CANDIDATE_COUNT INTEGER NOT NULL DEFAULT 0,
                    $COL_DETECTED_FIELDS TEXT,
                    $COL_ERROR_CLASS TEXT
                )"""
            )
            db.execSQL("CREATE INDEX idx_${TABLE}_ts ON $TABLE ($COL_TIMESTAMP)")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            // 診断用ログのため互換性維持は不要。将来スキーマを変える場合は単純に作り直す。
            db.execSQL("DROP TABLE IF EXISTS $TABLE")
            onCreate(db)
        }
    }
}
