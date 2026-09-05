// カスタムフィールドのオートフィルセレクタ ピッカー — Service Worker側ハンドラ
//
// popupのライフサイクル問題（対象ページをクリックするとpopupが閉じ、Reactの状態が
// 破棄される）への対処として、TOTP QRスキャン（totp-qr-scan.ts）と同じ方式を採る。
// ピッカーの選択結果は popup のフォーム状態を経由せず、Service Worker側で直接
// api_update_entry により該当カスタムフィールドへ書き込む。
// 詳細: docs/extension-custom-field-autofill.md 4-3節

import { DEFAULT_VAULT_ID } from '../shared/constants'

const LOG_PREFIX = '[kura:picker:sw]'

interface PickerContext {
  entryId: string
  fieldId: string
  tabId: number
}

interface RawCustomFieldSelector {
  tag?: string
  name?: string
  id?: string
  type?: string
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
}

let vaultApi: VaultApi | null = null
let isUnlocked: () => boolean = () => false
let saveLocallyFn: (() => Promise<void>) | null = null
let autoSyncFn: (() => Promise<void>) | null = null

let pickerContext: PickerContext | null = null
// popup再起動後にPICKER_QUERY_RESULTで一度だけ取り出される、直近の適用結果
let pendingResult: { entryId: string; fieldId: string } | null = null

export function initPicker(
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

export function clearPickerContext() {
  pickerContext = null
}

export function handlePickerMessage(
  message: { type?: string; entryId?: string; fieldId?: string; selector?: RawCustomFieldSelector },
  sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void,
): boolean | undefined {
  switch (message.type) {
    case 'PICKER_START': {
      if (!isUnlocked()) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      const entryId = message.entryId
      const fieldId = message.fieldId
      if (!entryId || !fieldId) {
        // V1では新規作成中エントリからのピッカー起動は非対応（既存エントリの
        // 編集画面のみ）。詳細: docs/extension-custom-field-autofill.md 4-3節ケースB
        sendResponse({ success: false, error: 'entryId and fieldId required' })
        break
      }
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0]
        if (!tab?.id) {
          sendResponse({ success: false, error: 'No active tab' })
          return
        }
        pickerContext = { entryId, fieldId, tabId: tab.id }
        chrome.tabs
          .sendMessage(tab.id, { type: 'PICKER_START', fieldId }, { frameId: 0 })
          .then(() => sendResponse({ success: true }))
          .catch((e) => {
            pickerContext = null
            sendResponse({ success: false, error: String(e) })
          })
      })
      return true
    }

    case 'PICKER_RESULT': {
      if (!isUnlocked() || !vaultApi || !saveLocallyFn || !autoSyncFn) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      if (!pickerContext) {
        sendResponse({ success: false, error: 'No active picker' })
        break
      }
      if (sender.tab?.id != null && sender.tab.id !== pickerContext.tabId) {
        sendResponse({ success: false, error: 'Picker tab mismatch' })
        break
      }
      const selector = message.selector
      if (!selector) {
        sendResponse({ success: false, error: 'selector required' })
        break
      }

      const { entryId, fieldId } = pickerContext
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
          const customFields = (
            (raw.custom_fields as Record<string, unknown>[] | undefined) ?? []
          ).map((f) => ({
            id: String(f.id ?? ''),
            name: String(f.name ?? ''),
            field_type: String(f.field_type ?? 'text'),
            value: String(f.value ?? ''),
            autofill_selector: f.autofill_selector ?? undefined,
          }))

          const idx = customFields.findIndex((f) => f.id === fieldId)
          if (idx < 0) {
            sendResponse({ success: false, error: 'Field not found' })
            return
          }
          customFields[idx] = { ...customFields[idx], autofill_selector: selector }

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

          pendingResult = { entryId, fieldId }
          pickerContext = null
          sendResponse({ success: true })

          // popupは対象ページのクリックで閉じているため、結果を反映できるよう再起動する
          chrome.action.openPopup().catch((e) => {
            console.warn(LOG_PREFIX, 'openPopup failed (user may need to reopen manually):', e)
          })
        } catch (e) {
          console.error(LOG_PREFIX, 'PICKER_RESULT failed:', e)
          sendResponse({ success: false, error: String(e) })
        }
      })()
      return true
    }

    case 'PICKER_QUERY_RESULT': {
      sendResponse({ success: true, pickerResult: pendingResult })
      pendingResult = null
      break
    }

    case 'PICKER_CANCEL': {
      if (pickerContext) {
        chrome.tabs
          .sendMessage(pickerContext.tabId, { type: 'PICKER_CANCEL' }, { frameId: 0 })
          .catch(() => {}) // タブが既に閉じている可能性がある
      }
      pickerContext = null
      sendResponse({ success: true })
      break
    }

    default:
      return undefined
  }
  return false
}
