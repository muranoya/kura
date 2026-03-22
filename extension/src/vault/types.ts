export interface EntryRow {
  id: string
  type: string
  name: string
  is_favorite: boolean
  label_ids: string[]
  typed_value: any
  notes?: string
  deleted_at?: number | null
}

export interface Label {
  id: string
  name: string
}

export interface VaultMeta {
  encrypted_dek_master: string
  encrypted_dek_recovery: string
  argon2_params: {
    salt: string
    iterations: number
    memory: number
    parallelism: number
  }
  created_at: number
}

export interface Vault {
  schema_version: number
  meta: VaultMeta
  encrypted_vault: string
}

export interface EntryFilter {
  searchQuery?: string
  labelId?: string
  type?: string
  includeTrash?: boolean
}

export interface SyncConflict {
  entryId: string
  entryName: string
  conflictType: 'local_modified_remote_deleted' | 'remote_modified_local_deleted' | 'both_modified'
  localValue?: any
  remoteValue?: any
}
