// Service Worker エントリーポイント
// WASM の初期化とメッセージハンドラーのセットアップ

import * as vaultModule from '../../wasm/wasm_bridge'
import { DEFAULT_VAULT_ID, STORAGE_KEYS } from '../shared/constants'
import { getFromStorage, saveToStorage } from '../shared/storage'

/** WASM API surface for Service Worker */
interface WasmApi {
  api_create_new_vault(vaultId: string, masterPassword: string): string
  api_load_vault(vaultId: string, vaultBytes: Uint8Array, etag: string): void
  api_unlock(vaultId: string, masterPassword: string): boolean
  api_unlock_with_recovery_key(vaultId: string, recoveryKey: string): void
  api_lock(vaultId: string): Uint8Array
  api_get_vault_bytes(vaultId: string): Uint8Array
  api_get_vault_etag?(vaultId: string): string | null
  api_is_unlocked(vaultId: string): boolean
  api_list_entries(
    vaultId: string,
    searchQuery: string | null,
    type: string | null,
    labelId: string | null,
    includeTrash: boolean,
    onlyFavorites: boolean,
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
  api_list_labels(vaultId: string): string
  api_create_label(vaultId: string, name: string): string
  api_delete_label(vaultId: string, id: string): void
  api_rename_label(vaultId: string, id: string, newName: string): void
  api_set_entry_labels(vaultId: string, entryId: string, labelIds: string[]): void
  api_generate_password(
    length: number,
    includeUppercase: boolean,
    includeLowercase: boolean,
    includeNumbers: boolean,
    includeSymbols: boolean,
  ): string
  api_generate_totp_default(secret: string): string
  api_change_master_password(vaultId: string, oldPassword: string, newPassword: string): void
  api_rotate_dek(vaultId: string, password: string): string
  api_regenerate_recovery_key(vaultId: string, password: string): string
  api_sync(vaultId: string, configStr: string): Promise<{ last_synced_at?: number }>
  api_download(vaultId: string, configStr: string): Promise<boolean>
  [key: string]: unknown
}

const vault = vaultModule as unknown as WasmApi

let wasmInitialized = false
let unlocked = false

// WASM 初期化関数
async function initWasm() {
  if (wasmInitialized) return
  try {
    wasmInitialized = true
  } catch (error) {
    console.error('[SW] WASM initialization error:', error)
    throw error
  }
}

// ========== メッセージハンドラーのセットアップ ==========

function setupMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // async 処理を fire-and-forget で実行し、Promise で sendResponse を呼ぶ
    handleMessage(message, sender, sendResponse).catch((err) => {
      console.error('[SW] Unhandled error in message handler:', err)
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

// Service Worker 起動時に初期化
self.addEventListener('install', (event: Event) => {
  ;(event as unknown as { waitUntil(p: Promise<unknown>): void }).waitUntil(initWasm())
})

self.addEventListener('activate', (event: Event) => {
  ;(event as unknown as { waitUntil(p: Promise<unknown>): void }).waitUntil(
    initWasm().then(() => {
      setupAlarms()
    }),
  )
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
    isFavorite: raw.is_favorite ?? false,
    createdAt: raw.created_at ?? 0,
    updatedAt: raw.updated_at ?? 0,
    deletedAt: raw.deleted_at ?? null,
    notes: raw.notes ?? null,
    typedValue: raw.typed_value ?? {},
    labels: raw.label_ids ?? [],
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

/**
 * 自動同期（リモートとマージしてアップロード）
 */
async function autoSync() {
  try {
    // S3設定がない場合はローカル保存のみ
    const s3Config = await getFromStorage(STORAGE_KEYS.S3_CONFIG)
    if (!s3Config) {
      const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
      await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
      return
    }

    const configStr = JSON.stringify(s3Config)
    await vault.api_sync(DEFAULT_VAULT_ID, configStr)

    // 同期後に vault bytes / ETag / lastSyncTime を更新
    const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
    await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
    const newEtag = vault.api_get_vault_etag?.(DEFAULT_VAULT_ID) ?? null
    await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)
    const syncTime = Math.floor(Date.now() / 1000)
    await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, syncTime)
  } catch (err) {
    console.error('[SW] autoSync failed:', err)
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
    // vaultBytes が storage に存在し、unlocked が false の場合、vault をロードする
    if (!unlocked) {
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
          unlocked = true
          // オートロック alarm を設定
          const settings = await loadSettings()
          chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
          // 定期同期アラームを設定
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          sendResponse({ success: true })
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
          unlocked = true
          const settings = await loadSettings()
          chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
          // 定期同期アラームを設定
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          sendResponse({ success: true })
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
          chrome.alarms.clear('autolock')
          chrome.alarms.clear('autosync')
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
            await saveToStorage(STORAGE_KEYS.S3_CONFIG, message.s3Config)
          }
          unlocked = true
          const settings = await loadSettings()
          chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
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
          vault.api_change_master_password(DEFAULT_VAULT_ID, message.recoveryKey, message.newPassword)
          const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, null)
          await autoSync()
          unlocked = true
          const settings = await loadSettings()
          chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
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
          const result = vault.api_list_entries(DEFAULT_VAULT_ID, null, null, null, true, false)
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
            message.includeUppercase ?? true,
            message.includeLowercase ?? true,
            message.includeNumbers ?? true,
            message.includeSymbols ?? true,
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

      // ========== Security ==========

      case 'CHANGE_MASTER_PASSWORD': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_change_master_password(DEFAULT_VAULT_ID, message.oldPassword, message.newPassword)
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
          const s3Config = await getFromStorage(STORAGE_KEYS.S3_CONFIG)
          if (!s3Config) {
            sendResponse({ success: false, error: 'S3 config not found' })
            break
          }

          // api_download が実装されるまでは、エラーを返す
          if (typeof vault.api_download !== 'function') {
            sendResponse({
              success: false,
              error: 'S3 download feature is not yet implemented in vault_core',
            })
            break
          }

          const vaultExists = await vault.api_download(DEFAULT_VAULT_ID, JSON.stringify(s3Config))

          if (vaultExists) {
            const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
            await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          }

          sendResponse({ success: true, vaultExists })
        } catch (err) {
          console.error('[SW] DOWNLOAD_VAULT: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DOWNLOAD': {
        try {
          const s3Config = message.storageConfig
            ? JSON.parse(message.storageConfig)
            : await getFromStorage(STORAGE_KEYS.S3_CONFIG)

          if (!s3Config) {
            sendResponse({ success: false, error: 'S3 config not found' })
            break
          }

          const configStr = JSON.stringify(s3Config)
          const downloadResult = await vault.api_download(DEFAULT_VAULT_ID, configStr)

          sendResponse({ success: true, result: downloadResult })
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
        try {
          const s3Config = await getFromStorage(STORAGE_KEYS.S3_CONFIG)

          if (!s3Config) {
            sendResponse({ success: true, status: 'idle', message: 'S3 config not set' })
            break
          }

          const configStr = JSON.stringify(s3Config)

          const syncResult = await vault.api_sync(DEFAULT_VAULT_ID, configStr)
          const lastSyncedAt = syncResult?.last_synced_at ?? null

          // 同期後、vault bytes と ETag を更新
          const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          const newEtag = vault.api_get_vault_etag?.(DEFAULT_VAULT_ID) ?? null
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)

          const syncTime = lastSyncedAt ?? Math.floor(Date.now() / 1000)
          await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, syncTime)
          sendResponse({ success: true, status: 'synced', last_synced_at: syncTime })
        } catch (err) {
          console.error('[SW] SYNC: Error:', err)
          sendResponse({ success: false, error: String(err) })
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
            chrome.alarms.create('autolock', { delayInMinutes: message.settings.autolockMinutes })
          }
          sendResponse({ success: true })
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
  if (!unlocked) return
  try {
    const vaultBytes = vault.api_lock(DEFAULT_VAULT_ID)
    await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
    unlocked = false
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
  if (!unlocked) return
  autoSync().catch((e) => console.error('[SW] Periodic sync failed:', e))
}
