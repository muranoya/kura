import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleWebauthnMessage, initWebauthn, type WebauthnVaultApi } from '../background/webauthn'
import { STORAGE_KEYS } from '../shared/constants'
import { saveToStorage } from '../shared/storage'

function createMockVaultApi(): WebauthnVaultApi {
  return {
    api_webauthn_find_credentials: vi.fn(() => '[]'),
    api_webauthn_create_credential: vi.fn(() => '{}'),
    api_webauthn_get_assertion: vi.fn(() => '{}'),
    api_list_login_candidates: vi.fn(() => '[]'),
  }
}

function call(
  message: Record<string, unknown>,
  sender: chrome.runtime.MessageSender,
): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    handleWebauthnMessage(message, sender, resolve)
  })
}

const tab = { id: 1, windowId: 1 } as chrome.tabs.Tab

describe('handleWebauthnMessage origin handling', () => {
  let api: WebauthnVaultApi

  beforeEach(async () => {
    api = createMockVaultApi()
    initWebauthn(
      api,
      () => true,
      async () => {},
      async () => {},
    )
    await saveToStorage(STORAGE_KEYS.APP_SETTINGS, { passkeyEnabled: true })
  })

  it('validates rp_id against the sender origin, ignoring origin/hostname in the payload', async () => {
    const result = await call(
      {
        type: 'WEBAUTHN_GET_REQUEST',
        requestId: 'r1',
        challenge: 'abc',
        rpId: 'bank.example',
        origin: 'https://bank.example',
        hostname: 'bank.example',
      },
      { id: 'test-id', url: 'https://evil.example/login', tab, frameId: 0 },
    )
    expect(result).toMatchObject({ success: false, errorName: 'SecurityError' })
    expect(api.api_webauthn_find_credentials).not.toHaveBeenCalled()
  })

  it('rejects requests from opaque (sandboxed) origins', async () => {
    const result = await call(
      { type: 'WEBAUTHN_GET_REQUEST', requestId: 'r2', challenge: 'abc', rpId: 'bank.example' },
      {
        id: 'test-id',
        url: 'https://bank.example/user-content',
        origin: 'null',
        tab,
        frameId: 0,
      },
    )
    expect(result).toMatchObject({ success: false, errorName: 'SecurityError' })
  })

  it('looks up credentials for a request whose rp_id matches the sender origin', async () => {
    const result = await call(
      { type: 'WEBAUTHN_GET_REQUEST', requestId: 'r3', challenge: 'abc', rpId: 'bank.example' },
      { id: 'test-id', url: 'https://login.bank.example/', tab, frameId: 0 },
    )
    // No credentials in the mock vault → passthrough to the native implementation
    expect(result).toEqual({ success: true, status: 'passthrough' })
    expect(api.api_webauthn_find_credentials).toHaveBeenCalledWith('default', 'bank.example', [])
  })
})
