import { invoke } from '@tauri-apps/api/core'
import { DEFAULT_VAULT_ID, STORAGE_KEYS } from '../shared/constants'
import { getFromStorage, saveToStorage } from '../shared/storage'
import type { Entry, EntryFilter, EntryRow, Label } from '../shared/types'

const vaultId = DEFAULT_VAULT_ID

// ============================================================================
// Session Management
// ============================================================================

export async function createVault(masterPassword: string): Promise<string> {
  return invoke<string>('create_vault', { vaultId, masterPassword })
}

export async function loadVault(vaultBytes: number[], etag: string): Promise<void> {
  return invoke<void>('load_vault', { vaultId, vaultBytes, etag })
}

export async function unlock(masterPassword: string): Promise<void> {
  return invoke<void>('unlock', { vaultId, masterPassword })
}

export async function unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
  return invoke<void>('unlock_with_recovery_key', { vaultId, recoveryKey })
}

export async function lock(): Promise<number[]> {
  return invoke<number[]>('lock', { vaultId })
}

export async function getVaultBytes(): Promise<number[]> {
  return invoke<number[]>('get_vault_bytes', { vaultId })
}

export async function isUnlocked(): Promise<boolean> {
  return invoke<boolean>('is_unlocked', { vaultId })
}

// ============================================================================
// Entries
// ============================================================================

export async function listEntries(filter?: EntryFilter): Promise<EntryRow[]> {
  return invoke<EntryRow[]>('list_entries', {
    vaultId,
    searchQuery: filter?.searchQuery ?? null,
    entryType: filter?.type ?? null,
    labelId: filter?.labelId ?? null,
    includeTrash: filter?.includeTrash ?? false,
    onlyFavorites: filter?.onlyFavorites ?? false,
  })
}

export async function getEntry(id: string): Promise<Entry> {
  const entry = await invoke<Record<string, unknown>>('get_entry', { vaultId, id })
  return {
    ...entry,
    customFields: ((entry.customFields as Array<Record<string, unknown>>) ?? []).map(
      (f: Record<string, unknown>) => ({
        id: f.id,
        name: f.name,
        fieldType: f.field_type,
        value: f.value,
      }),
    ),
  }
}

export async function createEntry(
  entryType: string,
  name: string,
  typedValueJson: string,
  notes?: string,
  labelIds?: string[],
  customFields?: string,
): Promise<string> {
  return invoke<string>('create_entry', {
    vaultId,
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
  customFields?: string,
): Promise<void> {
  return invoke<void>('update_entry', {
    vaultId,
    id,
    name,
    notes: notes ?? null,
    typedValueJson: typedValueJson ?? null,
    labelIds: labelIds ?? null,
    customFields: customFields ?? null,
  })
}

export async function deleteEntry(id: string): Promise<void> {
  return invoke<void>('delete_entry', { vaultId, id })
}

export async function restoreEntry(id: string): Promise<void> {
  return invoke<void>('restore_entry', { vaultId, id })
}

export async function purgeEntry(id: string): Promise<void> {
  return invoke<void>('purge_entry', { vaultId, id })
}

export async function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  return invoke<void>('set_favorite', { vaultId, id, isFavorite })
}

// ============================================================================
// Labels
// ============================================================================

export async function listLabels(): Promise<Label[]> {
  return invoke<Label[]>('list_labels', { vaultId })
}

export async function createLabel(name: string): Promise<Label> {
  return invoke<Label>('create_label', { vaultId, name })
}

export async function deleteLabel(id: string): Promise<void> {
  return invoke<void>('delete_label', { vaultId, id })
}

export async function renameLabel(id: string, newName: string): Promise<void> {
  return invoke<void>('rename_label', { vaultId, id, newName })
}

export async function setEntryLabels(entryId: string, labelIds: string[]): Promise<void> {
  return invoke<void>('set_entry_labels', { vaultId, entryId, labelIds })
}

// ============================================================================
// Security
// ============================================================================

export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
): Promise<void> {
  return invoke<void>('change_master_password', { vaultId, oldPassword, newPassword })
}

export async function upgradeArgon2Params(
  password: string,
  iterations: number,
  memory: number,
  parallelism: number,
): Promise<string> {
  return invoke<string>('upgrade_argon2_params', {
    vaultId,
    password,
    iterations,
    memory,
    parallelism,
  })
}

export async function rotateDek(password: string): Promise<string> {
  return invoke<string>('rotate_dek', { vaultId, password })
}

export async function regenerateRecoveryKey(password: string): Promise<string> {
  return invoke<string>('regenerate_recovery_key', { vaultId, password })
}

// ============================================================================
// Utils
// ============================================================================

export async function generatePassword(
  length = 16,
  includeUppercase = true,
  includeLowercase = true,
  includeNumbers = true,
  includeSymbols = true,
): Promise<string> {
  return invoke<string>('generate_password', {
    length,
    includeUppercase,
    includeLowercase,
    includeNumbers,
    includeSymbols,
  })
}

export async function generateTotp(secret: string, digits = 6, period = 30): Promise<string> {
  return invoke<string>('generate_totp', { secret, digits, period })
}

export async function generateTotpDefault(secret: string): Promise<string> {
  return invoke<string>('generate_totp_default', { secret })
}

// ============================================================================
// Sync
// ============================================================================

export async function syncVault(storageConfig: string): Promise<{
  synced: boolean
  last_synced_at: number | null
}> {
  return invoke<{ synced: boolean; last_synced_at: number | null }>('sync_vault', {
    vaultId,
    storageConfig,
  })
}

export async function pushVault(storageConfig: string): Promise<number> {
  return invoke<number>('push_vault', { vaultId, storageConfig })
}

/// ヘルパー: pushVaultを実行して、タイムスタンプをストレージに保存
/// 再暗号化操作（マスターパスワード変更・DEKローテーション・リカバリーキー再生成）後専用。
/// 通常のデータ変更にはsyncVaultIfConfiguredを使用すること。
export async function pushVaultAndTrack(storageConfig: string): Promise<void> {
  const ts = await pushVault(storageConfig)
  await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, ts)
}

/// S3設定がある場合のみ syncVault を呼び出す（エラーはサイレント無視）
/// 実際にデータが同期された場合は true を返す
export async function syncVaultIfConfigured(): Promise<boolean> {
  const config = await getFromStorage<Record<string, unknown>>(STORAGE_KEYS.S3_CONFIG)
  if (!config) return false
  try {
    const result = await syncVault(JSON.stringify(config))
    if (result.last_synced_at) {
      await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, result.last_synced_at)
    }
    return result.synced
  } catch (e) {
    console.warn('Background sync failed:', e)
    return false
  }
}

export async function getLastSyncTime(): Promise<number | null> {
  return invoke<number | null>('get_last_sync_time', { vaultId })
}

export async function downloadVault(storageConfig: string): Promise<boolean> {
  return invoke<boolean>('download_vault', { vaultId, storageConfig })
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
