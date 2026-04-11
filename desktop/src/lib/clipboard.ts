import { readText, writeText } from '@tauri-apps/plugin-clipboard-manager'
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants'
import { getFromStorage } from '../shared/storage'
import type { AppSettings } from '../shared/types'

let timeoutId: ReturnType<typeof setTimeout> | null = null
let lastCopiedText: string | null = null

/**
 * センシティブなテキストをクリップボードにコピーし、設定に応じて自動クリアタイマーを開始する。
 * タイマーは常に1つだけ（新しいコピーで前のタイマーをキャンセル）。
 * クリア前にクリップボードの内容を確認し、コピーした値と同じ場合のみクリアする。
 */
export async function copySensitive(text: string): Promise<void> {
  await writeText(text)

  if (timeoutId !== null) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  lastCopiedText = text

  const settings = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
  const clearSeconds = settings?.clipboardClearSeconds ?? DEFAULT_SETTINGS.clipboardClearSeconds

  if (clearSeconds > 0) {
    timeoutId = setTimeout(async () => {
      try {
        const current = await readText()
        if (current === lastCopiedText) {
          await writeText('')
        }
      } catch {
        // readText 失敗時は安全側に倒して無条件クリア
        try {
          await writeText('')
        } catch {
          // クリアも失敗した場合は無視
        }
      }
      lastCopiedText = null
      timeoutId = null
    }, clearSeconds * 1000)
  }
}
