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
  // 初期設定でダウンロードした、まだアンロックしていない既存 Vault（{ bytes, etag }）。
  // VAULT_BYTES があると App は初期設定の完了とみなすため、アンロック成功まで分けて置く
  PENDING_VAULT: 'pendingVault',
  S3_CONFIG: 's3Config',
  APP_SETTINGS: 'appSettings',
  // 旧バージョンが平文のS3認証情報を保存していたキー。削除のためだけに残している
  LEGACY_ONBOARDING_DRAFT: 'onboardingDraft',
  ONBOARDING_FLOW: 'onboardingFlow',
  LAST_SYNC_TIME: 'lastSyncTime',
  LAST_ERROR: 'lastError',
  SORT_CONFIG: 'entrySortConfig',
  SEARCH_QUERY: 'entrySearchQuery',
  ENTRY_TYPE_FILTER: 'entryTypeFilter',
  LABEL_FILTER: 'entryLabelFilter',
  SELECTED_ENTRY_ID: 'entrySelectedId',
  FAVORITES_FILTER: 'entryFavoritesFilter',
  // アンロック中の DEK（base64）。SW 再起動時のセッション復元用（マスターパスワードは保存しない）
  SESSION_DEK: 'sessionDek',
  // 自動消去の対象としてコピーした値の SHA-256（平文は置かない）
  CLIPBOARD_HASH: 'clipboardHash',
}
