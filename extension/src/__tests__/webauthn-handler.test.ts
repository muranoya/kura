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

describe('ritual window binding', () => {
  const candidate = {
    entry_id: 'e1',
    entry_name: 'Bank',
    custom_field_id: 'cf1',
    credential_id: 'cred-1',
    user_handle: 'uh',
    user_name: 'alice',
    user_display_name: 'Alice',
  }
  let api: WebauthnVaultApi
  let createdUrls: string[]

  beforeEach(async () => {
    api = createMockVaultApi()
    vi.mocked(api.api_webauthn_find_credentials).mockReturnValue(JSON.stringify([candidate]))
    vi.mocked(api.api_webauthn_get_assertion).mockReturnValue(
      JSON.stringify({
        credential_id: 'cred-1',
        authenticator_data: 'ad',
        signature: 'sig',
        user_handle: 'uh',
      }),
    )
    initWebauthn(
      api,
      () => true,
      async () => {},
      async () => {},
    )
    await saveToStorage(STORAGE_KEYS.APP_SETTINGS, { passkeyEnabled: true })

    createdUrls = []
    let nextWindowId = 100
    vi.mocked(chrome.windows.create).mockImplementation(((
      options: chrome.windows.CreateData,
      callback?: (win: chrome.windows.Window) => void,
    ) => {
      createdUrls.push(options.url as string)
      callback?.({ id: nextWindowId++ } as chrome.windows.Window)
    }) as unknown as typeof chrome.windows.create)
  })

  const pageSender = (tabId: number): chrome.runtime.MessageSender => ({
    id: 'test-id',
    url: 'https://bank.example/login',
    tab: { id: tabId, windowId: 1 } as chrome.tabs.Tab,
    frameId: 0,
  })

  const ritualSender = (ritualId: string, windowId: number): chrome.runtime.MessageSender => ({
    id: 'test-id',
    url: `chrome-extension://test-id/src/popup/webauthn.html?requestId=${ritualId}&kind=get`,
    tab: { id: 999, windowId } as chrome.tabs.Tab,
  })

  function startGet(tabId: number, pageRequestId: string) {
    return call(
      {
        type: 'WEBAUTHN_GET_REQUEST',
        requestId: pageRequestId,
        challenge: 'abc',
        rpId: 'bank.example',
      },
      pageSender(tabId),
    )
  }

  async function lastRitualId(): Promise<string> {
    await vi.waitFor(() => expect(createdUrls.length).toBeGreaterThan(0))
    const url = new URL(createdUrls[createdUrls.length - 1])
    return url.searchParams.get('requestId') as string
  }

  it('uses a Service Worker generated ritual id, not the page request id', async () => {
    void startGet(10, 'page-chosen-id')
    const ritualId = await lastRitualId()
    expect(ritualId).not.toBe('page-chosen-id')
    await call(
      { type: 'WEBAUTHN_RITUAL_DECISION', requestId: ritualId, cancelled: true },
      ritualSender(ritualId, 100),
    )
  })

  it('accepts ritual messages only from the window opened for that request', async () => {
    const pending = startGet(11, 'r')
    const ritualId = await lastRitualId()

    // From a content script
    expect(
      await call({ type: 'WEBAUTHN_RITUAL_GET_CONTEXT', requestId: ritualId }, pageSender(11)),
    ).toMatchObject({ success: false })
    // From the ritual page but in another window
    expect(
      await call(
        {
          type: 'WEBAUTHN_RITUAL_DECISION',
          requestId: ritualId,
          cancelled: false,
          credentialId: 'cred-1',
        },
        ritualSender(ritualId, 555),
      ),
    ).toMatchObject({ success: false })
    expect(api.api_webauthn_get_assertion).not.toHaveBeenCalled()

    // From the right window
    expect(
      await call(
        { type: 'WEBAUTHN_RITUAL_GET_CONTEXT', requestId: ritualId },
        ritualSender(ritualId, 100),
      ),
    ).toMatchObject({ success: true, context: { kind: 'get' } })
    await call(
      {
        type: 'WEBAUTHN_RITUAL_DECISION',
        requestId: ritualId,
        cancelled: false,
        credentialId: 'cred-1',
      },
      ritualSender(ritualId, 100),
    )
    expect(await pending).toMatchObject({ success: true, status: 'ok' })
  })

  it('allows only one pending ritual per tab', async () => {
    void startGet(12, 'first')
    const ritualId = await lastRitualId()

    const second = await startGet(12, 'second')
    expect(second).toMatchObject({ success: false, errorName: 'NotAllowedError' })
    expect(createdUrls).toHaveLength(1)

    await call(
      { type: 'WEBAUTHN_RITUAL_DECISION', requestId: ritualId, cancelled: true },
      ritualSender(ritualId, 100),
    )
  })
})

