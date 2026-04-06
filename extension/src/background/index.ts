// Service Worker エントリーポイント
// WASM の初期化とメッセージハンドラーのセットアップ

import { DEFAULT_VAULT_ID, STORAGE_KEYS } from '../shared/constants'
import { ConflictError, VaultS3Client } from '../shared/s3-client'
import {
  getFromSessionStorage,
  getFromStorage,
  removeFromSessionStorage,
  saveToSessionStorage,
  saveToStorage,
} from '../shared/storage'
import type { S3Config } from '../shared/types'
import {
  cleanupPendingFlow,
  handleAutofillMessage,
  initAutofill,
  onVaultLocked,
  onVaultUnlocked,
} from './autofill'
import { initWasmManual } from './wasm-init'

/** WASM API surface for Service Worker */
interface WasmApi {
  api_create_new_vault(vaultId: string, masterPassword: string): string
  api_load_vault(vaultId: string, vaultBytes: Uint8Array, etag: string): void
  api_unlock(vaultId: string, masterPassword: string): boolean
  api_unlock_with_recovery_key(vaultId: string, recoveryKey: string): void
  api_lock(vaultId: string): Uint8Array
  api_get_vault_bytes(vaultId: string): Uint8Array
  api_get_vault_etag(vaultId: string): string | null
  api_is_unlocked(vaultId: string): boolean
  api_merge_remote_vault(vaultId: string, remoteBytes: Uint8Array, remoteEtag: string): void
  api_update_etag(vaultId: string, etag: string): void
  api_list_entries(
    vaultId: string,
    searchQuery: string | null,
    type: string | null,
    labelId: string | null,
    includeTrash: boolean,
    onlyFavorites: boolean,
    sortField: string | null,
    sortOrder: string | null,
  ): string
  api_get_entry(vaultId: string, id: string): string
  api_create_entry(
    vaultId: string,
    entryType: string,
    name: string,
    notes: string | null,
    typedValueJson: string,
    labelIds: string[],
    customFieldsJson: string | null,
  ): string
  api_update_entry(
    vaultId: string,
    id: string,
    name: string,
    notes: string | null,
    typedValueJson: string,
    labelIds: string[],
    customFieldsJson: string | null,
  ): void
  api_delete_entry(vaultId: string, id: string): void
  api_restore_entry(vaultId: string, id: string): void
  api_purge_entry(vaultId: string, id: string): void
  api_set_favorite(vaultId: string, id: string, isFavorite: boolean): void
  api_list_login_urls(vaultId: string): string
  api_list_labels(vaultId: string): string
  api_create_label(vaultId: string, name: string): string
  api_delete_label(vaultId: string, id: string): void
  api_rename_label(vaultId: string, id: string, newName: string): void
  api_set_entry_labels(vaultId: string, entryId: string, labelIds: string[]): void
  api_generate_password(
    length: number,
    includeLowercase: boolean,
    includeUppercase: boolean,
    includeNumbers: boolean,
    includeSymbols1: boolean,
    includeSymbols2: boolean,
    includeSymbols3: boolean,
  ): string
  api_generate_totp_default(secret: string): string
  api_generate_totp_from_value(value: string): string
  api_parse_totp_period(value: string): number
  api_change_master_password(vaultId: string, oldPassword: string, newPassword: string): void
  api_rotate_dek(vaultId: string, password: string): string
  api_regenerate_recovery_key(vaultId: string, password: string): string
  api_encrypt_config(vaultId: string, password: string, plaintext: string): string
  api_decrypt_config(vaultId: string, password: string, encryptedB64: string): string
  api_encrypt_transfer_config(password: string, configJson: string): string
  api_decrypt_transfer_config(password: string, transferString: string): string
  [key: string]: unknown
}

let vault: WasmApi = null as unknown as WasmApi

let wasmInitialized = false
let unlocked = false
let popupConnected = false
let decryptedS3Config: S3Config | null = null

