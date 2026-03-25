// Service Worker エントリーポイント
// WASM の初期化とメッセージハンドラーのセットアップ

import * as vault from '../../wasm/vault_core'
import { getFromStorage, saveToStorage } from '../shared/storage'

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

// Service Worker 起動時に初期化
self.addEventListener('install', (event) => {
  event.waitUntil(initWasm())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(initWasm().then(() => {
    setupMessageHandlers()
    setupAlarms()
  }))
})

// メッセージハンドラーのセットアップ
function setupMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender, sendResponse)
    return true // 非同期レスポンスを許可
  })
}

// メッセージハンドリング
async function handleMessage(
  message: any,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: any) => void
) {
  try {
    await initWasm()

    switch (message.type) {
      case 'IS_UNLOCKED': {
        sendResponse({ unlocked })
        break
      }

      case 'UNLOCK': {
        if (!message.password) {
          sendResponse({ success: false, error: 'Password required' })
          break
        }
        try {
          const vaultBytes = await getFromStorage('vaultBytes')
          const etag = await getFromStorage('vaultEtag')
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
          sendResponse({ success: true })
        } catch (err) {
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
          await saveToStorage('vaultBytes', Array.from(vaultBytes))
          await saveToStorage('vaultEtag', null)
          unlocked = true
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'LOCK': {
        try {
          const vaultBytes = (vault as any).api_lock()
          await saveToStorage('vaultBytes', Array.from(vaultBytes))
          unlocked = false
          chrome.alarms.clear('autolock')
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
          const recoveryKey = (vault as any).api_create_new_vault(message.masterPassword)
          const vaultBytes = (vault as any).api_get_vault_bytes()
          await saveToStorage('vaultBytes', Array.from(vaultBytes))
          await saveToStorage('vaultEtag', null)
          unlocked = true
          sendResponse({ success: true, recoveryKey })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

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
            filter.includeTrash || false
          )
          const entries = JSON.parse(result)
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
          const entry = JSON.parse(result)
          if (entry && entry.typed_value && typeof entry.typed_value === 'string') {
            entry.typed_value = JSON.parse(entry.typed_value)
          }
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
          ;(vault as any).api_create_entry(
            message.entryType,
            message.name,
            message.notes || null,
            JSON.stringify(message.typed_value || {}),
            message.labelIds || []
          )
          sendResponse({ success: true })
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
            JSON.stringify(message.typed_value || {}),
            message.labelIds || []
          )
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
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'LIST_TRASH': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const result = (vault as any).api_list_entries(null, null, null, true)
          const entries = JSON.parse(result)
          sendResponse({ success: true, entries })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

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
          sendResponse({ success: true, label: { id: labelId, name: message.name } })
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
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'SYNC': {
        // S3 同期は現フェーズでは未実装
        sendResponse({ success: true, status: 'idle' })
        break
      }

      case 'GET_SYNC_STATUS': {
        const lastSyncTime = await getFromStorage('lastSyncTime')
        sendResponse({ success: true, status: 'idle', lastSyncTime })
        break
      }

      case 'GET_SYNC_CONFLICTS': {
        sendResponse({ success: true, conflicts: [] })
        break
      }

      case 'RESOLVE_SYNC_CONFLICTS': {
        sendResponse({ success: true })
        break
      }

      case 'GET_SETTINGS': {
        const settings = await loadSettings()
        sendResponse({ success: true, settings })
        break
      }

      case 'SAVE_SETTINGS': {
        try {
          await saveToStorage('settings', message.settings)
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
        sendResponse({ error: 'Unknown message type' })
    }
  } catch (error) {
    console.error('[SW] Message handling error:', error)
    sendResponse({ error: String(error) })
  }
}

// ヘルパー関数
async function loadSettings() {
  const settings = await getFromStorage('settings')
  return settings || {
    autolockMinutes: 5,
    clipboardClearSeconds: 30,
    clipboardAutoClean: true,
  }
}

// Alarm のセットアップ（オートロック・クリップボードクリア）
function setupAlarms() {
  // オートロック用 alarm
  chrome.alarms.create('autolock', { delayInMinutes: 5 })

  // Alarm イベントハンドラー
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'autolock') {
      handleAutolockAlarm()
    } else if (alarm.name === 'clipboard-clear') {
      handleClipboardClearAlarm()
    }
  })
}

async function handleAutolockAlarm() {
  console.log('[SW] Autolock alarm triggered')
  if (!unlocked) return
  try {
    const vaultBytes = (vault as any).api_lock()
    await saveToStorage('vaultBytes', Array.from(vaultBytes))
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

export {}
