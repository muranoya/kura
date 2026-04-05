// Re-export from shared/types for backward compatibility
export type {
  EntryType,
  CustomFieldType,
  CustomField,
  EntryRow,
  Entry,
  Label,
  EntryFilter,
  S3Config,
  AppSettings,
} from '../shared/types'

// Legacy types for backward compatibility
export interface VaultMeta {
  vault_uuid: string
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

export interface SyncConflict {
  entryId: string
  entryName: string
  conflictType: 'local_modified_remote_deleted' | 'remote_modified_local_deleted' | 'both_modified'
  localValue?: unknown
  remoteValue?: unknown
}
