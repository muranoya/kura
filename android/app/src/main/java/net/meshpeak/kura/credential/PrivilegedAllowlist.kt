package net.meshpeak.kura.credential

import android.content.Context

/**
 * Googleが公開する特権アプリ（ブラウザ等）の許可リスト。`CallingAppInfo.getOrigin()`に
 * 渡すことで、Webオリジンを代弁する権限を持つ呼び出し元かどうかをシステムが検証する。
 * `package_domains.json`と同じくassetsに直接バンドルし、手動で定期更新する運用とする
 * （docs/android-passkey.md 4-1、https://www.gstatic.com/gpm-passkeys-privileged-apps/apps.json）。
 */
object PrivilegedAllowlist {
    private const val ASSET_PATH = "gpm_privileged_allowlist.json"
    private const val EMPTY_ALLOWLIST = """{"apps":[]}"""

    @Volatile
    private var cache: String? = null

    fun raw(context: Context): String {
        cache?.let { return it }
        synchronized(this) {
            cache?.let { return it }
            val loaded = load(context)
            cache = loaded
            return loaded
        }
    }

    private fun load(context: Context): String = runCatching {
        context.assets.open(ASSET_PATH).bufferedReader().readText()
    }.getOrDefault(EMPTY_ALLOWLIST)
}
