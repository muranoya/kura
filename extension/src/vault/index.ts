import * as wasm from '../../wasm/wasm_bridge'
import { EntryRow, Label, Vault, EntryFilter, SyncConflict } from './types'

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
    const recoveryKey = (wasm as any).api_create_new_vault(masterPassword)
    return recoveryKey
  } catch (error) {
    console.error('[Vault] Failed to create vault:', error)
    throw error
  }
}

export async function loadVault(vaultBytes: string): Promise<Vault> {
  await ensureWasmReady()
  try {
    const vault = (wasm as any).api_load_vault(vaultBytes)
    return JSON.parse(vault)
  } catch (error) {
    console.error('[Vault] Failed to load vault:', error)
    throw error
  }
}

export async function unlockVault(masterPassword: string): Promise<boolean> {
  await ensureWasmReady()
  try {
    const result = (wasm as any).api_unlock(masterPassword)
    return result === true
  } catch (error) {
    console.error('[Vault] Failed to unlock vault:', error)
    throw error
  }
}

export async function unlockWithRecoveryKey(recoveryKey: string): Promise<void> {
  await ensureWasmReady()
  try {
    (wasm as any).api_unlock_with_recovery_key(recoveryKey)
  } catch (error) {
    console.error('[Vault] Failed to unlock with recovery key:', error)
    throw error
  }
}

export async function lockVault(): Promise<string> {
  await ensureWasmReady()
  try {
    return (wasm as any).api_lock()
  } catch (error) {
    console.error('[Vault] Failed to lock vault:', error)
    throw error
  }
}

export async function getVaultBytes(): Promise<string> {
  await ensureWasmReady()
  try {
    return (wasm as any).api_get_vault_bytes()
  } catch (error) {
    console.error('[Vault] Failed to get vault bytes:', error)
    throw error
  }
}

// エントリ操作

export async function listEntries(filter?: EntryFilter): Promise<EntryRow[]> {
  await ensureWasmReady()
  try {
    const result = (wasm as any).api_list_entries(
      filter?.searchQuery || null,
      filter?.type || null,
      filter?.labelId || null,
      filter?.includeTrash || false
    )
    const rows = JSON.parse(result)
    // WASM が entry_type を返すため、type に変換
    return rows.map((r: any) => ({
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
    const result = (wasm as any).api_get_entry(id)
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
  typedValue: any,
  notes?: string,
  labelIds?: string[]
): Promise<string> {
  await ensureWasmReady()
  try {
    const entryId = (wasm as any).api_create_entry(
      type,
      name,
      notes || null,
      JSON.stringify(typedValue),
      labelIds || []
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
  typedValue: any,
  notes?: string,
  labelIds?: string[]
): Promise<void> {
  await ensureWasmReady()
  try {
    (wasm as any).api_update_entry(
      id,
      name,
      notes || null,
      JSON.stringify(typedValue),
      labelIds || []
    )
  } catch (error) {
    console.error('[Vault] Failed to update entry:', error)
    throw error
  }
}

export async function deleteEntry(id: string): Promise<void> {
  await ensureWasmReady()
  try {
    (wasm as any).api_delete_entry(id)
  } catch (error) {
    console.error('[Vault] Failed to delete entry:', error)
    throw error
  }
}

export async function restoreEntry(id: string): Promise<void> {
  await ensureWasmReady()
  try {
    (wasm as any).api_restore_entry(id)
  } catch (error) {
    console.error('[Vault] Failed to restore entry:', error)
    throw error
  }
}

export async function purgeEntry(id: string): Promise<void> {
  await ensureWasmReady()
  try {
    (wasm as any).api_purge_entry(id)
  } catch (error) {
    console.error('[Vault] Failed to purge entry:', error)
    throw error
  }
}

export async function setFavorite(id: string, isFavorite: boolean): Promise<void> {
  await ensureWasmReady()
  try {
    (wasm as any).api_set_favorite(id, isFavorite)
  } catch (error) {
    console.error('[Vault] Failed to set favorite:', error)
    throw error
  }
}

// ラベル操作

export async function listLabels(): Promise<Label[]> {
  await ensureWasmReady()
  try {
    const result = (wasm as any).api_list_labels()
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to list labels:', error)
    throw error
  }
}

export async function createLabel(name: string): Promise<Label> {
  await ensureWasmReady()
  try {
    const result = (wasm as any).api_create_label(name)
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to create label:', error)
    throw error
  }
}

export async function deleteLabel(id: string): Promise<void> {
  await ensureWasmReady()
  try {
    (wasm as any).api_delete_label(id)
  } catch (error) {
    console.error('[Vault] Failed to delete label:', error)
    throw error
  }
}

export async function setEntryLabels(entryId: string, labelIds: string[]): Promise<void> {
  await ensureWasmReady()
  try {
    (wasm as any).api_set_entry_labels(entryId, JSON.stringify(labelIds))
  } catch (error) {
    console.error('[Vault] Failed to set entry labels:', error)
    throw error
  }
}

// ユーティリティ

export async function generatePassword(
  length?: number,
  useSymbols?: boolean
): Promise<string> {
  await ensureWasmReady()
  try {
    return (wasm as any).api_generate_password(length || 16, useSymbols !== false)
  } catch (error) {
    console.error('[Vault] Failed to generate password:', error)
    throw error
  }
}

export async function generateTotp(secret: string): Promise<string> {
  await ensureWasmReady()
  try {
    return (wasm as any).api_generate_totp(secret)
  } catch (error) {
    console.error('[Vault] Failed to generate TOTP:', error)
    throw error
  }
}

export async function generateTotpDefault(): Promise<string> {
  await ensureWasmReady()
  try {
    return (wasm as any).api_generate_totp_default()
  } catch (error) {
    console.error('[Vault] Failed to generate TOTP default:', error)
    throw error
  }
}

// セキュリティ

export async function changeMasterPassword(
  currentPassword: string,
  newPassword: string
): Promise<Vault> {
  await ensureWasmReady()
  try {
    const result = (wasm as any).api_change_master_password(currentPassword, newPassword)
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to change master password:', error)
    throw error
  }
}

export async function upgradeArgon2Params(): Promise<Vault> {
  await ensureWasmReady()
  try {
    const result = (wasm as any).api_upgrade_argon2_params()
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to upgrade Argon2 params:', error)
    throw error
  }
}

export async function rotateDek(): Promise<Vault> {
  await ensureWasmReady()
  try {
    const result = (wasm as any).api_rotate_dek()
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to rotate DEK:', error)
    throw error
  }
}

export async function regenerateRecoveryKey(): Promise<{ vault: Vault; recoveryKey: string }> {
  await ensureWasmReady()
  try {
    const result = (wasm as any).api_regenerate_recovery_key()
    return JSON.parse(result)
  } catch (error) {
    console.error('[Vault] Failed to regenerate recovery key:', error)
    throw error
  }
}
