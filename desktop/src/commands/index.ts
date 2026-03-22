import { invoke } from '@tauri-apps/api/core'
import { EntryRow, Entry, Label, EntryFilter } from '../shared/types'

// ============================================================================
// Session Management
// ============================================================================

export async function createVault(masterPassword: string): Promise<string> {
  return invoke<string>('create_vault', { masterPassword })
}

export async function loadVault(vaultBytes: number[], etag: string): Promise<void> {
  return invoke<void>('load_vault', { vaultBytes, etag })
}

export async function unlock(masterPassword: string): Promise<void> {
  return invoke<void>('unlock', { masterPassword })
}

export async function unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
  return invoke<void>('unlock_with_recovery_key', { recoveryKey })
}

export async function lock(): Promise<number[]> {
  return invoke<number[]>('lock')
}

export async function getVaultBytes(): Promise<number[]> {
  return invoke<number[]>('get_vault_bytes')
}

export async function isUnlocked(): Promise<boolean> {
  return invoke<boolean>('is_unlocked')
}

// ============================================================================
// Entries
// ============================================================================

export async function listEntries(filter?: EntryFilter): Promise<EntryRow[]> {
  return invoke<EntryRow[]>('list_entries', {
    searchQuery: filter?.searchQuery ?? null,
    entryType: filter?.type ?? null,
    labelId: filter?.labelId ?? null,
    includeTrash: filter?.includeTrash ?? false,
  })
}

export async function getEntry(id: string): Promise<Entry> {
  return invoke<Entry>('get_entry', { id })
}

export async function createEntry(
  entryType: string,
  name: string,
  typedValueJson: string,
  notes?: string,
  labelIds?: string[],
  customFields?: string
): Promise<string> {
  return invoke<string>('create_entry', {
    entryType,
    name,
    notes: notes ?? null,
    typedValueJson,
    labelIds: labelIds ?? [],
    customFields: customFields ?? null,
  })
}

export async function updateEntry(
  id: string,
  name: string,
  typedValueJson: string,
  notes?: string,
  labelIds?: string[],
  customFields?: string
): Promise<void> {
  return invoke<void>('update_entry', {
    id,
    name,
    notes: notes ?? null,
    typedValueJson: typedValueJson ?? null,
    labelIds: labelIds ?? null,
    customFields: customFields ?? null,
  })
}

export async function deleteEntry(id: string): Promise<void> {
  return invoke<void>('delete_entry', { id })
}

export async function restoreEntry(id: string): Promise<void> {
  return invoke<void>('restore_entry', { id })
}

export async function purgeEntry(id: string): Promise<void> {
  return invoke<void>('purge_entry', { id })
}

export async function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  return invoke<void>('set_favorite', { id, isFavorite })
}

// ============================================================================
// Labels
// ============================================================================

export async function listLabels(): Promise<Label[]> {
  return invoke<Label[]>('list_labels')
}

export async function createLabel(name: string): Promise<Label> {
  return invoke<Label>('create_label', { name })
}

export async function deleteLabel(id: string): Promise<void> {
  return invoke<void>('delete_label', { id })
}

export async function setEntryLabels(entryId: string, labelIds: string[]): Promise<void> {
  return invoke<void>('set_entry_labels', { entryId, labelIds })
}

// ============================================================================
// Security
// ============================================================================

export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string
): Promise<void> {
  return invoke<void>('change_master_password', { oldPassword, newPassword })
}

export async function upgradeArgon2Params(
  password: string,
  iterations: number,
  memory: number,
  parallelism: number
): Promise<void> {
  return invoke<void>('upgrade_argon2_params', {
    password,
    iterations,
    memory,
    parallelism,
  })
}

export async function rotateDek(password: string): Promise<void> {
  return invoke<void>('rotate_dek', { password })
}

export async function regenerateRecoveryKey(password: string): Promise<string> {
  return invoke<string>('regenerate_recovery_key', { password })
}

// ============================================================================
// Utils
// ============================================================================

export async function generatePassword(
  length: number = 16,
  includeUppercase: boolean = true,
  includeLowercase: boolean = true,
  includeNumbers: boolean = true,
  includeSymbols: boolean = true
): Promise<string> {
  return invoke<string>('generate_password', {
    length,
    includeUppercase,
    includeLowercase,
    includeNumbers,
    includeSymbols,
  })
}

export async function generateTotp(secret: string, digits: number = 6, period: number = 30): Promise<string> {
  return invoke<string>('generate_totp', { secret, digits, period })
}

export async function generateTotpDefault(secret: string): Promise<string> {
  return invoke<string>('generate_totp_default', { secret })
}

// ============================================================================
// Sync
// ============================================================================

export async function syncVault(storageConfig: string): Promise<{
  hasConflicts: boolean
  conflicts: unknown[]
}> {
  return invoke<{ hasConflicts: boolean; conflicts: unknown[] }>('sync_vault', {
    storageConfig,
  })
}

export async function pushVault(storageConfig: string): Promise<void> {
  return invoke<void>('push_vault', { storageConfig })
}

export async function resolveConflict(id: string, resolution: string): Promise<void> {
  return invoke<void>('resolve_conflict', { id, resolution })
}

// ============================================================================
// Storage (Local File Operations)
// ============================================================================

export async function readVaultFile(): Promise<number[] | null> {
  return invoke<number[] | null>('read_vault_file')
}

export async function writeVaultFile(bytes: number[]): Promise<void> {
  return invoke<void>('write_vault_file', { bytes })
}

export async function vaultFileExists(): Promise<boolean> {
  return invoke<boolean>('vault_file_exists')
}

export async function deleteVaultFile(): Promise<void> {
  return invoke<void>('delete_vault_file')
}