function updateExtensionIcon(isUnlocked: boolean) {
  const prefix = isUnlocked ? 'unlocked' : 'locked'
  chrome.action.setIcon({
    path: {
      16: `icons/${prefix}-16.png`,
      48: `icons/${prefix}-48.png`,
      128: `icons/${prefix}-128.png`,
    },
  })
}

// WASM 初期化関数（手動 fetch + instantiate で top-level await を回避）
async function initWasm() {
  if (wasmInitialized) return
  try {
    vault = (await initWasmManual()) as unknown as WasmApi
    wasmInitialized = true
  } catch (error) {
    console.error('[SW] WASM initialization error:', error)
    throw error
  }
}

// ========== メッセージハンドラーのセットアップ ==========

function setupMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log(
      '[SW] onMessage received:',
      message.type,
      'from:',
      sender.url?.substring(0, 60) || sender.id,
    )
    // async 処理を fire-and-forget で実行し、Promise で sendResponse を呼ぶ
    handleMessage(message, sender, sendResponse)
      .then(() => {
        console.log('[SW] handleMessage completed for:', message.type)
      })
      .catch((err) => {
        console.error('[SW] Unhandled error in message handler:', message.type, err)
        try {
          sendResponse({ success: false, error: String(err) })
        } catch (e) {
          console.error('[SW] Failed to send error response:', e)
        }
      })
    return true // 非同期レスポンスを許可
  })
}

// メッセージハンドラーを最初に登録（スクリプト読み込み時）
setupMessageHandlers()

// ポップアップの接続/切断を検知してオートロックを管理
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'popup') return
  popupConnected = true
  chrome.alarms.clear('autolock')

  port.onDisconnect.addListener(async () => {
    popupConnected = false
    if (!unlocked) return
    const settings = await loadSettings()
    if (settings.autolockMinutes > 0) {
      chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
    }
  })
})

// Service Worker 起動時に初期化
self.addEventListener('install', (event: Event) => {
  ;(event as unknown as { waitUntil(p: Promise<unknown>): void }).waitUntil(initWasm())
})

self.addEventListener('activate', (event: Event) => {
  ;(event as unknown as { waitUntil(p: Promise<unknown>): void }).waitUntil(
    initWasm().then(() => {
      updateExtensionIcon(false)
    }),
  )
})

// アラームリスナーはトップレベルで登録（SW再起動時にも確実に登録されるようにする）
setupAlarms()

// Autofill の初期化（vault はプロキシ経由でlazy参照）
initAutofill(
  new Proxy({} as WasmApi, {
    get: (_target, prop) => (vault as unknown as Record<string | symbol, unknown>)[prop],
  }),
  () => unlocked,
)

// Clean up pending login flows when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupPendingFlow(tabId)
})

// ========== ヘルパー関数 ==========

/**
 * camelCase への正規化（WASM からの snake_case → camelCase）
 */
function normalizeEntry(raw: Record<string, unknown>): Record<string, unknown> {
  if (!raw) return raw
  return {
    id: raw.id,
    entryType: raw.entry_type,
    name: raw.name,
    subtitle: raw.subtitle ?? null,
    isFavorite: raw.is_favorite ?? false,
    createdAt: raw.created_at ?? 0,
    updatedAt: raw.updated_at ?? 0,
    deletedAt: raw.deleted_at ?? null,
    notes: raw.notes ?? null,
    typedValue: raw.typed_value ?? {},
    labels: raw.labels ?? raw.label_ids ?? [],
    customFields: ((raw.custom_fields as Record<string, unknown>[] | undefined) ?? []).map(
      (f: Record<string, unknown>) => ({
        id: f.id,
        name: f.name,
        fieldType: f.field_type,
        value: f.value,
      }),
    ),
  }
}

/**
 * 配列エントリを正規化（normalizeEntry を各要素に適用）
 */
