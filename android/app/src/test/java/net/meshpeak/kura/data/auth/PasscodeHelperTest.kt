package net.meshpeak.kura.data.auth

import net.meshpeak.kura.data.preferences.PasscodeStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.fail
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class PasscodeHelperTest {

    private class InMemoryPasscodeStore : PasscodeStore {
        var encryptedPassword: String? = null
        var iv: String? = null
        var salt: String? = null
        var failedAttempts = 0
        val attemptWrites = mutableListOf<Int>()

        override fun savePasscodeData(encryptedPassword: String, iv: String, salt: String) {
            this.encryptedPassword = encryptedPassword
            this.iv = iv
            this.salt = salt
            failedAttempts = 0
        }
        override fun getPasscodeEncryptedPassword() = encryptedPassword
        override fun getPasscodeIv() = iv
        override fun getPasscodeSalt() = salt
        override fun hasPasscodeData() = encryptedPassword != null && iv != null && salt != null
        override fun clearPasscodeData() {
            encryptedPassword = null
            iv = null
            salt = null
            failedAttempts = 0
        }
        override fun getPasscodeFailedAttempts() = failedAttempts
        override fun setPasscodeFailedAttempts(count: Int) {
            failedAttempts = count
            attemptWrites += count
        }
    }

    private val store = InMemoryPasscodeStore()
    private val helper = PasscodeHelper(store).also { it.encryptAndStore("1234", "master-pw") }

    @Test
    fun `正しいパスコードでマスターパスワードを復号し失敗回数をリセットする`() {
        assertThrowsWrong { helper.decryptPassword("0000") }
        assertEquals(1, store.failedAttempts)

        assertEquals("master-pw", helper.decryptPassword("1234"))
        assertEquals(0, store.failedAttempts)
    }

    @Test
    fun `間違えるたびに残り回数が減る`() {
        for (expectedRemaining in PasscodeHelper.MAX_FAILED_ATTEMPTS - 1 downTo 1) {
            val e = assertThrowsWrong { helper.decryptPassword("0000") }
            assertEquals(expectedRemaining, e.remainingAttempts)
        }
    }

    @Test
    fun `上限回数まで間違えるとパスコードデータが消去される`() {
        repeat(PasscodeHelper.MAX_FAILED_ATTEMPTS - 1) {
            assertThrowsWrong { helper.decryptPassword("0000") }
        }
        try {
            helper.decryptPassword("0000")
            fail("expected PasscodeLockedOutException")
        } catch (_: PasscodeLockedOutException) {
        }
        assertFalse(helper.isSetUp())
    }

    @Test
    fun `上限に達した状態が残っていれば正しいパスコードでも復号しない`() {
        // 復号中のプロセス強制終了などで加算だけが永続化された状態
        store.failedAttempts = PasscodeHelper.MAX_FAILED_ATTEMPTS
        try {
            helper.decryptPassword("1234")
            fail("expected PasscodeLockedOutException")
        } catch (_: PasscodeLockedOutException) {
        }
        assertFalse(helper.isSetUp())
    }

    @Test
    fun `失敗回数は復号を試す前に加算して保存される`() {
        helper.decryptPassword("1234")
        // 成功時も一旦1を保存してから0に戻す（復号中に強制終了されても加算が残る）
        assertEquals(listOf(1, 0), store.attemptWrites)
    }

    private fun assertThrowsWrong(block: () -> Unit): WrongPasscodeException {
        try {
            block()
        } catch (e: WrongPasscodeException) {
            return e
        }
        fail("expected WrongPasscodeException")
        throw IllegalStateException()
    }
}
