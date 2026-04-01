// Entry type labels and icons
export const ENTRY_TYPE_LABELS: Record<string, string> = {
  login: 'ログイン',
  bank: '銀行口座',
  ssh_key: 'SSHキー',
  secure_note: 'セキュアノート',
  credit_card: 'クレジットカード',
  passkey: 'PassKey',
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
  autolockOnBackground: true,
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
}

// Password generation defaults
export const PASSWORD_GENERATION_DEFAULTS = {
  length: 16,
  includeUppercase: true,
  includeLowercase: true,
  includeNumbers: true,
  includeSymbols: true,
}

// TOTP defaults
export const TOTP_DEFAULTS = {
  digits: 6,
  period: 30,
}
