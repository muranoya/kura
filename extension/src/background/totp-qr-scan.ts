// TOTP QR scan via page screenshot — Service Worker handlers

import { DEFAULT_VAULT_ID } from '../shared/constants'

const LOG_PREFIX = '[kura:totp-qr:sw]'

interface TotpQrContext {
  entryId: string
  fieldId: string
  tabId: number
  windowId?: number
}

interface VaultApi {
  api_get_entry(vaultId: string, id: string): string
  api_update_entry(
    vaultId: string,
    id: string,
    name: string,
    notes: string | null,
    typedValue: string,
    labelIds: string[],
    customFields: string | null,
  ): void
  api_generate_totp_from_value(value: string): string
}

let vaultApi: VaultApi | null = null
let isUnlocked: () => boolean = () => false
let saveLocallyFn: (() => Promise<void>) | null = null
let autoSyncFn: (() => Promise<void>) | null = null
let scanContext: TotpQrContext | null = null

export function initTotpQrScan(
  api: VaultApi,
  unlockedFn: () => boolean,
  saveLocally: () => Promise<void>,
  autoSync: () => Promise<void>,
) {
  vaultApi = api
  isUnlocked = unlockedFn
  saveLocallyFn = saveLocally
  autoSyncFn = autoSync
}

export function clearTotpQrScanContext() {
  scanContext = null
}

export function handleTotpQrMessage(
  message: { type?: string; entryId?: string; fieldId?: string; value?: string },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean | undefined {
  switch (message.type) {
    case 'TOTP_QR_START': {
      if (!isUnlocked()) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      const entryId = message.entryId
      const fieldId = message.fieldId
      if (!entryId || !fieldId) {
        sendResponse({ success: false, error: 'entryId and fieldId required' })
        break
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0]
        if (!tab?.id) {
          sendResponse({ success: false, error: 'No active tab' })
          return
        }
        const prevContext = scanContext
        scanContext = {
          entryId,
          fieldId,
          tabId: tab.id,
          windowId: tab.windowId,
        }
        // Tear down an overlay left on a previous tab — the scan context now
        // belongs to the new tab, so the old tab's overlay would otherwise
        // stay on screen and fail with 'Scan tab mismatch' on interaction.
        if (prevContext && prevContext.tabId !== tab.id) {
          chrome.tabs
            .sendMessage(prevContext.tabId, { type: 'TOTP_QR_END' }, { frameId: 0 })
            .catch(() => {}) // Tab may already be closed
        }
        chrome.tabs
          .sendMessage(tab.id, { type: 'TOTP_QR_START' }, { frameId: 0 })
          .then(() => sendResponse({ success: true }))
          .catch((e) => {
            scanContext = null
            sendResponse({ success: false, error: String(e) })
          })
      })
      return true
    }

    case 'TOTP_QR_CAPTURE': {
      if (!scanContext) {
        sendResponse({ success: false, error: 'No active TOTP QR scan' })
        break
      }
      if (sender.tab?.id != null && sender.tab.id !== scanContext.tabId) {
        sendResponse({ success: false, error: 'Scan tab mismatch' })
        break
      }
      const windowId = scanContext.windowId ?? sender.tab?.windowId
      if (windowId == null) {
        sendResponse({ success: false, error: 'No window for capture' })
        break
      }
      chrome.tabs.captureVisibleTab(windowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({
            success: false,
            error: chrome.runtime.lastError?.message || 'Screenshot failed',
          })
          return
        }
        sendResponse({ success: true, dataUrl })
      })
      return true
    }

    case 'TOTP_QR_APPLY': {
      if (!isUnlocked() || !vaultApi || !saveLocallyFn || !autoSyncFn) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      if (!scanContext) {
        sendResponse({ success: false, error: 'No active TOTP QR scan' })
        break
      }
      const value = typeof message.value === 'string' ? message.value.trim() : ''
      if (!value) {
        sendResponse({ success: false, error: 'empty' })
        break
      }
      try {
        vaultApi.api_generate_totp_from_value(value)
      } catch (e) {
        sendResponse({ success: false, error: 'invalid_totp' })
        console.warn(LOG_PREFIX, 'TOTP validation failed:', e)
        break
      }

      const { entryId, fieldId } = scanContext
      const api = vaultApi
      const saveFn = saveLocallyFn
      const syncFn = autoSyncFn
      ;(async () => {
        try {
          const raw = JSON.parse(api.api_get_entry(DEFAULT_VAULT_ID, entryId)) as Record<
            string,
            unknown
          >
          if (!raw) {
            sendResponse({ success: false, error: 'Entry not found' })
            return
          }

          if (raw.typed_value && typeof raw.typed_value === 'string') {
            raw.typed_value = JSON.parse(raw.typed_value)
          }
          if (raw.custom_fields && typeof raw.custom_fields === 'string') {
            raw.custom_fields = JSON.parse(raw.custom_fields)
          }

          const name = String(raw.name ?? '')
          const notes = (raw.notes as string | null) ?? null
          const typedValue = raw.typed_value ?? {}
          const labelIds =
            (raw.labels as string[] | undefined) ?? (raw.label_ids as string[] | undefined) ?? []
          let customFields = (
            (raw.custom_fields as Record<string, unknown>[] | undefined) ?? []
          ).map((f) => ({
            id: String(f.id ?? ''),
            name: String(f.name ?? ''),
            field_type: String(f.field_type ?? 'text'),
            value: String(f.value ?? ''),
          }))

          const idx = customFields.findIndex((f) => f.id === fieldId)
          if (idx >= 0) {
            customFields = customFields.map((f, i) =>
              i === idx ? { ...f, field_type: 'totp', value } : f,
            )
          } else {
            customFields = [
              ...customFields,
              {
                id: fieldId,
                name: 'TOTP',
                field_type: 'totp',
                value,
              },
            ]
          }

          api.api_update_entry(
            DEFAULT_VAULT_ID,
            entryId,
            name,
            notes,
            JSON.stringify(typedValue),
            labelIds,
            JSON.stringify(customFields),
          )
          await saveFn()
          syncFn().catch((e) => console.error(LOG_PREFIX, 'Sync failed:', e))

          scanContext = null
          sendResponse({ success: true })
        } catch (e) {
          console.error(LOG_PREFIX, 'TOTP_QR_APPLY failed:', e)
          sendResponse({ success: false, error: String(e) })
        }
      })()
      return true
    }

    case 'TOTP_QR_CANCEL': {
      scanContext = null
      sendResponse({ success: true })
      break
    }

    default:
      return undefined
  }
  return false
}
