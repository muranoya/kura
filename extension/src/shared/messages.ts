// Type-safe messaging between popup and Service Worker

import type {
  AutofillCredentialCandidate,
  AutofillFillData,
  CustomFieldSelector,
  EntryFilter,
  EntryRow,
  Label,
  SyncConflict,
} from './types'

export type Message =
  // Auth
  | { type: 'IS_UNLOCKED' }
  | { type: 'UNLOCK'; password: string }
  | { type: 'UNLOCK_EXISTING'; password: string }
  | { type: 'RECOVER'; recoveryKey: string; newPassword: string }
  | { type: 'LOCK' }
  // ロックしたうえで拡張機能の全データを消去する
  | { type: 'LOGOUT' }
  // 拡張機能UIでのユーザー操作の通知（オートロックタイマーの延長）
  | { type: 'USER_ACTIVITY' }
  | { type: 'CREATE_VAULT'; masterPassword: string; s3Config: Record<string, string> }

  // Entries
  | { type: 'LIST_ENTRIES'; filter: EntryFilter }
  | { type: 'GET_ENTRY'; id: string }
  | {
      type: 'CREATE_ENTRY'
      entryType: string
      name: string
      typedValue: Record<string, unknown>
      notes?: string
      labelIds?: string[]
      customFields?: Record<string, unknown>[]
    }
  | {
      type: 'UPDATE_ENTRY'
      id: string
      name: string
      typedValue: Record<string, unknown>
      notes?: string
      labelIds?: string[]
      customFields?: Record<string, unknown>[]
    }
  | { type: 'DELETE_ENTRY'; id: string }
  | { type: 'RESTORE_ENTRY'; id: string }
  | { type: 'PURGE_ENTRY'; id: string }
  | { type: 'SET_FAVORITE'; id: string; isFavorite: boolean }
  | { type: 'LIST_ENTRY_IDS_FOR_URL'; url: string }

  // Trash
  | { type: 'LIST_TRASH'; filter: EntryFilter }

  // Labels
  | { type: 'LIST_LABELS' }
  | { type: 'CREATE_LABEL'; name: string }
  | { type: 'DELETE_LABEL'; id: string }
  | { type: 'RENAME_LABEL'; id: string; newName: string }
  | { type: 'SET_ENTRY_LABELS'; entryId: string; labelIds: string[] }

  // Password & TOTP
  | {
      type: 'GENERATE_PASSWORD'
      length: number
      includeLowercase: boolean
      includeUppercase: boolean
      includeNumbers: boolean
      includeSymbols1: boolean
      includeSymbols2: boolean
      includeSymbols3: boolean
    }
  | { type: 'GENERATE_TOTP'; secret: string }
  | { type: 'GENERATE_TOTP_FROM_VALUE'; value: string }

  // Security
  | { type: 'VERIFY_PASSWORD'; password: string }
  | { type: 'CHANGE_MASTER_PASSWORD'; oldPassword: string; newPassword: string }
  | { type: 'ROTATE_DEK'; password: string }
  | { type: 'REGENERATE_RECOVERY_KEY'; password: string }

  // Storage & Sync
  | { type: 'DOWNLOAD_VAULT' }
  | { type: 'SYNC' }
  | { type: 'GET_SYNC_STATUS' }
  | { type: 'GET_SYNC_CONFLICTS' }
  | { type: 'RESOLVE_SYNC_CONFLICTS'; resolutions: Record<string, 'local' | 'remote'> }

  // Transfer
  | { type: 'DECRYPT_TRANSFER_CONFIG'; password: string; transferString: string }
  | { type: 'ENCRYPT_TRANSFER_CONFIG'; password: string; configJson: string }

  // Settings
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Record<string, unknown> }
  | { type: 'CLIPBOARD_COPIED' }

  // Autofill (Content Script → Service Worker)
  | { type: 'AUTOFILL_GET_CREDENTIALS'; url: string; strictSubdomain?: boolean }
  | { type: 'AUTOFILL_FILL_REQUEST'; entryId: string }
  | { type: 'AUTOFILL_GET_TOTP'; url: string; entryId: string }
  | { type: 'AUTOFILL_GET_TOTP_CANDIDATES'; url: string }
  | { type: 'AUTOFILL_GET_CREDIT_CARDS' }
  | { type: 'AUTOFILL_PENDING_FLOW_STORE'; entryId: string; username: string; url: string }
  | { type: 'AUTOFILL_PENDING_FLOW_QUERY'; url: string }

  // Autofill: Credential Capture
  | { type: 'AUTOFILL_START_CAPTURE' }
  | {
      type: 'AUTOFILL_SAVE_CAPTURED'
      url: string
      name: string | null
      username: string | null
      password: string
    }

  // TOTP QR scan (page screenshot)
  | { type: 'TOTP_QR_START'; entryId: string; fieldId: string }
  | { type: 'TOTP_QR_END' }
  | { type: 'TOTP_QR_CAPTURE' }
  | { type: 'TOTP_QR_APPLY'; value: string }
  | { type: 'TOTP_QR_CANCEL' }

  // カスタムフィールドのオートフィルセレクタ ピッカー
  // サイドバー → Service Worker: 既存エントリの編集画面からのみ起動可能（entryId必須）
  | { type: 'PICKER_START'; entryId: string; fieldId: string }
  | { type: 'PICKER_CANCEL' }
  // Content Script → Service Worker: ページ上で要素が確定されたときの結果報告
  | { type: 'PICKER_RESULT'; fieldId: string; selector: CustomFieldSelector }

