package net.meshpeak.kura.util

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.os.Build
import android.os.PersistableBundle
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * クリップボードにテキストをコピーし、指定秒数後に自動クリアするシングルトン。
 * タイマーは常に1つだけ（新しいコピーで前のタイマーをキャンセル）。
 * クリア前にクリップボードの内容を確認し、コピーした値と同じ場合のみクリアする。
 */
object ClipboardUtil {
    private var clearJob: Job? = null
    private var lastCopiedText: String? = null

    /**
     * クリップボードにテキストをコピーし、指定秒数後に自動クリアする。
     * Android 13+ではクリップボード内容をセンシティブとしてマークする。
     *
     * @param context Android Context
     * @param label クリップボードラベル
     * @param text コピーするテキスト
     * @param clearSeconds 自動クリアまでの秒数（0で無効）
     * @param scope クリアタイマー用のCoroutineScope
     * @param isSensitive trueの場合、Android 13+でEXTRA_IS_SENSITIVEを設定
     */
    fun copyToClipboard(
        context: Context,
        label: String,
        text: String,
        clearSeconds: Int,
        scope: CoroutineScope,
        isSensitive: Boolean = true,
    ) {
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        if (isSensitive && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            clip.description.extras = PersistableBundle().apply {
                putBoolean("android.content.extra.IS_SENSITIVE", true)
            }
        }
        clipboard.setPrimaryClip(clip)

        clearJob?.cancel()
        lastCopiedText = text

        if (clearSeconds > 0) {
            clearJob = scope.launch {
                delay(clearSeconds * 1000L)
                val current = clipboard.primaryClip?.getItemAt(0)?.text?.toString()
                if (current == null || current == lastCopiedText) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                        clipboard.clearPrimaryClip()
                    } else {
                        clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
                    }
                }
                lastCopiedText = null
            }
        }
    }
}
