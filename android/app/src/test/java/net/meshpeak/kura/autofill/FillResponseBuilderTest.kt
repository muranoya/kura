package net.meshpeak.kura.autofill

import android.app.Application
import android.service.autofill.FillResponse
import android.view.View
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import net.meshpeak.kura.autofill.log.AutofillLogStore
import net.meshpeak.kura.autofill.model.ParsedLoginForm
import net.meshpeak.kura.data.model.AutofillCandidate
import net.meshpeak.kura.data.model.Entry
import net.meshpeak.kura.testutil.FakeVaultRepository
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * 「候補0件のとき静かに何も出さない」問題への対応の回帰テスト。
 * ログインフィールドが検出できた（＝埋める対象のAutofillIdが分かる）場合に限り、
 * ドメイン未解決/マッチ0件/例外/Dataset構築全滅のいずれでも手動検索フォールバックが
 * 提示され、[FillResponseBuilder.buildUnlocked]がnullを返さないことを確認する。
 *
 * android.service.autofill.Dataset/FillResponseはSDK上getter類が公開されていないため、
 * ここではnull/非nullの往復（＝候補が出るかどうか）を検証対象とし、Dataset内部の
 * フィールド値までは検証しない。
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class FillResponseBuilderTest {

    private val context = ApplicationProvider.getApplicationContext<Application>()

    @Before
    fun resetLogStore() {
        // buildUnlocked()はAutofillLogStoreへ副作用的に書き込む。Robolectricはテスト
        // メソッドごとに新しいApplication/データディレクトリを割り当てるため、objectシングルトンの
        // ヘルパーが前のテスト（他のテストクラス経由の間接呼び出しを含む）を持ち越さないよう破棄する。
        AutofillLogStore.resetForTest()
    }

    private fun autofillId() = View(context).autofillId!!

    private fun entry(id: String, typedValue: String = """{"username":"u","password":"p"}""") = Entry(
        id = id,
        entryType = "login",
        name = "Test Entry",
        isFavorite = false,
        updatedAt = 0,
        typedValue = typedValue
    )

    @Test
    fun `フィールド検出済みでドメイン未解決なら手動検索フォールバックを返す`() = runTest {
        val repository = FakeVaultRepository()
        val parsed = ParsedLoginForm(
            packageName = "com.unregistered.app",
            isBrowserRequest = false,
            usernameFieldId = autofillId(),
            passwordFieldId = autofillId()
        )

        val response = FillResponseBuilder.buildUnlocked(context, repository, parsed)

        assertNotNull("ドメイン未解決でもusername/passwordが分かればフォールバックを出す", response)
    }

    @Test
    fun `username・passwordとも未検出なら手動検索フォールバックを出さない`() = runTest {
        val repository = FakeVaultRepository()
        val parsed = ParsedLoginForm(
            packageName = "com.unregistered.app",
            isBrowserRequest = false,
            usernameFieldId = null,
            passwordFieldId = null,
            totpFieldId = autofillId()
        )

        val response = FillResponseBuilder.buildUnlocked(context, repository, parsed)

        assertNull("埋める対象のAutofillIdが分からない場合はフォールバックを出さない", response)
    }

    @Test
    fun `ドメイン解決済みだがマッチ0件なら手動検索フォールバックを返す`() = runTest {
        val repository = FakeVaultRepository().apply {
            listLoginCandidatesResult = emptyList()
        }
        val parsed = ParsedLoginForm(
            packageName = null,
            isBrowserRequest = true,
            webDomain = "example.com",
            usernameFieldId = autofillId(),
            passwordFieldId = autofillId()
        )

        val response = FillResponseBuilder.buildUnlocked(context, repository, parsed)

        assertNotNull(response)
    }

    @Test
    fun `listLoginCandidatesが例外を投げても手動検索フォールバックを返す`() = runTest {
        val repository = FakeVaultRepository().apply {
            listLoginCandidatesError = RuntimeException("boom")
        }
        val parsed = ParsedLoginForm(
            packageName = null,
            isBrowserRequest = true,
            webDomain = "example.com",
            usernameFieldId = autofillId(),
            passwordFieldId = autofillId()
        )

        val response = FillResponseBuilder.buildUnlocked(context, repository, parsed)

        assertNotNull(response)
    }

    @Test
    fun `候補はあるが全件getEntryに失敗したら手動検索フォールバックを返す`() = runTest {
        val repository = FakeVaultRepository().apply {
            listLoginCandidatesResult = listOf(AutofillCandidate(id = "e1", name = "Example", url = "https://example.com"))
            getEntryError = RuntimeException("decrypt failed")
        }
        val parsed = ParsedLoginForm(
            packageName = null,
            isBrowserRequest = true,
            webDomain = "example.com",
            usernameFieldId = autofillId(),
            passwordFieldId = autofillId()
        )

        val response = FillResponseBuilder.buildUnlocked(context, repository, parsed)

        assertNotNull(response)
    }

    @Test
    fun `正常にマッチした場合は候補を含むFillResponseを返す`() = runTest {
        val repository = FakeVaultRepository().apply {
            listLoginCandidatesResult = listOf(AutofillCandidate(id = "e1", name = "Example", url = "https://example.com"))
            getEntryResults = mapOf("e1" to entry("e1"))
        }
        val parsed = ParsedLoginForm(
            packageName = null,
            isBrowserRequest = true,
            webDomain = "example.com",
            usernameFieldId = autofillId(),
            passwordFieldId = autofillId()
        )

        val response: FillResponse? = FillResponseBuilder.buildUnlocked(context, repository, parsed)

        assertNotNull("マッチした候補からDatasetを構築できるはず", response)
    }
}
