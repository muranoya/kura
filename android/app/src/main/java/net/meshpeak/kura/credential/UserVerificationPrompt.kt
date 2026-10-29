package net.meshpeak.kura.credential

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import net.meshpeak.kura.R

/**
 * Passkeyの操作ごとに、生体認証または端末の画面ロック（PIN等）で本人確認する。
 * 成功した場合だけauthenticatorDataのUV（User Verified）フラグを立てる。
 * vaultがアンロック済みというだけでUVを立てると、画面ロックを解除済みの端末を手にした第三者が
 * タップだけでUV付きの署名を得られ、UVを多要素認証として扱うRPを欺けてしまう。
 */
object UserVerificationPrompt {
    enum class Result {
        VERIFIED,
        /** 端末に生体認証も画面ロックも設定されていない。UVを立てずに続行する */
        UNAVAILABLE,
        CANCELED
    }

    private const val AUTHENTICATORS = BIOMETRIC_STRONG or DEVICE_CREDENTIAL

    fun show(activity: FragmentActivity, onResult: (Result) -> Unit) {
        if (BiometricManager.from(activity).canAuthenticate(AUTHENTICATORS) != BiometricManager.BIOMETRIC_SUCCESS) {
            onResult(Result.UNAVAILABLE)
            return
        }
        val prompt = BiometricPrompt(
            activity,
            ContextCompat.getMainExecutor(activity),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    onResult(Result.VERIFIED)
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onResult(Result.CANCELED)
                }
            }
        )
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(activity.getString(R.string.app_name))
            .setSubtitle(activity.getString(R.string.passkey_user_verification_prompt))
            .setAllowedAuthenticators(AUTHENTICATORS)
            .build()
        prompt.authenticate(promptInfo)
    }
}
