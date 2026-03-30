// Service Worker エントリーポイント
// WASM の初期化とメッセージハンドラーのセットアップ

import * as vault from '../../wasm/vault_core'
import { getFromStorage, saveToStorage } from '../shared/storage'
import { STORAGE_KEYS } from '../shared/constants'

let wasmInitialized = false
let unlocked = false

// WASM 初期化関数
async function initWasm() {
  if (wasmInitialized) return
  try {
    wasmInitialized = true
    console.log('[SW] WASM initialized')
  } catch (error) {
    console.error('[SW] WASM initialization error:', error)
    throw error
  }
}

// ========== メッセージハンドラーのセットアップ ==========

function setupMessageHandlers() {
  console.log('[SW] Setting up message handlers')
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[SW] Message received:', message.type)
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
console.log('[SW] Registering message handlers immediately on script load')
setupMessageHandlers()

// Service Worker 起動時に初期化
self.addEventListener('install', (event) => {
  console.log('[SW] install event')
  event.waitUntil(initWasm())
})

self.addEventListener('activate', (event) => {
  console.log('[SW] activate event')
  event.waitUntil(initWasm().then(() => {
    console.log('[SW] Calling setupAlarms in activate')
    setupAlarms()
  }))
})

// ========== ヘルパー関数 ==========

/**
 * camelCase への正規化（WASM からの snake_case → camelCase）
 */
function normalizeEntry(raw: any): any {
  if (!raw) return raw
  return {
    id: raw.id,
    entryType: raw.entry_type,
    name: raw.name,
    isFavorite: raw.is_favorite ?? false,
    updatedAt: raw.updated_at ?? 0,
    deletedAt: raw.deleted_at ?? null,
    notes: raw.notes ?? null,
    typedValue: raw.typed_value ?? {},
    labels: raw.label_ids ?? [],
    customFields: (raw.custom_fields ?? []).map((f: any) => ({
      id: f.id,
      name: f.name,
      fieldType: f.field_type,
      value: f.value,
    })),
  }
}

/**
 * 配列エントリを正規化（normalizeEntry を各要素に適用）
 */
function normalizeEntries(entries: any[]): any[] {
  return (entries ?? []).map(normalizeEntry)
}

/**
 * 自動同期（api_sync を優先、失敗時は api_push にフォールバック）
 */
async function autoSync() {
  try {
    console.log('[SW] autoSync: Starting')

    // S3設定がない場合はローカル保存のみ
    const s3Config = await getFromStorage(STORAGE_KEYS.S3_CONFIG)
    if (!s3Config) {
      console.log('[SW] autoSync: No S3 config, saving locally only')
      const vaultBytes = (vault as any).api_get_vault_bytes()
      await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
      return
    }

    const configStr = JSON.stringify(s3Config)

    // api_sync を優先使用（マージ + アップロード）
    if (typeof (vault as any).api_sync === 'function') {
      console.log('[SW] autoSync: Calling api_sync')
      await (vault as any).api_sync(configStr)
      console.log('[SW] autoSync: api_sync completed successfully')
    } else if (typeof (vault as any).api_push === 'function') {
      // api_sync が利用不可の場合は api_push で代替
      console.log('[SW] autoSync: api_sync not available, using api_push')
      await (vault as any).api_push(configStr)
      console.log('[SW] autoSync: api_push completed successfully')
    } else {
      throw new Error('Neither api_sync nor api_push is available')
    }

    // 同期後に vault bytes / ETag / lastSyncTime を更新
    const vaultBytes = (vault as any).api_get_vault_bytes()
    await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
    const newEtag = (vault as any).api_get_vault_etag?.() ?? null
    await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)
    const syncTime = Math.floor(Date.now() / 1000)
    await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, syncTime)
    console.log('[SW] autoSync completed, syncTime:', syncTime)
  } catch (err) {
    console.warn('[SW] autoSync failed:', err)
  }
}

