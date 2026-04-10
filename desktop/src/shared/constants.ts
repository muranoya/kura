// Entry type labels and icons
export const ENTRY_TYPE_LABELS: Record<string, string> = {
  login: 'ログイン',
  bank: '銀行口座',
  ssh_key: 'SSHキー',
  secure_note: 'セキュアノート',
  credit_card: 'クレジットカード',
  password: 'パスワード',
  software_license: 'ソフトウェアライセンス',
}

export function getEntryTypeLabel(type: string): string {
  return ENTRY_TYPE_LABELS[type] ?? type
}

// Default app settings
export const DEFAULT_SETTINGS = {
  clipboardClearSeconds: 30,
  autolockMinutes: 5,
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
