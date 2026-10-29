package net.meshpeak.kura

import android.content.pm.ApplicationInfo
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity

/**
 * vaultの内容やロック画面を表示する全Activityの基底クラス。リリースビルドでは
 * FLAG_SECUREにより、スクリーンショット・画面録画・最近使ったアプリのサムネイルへの露出を防ぐ。
 * オートフィル/Passkey用のActivityもマスターパスワード入力やエントリ一覧を表示するため対象とする。
 */
abstract class SecureActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val isDebuggable = applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
        if (!isDebuggable) {
            window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        }
    }
}
