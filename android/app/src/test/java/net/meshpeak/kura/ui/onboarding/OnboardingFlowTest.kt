package net.meshpeak.kura.ui.onboarding

import android.app.Application
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.test.core.app.ApplicationProvider
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import net.meshpeak.kura.data.auth.BiometricHelper
import net.meshpeak.kura.testutil.FakePreferencesManager
import net.meshpeak.kura.testutil.FakeVaultRepository
import net.meshpeak.kura.ui.navigation.OnboardingNavHost
import net.meshpeak.kura.viewmodel.AppViewModel
import net.meshpeak.kura.viewmodel.AppState
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class OnboardingFlowTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var fakeRepository: FakeVaultRepository
    private lateinit var fakePreferences: FakePreferencesManager
    private lateinit var appViewModel: AppViewModel

    private val testDispatcher = UnconfinedTestDispatcher()

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        fakeRepository = FakeVaultRepository()
        fakePreferences = FakePreferencesManager()
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): AppViewModel {
        val app = ApplicationProvider.getApplicationContext<Application>()
        val fakeBiometricHelper = mockk<BiometricHelper>(relaxed = true)
        appViewModel = AppViewModel(app, fakeRepository, fakePreferences, fakeBiometricHelper)
        return appViewModel
    }

    private fun launchOnboarding() {
        val vm = createViewModel()
        composeTestRule.setContent {
            OnboardingNavHost(vm)
        }
    }

    // ========================================================================
    // Welcome画面
    // ========================================================================

    @Test
    fun `welcome screen displays app title and start button`() {
        launchOnboarding()

        composeTestRule.onNodeWithText("kura").assertIsDisplayed()
        composeTestRule.onNodeWithTag("start_button").assertIsDisplayed()
    }

    @Test
    fun `start button is disabled until terms checkbox is checked`() {
        launchOnboarding()

        composeTestRule.onNodeWithTag("start_button").assertIsNotEnabled()

        composeTestRule.onNodeWithTag("terms_checkbox").performClick()

        composeTestRule.onNodeWithTag("start_button").assertIsEnabled()
    }

    @Test
    fun `clicking start navigates to storage setup`() {
        launchOnboarding()

        composeTestRule.onNodeWithTag("terms_checkbox").performClick()
        composeTestRule.onNodeWithTag("start_button").performClick()

        composeTestRule.onNodeWithText("ストレージ設定").assertIsDisplayed()
    }

    // ========================================================================
    // StorageSetup画面 - バリデーション
    // ========================================================================

    private fun navigateToStorageSetup() {
        launchOnboarding()
        composeTestRule.onNodeWithTag("terms_checkbox").performClick()
        composeTestRule.onNodeWithTag("start_button").performClick()
        composeTestRule.waitForIdle()
    }

    @Test
    fun `storage setup shows error when required fields are empty`() {
        navigateToStorageSetup()

        composeTestRule.onNodeWithTag("storage_next_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("すべての必須フィールドを入力してください").assertExists()
    }

    @Test
    fun `storage setup shows error on S3 connection failure`() {
        fakeRepository.downloadVaultError = RuntimeException("Connection refused")
        navigateToStorageSetup()

        fillStorageForm()
        composeTestRule.onNodeWithTag("storage_next_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("ストレージへのアクセスに失敗しました", substring = true).assertExists()
    }

    // ========================================================================
    // StorageSetup画面 - 分岐
    // ========================================================================

    @Test
    fun `navigates to master password when no vault exists`() {
        fakeRepository.downloadVaultResult = false
        navigateToStorageSetup()

        fillStorageForm()
        composeTestRule.onNodeWithTag("storage_next_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("master_password_input").assertExists()
    }

    @Test
    fun `navigates to unlock existing vault when vault exists`() {
        fakeRepository.downloadVaultResult = true
        navigateToStorageSetup()

        fillStorageForm()
        composeTestRule.onNodeWithTag("storage_next_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("既存Vaultのアンロック").assertExists()
    }

    // ========================================================================
    // MasterPassword画面 - バリデーション
    // ========================================================================

    private fun navigateToMasterPassword() {
        fakeRepository.downloadVaultResult = false
        navigateToStorageSetup()
        fillStorageForm()
        composeTestRule.onNodeWithTag("storage_next_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()
    }

    @Test
    fun `master password shows error for password less than 8 characters`() {
        navigateToMasterPassword()

        composeTestRule.onNodeWithTag("master_password_input").performTextInput("short")
        composeTestRule.onNodeWithTag("confirm_password_input").performTextInput("short")
        composeTestRule.onNodeWithTag("create_vault_button").performClick()

        composeTestRule.onNodeWithText("パスワードは8文字以上必要です").assertExists()
    }

    @Test
    fun `master password shows error when passwords do not match`() {
        navigateToMasterPassword()

        composeTestRule.onNodeWithTag("master_password_input").performTextInput("password123")
        composeTestRule.onNodeWithTag("confirm_password_input").performTextInput("different123")
        composeTestRule.onNodeWithTag("create_vault_button").performClick()

        composeTestRule.onNodeWithText("パスワードが一致しません").assertExists()
    }

    // ========================================================================
    // MasterPassword画面 - vault作成
    // ========================================================================

    @Test
    fun `successful vault creation navigates to recovery key screen`() {
        fakeRepository.createVaultResult = "test-recovery-key-ABCDEF"
        navigateToMasterPassword()

        composeTestRule.onNodeWithTag("master_password_input").performTextInput("password123")
        composeTestRule.onNodeWithTag("confirm_password_input").performTextInput("password123")
        composeTestRule.onNodeWithTag("create_vault_button").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("リカバリーキー").assertExists()
        composeTestRule.onNodeWithTag("recovery_key_text").assertTextEquals("test-recovery-key-ABCDEF")
    }

    @Test
    fun `vault creation failure shows error`() {
        fakeRepository.createVaultError = RuntimeException("Creation failed")
        navigateToMasterPassword()

        composeTestRule.onNodeWithTag("master_password_input").performTextInput("password123")
        composeTestRule.onNodeWithTag("confirm_password_input").performTextInput("password123")
        composeTestRule.onNodeWithTag("create_vault_button").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Vault作成に失敗しました", substring = true).assertExists()
    }

    // ========================================================================
    // RecoveryKey画面
    // ========================================================================

    private fun navigateToRecoveryKey() {
        fakeRepository.createVaultResult = "recovery-key-XYZ-123"
        navigateToMasterPassword()

        composeTestRule.onNodeWithTag("master_password_input").performTextInput("password123")
        composeTestRule.onNodeWithTag("confirm_password_input").performTextInput("password123")
        composeTestRule.onNodeWithTag("create_vault_button").performClick()
        composeTestRule.waitForIdle()
    }

    @Test
    fun `recovery key screen displays the recovery key`() {
        navigateToRecoveryKey()

        composeTestRule.onNodeWithTag("recovery_key_text").assertTextEquals("recovery-key-XYZ-123")
    }

    @Test
    fun `recovery key complete button triggers sync`() {
        navigateToRecoveryKey()

        composeTestRule.onNodeWithTag("complete_button").performClick()
        composeTestRule.waitForIdle()
    }

    // ========================================================================
    // UnlockExistingVault画面
    // ========================================================================

    private fun navigateToUnlockExisting() {
        fakeRepository.downloadVaultResult = true
        navigateToStorageSetup()
        fillStorageForm()
        composeTestRule.onNodeWithTag("storage_next_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()
    }

    @Test
    fun `unlock shows error for empty password`() {
        navigateToUnlockExisting()

        composeTestRule.onNodeWithTag("unlock_button").performClick()

        composeTestRule.onNodeWithText("パスワードを入力してください").assertExists()
    }

    @Test
    fun `unlock shows error for wrong password`() {
        fakeRepository.unlockError = RuntimeException("Wrong password")
        navigateToUnlockExisting()

        composeTestRule.onNodeWithTag("unlock_password_input").performTextInput("wrongpassword")
        composeTestRule.onNodeWithTag("unlock_button").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("アンロックに失敗しました", substring = true).assertExists()
    }

    @Test
    fun `unlock succeeds with correct password`() {
        fakeRepository.unlockError = null
        navigateToUnlockExisting()

        composeTestRule.onNodeWithTag("unlock_password_input").performTextInput("correctpassword")
        composeTestRule.onNodeWithTag("unlock_button").performClick()
        composeTestRule.waitForIdle()

        assertEquals(AppState.UNLOCKED, appViewModel.appState.value)
    }

    // ========================================================================
    // 戻るナビゲーション
    // ========================================================================

    @Test
    fun `storage setup back button returns to welcome`() {
        navigateToStorageSetup()

        composeTestRule.onNodeWithTag("storage_back_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("kura").assertExists()
        composeTestRule.onNodeWithTag("start_button").assertExists()
    }

    @Test
    fun `master password back button returns to storage setup`() {
        navigateToMasterPassword()

        composeTestRule.onNodeWithTag("password_back_button").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("ストレージ設定").assertExists()
    }

    @Test
    fun `unlock existing back button returns to storage setup`() {
        navigateToUnlockExisting()

        composeTestRule.onNodeWithTag("unlock_back_button").performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("ストレージ設定").assertExists()
    }

    // ========================================================================
    // フルフロー
    // ========================================================================

    @Test
    fun `full new vault flow - welcome to recovery key`() {
        fakeRepository.downloadVaultResult = false
        fakeRepository.createVaultResult = "full-flow-recovery-key"
        launchOnboarding()

        // Welcome
        composeTestRule.onNodeWithTag("terms_checkbox").performClick()
        composeTestRule.onNodeWithTag("start_button").performClick()
        composeTestRule.waitForIdle()

        // StorageSetup
        fillStorageForm()
        composeTestRule.onNodeWithTag("storage_next_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        // MasterPassword
        composeTestRule.onNodeWithTag("master_password_input").performTextInput("mypassword123")
        composeTestRule.onNodeWithTag("confirm_password_input").performTextInput("mypassword123")
        composeTestRule.onNodeWithTag("create_vault_button").performClick()
        composeTestRule.waitForIdle()

        // RecoveryKey
        composeTestRule.onNodeWithTag("recovery_key_text").assertTextEquals("full-flow-recovery-key")
        composeTestRule.onNodeWithTag("complete_button").assertExists()
    }

    @Test
    fun `full existing vault flow - welcome to unlock`() {
        fakeRepository.downloadVaultResult = true
        fakeRepository.unlockError = null
        launchOnboarding()

        // Welcome
        composeTestRule.onNodeWithTag("terms_checkbox").performClick()
        composeTestRule.onNodeWithTag("start_button").performClick()
        composeTestRule.waitForIdle()

        // StorageSetup
        fillStorageForm()
        composeTestRule.onNodeWithTag("storage_next_button").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        // UnlockExistingVault
        composeTestRule.onNodeWithText("既存Vaultのアンロック").assertExists()
        composeTestRule.onNodeWithTag("unlock_password_input").performTextInput("mypassword123")
        composeTestRule.onNodeWithTag("unlock_button").performClick()
        composeTestRule.waitForIdle()

        // After successful unlock, AppState changes to UNLOCKED
        assertEquals(AppState.UNLOCKED, appViewModel.appState.value)
    }

    // ========================================================================
    // Helper methods
    // ========================================================================

    private fun fillStorageForm() {
        composeTestRule.onNodeWithTag("region_input").performScrollTo().performTextInput("ap-northeast-1")
        composeTestRule.onNodeWithTag("bucket_input").performScrollTo().performTextInput("my-vault")
        composeTestRule.onNodeWithTag("access_key_input").performScrollTo().performTextInput("AKIAIOSFODNN7EXAMPLE")
        composeTestRule.onNodeWithTag("secret_key_input").performScrollTo().performTextInput("secret-key-example")
    }
}
