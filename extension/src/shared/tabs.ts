// タブ関連のヘルパー

/**
 * ユーザーが操作しているブラウザウィンドウ（通常ウィンドウ）のアクティブタブを返す。
 *
 * `currentWindow: true` は、拡張機能の画面を独立したウィンドウで開いている場合
 * （Firefox でサイドバーを開けなかったときのフォールバック）にそのウィンドウ自身を指し、
 * 拡張機能のページが返ってしまうため、通常ウィンドウに限定して探す。
 */
export async function queryActiveBrowserTab(): Promise<chrome.tabs.Tab | undefined> {
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] })
  if (win.id == null) return undefined
  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id })
  return tab
}
