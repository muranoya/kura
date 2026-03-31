import * as wasmModule from '../../wasm/wasm_bridge'
import type { EntryFilter, EntryRow, Label, Vault } from './types'

/** WASM API surface - loosely typed since the actual shape comes from wasm-bindgen */
interface WasmApi {
  api_create_new_vault(masterPassword: string): string
  api_load_vault(vaultBytes: string | Uint8Array, etag?: string): string
  api_unlock(masterPassword: string): boolean
  api_unlock_with_recovery_key(recoveryKey: string): void
  api_lock(): string | Uint8Array
  api_get_vault_bytes(): string | Uint8Array
  api_list_entries(
    searchQuery: string | null,
    type: string | null,
    labelId: string | null,
    includeTrash: boolean,
  ): string
  api_get_entry(id: string): string
  api_create_entry(
    type: string,
    name: string,
    notes: string | null,
    typedValueJson: string,
    labelIds: string[],
  ): string
  api_update_entry(
    id: string,
    name: string,
    notes: string | null,
    typedValueJson: string,
    labelIds: string[],
  ): void
  api_delete_entry(id: string): void
  api_restore_entry(id: string): void
  api_purge_entry(id: string): void
  api_set_favorite(id: string, isFavorite: boolean): void
  api_list_labels(): string
  api_create_label(name: string): string
  api_delete_label(id: string): void
  api_set_entry_labels(entryId: string, labelIdsJson: string): void
  api_generate_password(length: number, useSymbols: boolean): string
  api_generate_totp(secret: string): string
  api_generate_totp_default(): string
  api_change_master_password(currentPassword: string, newPassword: string): string
  api_upgrade_argon2_params(): string
  api_rotate_dek(): string
  api_regenerate_recovery_key(): string
  [key: string]: unknown
}

const wasm = wasmModule as unknown as WasmApi

let wasmReady = false

export async function initWasm(): Promise<void> {
  if (wasmReady) return

  try {
    // WASM モジュールは既に初期化されている（vite-plugin-wasm により自動インポート）
    wasmReady = true
    console.log('[Vault] WASM initialized')
  } catch (error) {
    console.error('[Vault] WASM initialization failed:', error)
    throw error
  }
}

export async function ensureWasmReady(): Promise<void> {
  if (!wasmReady) {
    await initWasm()
  }
}

// Vault 操作

export async function createNewVault(masterPassword: string): Promise<string> {
  await ensureWasmReady()
  try {
    const recoveryKey = wasm.api_create_new_vault(masterPassword)
    return recoveryKey
  } catch (error) {
    console.error('[Vault] Failed to create vault:', error)
    throw error
  }
}

export async function loadVault(vaultBytes: string): Promise<Vault> {
  await ensureWasmReady()
  try {
    const vault = wasm.api_load_vault(vaultBytes)
    return JSON.parse(vault)
  } catch (error) {
    console.error('[Vault] Failed to load vault:', error)
    throw error
  }
}

export async function unlockVault(masterPassword: string): Promise<boolean> {
  await ensureWasmReady()
  try {
    const result = wasm.api_unlock(masterPassword)
    return result === true
  } catch (error) {
    console.error('[Vault] Failed to unlock vault:', error)
    throw error
  }
}

export async function unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
  await ensureWasmReady()
  try {
    wasm.api_unlock_with_recovery_key(recoveryKey)
  } catch (error) {
    console.error('[Vault] Failed to unlock with recovery key:', error)
    throw error
  }
}

export async function lockVault(): Promise<string> {
  await ensureWasmReady()
  try {
    return wasm.api_lock()
  } catch (error) {
    console.error('[Vault] Failed to lock vault:', error)
    throw error
  }
}

export async function getVaultBytes(): Promise<string> {
  await ensureWasmReady()
  try {
    return wasm.api_get_vault_bytes()
  } catch (error) {
    console.error('[Vault] Failed to get vault bytes:', error)
    throw error
  }
}

// エントリ操作

export async function listEntries(filter?: EntryFilter): Promise<EntryRow[]> {
  await ensureWasmReady()
  try {
    const result = wasm.api_list_entries(
      filter?.searchQuery || null,
      filter?.type || null,
      filter?.labelId || null,
      filter?.includeTrash || false,
    )
    const rows = JSON.parse(result)
    // WASM が entry_type を返すため、type に変換
    return rows.map((r: Record<string, unknown>) => ({
      ...r,
      type: r.entry_type,
    }))
  } catch (error) {
    console.error('[Vault] Failed to list entries:', error)
    throw error
  }
}

