import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../shared/constants'
import { getFromStorage, saveToStorage } from '../shared/storage'

const download = vi.fn()
const api_unlock = vi.fn()

vi.mock('../background/wasm-init', () => ({
  initWasmManual: async () => ({
    api_load_vault: vi.fn(),
    api_unlock,
    api_get_vault_bytes: () => new Uint8Array([1, 2, 3]),
    api_encrypt_config: () => 'encrypted-config',
    api_export_dek: () => 'dek',
    api_is_unlocked: () => false,
  }),
}))
vi.mock('../shared/s3-client', () => ({
  ConflictError: class extends Error {},
  VaultS3Client: class {
    download = download
    destroy = vi.fn()
  },
}))
vi.mock('../background/autofill', () => ({
  cleanupPendingFlow: vi.fn(),
  getMatchedEntryIdsForUrl: vi.fn(),
  handleAutofillMessage: vi.fn(),
  initAutofill: vi.fn(),
  onVaultLocked: vi.fn(),
  onVaultUnlocked: vi.fn(),
}))
vi.mock('../background/picker', () => ({
  clearPickerContext: vi.fn(),
  handlePickerMessage: vi.fn(),
  initPicker: vi.fn(),
}))
vi.mock('../background/sidebar', () => ({ initSidebar: vi.fn(), openSidebar: vi.fn() }))
vi.mock('../background/totp-qr-scan', () => ({
  clearTotpQrScanContext: vi.fn(),
  handleTotpQrMessage: vi.fn(),
  initTotpQrScan: vi.fn(),
}))
vi.mock('../background/webauthn', () => ({
  handleWebauthnMessage: vi.fn(),
  initWebauthn: vi.fn(),
  resumeLockedWebauthnRituals: vi.fn(),
}))

const S3_CONFIG = {
  region: 'us-east-1',
  bucket: 'kura-test',
  key: 'vault.json',
  accessKeyId: 'AKIATEST',
  secretAccessKey: 'secret123',
}

type Listener = (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: Record<string, unknown>) => void,
) => void

// Service Worker のモジュール状態が残らないよう、テストごとに読み込み直す
async function loadBackground() {
  const addListener = vi.mocked(chrome.runtime.onMessage.addListener)
  addListener.mockClear()
  vi.resetModules()
  await import('../background/index')
  const listener = addListener.mock.calls[0][0] as unknown as Listener
  return (message: unknown) =>
    new Promise<Record<string, unknown>>((resolve) => {
      listener(
        message,
        { id: chrome.runtime.id, url: chrome.runtime.getURL('popup.html') },
        resolve,
      )
    })
}

beforeEach(() => {
  download.mockReset()
  api_unlock.mockReset()
  const event = { addListener: vi.fn() }
  Object.assign(chrome, {
    action: { setIcon: vi.fn() },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(),
      get: vi.fn(),
      onAlarm: event,
    },
  })
  Object.assign(chrome.runtime, { onInstalled: event, onStartup: event })
})

describe('初期設定中の既存Vault', () => {
  it('ダウンロードしただけでは VAULT_BYTES に書かない', async () => {
    download.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), etag: 'etag-a' })
    const send = await loadBackground()

    const response = await send({ type: 'DOWNLOAD_VAULT', s3Config: S3_CONFIG })

    expect(response).toEqual({ success: true, vaultExists: true })
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toBeUndefined()
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toEqual({
      bytes: [1, 2, 3],
      etag: 'etag-a',
    })
  })

  it('Vaultのないバケットを入力し直すと、前のバケットのVaultを消す', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, { bytes: [1, 2, 3], etag: 'etag-a' })
    download.mockResolvedValue(null)
    const send = await loadBackground()

    const response = await send({ type: 'DOWNLOAD_VAULT', s3Config: S3_CONFIG })

    expect(response).toEqual({ success: true, vaultExists: false })
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toBeUndefined()
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toBeUndefined()
  })

  it('アンロックに失敗してもやり直せるようにし、VAULT_BYTES には書かない', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, { bytes: [1, 2, 3], etag: 'etag-a' })
    api_unlock.mockImplementation(() => {
      throw new Error('wrong password')
    })
    const send = await loadBackground()

    const response = await send({
      type: 'UNLOCK_EXISTING',
      password: 'wrong',
      s3Config: S3_CONFIG,
    })

    expect(response.success).toBe(false)
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toBeUndefined()
    expect(await getFromStorage(STORAGE_KEYS.S3_CONFIG)).toBeUndefined()
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toBeDefined()
  })

  it('アンロックに成功すると Vault を S3 設定とともに確定する', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, { bytes: [1, 2, 3], etag: 'etag-a' })
    download.mockResolvedValue(null)
    const send = await loadBackground()

    const response = await send({
      type: 'UNLOCK_EXISTING',
      password: 'correct',
      s3Config: S3_CONFIG,
    })

    expect(response).toEqual({ success: true })
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toEqual([1, 2, 3])
    expect(await getFromStorage(STORAGE_KEYS.VAULT_ETAG)).toBe('etag-a')
    expect(await getFromStorage(STORAGE_KEYS.S3_CONFIG)).toBe('encrypted-config')
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toBeUndefined()
  })
})
