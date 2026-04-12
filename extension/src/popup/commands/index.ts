/**
 * Commands layer for extension popup
 * Wraps chrome.runtime.sendMessage to provide a typed interface
 */

import type { MessageResponse } from '../../shared/messages'
import { sendMessage } from '../../shared/messages'
import type { AppSettings, Entry, EntryFilter, EntryRow, Label } from '../../shared/types'

// Helper to access optional fields on MessageResponse without `any` casts
function field<K extends string, V>(res: MessageResponse, key: K): V | undefined {
  return (res as Record<string, unknown>)[key] as V | undefined
}

// Auth
export async function isUnlocked(): Promise<boolean> {
  const res = await sendMessage({ type: 'IS_UNLOCKED' })
  return field<'unlocked', boolean>(res, 'unlocked') ?? false
}

export async function unlock(password: string): Promise<void> {
  const res = await sendMessage({ type: 'UNLOCK', password })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function recoverWithRecoveryKey(
  recoveryKey: string,
  newPassword: string,
): Promise<void> {
  const res = await sendMessage({ type: 'RECOVER', recoveryKey, newPassword })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function lock(): Promise<void> {
  const res = await sendMessage({ type: 'LOCK' })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

// Entries
export async function listEntries(filter?: EntryFilter): Promise<EntryRow[]> {
  const res = await sendMessage({ type: 'LIST_ENTRIES', filter: filter ?? {} })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'entries', EntryRow[]>(res, 'entries') ?? []
}

export async function getEntry(id: string): Promise<Entry> {
  const res = await sendMessage({ type: 'GET_ENTRY', id })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  const entry = field<'entry', Entry>(res, 'entry')
  if (!entry) throw new Error('Entry not found')
  return entry
}

export async function createEntry(
  entryType: string,
  name: string,
  typedValueJson: string,
  notes?: string,
  labelIds?: string[],
  customFieldsJson?: string,
): Promise<string> {
  const typedValue = JSON.parse(typedValueJson)
  const customFields = customFieldsJson ? JSON.parse(customFieldsJson) : undefined
  const res = await sendMessage({
    type: 'CREATE_ENTRY',
    entryType,
    name,
    typedValue,
    notes,
    labelIds,
    customFields,
  })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'entryId', string>(res, 'entryId') ?? ''
}

export async function updateEntry(
  id: string,
  name: string,
  typedValueJson: string,
  notes?: string,
  labelIds?: string[],
  customFieldsJson?: string,
): Promise<void> {
  const typedValue = JSON.parse(typedValueJson)
  const customFields = customFieldsJson ? JSON.parse(customFieldsJson) : undefined
  const res = await sendMessage({
    type: 'UPDATE_ENTRY',
    id,
    name,
    typedValue,
    notes,
    labelIds,
    customFields,
  })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function deleteEntry(id: string): Promise<void> {
  const res = await sendMessage({ type: 'DELETE_ENTRY', id })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function restoreEntry(id: string): Promise<void> {
  const res = await sendMessage({ type: 'RESTORE_ENTRY', id })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function purgeEntry(id: string): Promise<void> {
  const res = await sendMessage({ type: 'PURGE_ENTRY', id })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  const res = await sendMessage({ type: 'SET_FAVORITE', id, isFavorite })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

// Trash
export async function listTrash(filter?: EntryFilter): Promise<EntryRow[]> {
  const res = await sendMessage({ type: 'LIST_TRASH', filter: { ...filter, includeTrash: true } })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'entries', EntryRow[]>(res, 'entries') ?? []
}

// Labels
export async function listLabels(): Promise<Label[]> {
  const res = await sendMessage({ type: 'LIST_LABELS' })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'labels', Label[]>(res, 'labels') ?? []
}

export async function createLabel(name: string): Promise<string> {
  const res = await sendMessage({ type: 'CREATE_LABEL', name })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'labelId', string>(res, 'labelId') ?? ''
}

export async function deleteLabel(id: string): Promise<void> {
  const res = await sendMessage({ type: 'DELETE_LABEL', id })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function renameLabel(id: string, newName: string): Promise<void> {
  const res = await sendMessage({ type: 'RENAME_LABEL', id, newName })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function setEntryLabels(entryId: string, labelIds: string[]): Promise<void> {
  const res = await sendMessage({ type: 'SET_ENTRY_LABELS', entryId, labelIds })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

// Password & TOTP
export async function generatePassword(
  length = 16,
  includeLowercase = true,
  includeUppercase = true,
  includeNumbers = true,
  includeSymbols1 = true,
  includeSymbols2 = true,
  includeSymbols3 = true,
): Promise<string> {
  const res = await sendMessage({
    type: 'GENERATE_PASSWORD',
    length,
    includeLowercase,
    includeUppercase,
    includeNumbers,
    includeSymbols1,
    includeSymbols2,
    includeSymbols3,
  })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'password', string>(res, 'password') ?? ''
}

export async function generateTotp(secret: string): Promise<string> {
  const res = await sendMessage({ type: 'GENERATE_TOTP', secret })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'totp', string>(res, 'totp') ?? ''
}

export async function generateTotpFromValue(
  value: string,
): Promise<{ totp: string; period: number }> {
  const res = await sendMessage({ type: 'GENERATE_TOTP_FROM_VALUE', value })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return {
    totp: field<'totp', string>(res, 'totp') ?? '',
    period: field<'period', number>(res, 'period') ?? 30,
  }
}

// Export
export async function exportBitwardenJson(): Promise<string> {
  const res = await sendMessage({ type: 'EXPORT_BITWARDEN_JSON' })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'json', string>(res, 'json') ?? ''
}

// Security
export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  const res = await sendMessage({ type: 'CHANGE_MASTER_PASSWORD', oldPassword, newPassword })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

export async function rotateDek(password: string): Promise<string> {
  const res = await sendMessage({ type: 'ROTATE_DEK', password })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'recoveryKey', string>(res, 'recoveryKey') ?? ''
}

export async function regenerateRecoveryKey(password: string): Promise<string> {
  const res = await sendMessage({ type: 'REGENERATE_RECOVERY_KEY', password })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'recoveryKey', string>(res, 'recoveryKey') ?? ''
}

// Storage & Sync
export async function sync(): Promise<void> {
  const res = await sendMessage({ type: 'SYNC' })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}

// Settings
export async function getSettings(): Promise<AppSettings> {
  const res = await sendMessage({ type: 'GET_SETTINGS' })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
  return field<'settings', AppSettings>(res, 'settings') ?? ({} as AppSettings)
}

export async function saveSettings(settings: Partial<AppSettings>): Promise<void> {
  const res = await sendMessage({ type: 'SAVE_SETTINGS', settings })
  if (!res.success) throw new Error(field<'error', string>(res, 'error'))
}
