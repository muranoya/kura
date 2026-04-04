// Entry types supported by kura
export type EntryType = 'login' | 'bank' | 'ssh_key' | 'secure_note' | 'credit_card' | 'passkey' | 'password' | 'software_license'

// Custom field types
export type CustomFieldType = 'text' | 'password' | 'email' | 'url' | 'phone' | 'totp'

// Custom field
export interface CustomField {
  id: string
  name: string
  fieldType: CustomFieldType
  value: string
}

// Sort types
export type SortField = 'name' | 'created_at' | 'updated_at'
export type SortOrder = 'asc' | 'desc'

export interface SortConfig {
  field: SortField
  order: SortOrder
}

// Entry row for list display
export interface EntryRow {
  id: string
  entryType: EntryType
  name: string
  isFavorite: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
}

// Entry with full details
export interface Entry extends EntryRow {
  createdAt: number
  notes: string | null
  typedValue: Record<string, unknown>
  labels: string[]
  customFields: CustomField[]
}

// Label
export interface Label {
  id: string
  name: string
}

// Filter for list_entries
export interface EntryFilter {
  searchQuery?: string
  type?: EntryType
  labelId?: string
  includeTrash?: boolean
  onlyFavorites?: boolean
  sortField?: SortField
  sortOrder?: SortOrder
}

// Storage config for S3
export interface S3Config {
  region: string
  bucket: string
  key: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
}

// Onboarding draft state
export interface OnboardingDraft {
  storageType: string
  endpoint: string
  bucket: string
  region: string
  key: string
  accessKeyId: string
  secretAccessKey: string
}

// App settings
export interface AppSettings {
  clipboardClearSeconds: number
  autolockMinutes: number
  theme?: 'light' | 'dark'
}