describe('secure context requirement', () => {
  beforeEach(async () => {
    initWebauthn(
      createMockVaultApi(),
      () => true,
      async () => {},
      async () => {},
    )
    await saveToStorage(STORAGE_KEYS.APP_SETTINGS, { passkeyEnabled: true })
  })

  it('rejects requests from http: origins', async () => {
    const result = await call(
      { type: 'WEBAUTHN_GET_REQUEST', requestId: 'r', challenge: 'abc', rpId: 'bank.example' },
      { id: 'test-id', url: 'http://legacy.bank.example/', tab, frameId: 0 },
    )
    expect(result).toMatchObject({ success: false, errorName: 'SecurityError' })
  })

  it('accepts http://localhost for local development', async () => {
    const result = await call(
      { type: 'WEBAUTHN_GET_REQUEST', requestId: 'r', challenge: 'abc', rpId: 'localhost' },
      { id: 'test-id', url: 'http://localhost:8080/', tab, frameId: 0 },
    )
    expect(result).toEqual({ success: true, status: 'passthrough' })
  })
})

describe('excludeCredentials match', () => {
  it('opens the ritual window before rejecting with InvalidStateError', async () => {
    const api = createMockVaultApi()
    vi.mocked(api.api_webauthn_find_credentials).mockReturnValue(
      JSON.stringify([{ entry_id: 'e1', credential_id: 'cred-1' }]),
    )
    initWebauthn(
      api,
      () => true,
      async () => {},
      async () => {},
    )
    await saveToStorage(STORAGE_KEYS.APP_SETTINGS, { passkeyEnabled: true })

    const urls: string[] = []
    vi.mocked(chrome.windows.create).mockImplementation(((
      options: chrome.windows.CreateData,
      callback?: (win: chrome.windows.Window) => void,
    ) => {
      urls.push(options.url as string)
      callback?.({ id: 300 } as chrome.windows.Window)
    }) as unknown as typeof chrome.windows.create)

    let settled = false
    const pending = call(
      {
        type: 'WEBAUTHN_CREATE_REQUEST',
        requestId: 'r',
        challenge: 'abc',
        rpId: 'bank.example',
        excludeCredentialIds: ['cred-1'],
      },
      { id: 'test-id', url: 'https://bank.example/register', tab: { id: 20 } as chrome.tabs.Tab },
    ).then((r) => {
      settled = true
      return r
    })

    await vi.waitFor(() => expect(urls).toHaveLength(1))
    expect(settled).toBe(false)

    const ritualId = new URL(urls[0]).searchParams.get('requestId') as string
    const ritualSender = {
      id: 'test-id',
      url: urls[0],
      tab: { id: 999, windowId: 300 } as chrome.tabs.Tab,
    }
    expect(
      await call({ type: 'WEBAUTHN_RITUAL_GET_CONTEXT', requestId: ritualId }, ritualSender),
    ).toMatchObject({ context: { kind: 'error', reason: 'already_registered' } })
    // Even a non-cancel decision cannot turn the error screen into a registration
    await call(
      { type: 'WEBAUTHN_RITUAL_DECISION', requestId: ritualId, cancelled: false },
      ritualSender,
    )
    expect(await pending).toMatchObject({ success: false, errorName: 'InvalidStateError' })
    expect(api.api_webauthn_create_credential).not.toHaveBeenCalled()
  })
})