function normalizeEntries(entries: Record<string, unknown>[]): Record<string, unknown>[] {
  return (entries ?? []).map(normalizeEntry)
}

/** 同期中フラグ（並行実行を防止） */
let syncing = false

const MAX_SYNC_RETRIES = 5

/**
 * S3との同期（ダウンロード→マージ→アップロード、リトライ付き）
 */
async function syncWithS3(s3Config: S3Config): Promise<void> {
  const client = new VaultS3Client(s3Config)
  try {
    for (let attempt = 0; attempt < MAX_SYNC_RETRIES; attempt++) {
      const remote = await client.download()

      if (!remote) {
        // リモートに存在しない → ローカルをアップロード
        const bytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
        const etag = vault.api_get_vault_etag(DEFAULT_VAULT_ID)
        const newEtag = await client.upload(bytes, etag)
        vault.api_update_etag(DEFAULT_VAULT_ID, newEtag)
        return
      }

      // リモート存在 → Rust側でマージ（復号→auto_merge→GC→セッション更新）
      vault.api_merge_remote_vault(DEFAULT_VAULT_ID, remote.bytes, remote.etag)

      // マージ済みvaultをアップロード
      const mergedBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
      const currentEtag = vault.api_get_vault_etag(DEFAULT_VAULT_ID)

      try {
        const newEtag = await client.upload(mergedBytes, currentEtag)
        vault.api_update_etag(DEFAULT_VAULT_ID, newEtag)
        return
      } catch (err) {
        if (err instanceof ConflictError) {
          if (attempt + 1 === MAX_SYNC_RETRIES) {
            throw new Error('Sync failed after maximum retries')
          }
          continue
        }
        throw err
      }
    }
  } finally {
    client.destroy()
  }
}

/**
 * 自動同期（リモートとマージしてアップロード）
 */
async function autoSync() {
  if (syncing) return
  syncing = true
  try {
    // 復号済みS3設定がない場合はローカル保存のみ
    if (!decryptedS3Config) {
      const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
      await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
      return
    }

    await syncWithS3(decryptedS3Config)

    // 同期後に vault bytes / ETag / lastSyncTime を更新
    const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
    await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
    const newEtag = vault.api_get_vault_etag(DEFAULT_VAULT_ID) ?? null
    await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)
    const syncTime = Math.floor(Date.now() / 1000)
    await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, syncTime)
  } catch (err) {
    console.error('[SW] autoSync failed:', err)
    await saveToStorage(STORAGE_KEYS.LAST_ERROR, {
      key: 'auto-sync',
      message: `同期に失敗しました: ${err}`,
      timestamp: Date.now(),
    })
  } finally {
    syncing = false
  }
}

interface AppSettings {
  autolockMinutes: number
  clipboardClearSeconds: number
  clipboardAutoClean: boolean
  theme: string
}

async function loadSettings(): Promise<AppSettings> {
  const settings = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
  return (
    settings || {
      autolockMinutes: 5,
      clipboardClearSeconds: 30,
      clipboardAutoClean: true,
      theme: 'light',
    }
  )
}

// ========== セッション復元 ==========

