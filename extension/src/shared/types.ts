// TypeScript 型定義

export interface AppSettings {
  clipboardClearSeconds: number
  autolockMinutes: number
  autolockOnBackground: boolean
  screenshotPreventionEnabled: boolean
}

export interface S3Config {
  region: string
  bucket: string
  key: string
  access_key_id: string
  secret_access_key: string
  endpoint?: string
}

export interface EntryRow {
  id: string
  entry_type: string
  name: string
  is_favorite: boolean
  updated_at: number
  deleted_at: number | null
}

export interface Entry extends EntryRow {
  notes: string | null
  typed_value: string // JSON
  labels: string[]
}

export interface Label {
  id: string
  name: string
}

export type EntryType = 'login' | 'bank' | 'ssh_key' | 'secure_note' | 'credit_card' | 'passkey'

export interface LoginData {
  url?: string
  username?: string
  password?: string
  totp?: string
}

export interface BankData {
  bank_name?: string
  account_number?: string
  pin?: string
}

export interface SshKeyData {
  private_key?: string
  passphrase?: string
}

export interface SecureNoteData {
  content?: string
}

export interface CreditCardData {
  cardholder?: string
  number?: string
  expiry?: string
  cvv?: string
}
