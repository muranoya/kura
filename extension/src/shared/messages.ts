// Type-safe messaging between popup and Service Worker

import { EntryRow, Label, EntryFilter, SyncConflict } from '../vault/types'

export type Message =
  // Auth
  | { type: 'IS_UNLOCKED' }
  | { type: 'UNLOCK'; password: string }
  | { type: 'RECOVER'; recoveryKey: string; newPassword: string }
  | { type: 'LOCK' }
  | { type: 'CREATE_VAULT'; masterPassword: string; s3Config: Record<string, string> }

  // Entries
  | { type: 'LIST_ENTRIES'; filter: EntryFilter }
  | { type: 'GET_ENTRY'; id: string }
  | { type: 'CREATE_ENTRY'; entryType: string; name: string; typed_value: any; notes?: string }
  | { type: 'UPDATE_ENTRY'; id: string; name: string; typed_value: any; notes?: string }
  | { type: 'DELETE_ENTRY'; id: string }
  | { type: 'RESTORE_ENTRY'; id: string }
  | { type: 'PURGE_ENTRY'; id: string }
  | { type: 'SET_FAVORITE'; id: string; isFavorite: boolean }

  // Trash
  | { type: 'LIST_TRASH'; filter: EntryFilter }

  // Labels
  | { type: 'LIST_LABELS' }
  | { type: 'CREATE_LABEL'; name: string }
  | { type: 'DELETE_LABEL'; id: string }
  | { type: 'SET_ENTRY_LABELS'; entryId: string; labelIds: string[] }

  // Sync
  | { type: 'SYNC' }
  | { type: 'GET_SYNC_STATUS' }
  | { type: 'GET_SYNC_CONFLICTS' }
  | { type: 'RESOLVE_SYNC_CONFLICTS'; resolutions: Record<string, 'local' | 'remote'> }

  // Settings
  | { type: 'GET_SETTINGS' }
  | { type: 'SAVE_SETTINGS'; settings: Record<string, any> }
  | { type: 'CLIPBOARD_COPIED' }

export type MessageResponse =
  // Common
  | { success: true }
  | { success: false; error: string }

  // Auth responses
  | ({ success: true } & {
      unlocked?: boolean
      recoveryKey?: string
      vaultBytes?: string
    })

  // Entry responses
  | ({ success: true } & {
      entry?: EntryRow | null
      entries?: EntryRow[]
    })

  // Label responses
  | ({ success: true } & {
      label?: Label | null
      labels?: Label[]
    })

  // Sync responses
  | ({ success: true } & {
      status?: 'idle' | 'syncing' | 'success' | 'conflict' | 'error'
      lastSyncTime?: string | null
      conflicts?: SyncConflict[]
      conflict?: boolean
    })

  // Settings responses
  | ({ success: true } & {
      settings?: Record<string, any>
    })

export function sendMessage<T extends Message>(
  message: T
): Promise<MessageResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError)
      } else {
        resolve(response || { success: false, error: 'No response' })
      }
    })
  })
}
