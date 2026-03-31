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
})

export {}
