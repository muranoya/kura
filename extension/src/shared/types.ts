// Entry types supported by kura
export type EntryType =
  | 'login'
  | 'bank'
  | 'ssh_key'
  | 'secure_note'
  | 'credit_card'
  | 'password'
  | 'software_license'

// Custom field types
export type CustomFieldType = 'text' | 'password' | 'email' | 'url' | 'phone' | 'totp' | 'passkey'

// DOM要素マッチ条件（タグ名・name属性・id属性・type属性、各項目optional）。
// 詳細: docs/extension-custom-field-autofill.md 2-1節
export interface CustomFieldSelector {
  tag?: string
  name?: string
  id?: string
  type?: string
}

// Custom field
export interface CustomField {
  id: string
  name: string
  fieldType: CustomFieldType
  value: string
  // 秘匿フィールド（vault 内で secret ブロックに保存され、検索・オートフィル候補判定の
  // 対象外になる）かどうか。password / totp / passkey は常に true。
  // text / email / url / phone はユーザーが選べる。詳細: docs/vault-format-v2.md 4-2節
  secret?: boolean
  autofillSelector?: CustomFieldSelector
}

// ユーザーが「秘匿」を切り替えられるカスタムフィールドの型
export const SECRET_TOGGLEABLE_FIELD_TYPES: readonly CustomFieldType[] = [
  'text',
  'email',
  'url',
  'phone',
]

// カスタムフィールドが秘匿フィールドかどうか。vault-core が返す secret（保存先）に従う。
// password / totp / passkey は保存時に常に true へ正規化されている。
// secret を持たない場合だけ、型から判断する
export function isSecretCustomField(field: Pick<CustomField, 'fieldType' | 'secret'>): boolean {
  return field.secret ?? !SECRET_TOGGLEABLE_FIELD_TYPES.includes(field.fieldType)
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
  subtitle: string | null
  isFavorite: boolean
  createdAt: number
  updatedAt: number
  deletedAt: number | null
  labelNames: string[]
}

// Entry with full details
export interface Entry extends Omit<EntryRow, 'labelNames'> {
  createdAt: number
  notes: string | null
  typedValue: Record<string, unknown>
  labels: string[]
  customFields: CustomField[]
  // typedValue のうち秘匿値のキー（マスク表示の対象）
  secretFieldKeys: string[]
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
  /** WebAuthn/Passkey対応のON/OFF。デフォルトOFF（未設定時はfalse扱い）。 */
  passkeyEnabled?: boolean
}

// Autofill types

/** Credential candidate shown in the dropdown (no password) */
export interface AutofillCredentialCandidate {
  entryId: string
  name: string
  username: string | null
  totpPeriod?: number
}

/** カスタムフィールドのセレクタベース充填1件分（セレクタ設定済みのものだけを含む） */
export interface AutofillCustomFieldFillEntry {
  selector: CustomFieldSelector
  value: string
}

/** Full credential data sent only when the user selects a candidate */
export interface AutofillFillData {
  username: string | null
  password: string | null
  customFields?: AutofillCustomFieldFillEntry[]
}

// Sync conflict reported after a merge
export interface SyncConflict {
  entryId: string
  entryName: string
  conflictType: 'local_modified_remote_deleted' | 'remote_modified_local_deleted' | 'both_modified'
  localValue?: unknown
  remoteValue?: unknown
}
