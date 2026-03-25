// Entry types supported by kura
export type EntryType = 'login' | 'bank' | 'ssh_key' | 'secure_note' | 'credit_card' | 'passkey'

// Custom field types
export type CustomFieldType = 'text' | 'password' | 'email' | 'url' | 'phone'

// Custom field
export interface CustomField {
  id: string
  name: string
  fieldType: CustomFieldType
  value: string
}

// Entry row for list display
export interface EntryRow {
  id: string
  entryType: EntryType
  name: string
  isFavorite: boolean
  updatedAt: number
  deletedAt: number | null
}

// Entry with full details
export interface Entry extends EntryRow {
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
}

// Storage config for S3
export interface S3Config {
  region: string
  bucket: string
  endpoint?: string
  accessKeyId: string
  secretAccessKey: string
}

// App settings
export interface AppSettings {
  clipboardClearSeconds: number
  autolockMinutes: number
  autolockOnBackground: boolean
  theme?: 'light' | 'dark'
}

