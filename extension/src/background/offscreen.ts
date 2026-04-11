// Offscreen Document
// Service Worker からのメッセージを受信し、clipboard 操作を実行

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CLEAR_CLIPBOARD') {
    navigator.clipboard
      .writeText('')
      .then(() => {
        sendResponse({ success: true })
      })
      .catch((error) => {
        sendResponse({ error: String(error) })
      })
    return true // 非同期レスポンス
  }

  if (message.type === 'CHECK_AND_CLEAR_CLIPBOARD') {
    const expectedText: string | null = message.expectedText ?? null
    navigator.clipboard
      .readText()
      .then((current) => {
        if (current === expectedText) {
          return navigator.clipboard.writeText('')
        }
      })
      .then(() => {
        sendResponse({ success: true })
      })
      .catch(() => {
        // readText 失敗時は安全側に倒して無条件クリア
        navigator.clipboard
          .writeText('')
          .then(() => sendResponse({ success: true }))
          .catch((error) => sendResponse({ error: String(error) }))
      })
    return true // 非同期レスポンス
  }
})

export {}
