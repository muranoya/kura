// Default vault ID for single-vault extension
export const DEFAULT_VAULT_ID = 'default'

// Entry type identifiers (UIラベルは i18n の `entries.types.*` キーを参照する)
export const ENTRY_TYPE_KEYS = [
  'login',
  'bank',
  'ssh_key',
  'secure_note',
  'credit_card',
  'password',
  'software_license',
] as const
export type EntryTypeKey = (typeof ENTRY_TYPE_KEYS)[number]

// Default app settings
export const DEFAULT_SETTINGS = {
  clipboardClearSeconds: 30,
  autolockMinutes: 5,
}

// Storage keys
export const STORAGE_KEYS = {
  VAULT_BYTES: 'vaultBytes',
  VAULT_ETAG: 'vaultETag',
  S3_CONFIG: 's3Config',
  APP_SETTINGS: 'appSettings',
  ONBOARDING_DRAFT: 'onboardingDraft',
  ONBOARDING_FLOW: 'onboardingFlow',
  LAST_SYNC_TIME: 'lastSyncTime',
  LAST_ERROR: 'lastError',
  SORT_CONFIG: 'entrySortConfig',
  SEARCH_QUERY: 'entrySearchQuery',
  ENTRY_TYPE_FILTER: 'entryTypeFilter',
  LABEL_FILTER: 'entryLabelFilter',
  SELECTED_ENTRY_ID: 'entrySelectedId',
  FAVORITES_FILTER: 'entryFavoritesFilter',
  SESSION_PASSWORD: 'sessionPassword',
}