async function loadSettings() {
  const settings = await getFromStorage(STORAGE_KEYS.APP_SETTINGS)
  return settings || {
    autolockMinutes: 5,
    clipboardClearSeconds: 30,
    clipboardAutoClean: true,
    theme: 'light',
  }
}

// ========== メッセージハンドリング ==========

async function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  try {
    await initWasm()

    // Service Worker 再起動時の vault 自動復元
    // vaultBytes が storage に存在し、unlocked が false の場合、vault をロードする
    if (!unlocked) {
      const vaultBytes = await getFromStorage(STORAGE_KEYS.VAULT_BYTES)
      if (vaultBytes) {
        try {
          const etag = await getFromStorage(STORAGE_KEYS.VAULT_ETAG)
          console.log('[SW] Auto-loading vault from storage (Service Worker recovered)')
          ;(vault as any).api_load_vault(new Uint8Array(vaultBytes), etag || '')
          // Note: We load but don't unlock yet - the actual unlock state is restored on first UNLOCK/CREATE_VAULT
        } catch (e) {
          console.warn('[SW] Failed to auto-load vault:', e)
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
          const vaultBytes = await getFromStorage(STORAGE_KEYS.VAULT_BYTES)
          const etag = await getFromStorage(STORAGE_KEYS.VAULT_ETAG)
          if (!vaultBytes) {
            sendResponse({ success: false, error: 'Vault not found' })
            break
          }
          // vault をロードしてアンロック
          ;(vault as any).api_load_vault(new Uint8Array(vaultBytes), etag || '')
          ;(vault as any).api_unlock(message.password)
          unlocked = true
          // オートロック alarm を設定
          const settings = await loadSettings()
          chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
          // 定期同期アラームを設定
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          sendResponse({ success: true })
          // アンロック後に同期（バックグラウンド）
          autoSync().catch(e => console.warn('[SW] Post-unlock sync failed:', e))
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
          const vaultBytes = await getFromStorage(STORAGE_KEYS.VAULT_BYTES)
          const etag = await getFromStorage(STORAGE_KEYS.VAULT_ETAG)
          if (!vaultBytes) {
            sendResponse({ success: false, error: 'Vault not found' })
            break
          }
          ;(vault as any).api_load_vault(new Uint8Array(vaultBytes), etag || '')
          ;(vault as any).api_unlock(message.password)
          unlocked = true
          const settings = await loadSettings()
          chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
          // 定期同期アラームを設定
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          sendResponse({ success: true })
          // アンロック後に同期（バックグラウンド）
          autoSync().catch(e => console.warn('[SW] Post-unlock sync failed:', e))
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'LOCK': {
        try {
          const vaultBytes = (vault as any).api_lock()
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
          console.log('[SW] CREATE_VAULT: Starting vault creation')
          console.log('[SW] CREATE_VAULT: vault object type:', typeof vault)
          console.log('[SW] CREATE_VAULT: vault.api_create_new_vault:', typeof (vault as any).api_create_new_vault)

          const recoveryKey = (vault as any).api_create_new_vault(message.masterPassword)
          console.log('[SW] CREATE_VAULT: Vault created, recovery key:', recoveryKey)

          const vaultBytes = (vault as any).api_get_vault_bytes()
          console.log('[SW] CREATE_VAULT: Got vault bytes, size:', vaultBytes?.length)

          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, null)
          console.log('[SW] CREATE_VAULT: Saved vault bytes to storage')

          if (message.s3Config) {
            await saveToStorage(STORAGE_KEYS.S3_CONFIG, message.s3Config)
          }
          unlocked = true
          const settings = await loadSettings()
          chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
          console.log('[SW] CREATE_VAULT: Success, sending response')
          const responsePayload = { success: true, recoveryKey }
          console.log('[SW] CREATE_VAULT: Response payload:', responsePayload)
          sendResponse(responsePayload)
          console.log('[SW] CREATE_VAULT: sendResponse called')
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
          ;(vault as any).api_unlock_with_recovery_key(message.recoveryKey)
          ;(vault as any).api_change_master_password(message.recoveryKey, message.newPassword)
          const vaultBytes = (vault as any).api_get_vault_bytes()
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
          const result = (vault as any).api_list_entries(
            filter.searchQuery || null,
            filter.type || null,
            filter.labelId || null,
            filter.includeTrash || false,
            filter.onlyFavorites || false
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
          const result = (vault as any).api_get_entry(message.id)
          const rawEntry = JSON.parse(result)
          if (rawEntry && rawEntry.typed_value && typeof rawEntry.typed_value === 'string') {
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
          const entryId = (vault as any).api_create_entry(
            message.entryType,
            message.name,
            message.notes || null,
            JSON.stringify(message.typedValue || {}),
            message.labelIds || [],
            message.customFields ? JSON.stringify(message.customFields) : null
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
          ;(vault as any).api_update_entry(
            message.id,
            message.name,
            message.notes || null,
            JSON.stringify(message.typedValue || {}),
            message.labelIds || [],
            message.customFields ? JSON.stringify(message.customFields) : null
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
          ;(vault as any).api_delete_entry(message.id)
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
          ;(vault as any).api_restore_entry(message.id)
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
          ;(vault as any).api_purge_entry(message.id)
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
          ;(vault as any).api_set_favorite(message.id, message.isFavorite)
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
          const result = (vault as any).api_list_entries(null, null, null, true, false)
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
          const result = (vault as any).api_list_labels()
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
          const labelId = (vault as any).api_create_label(message.name)
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
          ;(vault as any).api_delete_label(message.id)
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
          ;(vault as any).api_rename_label(message.id, message.newName)
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
          ;(vault as any).api_set_entry_labels(message.entryId, message.labelIds || [])
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
          const password = (vault as any).api_generate_password(
            message.length ?? 16,
            message.includeUppercase ?? true,
            message.includeLowercase ?? true,
            message.includeNumbers ?? true,
            message.includeSymbols ?? true
          )
          sendResponse({ success: true, password })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'GENERATE_TOTP': {
        try {
          const totp = (vault as any).api_generate_totp_default(message.secret)
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
          ;(vault as any).api_change_master_password(message.oldPassword, message.newPassword)
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
          const recoveryKey = (vault as any).api_rotate_dek(message.password)
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
          const recoveryKey = (vault as any).api_regenerate_recovery_key(message.password)
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
          if (typeof (vault as any).api_download !== 'function') {
            console.warn('[SW] DOWNLOAD_VAULT: api_download is not available in vault_core')
            sendResponse({
              success: false,
              error: 'S3 download feature is not yet implemented in vault_core',
            })
            break
          }

          console.log('[SW] DOWNLOAD_VAULT: Downloading vault from S3')
          const vaultExists = await (vault as any).api_download(JSON.stringify(s3Config))

          if (vaultExists) {
            const vaultBytes = (vault as any).api_get_vault_bytes()
            await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
            console.log('[SW] DOWNLOAD_VAULT: Vault downloaded and saved to storage')
          } else {
            console.log('[SW] DOWNLOAD_VAULT: Vault not found in S3, vaultExists=false')
          }

          sendResponse({ success: true, vaultExists })
        } catch (err) {
          console.error('[SW] DOWNLOAD_VAULT: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'PUSH_VAULT': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const s3Config = await getFromStorage(STORAGE_KEYS.S3_CONFIG)
          if (!s3Config) {
            sendResponse({ success: false, error: 'S3 config not found' })
            break
          }

          // api_push が実装されるまでは、エラーを返す
          if (typeof (vault as any).api_push !== 'function') {
            console.warn('[SW] PUSH_VAULT: api_push is not available in vault_core')
            sendResponse({
              success: false,
              error: 'S3 push feature is not yet implemented in vault_core',
            })
            break
          }

          console.log('[SW] PUSH_VAULT: Pushing vault to S3')
          await (vault as any).api_push(JSON.stringify(s3Config))
          const newEtag = (vault as any).api_get_vault_etag?.() ?? null
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)
          await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, new Date().toISOString())
          console.log('[SW] PUSH_VAULT: Push successful')
          sendResponse({ success: true })
        } catch (err) {
          console.error('[SW] PUSH_VAULT: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DOWNLOAD': {
        try {
          console.log('[SW] DOWNLOAD: Starting download')
          const s3Config = message.storageConfig ? JSON.parse(message.storageConfig) : await getFromStorage(STORAGE_KEYS.S3_CONFIG)

          if (!s3Config) {
            sendResponse({ success: false, error: 'S3 config not found' })
            break
          }

          const configStr = JSON.stringify(s3Config)
          console.log('[SW] DOWNLOAD: Calling api_download')
          const downloadResult = await (vault as any).api_download(configStr)
          console.log('[SW] DOWNLOAD: api_download completed, result:', downloadResult)

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
          console.log('[SW] SYNC: Starting sync')
          const s3Config = await getFromStorage(STORAGE_KEYS.S3_CONFIG)
          console.log('[SW] SYNC: s3Config:', s3Config)

          if (!s3Config) {
            console.log('[SW] SYNC: No S3 config found')
            sendResponse({ success: true, status: 'idle', message: 'S3 config not set' })
            break
          }

          console.log('[SW] SYNC: api_sync available:', typeof (vault as any).api_sync === 'function')
          console.log('[SW] SYNC: api_push available:', typeof (vault as any).api_push === 'function')

          const configStr = JSON.stringify(s3Config)

          let lastSyncedAt: number | null = null
          // api_sync が実装されている場合、それを使用
          if (typeof (vault as any).api_sync === 'function') {
            console.log('[SW] SYNC: Calling api_sync')
            const syncResult = await (vault as any).api_sync(configStr)
            console.log('[SW] SYNC: api_sync completed successfully, syncResult:', syncResult)
            console.log('[SW] SYNC: syncResult type:', typeof syncResult)
            console.log('[SW] SYNC: syncResult.last_synced_at:', syncResult?.last_synced_at)
            lastSyncedAt = syncResult?.last_synced_at ?? null
          } else if (typeof (vault as any).api_push === 'function') {
            // api_sync が利用できない場合は api_push で代替
            console.log('[SW] SYNC: api_sync not available, using api_push instead')
            const pushResult = await (vault as any).api_push(configStr)
            console.log('[SW] SYNC: api_push completed successfully')
            lastSyncedAt = null
          } else {
            throw new Error('Neither api_sync nor api_push is available')
          }

          // 同期後、vault bytes と ETag を更新
          const vaultBytes = (vault as any).api_get_vault_bytes()
          console.log('[SW] SYNC: Got vault bytes after sync, size:', vaultBytes?.length)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          const newEtag = (vault as any).api_get_vault_etag?.() ?? null
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)

          // lastSyncedAt がない場合はフォールバック
          const syncTime = lastSyncedAt ?? Math.floor(Date.now() / 1000)
          await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, syncTime)

          console.log('[SW] SYNC: Sync completed successfully, lastSyncedAt:', syncTime)
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
  console.log('[SW] Autolock alarm triggered')
  if (!unlocked) return
  try {
    const vaultBytes = (vault as any).api_lock()
    await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
    unlocked = false
    console.log('[SW] Vault locked')
  } catch (err) {
    console.error('[SW] Autolock failed:', err)
  }
}

async function handleClipboardClearAlarm() {
  console.log('[SW] Clipboard clear alarm triggered')
  try {
    if (typeof chrome.offscreen !== 'undefined') {
      // Chrome: offscreen document 経由でクリップボードをクリア
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('src/background/offscreen.html'),
        reasons: ['CLIPBOARD'],
        justification: 'Clear clipboard after copy timeout',
      } as any)
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
  console.log('[SW] Autosync alarm triggered')
  if (!unlocked) {
    console.log('[SW] Vault is locked, skipping sync')
    return
  }
  autoSync().catch(e => console.warn('[SW] Periodic sync failed:', e))
}

export {}
