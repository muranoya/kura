import { beforeEach, describe, expect, it, vi } from 'vitest'
import { STORAGE_KEYS } from '../shared/constants'
import { getFromStorage, saveToStorage } from '../shared/storage'

const download = vi.fn()
const api_unlock = vi.fn()
const api_lock = vi.fn()
const api_unlock_with_recovery_key = vi.fn()
const api_reset_master_password_with_recovery_key = vi.fn()
const api_is_unlocked = vi.fn(() => false)

vi.mock('../background/wasm-init', () => ({
  initWasmManual: async () => ({
    api_load_vault: vi.fn(),
    api_unlock,
    api_lock,
    api_unlock_with_recovery_key,
    api_reset_master_password_with_recovery_key,
    api_get_vault_bytes: () => new Uint8Array([1, 2, 3]),
    api_encrypt_config: () => 'encrypted-config',
    api_export_dek: () => 'dek',
    api_is_unlocked,
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

const PENDING = { bytes: [1, 2, 3], etag: 'etag-a', bucket: 'kura-test', key: 'vault.json' }

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
  api_lock.mockReset()
  api_unlock_with_recovery_key.mockReset()
  api_reset_master_password_with_recovery_key.mockReset()
  api_is_unlocked.mockReset()
  api_is_unlocked.mockReturnValue(false)
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
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toEqual(PENDING)
  })

  it('Vaultを保存できなかったときは成功を返さない', async () => {
    download.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), etag: 'etag-a' })
    const send = await loadBackground()
    vi.mocked(chrome.storage.local.set).mockImplementationOnce((_items, callback) => {
      Object.assign(chrome.runtime, { lastError: { message: 'quota exceeded' } })
      callback?.()
      Object.assign(chrome.runtime, { lastError: undefined })
    })

    const response = await send({ type: 'DOWNLOAD_VAULT', s3Config: S3_CONFIG })

    expect(response.success).toBe(false)
    expect(String(response.error)).toContain('quota exceeded')
  })

  it('Vaultのないバケットを入力し直すと、前のバケットのVaultを消す', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, PENDING)
    download.mockResolvedValue(null)
    const send = await loadBackground()

    const response = await send({ type: 'DOWNLOAD_VAULT', s3Config: S3_CONFIG })

    expect(response).toEqual({ success: true, vaultExists: false })
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toBeUndefined()
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toBeUndefined()
  })

  it('アンロックに失敗してもやり直せるようにし、VAULT_BYTES には書かない', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, PENDING)
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
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, PENDING)
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

  it.each([
    ['バケット', { bucket: 'other-bucket' }],
    ['キー', { key: 'other.json' }],
    ['エンドポイント', { endpoint: 'https://other.example.com' }],
  ])('ダウンロード後に%sを変えた S3 設定では確定しない', async (_name, change) => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, PENDING)
    const send = await loadBackground()

    const response = await send({
      type: 'UNLOCK_EXISTING',
      password: 'correct',
      s3Config: { ...S3_CONFIG, ...change },
    })

    expect(response.success).toBe(false)
    expect(api_unlock).not.toHaveBeenCalled()
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toBeUndefined()
    expect(await getFromStorage(STORAGE_KEYS.S3_CONFIG)).toBeUndefined()
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toBeDefined()
  })

  // 2つのコピーを同時に持つと、Chrome の quota（10MiB）で保存できる Vault の上限が半減する
  it('VAULT_BYTES を書く前に PENDING_VAULT を消す', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, PENDING)
    download.mockResolvedValue(null)
    const send = await loadBackground()
    let pendingAtVaultWrite: unknown = 'not written'
    const set = vi.mocked(chrome.storage.local.set)
    const originalSet = set.getMockImplementation()
    set.mockImplementation((items, callback) => {
      if (STORAGE_KEYS.VAULT_BYTES in items) {
        chrome.storage.local.get([STORAGE_KEYS.PENDING_VAULT], (result) => {
          pendingAtVaultWrite = result[STORAGE_KEYS.PENDING_VAULT]
        })
      }
      originalSet?.(items, callback)
    })

    const response = await send({
      type: 'UNLOCK_EXISTING',
      password: 'correct',
      s3Config: S3_CONFIG,
    })
    set.mockImplementation(originalSet as never)

    expect(response).toEqual({ success: true })
    expect(pendingAtVaultWrite).toBeUndefined()
  })

  it('Vaultを保存できなければアンロック成功を返さず、WASMセッションも残さない', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, PENDING)
    const send = await loadBackground()
    vi.mocked(chrome.storage.local.set).mockImplementationOnce((_items, callback) => {
      Object.assign(chrome.runtime, { lastError: { message: 'quota exceeded' } })
      callback?.()
      Object.assign(chrome.runtime, { lastError: undefined })
    })
    api_is_unlocked.mockReturnValue(true)

    const response = await send({
      type: 'UNLOCK_EXISTING',
      password: 'correct',
      s3Config: S3_CONFIG,
    })

    expect(response.success).toBe(false)
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toBeUndefined()
    expect(api_lock).toHaveBeenCalled()
    const unlockedResponse = await send({ type: 'IS_UNLOCKED' })
    expect(unlockedResponse.unlocked).toBe(false)
  })

  it('リカバリーキーで開くと新しいパスワードを設定して確定する', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, PENDING)
    download.mockResolvedValue(null)
    const send = await loadBackground()

    const response = await send({
      type: 'RECOVER_EXISTING',
      recoveryKey: 'recovery-key',
      newPassword: 'new-password',
      s3Config: S3_CONFIG,
    })

    expect(response).toEqual({ success: true })
    expect(api_reset_master_password_with_recovery_key).toHaveBeenCalledWith(
      expect.anything(),
      'recovery-key',
      'new-password',
    )
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toEqual([1, 2, 3])
    expect(await getFromStorage(STORAGE_KEYS.S3_CONFIG)).toBe('encrypted-config')
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toBeUndefined()
    expect((await send({ type: 'IS_UNLOCKED' })).unlocked).toBe(true)
  })

  it('リカバリーキーが違えばやり直せるようにし、確定しない', async () => {
    await saveToStorage(STORAGE_KEYS.PENDING_VAULT, PENDING)
    api_unlock_with_recovery_key.mockImplementation(() => {
      throw new Error('invalid recovery key')
    })
    const send = await loadBackground()

    const response = await send({
      type: 'RECOVER_EXISTING',
      recoveryKey: 'wrong',
      newPassword: 'new-password',
      s3Config: S3_CONFIG,
    })

    expect(response.success).toBe(false)
    expect(await getFromStorage(STORAGE_KEYS.VAULT_BYTES)).toBeUndefined()
    expect(await getFromStorage(STORAGE_KEYS.PENDING_VAULT)).toBeDefined()
  })
})
