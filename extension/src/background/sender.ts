// Classification of runtime.onMessage senders.
//
// Content scripts run inside web page renderer processes (on every site and
// frame, see manifest `<all_urls>` / `all_frames`), so they are the least
// trusted senders: a compromised renderer can send arbitrary messages as its
// content script. Privileged operations must only be reachable from the
// extension's own pages (sidebar, ritual window, ...).

/**
 * Message sent from one of this extension's own pages. Decided by URL, not by
 * the absence of `sender.tab`: the WebAuthn ritual window and the Firefox
 * fallback popup are extension pages opened as tabs, so they carry `tab`.
 */
export function isExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(chrome.runtime.getURL(''))
  )
}

/** Message sent from this extension's content script running in a web page. */
export function isContentScript(sender: chrome.runtime.MessageSender): boolean {
  return sender.id === chrome.runtime.id && sender.tab?.id != null && !isExtensionPage(sender)
}

/** Message types content scripts are allowed to send. Everything else is extension-page only. */
const CONTENT_SCRIPT_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  'AUTOFILL_GET_CREDENTIALS',
  'AUTOFILL_FILL_REQUEST',
  'AUTOFILL_GET_TOTP',
  'AUTOFILL_GET_TOTP_CANDIDATES',
  'AUTOFILL_PENDING_FLOW_STORE',
  'AUTOFILL_PENDING_FLOW_QUERY',
  'AUTOFILL_SAVE_CAPTURED',
  'AUTOFILL_OPEN_SIDEBAR',
  'GENERATE_PASSWORD',
  'CLIPBOARD_COPIED',
  'TOTP_QR_CAPTURE',
  'TOTP_QR_APPLY',
  'TOTP_QR_CANCEL',
  'PICKER_RESULT',
  'PICKER_CANCEL',
  'WEBAUTHN_CREATE_REQUEST',
  'WEBAUTHN_GET_REQUEST',
])

/** Whether `sender` may send a message of `type` to the Service Worker. */
export function isMessageAllowed(type: unknown, sender: chrome.runtime.MessageSender): boolean {
  if (isExtensionPage(sender)) return true
  return (
    typeof type === 'string' && CONTENT_SCRIPT_MESSAGE_TYPES.has(type) && isContentScript(sender)
  )
}