export async function getEntry(id: string): Promise<EntryRow | null> {
  await ensureWasmReady()
  try {
    const result = wasm.api_get_entry(id)
    const entry = JSON.parse(result)
    if (!entry) return null
    // typed_value は二重エンコードなので2回 JSON.parse が必要
    if (entry.typed_value && typeof entry.typed_value === 'string') {
      entry.typed_value = JSON.parse(entry.typed_value)
    }
    // entry_type を type に変換
    entry.type = entry.entry_type
    return entry
  } catch (error) {
    console.error('[Vault] Failed to get entry:', error)
    throw error
  }
}

export async function createEntry(
  type: string,
  name: string,
  typedValue: Record<string, unknown>,
  notes?: string,
  labelIds?: string[],
): Promise<string> {
  await ensureWasmReady()
  try {
    const entryId = wasm.api_create_entry(
      type,
      name,
      notes || null,
      JSON.stringify(typedValue),
      labelIds || [],
    )
    return entryId
  } catch (error) {
    console.error('[Vault] Failed to create entry:', error)
    throw error
  }
}

export async function updateEntry(
  id: string,
  name: string,
  typedValue: Record<string, unknown>,
  notes?: string,
  labelIds?: string[],
): Promise<void> {
  await ensureWasmReady()
  try {
    wasm.api_update_entry(id, name, notes || null, JSON.stringify(typedValue), labelIds || [])
  } catch (error) {
    console.error('[Vault] Failed to update entry:', error)
    throw error
  }
}

export async function deleteEntry(id: string): Promise<void> {
  await ensureWasmReady()
  try {
    wasm.api_delete_entry(id)
  } catch (error) {
    console.error('[Vault] Failed to delete entry:', error)
    throw error
  }
}

export async function restoreEntry(id: string): Promise<void> {
  await ensureWasmReady()
  try {
    wasm.api_restore_entry(id)
  } catch (error) {
    console.error('[Vault] Failed to restore entry:', error)
    throw error
  }
}

export async function purgeEntry(id: string): Promise<void> {
  await ensureWasmReady()
  try {
    wasm.api_purge_entry(id)
  } catch (error) {
    console.error('[Vault] Failed to purge entry:', error)
    throw error
  }
}

export async function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  await ensureWasmReady()
  try {
    wasm.api_set_favorite(id, isFavorite)
  } catch (error) {
    console.error('[Vault] Failed to set favorite:', error)
    throw error
  }
}

// ラベル操作

export async function listLabels(): Promise<Label[]> {
  await ensureWasmReady()
  try {
    const result = wasm.api_list_labels()
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to list labels:', error)
    throw error
  }
}

export async function createLabel(name: string): Promise<Label> {
  await ensureWasmReady()
  try {
    const result = wasm.api_create_label(name)
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to create label:', error)
    throw error
  }
}

export async function deleteLabel(id: string): Promise<void> {
  await ensureWasmReady()
  try {
    wasm.api_delete_label(id)
  } catch (error) {
    console.error('[Vault] Failed to delete label:', error)
    throw error
  }
}

export async function setEntryLabels(entryId: string, labelIds: string[]): Promise<void> {
  await ensureWasmReady()
  try {
    wasm.api_set_entry_labels(entryId, JSON.stringify(labelIds))
  } catch (error) {
    console.error('[Vault] Failed to set entry labels:', error)
    throw error
  }
}

// ユーティリティ

export async function generatePassword(length?: number, useSymbols?: boolean): Promise<string> {
  await ensureWasmReady()
  try {
    return wasm.api_generate_password(length || 16, useSymbols !== false)
  } catch (error) {
    console.error('[Vault] Failed to generate password:', error)
    throw error
  }
}

export async function generateTotp(secret: string): Promise<string> {
  await ensureWasmReady()
  try {
    return wasm.api_generate_totp(secret)
  } catch (error) {
    console.error('[Vault] Failed to generate TOTP:', error)
    throw error
  }
}

export async function generateTotpDefault(): Promise<string> {
  await ensureWasmReady()
  try {
    return wasm.api_generate_totp_default()
  } catch (error) {
    console.error('[Vault] Failed to generate TOTP default:', error)
    throw error
  }
}

// セキュリティ

export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string,
): Promise<Vault> {
  await ensureWasmReady()
  try {
    const result = wasm.api_change_master_password(currentPassword, newPassword)
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to change master password:', error)
    throw error
  }
}

export async function upgradeArgon2Params(): Promise<Vault> {
  await ensureWasmReady()
  try {
    const result = wasm.api_upgrade_argon2_params()
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to upgrade Argon2 params:', error)
    throw error
  }
}

export async function rotateDek(): Promise<Vault> {
  await ensureWasmReady()
  try {
    const result = wasm.api_rotate_dek()
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to rotate DEK:', error)
    throw error
  }
}

export async function regenerateRecoveryKey(): Promise<{ vault: Vault; recoveryKey: string }> {
  await ensureWasmReady()
  try {
    const result = wasm.api_regenerate_recovery_key()
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to regenerate recovery key:', error)
    throw error
  }
}