async function tryRestoreSession(): Promise<boolean> {
  console.log('[SW] tryRestoreSession: starting')
  const password = await getFromSessionStorage<string>(STORAGE_KEYS.SESSION_PASSWORD)
  console.log('[SW] tryRestoreSession: password retrieved?', !!password)
  if (!password) return false

  try {
    await initWasm()
    const vaultBytes = await getFromStorage<number[]>(STORAGE_KEYS.VAULT_BYTES)
    const etag = await getFromStorage<string>(STORAGE_KEYS.VAULT_ETAG)
    console.log('[SW] tryRestoreSession: vaultBytes?', !!vaultBytes, 'etag?', !!etag)
    if (!vaultBytes) return false

    vault.api_load_vault(DEFAULT_VAULT_ID, new Uint8Array(vaultBytes), etag || '')
    console.log('[SW] tryRestoreSession: vault loaded')
    vault.api_unlock(DEFAULT_VAULT_ID, password)
    console.log('[SW] tryRestoreSession: vault unlocked')

    // S3設定の復号
    const encryptedConfig = await getFromStorage<string>(STORAGE_KEYS.S3_CONFIG)
    if (encryptedConfig) {
      try {
        const configJson = vault.api_decrypt_config(DEFAULT_VAULT_ID, password, encryptedConfig)
        decryptedS3Config = JSON.parse(configJson)
      } catch (e) {
        console.error('[SW] Failed to decrypt S3 config during session restore:', e)
      }
    }

    unlocked = true
    updateExtensionIcon(true)
    console.log('[SW] Session restored successfully')
    return true
  } catch (e) {
    console.error('[SW] Session restore failed:', e)
    await removeFromSessionStorage(STORAGE_KEYS.SESSION_PASSWORD)
    return false
  }
}

// ========== メッセージハンドリング ==========