export type MessageResponse =
  // Common
  | { success: true }
  | { success: false; error: string }

  // Auth responses
  | ({ success: true } & {
      unlocked?: boolean
      recoveryKey?: string
      vaultBytes?: string
      vaultExists?: boolean
    })

  // Entry responses
  | ({ success: true } & {
      entry?: EntryRow | null
      entries?: EntryRow[]
      entryId?: string
      entryIds?: string[]
    })

  // Label responses
  | ({ success: true } & {
      label?: Label | null
      labels?: Label[]
    })

  // Password & TOTP responses
  | ({ success: true } & {
      password?: string
      totp?: string
    })

  // Security responses
  | ({ success: true } & {
      recoveryKey?: string
    })

  // Sync responses
  | ({ success: true } & {
      status?: 'idle' | 'syncing' | 'success' | 'conflict' | 'error'
      lastSyncTime?: string | null
      conflicts?: SyncConflict[]
      conflict?: boolean
    })

  // Transfer responses
  | ({ success: true } & {
      configJson?: string
      transferString?: string
    })

  // Settings responses
  | ({ success: true } & {
      settings?: Record<string, unknown>
    })

  // Autofill responses
  | ({ success: true } & {
      credentials?: AutofillCredentialCandidate[]
      fillData?: AutofillFillData
      totpCode?: string
      creditCards?: AutofillCredentialCandidate[]
      totpCandidates?: AutofillCredentialCandidate[]
      pendingFlow?: { entryId: string; username: string; password: string } | null
    })

  // TOTP QR scan responses
  | ({ success: true } & {
      dataUrl?: string
    })

// Service Worker → 拡張機能ページ（サイドバー）へのブロードキャスト。
// サイドバーは開いたままになるため、SW側で起きた状態変化をその場で反映する必要がある。
export type ExtensionPageBroadcast =
  | { type: 'VAULT_LOCK_STATE_CHANGED'; unlocked: boolean }
  // ピッカー / TOTP QRスキャン / Passkey登録の結果をSW側でエントリへ書き込んだ。
  // change はSWが書き換えた属性で、受信側はその属性だけを反映する
  | {
      type: 'ENTRY_UPDATED_IN_BACKGROUND'
      entryId: string
      fieldId: string
      change: BackgroundFieldChange
    }

/**
 * SW側でカスタムフィールドのどの属性を書き換えたか。
 * - autofillSelector: ピッカーでセレクタを設定した
 * - totp: TOTP QRスキャンで種類と値を設定した（フィールドが無ければ追加した）
 * - passkey: Passkeyの登録で既存エントリにpasskeyフィールドを追加した
 */
export type BackgroundFieldChange = 'autofillSelector' | 'totp' | 'passkey'

export function broadcastToExtensionPages(message: ExtensionPageBroadcast) {
  // 受信側（サイドバー）が開いていない場合は reject されるので無視する
  chrome.runtime.sendMessage(message).catch(() => {})
}

export function sendMessage<T extends Message>(
  message: T,
  maxRetries = 2,
  delayMs = 500,
): Promise<MessageResponse> {
  return new Promise((resolve, reject) => {
    const attempt = (retriesLeft: number) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          if (retriesLeft > 0) {
            setTimeout(() => attempt(retriesLeft - 1), delayMs)
          } else {
            reject(chrome.runtime.lastError)
          }
        } else {
          resolve(response || { success: false, error: 'No response' })
        }
      })
    }
    attempt(maxRetries)
  })
}
