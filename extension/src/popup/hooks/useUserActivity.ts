import { useEffect } from 'react'
import { sendMessage } from '../../shared/messages'

// オートロックの判定は「最後の操作」基準なので、多少早めにロックされる誤差は許容して
// Service Worker を起こす頻度を抑える
const ACTIVITY_THROTTLE_MS = 15_000

// マウスが通過しただけでロックが延びないよう、明示的な操作のみを対象にする
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel'] as const

/**
 * サイドバーでのユーザー操作を Service Worker に通知し、オートロックタイマーを延長する。
 * サイドバーは開いたままになるため、無操作が続けば開いていてもロックされる。
 */
export function useUserActivity() {
  useEffect(() => {
    let lastSentAt = 0
    const onActivity = () => {
      const now = Date.now()
      if (now - lastSentAt < ACTIVITY_THROTTLE_MS) return
      lastSentAt = now
      sendMessage({ type: 'USER_ACTIVITY' }).catch(() => {})
    }
    for (const type of ACTIVITY_EVENTS) {
      window.addEventListener(type, onActivity, { capture: true, passive: true })
    }
    return () => {
      for (const type of ACTIVITY_EVENTS) {
        window.removeEventListener(type, onActivity, { capture: true })
      }
    }
  }, [])
}
