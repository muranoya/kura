/**
 * センシティブなテキストをクリップボードにコピーし、
 * Service Worker にクリップボードクリアタイマーの開始を通知する。
 */
export async function copySensitive(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
  chrome.runtime.sendMessage({ type: 'CLIPBOARD_COPIED', text })
}
