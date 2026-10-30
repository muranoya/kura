// Offscreen Document
// Service Worker からのメッセージを受信し、clipboard 操作を実行
//
// offscreen document はフォーカスを持たないため、navigator.clipboard（非同期
// Clipboard API）は "Document is not focused" で失敗する。clipboardRead /
// clipboardWrite 権限で使える document.execCommand で読み書きする。

import { hashClipboardText } from '../shared/clipboard-hash'

/** クリップボードのテキストを読む。読めなければ null */
function readClipboard(): string | null {
  const textarea = document.createElement('textarea')
  document.body.appendChild(textarea)
  textarea.focus()
  const ok = document.execCommand('paste')
  const text = textarea.value
  textarea.remove()
  return ok ? text : null
}

/** クリップボードを空文字列で上書きする */
function clearClipboard(): boolean {
  const onCopy = (e: ClipboardEvent) => {
    e.clipboardData?.setData('text/plain', '')
    e.preventDefault()
  }
  document.addEventListener('copy', onCopy)
  try {
    return document.execCommand('copy')
  } finally {
    document.removeEventListener('copy', onCopy)
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_AND_CLEAR_CLIPBOARD') {
    const expectedHash: string = message.expectedHash
    const current = readClipboard()
    // 読めなければ安全側に倒して無条件クリア
    const matches =
      current === null
        ? Promise.resolve(true)
        : hashClipboardText(current).then((h) => h === expectedHash)
    matches
      .then((shouldClear) => {
        sendResponse({ success: !shouldClear || clearClipboard() })
      })
      .catch((error) => sendResponse({ success: false, error: String(error) }))
    return true // 非同期レスポンス
  }
})
