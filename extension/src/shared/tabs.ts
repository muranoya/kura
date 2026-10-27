// タブ関連のヘルパー

/**
 * ユーザーが操作しているブラウザウィンドウ（通常ウィンドウ）のアクティブタブを返す。
 *
 * `currentWindow: true` は、拡張機能の画面を独立したウィンドウで開いている場合
 * （Firefox でサイドバーを開けなかったときのフォールバック）にそのウィンドウ自身を指し、
 * 拡張機能のページが返ってしまうため、通常ウィンドウに限定して探す。
 *
 * Firefox の `windows.getLastFocused` は `windowTypes` を無視してポップアップウィンドウも
 * 返すため、最後にフォーカスされたウィンドウが通常ウィンドウでなければ、通常ウィンドウの
 * アクティブタブのうち最後に表示されたものを使う。
 */
export async function queryActiveBrowserTab(): Promise<chrome.tabs.Tab | undefined> {
  const tabs = await chrome.tabs.query({ active: true, windowType: 'normal' })
  if (tabs.length <= 1) return tabs[0]
  const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'] })
  const focused = tabs.find((t) => t.windowId === win.id)
  if (focused) return focused
  return tabs.reduce((a, b) => ((b.lastAccessed ?? 0) > (a.lastAccessed ?? 0) ? b : a))
}
