import { describe, expect, it } from 'vitest'
import { isContentScript, isExtensionPage, isMessageAllowed } from '../background/sender'

const extensionPage: chrome.runtime.MessageSender = {
  id: 'test-id',
  url: 'chrome-extension://test-id/src/popup/index.html',
}
// The WebAuthn ritual window is an extension page opened as a tab
const ritualWindow: chrome.runtime.MessageSender = {
  id: 'test-id',
  url: 'chrome-extension://test-id/src/popup/webauthn.html?requestId=x',
  tab: { id: 5 } as chrome.tabs.Tab,
}
const contentScript: chrome.runtime.MessageSender = {
  id: 'test-id',
  url: 'https://evil.example/login',
  tab: { id: 7 } as chrome.tabs.Tab,
  frameId: 0,
}

describe('sender classification', () => {
  it('classifies extension pages by URL, even when they have a tab', () => {
    expect(isExtensionPage(extensionPage)).toBe(true)
    expect(isExtensionPage(ritualWindow)).toBe(true)
    expect(isContentScript(ritualWindow)).toBe(false)
  })

  it('classifies content scripts', () => {
    expect(isExtensionPage(contentScript)).toBe(false)
    expect(isContentScript(contentScript)).toBe(true)
  })

  it('rejects messages from other extensions', () => {
    expect(isMessageAllowed('LIST_ENTRIES', { ...extensionPage, id: 'other' })).toBe(false)
    expect(isMessageAllowed('AUTOFILL_GET_CREDENTIALS', { ...contentScript, id: 'other' })).toBe(
      false,
    )
  })
})

describe('isMessageAllowed', () => {
  it('allows any message from extension pages', () => {
    expect(isMessageAllowed('GET_DECRYPTED_S3_CONFIG', extensionPage)).toBe(true)
    expect(isMessageAllowed('WEBAUTHN_RITUAL_DECISION', ritualWindow)).toBe(true)
  })

  it('allows only autofill-related messages from content scripts', () => {
    expect(isMessageAllowed('AUTOFILL_GET_CREDENTIALS', contentScript)).toBe(true)
    expect(isMessageAllowed('WEBAUTHN_GET_REQUEST', contentScript)).toBe(true)
  })

  it('rejects privileged messages from content scripts', () => {
    for (const type of [
      'LIST_ENTRIES',
      'GET_ENTRY',
      'GET_DECRYPTED_S3_CONFIG',
      'CREATE_VAULT',
      'DOWNLOAD_VAULT',
      'LOGOUT',
      'SAVE_SETTINGS',
      'USER_ACTIVITY',
      'UNLOCK',
      'DEV_MODE_DRY_RUN_TAB',
      'WEBAUTHN_RITUAL_GET_CONTEXT',
      'WEBAUTHN_RITUAL_DECISION',
    ]) {
      expect(isMessageAllowed(type, contentScript), type).toBe(false)
    }
  })
})
