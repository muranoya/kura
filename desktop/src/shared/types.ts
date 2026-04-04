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

// App settings
export interface AppSettings {
  clipboardClearSeconds: number
  autolockMinutes: number
}

// ============================================================================
// Import types
// ============================================================================

export type DuplicateConfidence = 'high' | 'medium' | 'low'

export interface DuplicateCandidate {
  existing_entry_id: string
  existing_entry_name: string
  existing_entry_type: string
  confidence: DuplicateConfidence
  reason: string
}

export type ImportAction =
  | 'import'
  | { overwrite: { existing_entry_id: string } }
  | 'skip'

export interface SourceCategory {
  category_uuid: string
  category_name: string
  is_direct_mapping: boolean
}

export interface ImportPreviewItem {
  source_id: string
  source_name: string
  source_category: SourceCategory
  source_vault_name: string
  target_entry_type: string
  target_name: string
  duplicates: DuplicateCandidate[]
  default_action: ImportAction
  has_attachments: boolean
  tags: string[]
  field_count: number
}

export interface ImportPreviewStats {
  total_items: number
  by_target_type: [string, number][]
  duplicate_count: number
  attachment_warning_count: number
  indirect_mapping_count: number
}

export interface ImportPreview {
  stats: ImportPreviewStats
  items: ImportPreviewItem[]
  source_account_name: string
  source_vault_names: string[]
}

export interface ImportItemAction {
  source_id: string
  action: ImportAction
  target_entry_type?: string
}

export interface ImportItemResult {
  source_id: string
  source_name: string
  success: boolean
  action_taken: string
  created_entry_id: string | null
  error: string | null
}

export interface ImportResult {
  created_count: number
  overwritten_count: number
  skipped_count: number
  error_count: number
  labels_created: string[]
  items: ImportItemResult[]
}