async function handleMessage(
  // biome-ignore lint/suspicious/noExplicitAny: message shape varies by type, validated per case
  message: Record<string, any>,
  _sender: chrome.runtime.MessageSender,
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies by handler
  sendResponse: (response?: any) => void,
) {
  try {
    await initWasm()

    // Service Worker 再起動時の vault 自動復元
    // セッションが残っていればアンロック状態まで復元、なければロック状態でvaultをロードする
    console.log('[SW] handleMessage preamble: unlocked=', unlocked, 'type=', message.type)
    if (!unlocked) {
      const restored = await tryRestoreSession()
      if (!restored) {
        const vaultBytes = await getFromStorage<number[]>(STORAGE_KEYS.VAULT_BYTES)
        if (vaultBytes) {
          try {
            const etag = await getFromStorage<string>(STORAGE_KEYS.VAULT_ETAG)
            vault.api_load_vault(DEFAULT_VAULT_ID, new Uint8Array(vaultBytes), etag || '')
          } catch (e) {
            console.error('[SW] Failed to auto-load vault:', e)
          }
        }
      }
    }

    // Delegate autofill messages to the autofill module
    if (typeof message.type === 'string' && message.type.startsWith('AUTOFILL_')) {
      return handleAutofillMessage(message, _sender, sendResponse)
    }

    switch (message.type) {
      // ========== Auth ==========

      case 'IS_UNLOCKED': {
        sendResponse({ success: true, unlocked })
        break
      }

      case 'UNLOCK': {
        if (!message.password) {
          sendResponse({ success: false, error: 'Password required' })
          break
        }
        try {
          const vaultBytes = await getFromStorage<number[]>(STORAGE_KEYS.VAULT_BYTES)
          const etag = await getFromStorage<string>(STORAGE_KEYS.VAULT_ETAG)
          if (!vaultBytes) {
            sendResponse({ success: false, error: 'Vault not found' })
            break
          }
          // vault をロードしてアンロック
          vault.api_load_vault(DEFAULT_VAULT_ID, new Uint8Array(vaultBytes), etag || '')
          vault.api_unlock(DEFAULT_VAULT_ID, message.password)
          // 暗号化されたS3設定を復号してメモリに保持
          const encryptedConfig = await getFromStorage<string>(STORAGE_KEYS.S3_CONFIG)
          if (encryptedConfig) {
            try {
              const configJson = vault.api_decrypt_config(
                DEFAULT_VAULT_ID,
                message.password,
                encryptedConfig,
              )
              decryptedS3Config = JSON.parse(configJson)
            } catch (e) {
              console.error('[SW] Failed to decrypt S3 config:', e)
            }
          }
          unlocked = true
          updateExtensionIcon(true)
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.password)
          // ポップアップが閉じている場合のみオートロック alarm を設定
          if (!popupConnected) {
            const settings = await loadSettings()
            if (settings.autolockMinutes > 0) {
              chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
            }
          }
          // 定期同期アラームを設定
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          sendResponse({ success: true })
          // オートフィル: アクティブタブにContent Script注入
          onVaultUnlocked()
          // アンロック後に同期（バックグラウンド）
          autoSync().catch((e) => console.error('[SW] Post-unlock sync failed:', e))
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'UNLOCK_EXISTING': {
        if (!message.password) {
          sendResponse({ success: false, error: 'Password required' })
          break
        }
        try {
          const vaultBytes = await getFromStorage<number[]>(STORAGE_KEYS.VAULT_BYTES)
          const etag = await getFromStorage<string>(STORAGE_KEYS.VAULT_ETAG)
          if (!vaultBytes) {
            sendResponse({ success: false, error: 'Vault not found' })
            break
          }
          vault.api_load_vault(DEFAULT_VAULT_ID, new Uint8Array(vaultBytes), etag || '')
          vault.api_unlock(DEFAULT_VAULT_ID, message.password)
          // オンボーディング時のS3設定暗号化保存
          if (message.s3Config) {
            const configJson = JSON.stringify(message.s3Config)
            const encrypted = vault.api_encrypt_config(
              DEFAULT_VAULT_ID,
              message.password,
              configJson,
            )
            await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
            decryptedS3Config = message.s3Config
          } else {
            // 通常のアンロック: 暗号化S3設定を復号
            const encryptedConfig = await getFromStorage<string>(STORAGE_KEYS.S3_CONFIG)
            if (encryptedConfig) {
              try {
                const cJson = vault.api_decrypt_config(
                  DEFAULT_VAULT_ID,
                  message.password,
                  encryptedConfig,
                )
                decryptedS3Config = JSON.parse(cJson)
              } catch (e) {
                console.error('[SW] Failed to decrypt S3 config:', e)
              }
            }
          }
          unlocked = true
          updateExtensionIcon(true)
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.password)
          // ポップアップが閉じている場合のみオートロック alarm を設定
          if (!popupConnected) {
            const settings = await loadSettings()
            if (settings.autolockMinutes > 0) {
              chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
            }
          }
          // 定期同期アラームを設定
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          sendResponse({ success: true })
          // オートフィル: アクティブタブにContent Script注入
          onVaultUnlocked()
          // アンロック後に同期（バックグラウンド）
          autoSync().catch((e) => console.error('[SW] Post-unlock sync failed:', e))
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'LOCK': {
        try {
          const vaultBytes = vault.api_lock(DEFAULT_VAULT_ID)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          unlocked = false
          updateExtensionIcon(false)
          decryptedS3Config = null
          await removeFromSessionStorage(STORAGE_KEYS.SESSION_PASSWORD)
          chrome.alarms.clear('autolock')
          chrome.alarms.clear('autosync')
          // オートフィル: 全タブに通知してContent Scriptを無効化
          onVaultLocked()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'CREATE_VAULT': {
        if (!message.masterPassword) {
          sendResponse({ success: false, error: 'Master password required' })
          break
        }
        try {
          const recoveryKey = vault.api_create_new_vault(DEFAULT_VAULT_ID, message.masterPassword)
          const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)

          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, null)

          if (message.s3Config) {
            const configJson = JSON.stringify(message.s3Config)
            const encrypted = vault.api_encrypt_config(
              DEFAULT_VAULT_ID,
              message.masterPassword,
              configJson,
            )
            await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
            decryptedS3Config = message.s3Config
          }
          unlocked = true
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.masterPassword)
          if (!popupConnected) {
            const settings = await loadSettings()
            if (settings.autolockMinutes > 0) {
              chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
            }
          }
          sendResponse({ success: true, recoveryKey })
        } catch (err) {
          console.error('[SW] CREATE_VAULT: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'RECOVER': {
        if (!message.recoveryKey || !message.newPassword) {
          sendResponse({ success: false, error: 'Recovery key and password required' })
          break
        }
        try {
          vault.api_unlock_with_recovery_key(DEFAULT_VAULT_ID, message.recoveryKey)
          vault.api_change_master_password(
            DEFAULT_VAULT_ID,
            message.recoveryKey,
            message.newPassword,
          )
          const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, null)
          await autoSync()
          unlocked = true
          updateExtensionIcon(true)
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.newPassword)
          if (!popupConnected) {
            const settings = await loadSettings()
            if (settings.autolockMinutes > 0) {
              chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
            }
          }
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Entries ==========

      case 'LIST_ENTRIES': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const filter = message.filter || {}
          const result = vault.api_list_entries(
            DEFAULT_VAULT_ID,
            filter.searchQuery || null,
            filter.type || null,
            filter.labelId || null,
            filter.includeTrash || false,
            filter.onlyFavorites || false,
            filter.sortField || null,
            filter.sortOrder || null,
          )
          const rawEntries = JSON.parse(result)
          const entries = normalizeEntries(rawEntries)
          sendResponse({ success: true, entries })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'GET_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const result = vault.api_get_entry(DEFAULT_VAULT_ID, message.id)
          const rawEntry = JSON.parse(result)
          if (rawEntry?.typed_value && typeof rawEntry.typed_value === 'string') {
            rawEntry.typed_value = JSON.parse(rawEntry.typed_value)
          }
          if (rawEntry?.custom_fields && typeof rawEntry.custom_fields === 'string') {
            rawEntry.custom_fields = JSON.parse(rawEntry.custom_fields)
          }
          const entry = normalizeEntry(rawEntry)
          sendResponse({ success: true, entry })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'CREATE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const entryId = vault.api_create_entry(
            DEFAULT_VAULT_ID,
            message.entryType,
            message.name,
            message.notes || null,
            JSON.stringify(message.typedValue || {}),
            message.labelIds || [],
            message.customFields ? JSON.stringify(message.customFields) : null,
          )
          await autoSync()
          sendResponse({ success: true, entryId })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'UPDATE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_update_entry(
            DEFAULT_VAULT_ID,
            message.id,
            message.name,
            message.notes || null,
            JSON.stringify(message.typedValue || {}),
            message.labelIds || [],
            message.customFields ? JSON.stringify(message.customFields) : null,
          )
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DELETE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_delete_entry(DEFAULT_VAULT_ID, message.id)
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'RESTORE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_restore_entry(DEFAULT_VAULT_ID, message.id)
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'PURGE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_purge_entry(DEFAULT_VAULT_ID, message.id)
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'SET_FAVORITE': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_set_favorite(DEFAULT_VAULT_ID, message.id, message.isFavorite)
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Trash ==========

      case 'LIST_TRASH': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const result = vault.api_list_entries(
            DEFAULT_VAULT_ID,
            null,
            null,
            null,
            true,
            false,
            null,
            null,
          )
          const rawEntries = JSON.parse(result)
          const entries = normalizeEntries(rawEntries)
          sendResponse({ success: true, entries })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Labels ==========

      case 'LIST_LABELS': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const result = vault.api_list_labels(DEFAULT_VAULT_ID)
          const labels = JSON.parse(result)
          sendResponse({ success: true, labels })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'CREATE_LABEL': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const labelId = vault.api_create_label(DEFAULT_VAULT_ID, message.name)
          await autoSync()
          sendResponse({ success: true, labelId })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DELETE_LABEL': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_delete_label(DEFAULT_VAULT_ID, message.id)
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'RENAME_LABEL': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_rename_label(DEFAULT_VAULT_ID, message.id, message.newName)
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'SET_ENTRY_LABELS': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_set_entry_labels(DEFAULT_VAULT_ID, message.entryId, message.labelIds || [])
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Password & TOTP ==========

      case 'GENERATE_PASSWORD': {
        try {
          const password = vault.api_generate_password(
            message.length ?? 16,
            message.includeLowercase ?? true,
            message.includeUppercase ?? true,
            message.includeNumbers ?? true,
            message.includeSymbols1 ?? true,
            message.includeSymbols2 ?? true,
            message.includeSymbols3 ?? true,
          )
          sendResponse({ success: true, password })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'GENERATE_TOTP': {
        try {
          const totp = vault.api_generate_totp_default(message.secret)
          sendResponse({ success: true, totp })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'GENERATE_TOTP_FROM_VALUE': {
        try {
          const totp = vault.api_generate_totp_from_value(message.value)
          const period = vault.api_parse_totp_period(message.value)
          sendResponse({ success: true, totp, period })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Security ==========

      case 'CHANGE_MASTER_PASSWORD': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_change_master_password(
            DEFAULT_VAULT_ID,
            message.oldPassword,
            message.newPassword,
          )
          // S3設定を新しいパスワードで再暗号化
          if (decryptedS3Config) {
            const configJson = JSON.stringify(decryptedS3Config)
            const encrypted = vault.api_encrypt_config(
              DEFAULT_VAULT_ID,
              message.newPassword,
              configJson,
            )
            await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
          }
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.newPassword)
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'ROTATE_DEK': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const recoveryKey = vault.api_rotate_dek(DEFAULT_VAULT_ID, message.password)
          await autoSync()
          sendResponse({ success: true, recoveryKey })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'REGENERATE_RECOVERY_KEY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const recoveryKey = vault.api_regenerate_recovery_key(DEFAULT_VAULT_ID, message.password)
          await autoSync()
          sendResponse({ success: true, recoveryKey })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Storage & Sync ==========

      case 'DOWNLOAD_VAULT': {
        try {
          // オンボーディング中はメッセージからS3設定を受け取る。既存セッションではメモリから使用。
          const s3Config: S3Config | null = message.s3Config ?? decryptedS3Config
          if (!s3Config) {
            sendResponse({ success: false, error: 'S3 config not found' })
            break
          }

          const client = new VaultS3Client(s3Config)
          try {
            const remote = await client.download()
            if (remote) {
              vault.api_load_vault(DEFAULT_VAULT_ID, remote.bytes, remote.etag)
              const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
              await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
              await saveToStorage(STORAGE_KEYS.VAULT_ETAG, remote.etag)
            }
            sendResponse({ success: true, vaultExists: !!remote })
          } finally {
            client.destroy()
          }
        } catch (err) {
          console.error('[SW] DOWNLOAD_VAULT: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DOWNLOAD': {
        try {
          const s3Config: S3Config | null = message.storageConfig
            ? JSON.parse(message.storageConfig)
            : decryptedS3Config

          if (!s3Config) {
            sendResponse({ success: false, error: 'S3 config not found' })
            break
          }

          const client = new VaultS3Client(s3Config)
          try {
            const remote = await client.download()
            if (remote) {
              vault.api_load_vault(DEFAULT_VAULT_ID, remote.bytes, remote.etag)
            }
            sendResponse({ success: true, result: !!remote })
          } finally {
            client.destroy()
          }
        } catch (err) {
          console.error('[SW] DOWNLOAD: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'SYNC': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        if (syncing) {
          sendResponse({ success: false, error: 'Sync already in progress' })
          break
        }
        syncing = true
        try {
          if (!decryptedS3Config) {
            sendResponse({ success: true, status: 'idle', message: 'S3 config not set' })
            break
          }

          await syncWithS3(decryptedS3Config)

          // 同期後、vault bytes と ETag を更新
          const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          const newEtag = vault.api_get_vault_etag(DEFAULT_VAULT_ID) ?? null
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)

          const syncTime = Math.floor(Date.now() / 1000)
          await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, syncTime)
          sendResponse({ success: true, status: 'synced', last_synced_at: syncTime })
        } catch (err) {
          console.error('[SW] SYNC: Error:', err)
          sendResponse({ success: false, error: String(err) })
        } finally {
          syncing = false
        }
        break
      }

      case 'GET_DECRYPTED_S3_CONFIG': {
        if (!unlocked || !decryptedS3Config) {
          sendResponse({ success: true, config: null })
        } else {
          sendResponse({ success: true, config: decryptedS3Config })
        }
        break
      }

      // ========== Settings ==========

      case 'GET_SETTINGS': {
        const settings = await loadSettings()
        sendResponse({ success: true, settings })
        break
      }

      case 'SAVE_SETTINGS': {
        try {
          await saveToStorage(STORAGE_KEYS.APP_SETTINGS, message.settings)
          if (unlocked) {
            if (message.settings.autolockMinutes > 0 && !popupConnected) {
              chrome.alarms.create('autolock', { delayInMinutes: message.settings.autolockMinutes })
            } else {
              chrome.alarms.clear('autolock')
            }
          }
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DECRYPT_TRANSFER_CONFIG': {
        try {
          const configJson = vault.api_decrypt_transfer_config(
            message.password,
            message.transferString,
          )
          sendResponse({ success: true, configJson })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'ENCRYPT_TRANSFER_CONFIG': {
        try {
          const transferString = vault.api_encrypt_transfer_config(
            message.password,
            message.configJson,
          )
          sendResponse({ success: true, transferString })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'CLIPBOARD_COPIED': {
        try {
          const settings = await loadSettings()
          if (settings.clipboardAutoClean) {
            const minutes = settings.clipboardClearSeconds / 60
            chrome.alarms.create('clipboard-clear', { delayInMinutes: minutes })
          }
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' })
    }
  } catch (error) {
    console.error('[SW] Message handling error:', error)
    sendResponse({ success: false, error: String(error) })
  }
}

// ========== Alarm Setup ==========

function setupAlarms() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'autolock') {
      handleAutolockAlarm()
    } else if (alarm.name === 'clipboard-clear') {
      handleClipboardClearAlarm()
    } else if (alarm.name === 'autosync') {
      handleAutosyncAlarm()
    }
  })
}

async function handleAutolockAlarm() {
  // SW再起動後にアラームが発火した場合、セッションを復元してからロックする
  if (!unlocked) {
    await tryRestoreSession()
  }
  if (!unlocked) return
  try {
    const vaultBytes = vault.api_lock(DEFAULT_VAULT_ID)
    await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
    unlocked = false
    updateExtensionIcon(false)
    decryptedS3Config = null
    await removeFromSessionStorage(STORAGE_KEYS.SESSION_PASSWORD)
    onVaultLocked()
  } catch (err) {
    console.error('[SW] Autolock failed:', err)
  }
}

async function handleClipboardClearAlarm() {
  try {
    if (typeof chrome.offscreen !== 'undefined') {
      // Chrome: offscreen document 経由でクリップボードをクリア
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('src/background/offscreen.html'),
        reasons: ['CLIPBOARD' as chrome.offscreen.Reason],
        justification: 'Clear clipboard after copy timeout',
      })
      chrome.runtime.sendMessage({ type: 'CLEAR_CLIPBOARD' })
    } else {
      // Firefox: background page から直接クリップボードをクリア
      await navigator.clipboard.writeText('')
    }
  } catch (err) {
    console.error('[SW] Clipboard clear failed:', err)
  }
}

async function handleAutosyncAlarm() {
  if (!unlocked) {
    await tryRestoreSession()
  }
  if (!unlocked) return
  autoSync().catch((e) => {
    console.error('[SW] Periodic sync failed:', e)
    saveToStorage(STORAGE_KEYS.LAST_ERROR, {
      key: 'periodic-sync',
      message: `同期に失敗しました: ${e}`,
      timestamp: Date.now(),
    })
  })
}
