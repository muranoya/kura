import i18n from '../i18n'
import type { AppSettings } from './types'

export function getEntryTypeLabel(type: string): string {
  return i18n.t(`entryTypes.${type}`, { defaultValue: type })
}

// Default app settings
export const DEFAULT_SETTINGS: AppSettings = {
  clipboardClearSeconds: 30,
  autolockMinutes: 5,
  language: 'system',
}

// Default vault ID (single vault for now)
export const DEFAULT_VAULT_ID = 'default'

// Storage keys
export const STORAGE_KEYS = {
  VAULT_BYTES: 'vaultBytes',
  VAULT_ETAG: 'vaultETag',
  S3_CONFIG: 's3Config',
  APP_SETTINGS: 'appSettings',
  LAST_SYNC_TIME: 'lastSyncTime',
  SORT_CONFIG: 'entrySortConfig',
  ENTRY_TYPE_FILTER: 'entryTypeFilter',
}
