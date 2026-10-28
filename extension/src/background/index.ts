// Service Worker エントリーポイント
// WASM の初期化とメッセージハンドラーのセットアップ

import { DEFAULT_VAULT_ID, STORAGE_KEYS } from '../shared/constants'
import { ConflictError, VaultS3Client } from '../shared/s3-client'
import {
  clearStorage,
  getFromSessionStorage,
  getFromStorage,
  removeFromSessionStorage,
  removeFromStorage,
  saveItemsToStorage,
  saveToSessionStorage,
  saveToStorage,
} from '../shared/storage'
import type { S3Config } from '../shared/types'
import {
  cleanupPendingFlow,
  getMatchedEntryIdsForUrl,
  handleAutofillMessage,
  initAutofill,
  onVaultLocked,
  onVaultUnlocked,
} from './autofill'
import { clearPickerContext, handlePickerMessage, initPicker } from './picker'
import { initSidebar, openSidebar } from './sidebar'
import { clearTotpQrScanContext, handleTotpQrMessage, initTotpQrScan } from './totp-qr-scan'
import { initWasmManual } from './wasm-init'
import { handleWebauthnMessage, initWebauthn, resumeLockedWebauthnRituals } from './webauthn'

/** WASM API surface for Service Worker */
interface WasmApi {
  api_create_new_vault(vaultId: string, masterPassword: string): string
  api_load_vault(vaultId: string, vaultBytes: Uint8Array, etag: string): void
  api_unlock(vaultId: string, masterPassword: string): boolean
  api_unlock_with_recovery_key(vaultId: string, recoveryKey: string): void
  api_lock(vaultId: string): Uint8Array
  api_get_vault_bytes(vaultId: string): Uint8Array
  api_get_vault_etag(vaultId: string): string | null
  api_is_unlocked(vaultId: string): boolean
  api_merge_remote_vault(vaultId: string, remoteBytes: Uint8Array, remoteEtag: string): void
  api_update_etag(vaultId: string, etag: string): void
  api_list_entries(
    vaultId: string,
    searchQuery: string | null,
    type: string | null,
    labelId: string | null,
    includeTrash: boolean,
    onlyFavorites: boolean,
    sortField: string | null,
    sortOrder: string | null,
  ): string
  api_get_entry(vaultId: string, id: string): string
  api_create_entry(
    vaultId: string,
    entryType: string,
    name: string,
    notes: string | null,
    typedValueJson: string,
    labelIds: string[],
    customFieldsJson: string | null,
  ): string
  api_update_entry(
    vaultId: string,
    id: string,
    name: string,
    notes: string | null,
    typedValueJson: string,
    labelIds: string[],
    customFieldsJson: string | null,
  ): void
  api_delete_entry(vaultId: string, id: string): void
  api_restore_entry(vaultId: string, id: string): void
  api_purge_entry(vaultId: string, id: string): void
  api_set_favorite(vaultId: string, id: string, isFavorite: boolean): void
  api_list_login_candidates(vaultId: string, pageHostname: string, strictSubdomain: boolean): string
  api_get_totp_code(vaultId: string, id: string): string | null
  api_list_totp_periods(vaultId: string, ids: string[]): string
  api_list_labels(vaultId: string): string
  api_create_label(vaultId: string, name: string): string
  api_delete_label(vaultId: string, id: string): void
  api_rename_label(vaultId: string, id: string, newName: string): void
  api_generate_password(
    length: number,
    includeLowercase: boolean,
    includeUppercase: boolean,
    includeNumbers: boolean,
    includeSymbols1: boolean,
    includeSymbols2: boolean,
    includeSymbols3: boolean,
  ): string
  api_generate_totp_default(secret: string): string
  api_generate_totp_from_value(value: string): string
  api_parse_totp_period(value: string): number
  api_verify_password(vaultId: string, password: string): void
  api_change_master_password(vaultId: string, oldPassword: string, newPassword: string): void
  api_reset_master_password_with_recovery_key(
    vaultId: string,
    recoveryKey: string,
    newPassword: string,
  ): void
  api_rotate_dek(vaultId: string, password: string): string
  api_regenerate_recovery_key(vaultId: string, password: string): string
  api_encrypt_config(vaultId: string, password: string, plaintext: string): string
  api_decrypt_config(vaultId: string, password: string, encryptedB64: string): string
  api_config_needs_upgrade(encryptedB64: string): boolean
  api_encrypt_transfer_config(password: string, configJson: string): string
  api_decrypt_transfer_config(password: string, transferString: string): string
  api_webauthn_find_credentials(vaultId: string, rpId: string, allowCredentialIds: string[]): string
  api_webauthn_create_credential(
    vaultId: string,
    entryId: string | null,
    rpId: string,
    rpName: string | null,
    userHandle: string,
    userName: string,
    userDisplayName: string,
    excludeCredentialIds: string[],
  ): string
  api_webauthn_get_assertion(
    vaultId: string,
    entryId: string,
    customFieldId: string,
    clientDataJson: string,
  ): string
  [key: string]: unknown
}

let vault: WasmApi = null as unknown as WasmApi

let wasmInitPromise: Promise<void> | null = null
let unlocked = false
let decryptedS3Config: S3Config | null = null

function updateExtensionIcon(isUnlocked: boolean) {
  const prefix = isUnlocked ? 'unlocked' : 'locked'
  chrome.action.setIcon({
    path: {
      16: `icons/${prefix}-16.png`,
      48: `icons/${prefix}-48.png`,
      128: `icons/${prefix}-128.png`,
    },
  })
}

// WASM 初期化関数（手動 fetch + instantiate で top-level await を回避）
// 並行して呼ばれても1回だけ初期化する（2つ目のインスタンスで vault が差し替わり、
// アンロック済みのセッションが失われるのを防ぐ）
function initWasm(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = initWasmManual()
      .then((api) => {
        vault = api as unknown as WasmApi
      })
      .catch((error) => {
        wasmInitPromise = null
        console.error('[SW] WASM initialization error:', error)
        throw error
      })
  }
  return wasmInitPromise
}

// ========== メッセージハンドラーのセットアップ ==========

function setupMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // サイドバーの表示はユーザー操作の文脈内で同期的に呼ぶ必要があるため、
    // await を含む handleMessage より前に処理する
    if (message?.type === 'AUTOFILL_OPEN_SIDEBAR') {
      openSidebar(sender)
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    // サイドバーから頻繁に届くため、Vaultの復元を伴う handleMessage を通さずに処理する
    if (message?.type === 'USER_ACTIVITY') {
      handleUserActivity()
        .then(() => sendResponse({ success: true }))
        .catch((e) => sendResponse({ success: false, error: String(e) }))
      return true
    }

    // async 処理を fire-and-forget で実行し、Promise で sendResponse を呼ぶ
    handleMessage(message, sender, sendResponse).catch((err) => {
      console.error('[SW] Unhandled error in message handler:', message.type, err)
      try {
        sendResponse({ success: false, error: String(err) })
      } catch (e) {
        console.error('[SW] Failed to send error response:', e)
      }
    })
    return true // 非同期レスポンスを許可
  })
}

// メッセージハンドラーを最初に登録（スクリプト読み込み時）
setupMessageHandlers()
initSidebar()

// オートロックは「拡張機能UIでの最後の操作」からの経過時間で判定する。
// サイドバーは開いたままになるため、接続の有無ではなく操作（USER_ACTIVITY）で
// タイマーを延長する。
async function resetAutolockAlarm() {
  const settings = await loadSettings()
  if (settings.autolockMinutes > 0) {
    chrome.alarms.create('autolock', { delayInMinutes: settings.autolockMinutes })
  } else {
    chrome.alarms.clear('autolock')
  }
}

async function handleUserActivity() {
  // SW再起動直後はメモリ上 unlocked=false でもセッションは残っている（アラームも残る）。
  // セッションの有無だけで判定し、Vaultの復元（Argon2）は行わない
  if (unlocked || (await getFromSessionStorage<string>(STORAGE_KEYS.SESSION_PASSWORD))) {
    await resetAutolockAlarm()
  }
}

// Service Worker 起動時に初期化
self.addEventListener('install', (event: Event) => {
  ;(event as unknown as { waitUntil(p: Promise<unknown>): void }).waitUntil(initWasm())
})

self.addEventListener('activate', (event: Event) => {
  ;(event as unknown as { waitUntil(p: Promise<unknown>): void }).waitUntil(
    initWasm().then(() => {
      updateExtensionIcon(false)
    }),
  )
})

// アラームリスナーはトップレベルで登録（SW再起動時にも確実に登録されるようにする）
setupAlarms()

// Autofill の初期化（vault はプロキシ経由でlazy参照）
initAutofill(
  new Proxy({} as WasmApi, {
    get: (_target, prop) => (vault as unknown as Record<string | symbol, unknown>)[prop],
  }),
  () => unlocked,
  saveLocally,
  autoSync,
)

initTotpQrScan(
  new Proxy({} as WasmApi, {
    get: (_target, prop) => (vault as unknown as Record<string | symbol, unknown>)[prop],
  }),
  () => unlocked,
  saveLocally,
  autoSync,
)

initPicker(
  new Proxy({} as WasmApi, {
    get: (_target, prop) => (vault as unknown as Record<string | symbol, unknown>)[prop],
  }),
  () => unlocked,
  saveLocally,
  autoSync,
)

// WebAuthn/Passkeyの初期化（vault はプロキシ経由でlazy参照）
initWebauthn(
  new Proxy({} as WasmApi, {
    get: (_target, prop) => (vault as unknown as Record<string | symbol, unknown>)[prop],
  }),
  () => unlocked,
  saveLocally,
  autoSync,
)

// Clean up pending login flows when a tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  cleanupPendingFlow(tabId)
})

// ========== ヘルパー関数 ==========

/**
 * camelCase への正規化（WASM からの snake_case → camelCase）
 */
function normalizeEntry(raw: Record<string, unknown>): Record<string, unknown> {
  if (!raw) return raw
  return {
    id: raw.id,
    entryType: raw.entry_type,
    name: raw.name,
    subtitle: raw.subtitle ?? null,
    isFavorite: raw.is_favorite ?? false,
    createdAt: raw.created_at ?? 0,
    updatedAt: raw.updated_at ?? 0,
    deletedAt: raw.deleted_at ?? null,
    notes: raw.notes ?? null,
    typedValue: raw.typed_value ?? {},
    labels: raw.labels ?? raw.label_ids ?? [],
    secretFieldKeys: raw.secret_field_keys ?? [],
    customFields: ((raw.custom_fields as Record<string, unknown>[] | undefined) ?? []).map(
      (f: Record<string, unknown>) => {
        const rawSelector = f.autofill_selector as Record<string, unknown> | null | undefined
        return {
          id: f.id,
          name: f.name,
          fieldType: f.field_type,
          value: f.value,
          secret: f.secret === true,
          autofillSelector: rawSelector
            ? {
                tag: rawSelector.tag,
                name: rawSelector.name,
                id: rawSelector.id,
                type: rawSelector.type,
              }
            : undefined,
        }
      },
    ),
  }
}

/**
 * 配列エントリを正規化（normalizeEntry を各要素に適用）
 */
function normalizeEntries(entries: Record<string, unknown>[]): Record<string, unknown>[] {
  return (entries ?? []).map(normalizeEntry)
}

/** 同期中フラグ（並行実行を防止） */
let syncing = false

const MAX_SYNC_RETRIES = 5

/**
 * 同期中（S3通信のawait中）にオートロックが割り込み、Vaultがロックされたことを示すマーカーエラー。
 * ユーザーへのエラー表示は行わず、静かに同期を中断するために使う。
 */
class VaultLockedDuringSyncError extends Error {
  constructor() {
    super('Vault locked during sync (autolock race)')
    this.name = 'VaultLockedDuringSyncError'
  }
}

/**
 * S3との同期（ダウンロード→マージ→アップロード、リトライ付き）
 */
async function syncWithS3(s3Config: S3Config): Promise<void> {
  const client = new VaultS3Client(s3Config)
  try {
    for (let attempt = 0; attempt < MAX_SYNC_RETRIES; attempt++) {
      const remote = await client.download()

      if (!remote) {
        // リモートに存在しない → ローカルをアップロード
        const bytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
        const etag = vault.api_get_vault_etag(DEFAULT_VAULT_ID)
        const newEtag = await client.upload(bytes, etag)
        vault.api_update_etag(DEFAULT_VAULT_ID, newEtag)
        return
      }

      // リモート存在 → Rust側でマージ（復号→auto_merge→GC→セッション更新）
      // download() の await 中にオートロックが発火した場合、ここで検知して中断する
      // （チェック直後に同期的にWASMを呼ぶため、JSのシングルスレッド性によりTOCTOUは発生しない）
      if (!vault.api_is_unlocked(DEFAULT_VAULT_ID)) {
        throw new VaultLockedDuringSyncError()
      }
      vault.api_merge_remote_vault(DEFAULT_VAULT_ID, remote.bytes, remote.etag)

      // マージ済みvaultをアップロード
      const mergedBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
      const currentEtag = vault.api_get_vault_etag(DEFAULT_VAULT_ID)

      try {
        const newEtag = await client.upload(mergedBytes, currentEtag)
        vault.api_update_etag(DEFAULT_VAULT_ID, newEtag)
        return
      } catch (err) {
        if (err instanceof ConflictError) {
          if (attempt + 1 === MAX_SYNC_RETRIES) {
            throw new Error('Sync failed after maximum retries')
          }
          continue
        }
        throw err
      }
    }
  } finally {
    client.destroy()
  }
}

/**
 * DEK のローテーション後に、マージせずにローカルの vault で上書きアップロードする。
 * 旧 DEK のリモートは新しい DEK では復号できず、マージできないため。
 * If-Match で、最後に同期した版から変わっていない場合だけ上書きする
 */
async function pushAfterDekRotation(s3Config: S3Config): Promise<void> {
  if (syncing) throw new Error('Sync in progress')
  syncing = true
  const client = new VaultS3Client(s3Config)
  try {
    const bytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
    const etag = vault.api_get_vault_etag(DEFAULT_VAULT_ID)
    const newEtag = await client.upload(bytes, etag)
    vault.api_update_etag(DEFAULT_VAULT_ID, newEtag)
    await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)
    await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, Math.floor(Date.now() / 1000))
    await clearSyncErrorIfPresent()
  } finally {
    client.destroy()
    syncing = false
  }
}

/**
 * ローカルストレージにvaultバイトを保存（S3同期なし）
 */
async function saveLocally() {
  const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
  await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
}

/**
 * オートロックとの競合によりVaultがロックされたことが原因の同期失敗かどうかを判定する。
 * 事前チェックをすり抜けてRust側の "Vault not unlocked" がそのままthrowされた
 * ケースも保険的に同一視する（このパスで他の原因によりこの文字列が発生することはない）。
 */
function isVaultLockRaceDuringSync(err: unknown): boolean {
  return err instanceof VaultLockedDuringSyncError || String(err).includes('Vault not unlocked')
}

/** LAST_ERROR が同期関連キー（'auto-sync' / 'periodic-sync'）の場合のみクリアする */
async function clearSyncErrorIfPresent() {
  const stored = await getFromStorage<{ key: string }>(STORAGE_KEYS.LAST_ERROR)
  if (stored && (stored.key === 'auto-sync' || stored.key === 'periodic-sync')) {
    await removeFromStorage(STORAGE_KEYS.LAST_ERROR)
  }
}

/**
 * 自動同期（リモートとマージしてアップロード）
 */
async function autoSync() {
  if (syncing) return
  syncing = true
  try {
    // 復号済みS3設定がない場合はローカル保存のみ
    if (!decryptedS3Config) {
      // ロック・ログアウト後に呼ばれた場合は書き戻さない
      if (!unlocked) return
      const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
      await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
      return
    }

    await syncWithS3(decryptedS3Config)
    // S3通信の await 中にロック・ログアウトされた場合は書き戻さない
    // （ログアウト後のストレージにVaultが復活するのを防ぐ）
    if (!unlocked) throw new VaultLockedDuringSyncError()

    // 同期後に vault bytes / ETag / lastSyncTime を更新
    const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
    await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
    const newEtag = vault.api_get_vault_etag(DEFAULT_VAULT_ID) ?? null
    await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)
    const syncTime = Math.floor(Date.now() / 1000)
    await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, syncTime)
    await clearSyncErrorIfPresent()
  } catch (err) {
    if (isVaultLockRaceDuringSync(err)) {
      // オートロックとの正常な競合。ユーザーにエラー表示はしない。
      // 次回の 'autosync' アラーム、または次回アンロック時の再同期で解消される。
      console.info('[SW] autoSync aborted: vault was locked during sync (autolock race)')
      await clearSyncErrorIfPresent()
      return
    }
    console.error('[SW] autoSync failed:', err)
    await saveToStorage(STORAGE_KEYS.LAST_ERROR, {
      key: 'auto-sync',
      message: `同期に失敗しました: ${err}`,
      timestamp: Date.now(),
    })
  } finally {
    syncing = false
  }
}

interface AppSettings {
  autolockMinutes: number
  clipboardClearSeconds: number
  theme: string
}

let lastCopiedText: string | null = null

async function loadSettings(): Promise<AppSettings> {
  const settings = await getFromStorage<AppSettings>(STORAGE_KEYS.APP_SETTINGS)
  return (
    settings || {
      autolockMinutes: 5,
      clipboardClearSeconds: 30,
      theme: 'light',
    }
  )
}

/**
 * ロック状態へ遷移する（復号済みデータの破棄・アラーム停止・各画面への通知）。
 * WASM 側の api_lock は呼び出し側で済ませておくこと。
 */
async function enterLockedState() {
  unlocked = false
  updateExtensionIcon(false)
  decryptedS3Config = null
  await removeFromSessionStorage(STORAGE_KEYS.SESSION_PASSWORD)
  chrome.alarms.clear('autolock')
  chrome.alarms.clear('autosync')
  // オートフィル: 全タブに通知してContent Scriptを無効化
  onVaultLocked()
  clearTotpQrScanContext()
  clearPickerContext()
}

// ========== S3設定 ==========

// 暗号化して保存したS3設定を復号してメモリに保持する（vault のロード後に呼ぶこと）。
// 旧形式（パスワード由来の鍵で直接暗号化したもの）なら、現行形式で暗号化し直して保存する
async function loadS3Config(password: string): Promise<void> {
  const encryptedConfig = await getFromStorage<string>(STORAGE_KEYS.S3_CONFIG)
  if (!encryptedConfig) return
  try {
    const configJson = vault.api_decrypt_config(DEFAULT_VAULT_ID, password, encryptedConfig)
    decryptedS3Config = JSON.parse(configJson)
    if (vault.api_config_needs_upgrade(encryptedConfig)) {
      const encrypted = vault.api_encrypt_config(DEFAULT_VAULT_ID, password, configJson)
      await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
    }
  } catch (e) {
    console.error('[SW] Failed to decrypt S3 config:', e)
  }
}

// ========== セッション復元 ==========

let restoreSessionPromise: Promise<boolean> | null = null

/**
 * セッションが残っていればアンロック状態まで復元する。
 * 並行して呼ばれても復元（Argon2）は1回だけ行う。
 */
function tryRestoreSession(): Promise<boolean> {
  if (unlocked) return Promise.resolve(true)
  if (!restoreSessionPromise) {
    restoreSessionPromise = restoreSession().finally(() => {
      restoreSessionPromise = null
    })
  }
  return restoreSessionPromise
}

async function restoreSession(): Promise<boolean> {
  const password = await getFromSessionStorage<string>(STORAGE_KEYS.SESSION_PASSWORD)
  if (!password) return false

  try {
    await initWasm()
    const vaultBytes = await getFromStorage<number[]>(STORAGE_KEYS.VAULT_BYTES)
    const etag = await getFromStorage<string>(STORAGE_KEYS.VAULT_ETAG)
    if (!vaultBytes) return false
    // await 中に UNLOCK 等でアンロックされていれば、ロード済みのセッションを壊さない
    if (unlocked || vault.api_is_unlocked(DEFAULT_VAULT_ID)) return unlocked

    vault.api_load_vault(DEFAULT_VAULT_ID, new Uint8Array(vaultBytes), etag || '')
    vault.api_unlock(DEFAULT_VAULT_ID, password)

    // S3設定の復号
    await loadS3Config(password)

    unlocked = true
    updateExtensionIcon(true)
    return true
  } catch (e) {
    console.error('[SW] Session restore failed:', e)
    await removeFromSessionStorage(STORAGE_KEYS.SESSION_PASSWORD)
    return false
  }
}

let ensureVaultLoadedPromise: Promise<void> | null = null

/**
 * Service Worker 再起動時の vault 自動復元。
 * セッションが残っていればアンロック状態まで復元、なければロック状態でvaultをロードする。
 * 並行するメッセージで重複して実行しないよう、実行中の処理を共有する。
 */
function ensureVaultLoaded(): Promise<void> {
  if (unlocked) return Promise.resolve()
  if (!ensureVaultLoadedPromise) {
    ensureVaultLoadedPromise = loadVaultForMessage().finally(() => {
      ensureVaultLoadedPromise = null
    })
  }
  return ensureVaultLoadedPromise
}

async function loadVaultForMessage() {
  const restored = await tryRestoreSession()
  if (restored) return
  const vaultBytes = await getFromStorage<number[]>(STORAGE_KEYS.VAULT_BYTES)
  if (!vaultBytes) return
  try {
    const etag = await getFromStorage<string>(STORAGE_KEYS.VAULT_ETAG)
    // await 中に UNLOCK 等でアンロックされていれば、ロック状態で上書きしない
    // （チェック直後に同期的にロードするため、間に割り込まれることはない）
    if (unlocked || vault.api_is_unlocked(DEFAULT_VAULT_ID)) return
    vault.api_load_vault(DEFAULT_VAULT_ID, new Uint8Array(vaultBytes), etag || '')
  } catch (e) {
    console.error('[SW] Failed to auto-load vault:', e)
  }
}

// ========== メッセージハンドリング ==========

async function handleMessage(
  // biome-ignore lint/suspicious/noExplicitAny: message shape varies by type, validated per case
  message: Record<string, any>,
  _sender: chrome.runtime.MessageSender,
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies by handler
  sendResponse: (response?: any) => void,
) {
  try {
    await initWasm()
    await ensureVaultLoaded()

    // Delegate developer mode messages
    if (typeof message.type === 'string' && message.type.startsWith('DEV_MODE_')) {
      return handleDevModeMessageInBackground(message, _sender, sendResponse)
    }

    // Delegate autofill messages to the autofill module
    if (typeof message.type === 'string' && message.type.startsWith('AUTOFILL_')) {
      return handleAutofillMessage(message, _sender, sendResponse)
    }

    if (typeof message.type === 'string' && message.type.startsWith('TOTP_QR_')) {
      return handleTotpQrMessage(message, _sender, sendResponse)
    }

    if (typeof message.type === 'string' && message.type.startsWith('PICKER_')) {
      return handlePickerMessage(message, _sender, sendResponse)
    }

    // Delegate WebAuthn/Passkey messages to the webauthn module
    if (typeof message.type === 'string' && message.type.startsWith('WEBAUTHN_')) {
      return handleWebauthnMessage(message, _sender, sendResponse)
    }

    switch (message.type) {
      // ========== Auth ==========

      case 'IS_UNLOCKED': {
        sendResponse({ success: true, unlocked })
        break
      }

      case 'UNLOCK': {
        if (!message.password) {
          sendResponse({ success: false, error: 'Password required' })
          break
        }
        if (unlocked && vault.api_is_unlocked(DEFAULT_VAULT_ID)) {
          // 別のウィンドウで既にアンロック済み（ロック画面が残っていた）。Vaultを
          // ロードし直すとアンロック済みのセッションを壊すため、パスワードの検証だけ行う。
          // CREATE_VAULT直後はunlockedがtrueでもWASMセッションはLockedなので通常経路へ進む
          try {
            vault.api_verify_password(DEFAULT_VAULT_ID, message.password)
            sendResponse({ success: true })
          } catch (err) {
            sendResponse({ success: false, error: String(err) })
          }
          break
        }
        try {
          const vaultBytes = await getFromStorage<number[]>(STORAGE_KEYS.VAULT_BYTES)
          const etag = await getFromStorage<string>(STORAGE_KEYS.VAULT_ETAG)
          if (!vaultBytes) {
            sendResponse({ success: false, error: 'Vault not found' })
            break
          }
          // vault をロードしてアンロック
          vault.api_load_vault(DEFAULT_VAULT_ID, new Uint8Array(vaultBytes), etag || '')
          vault.api_unlock(DEFAULT_VAULT_ID, message.password)
          // 暗号化されたS3設定を復号してメモリに保持
          await loadS3Config(message.password)
          unlocked = true
          updateExtensionIcon(true)
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.password)
          await resetAutolockAlarm()
          // 定期同期アラームを設定
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          // WebAuthnリチュアルがアンロック待ちの場合、確認/選択画面へ進める
          // （sendResponseより前に行い、リチュアルウィンドウ側の後続contextフェッチと順序を保証する）
          await resumeLockedWebauthnRituals()
          sendResponse({ success: true })
          // オートフィル: アクティブタブにContent Script注入
          onVaultUnlocked()
          // アンロック後に同期（バックグラウンド）
          autoSync().catch((e) => console.error('[SW] Post-unlock sync failed:', e))
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'UNLOCK_EXISTING': {
        if (!message.password) {
          sendResponse({ success: false, error: 'Password required' })
          break
        }
        try {
          const vaultBytes = await getFromStorage<number[]>(STORAGE_KEYS.VAULT_BYTES)
          const etag = await getFromStorage<string>(STORAGE_KEYS.VAULT_ETAG)
          if (!vaultBytes) {
            sendResponse({ success: false, error: 'Vault not found' })
            break
          }
          vault.api_load_vault(DEFAULT_VAULT_ID, new Uint8Array(vaultBytes), etag || '')
          vault.api_unlock(DEFAULT_VAULT_ID, message.password)
          // オンボーディング時のS3設定暗号化保存
          if (message.s3Config) {
            const configJson = JSON.stringify(message.s3Config)
            const encrypted = vault.api_encrypt_config(
              DEFAULT_VAULT_ID,
              message.password,
              configJson,
            )
            await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
            decryptedS3Config = message.s3Config
          } else {
            // 通常のアンロック: 暗号化S3設定を復号
            await loadS3Config(message.password)
          }
          unlocked = true
          updateExtensionIcon(true)
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.password)
          await resetAutolockAlarm()
          // 定期同期アラームを設定
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          await resumeLockedWebauthnRituals()
          sendResponse({ success: true })
          // オートフィル: アクティブタブにContent Script注入
          onVaultUnlocked()
          // アンロック後に同期（バックグラウンド）
          autoSync().catch((e) => console.error('[SW] Post-unlock sync failed:', e))
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'LOCK': {
        try {
          const vaultBytes = vault.api_lock(DEFAULT_VAULT_ID)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          await enterLockedState()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'LOGOUT': {
        // サイドバーは閉じないため、UI側でストレージを消すだけではSWのアンロック状態
        // （復号済みVault・S3設定・同期アラーム）が残る。ロックしてから全データを消去する。
        try {
          if (unlocked) {
            try {
              vault.api_lock(DEFAULT_VAULT_ID)
            } catch (e) {
              console.error('[SW] LOGOUT: api_lock failed:', e)
            }
            await enterLockedState()
          }
          await clearStorage()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'CREATE_VAULT': {
        if (!message.masterPassword) {
          sendResponse({ success: false, error: 'Master password required' })
          break
        }
        try {
          const recoveryKey = vault.api_create_new_vault(DEFAULT_VAULT_ID, message.masterPassword)
          const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)

          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, null)

          if (message.s3Config) {
            const configJson = JSON.stringify(message.s3Config)
            const encrypted = vault.api_encrypt_config(
              DEFAULT_VAULT_ID,
              message.masterPassword,
              configJson,
            )
            await saveToStorage(STORAGE_KEYS.S3_CONFIG, encrypted)
            decryptedS3Config = message.s3Config
          }
          unlocked = true
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.masterPassword)
          await resetAutolockAlarm()
          sendResponse({ success: true, recoveryKey })
        } catch (err) {
          console.error('[SW] CREATE_VAULT: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'RECOVER': {
        if (!message.recoveryKey || !message.newPassword) {
          sendResponse({ success: false, error: 'Recovery key and password required' })
          break
        }
        try {
          vault.api_unlock_with_recovery_key(DEFAULT_VAULT_ID, message.recoveryKey)
          vault.api_reset_master_password_with_recovery_key(
            DEFAULT_VAULT_ID,
            message.recoveryKey,
            message.newPassword,
          )
          const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, null)
          unlocked = true
          updateExtensionIcon(true)
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.newPassword)
          await resetAutolockAlarm()
          chrome.alarms.create('autosync', { periodInMinutes: 1 })
          // 通常のアンロックと同様に、待機中のPasskeyリチュアル・他の画面・各タブへ通知する
          await resumeLockedWebauthnRituals()
          sendResponse({ success: true })
          onVaultUnlocked()
        } catch (err) {
          // SW側はロック状態のままなので、WASMセッションだけアンロック済みで残さない
          if (!unlocked && vault.api_is_unlocked(DEFAULT_VAULT_ID)) {
            vault.api_lock(DEFAULT_VAULT_ID)
          }
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Entries ==========

      case 'LIST_ENTRIES': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const filter = message.filter || {}
          const result = vault.api_list_entries(
            DEFAULT_VAULT_ID,
            filter.searchQuery || null,
            filter.type || null,
            filter.labelId || null,
            filter.includeTrash || false,
            filter.onlyFavorites || false,
            filter.sortField || null,
            filter.sortOrder || null,
          )
          const rawEntries = JSON.parse(result)
          const entries = normalizeEntries(rawEntries)
          sendResponse({ success: true, entries })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'GET_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const result = vault.api_get_entry(DEFAULT_VAULT_ID, message.id)
          const rawEntry = JSON.parse(result)
          if (rawEntry?.typed_value && typeof rawEntry.typed_value === 'string') {
            rawEntry.typed_value = JSON.parse(rawEntry.typed_value)
          }
          if (rawEntry?.custom_fields && typeof rawEntry.custom_fields === 'string') {
            rawEntry.custom_fields = JSON.parse(rawEntry.custom_fields)
          }
          const entry = normalizeEntry(rawEntry)
          sendResponse({ success: true, entry })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'CREATE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const entryId = vault.api_create_entry(
            DEFAULT_VAULT_ID,
            message.entryType,
            message.name,
            message.notes ?? null,
            JSON.stringify(message.typedValue || {}),
            message.labelIds || [],
            message.customFields ? JSON.stringify(message.customFields) : null,
          )
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true, entryId })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'UPDATE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_update_entry(
            DEFAULT_VAULT_ID,
            message.id,
            message.name,
            message.notes ?? null,
            JSON.stringify(message.typedValue || {}),
            message.labelIds || [],
            message.customFields ? JSON.stringify(message.customFields) : null,
          )
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DELETE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_delete_entry(DEFAULT_VAULT_ID, message.id)
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'RESTORE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_restore_entry(DEFAULT_VAULT_ID, message.id)
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'PURGE_ENTRY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          // 完全削除はゴミ箱内のエントリに限る。古いゴミ箱画面から、別の画面で
          // 復元済みのエントリを消してしまわないようにする
          const target = JSON.parse(vault.api_get_entry(DEFAULT_VAULT_ID, message.id))
          if (target?.deleted_at == null) {
            sendResponse({ success: false, error: 'Entry is not in trash' })
            break
          }
          vault.api_purge_entry(DEFAULT_VAULT_ID, message.id)
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'SET_FAVORITE': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_set_favorite(DEFAULT_VAULT_ID, message.id, message.isFavorite)
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'LIST_ENTRY_IDS_FOR_URL': {
        if (!unlocked) {
          sendResponse({ success: true, entryIds: [] })
          break
        }
        try {
          const entryIds = getMatchedEntryIdsForUrl(message.url)
          sendResponse({ success: true, entryIds })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Trash ==========

      case 'LIST_TRASH': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const result = vault.api_list_entries(
            DEFAULT_VAULT_ID,
            null,
            null,
            null,
            true,
            false,
            null,
            null,
          )
          // include_trash は「ゴミ箱のエントリも含める」なので、ゴミ箱内のものだけに絞る
          const rawEntries = (JSON.parse(result) as Record<string, unknown>[]).filter(
            (e) => e.deleted_at != null,
          )
          const entries = normalizeEntries(rawEntries)
          sendResponse({ success: true, entries })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Labels ==========

      case 'LIST_LABELS': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const result = vault.api_list_labels(DEFAULT_VAULT_ID)
          const labels = JSON.parse(result)
          sendResponse({ success: true, labels })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'CREATE_LABEL': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const labelId = vault.api_create_label(DEFAULT_VAULT_ID, message.name)
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true, labelId })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DELETE_LABEL': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_delete_label(DEFAULT_VAULT_ID, message.id)
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'RENAME_LABEL': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_rename_label(DEFAULT_VAULT_ID, message.id, message.newName)
          await saveLocally()
          autoSync().catch((e) => console.error('[SW] Sync failed:', e))
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Password & TOTP ==========

      case 'GENERATE_PASSWORD': {
        try {
          const password = vault.api_generate_password(
            message.length ?? 16,
            message.includeLowercase ?? true,
            message.includeUppercase ?? true,
            message.includeNumbers ?? true,
            message.includeSymbols1 ?? true,
            message.includeSymbols2 ?? true,
            message.includeSymbols3 ?? true,
          )
          sendResponse({ success: true, password })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'GENERATE_TOTP': {
        try {
          const totp = vault.api_generate_totp_default(message.secret)
          sendResponse({ success: true, totp })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'GENERATE_TOTP_FROM_VALUE': {
        try {
          const totp = vault.api_generate_totp_from_value(message.value)
          const period = vault.api_parse_totp_period(message.value)
          sendResponse({ success: true, totp, period })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Security ==========

      case 'CHANGE_MASTER_PASSWORD': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_change_master_password(
            DEFAULT_VAULT_ID,
            message.oldPassword,
            message.newPassword,
          )
          // S3設定は DEK 由来の鍵で暗号化しているので、パスワード変更では暗号化し直さなくてよい
          await saveToSessionStorage(STORAGE_KEYS.SESSION_PASSWORD, message.newPassword)
          await autoSync()
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'ROTATE_DEK': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const recoveryKey = vault.api_rotate_dek(DEFAULT_VAULT_ID, message.password)
          // S3設定は DEK 由来の鍵で暗号化しているので、新しい DEK で暗号化し直す。
          // vault 本体と DEK が食い違うと次のアンロックで S3 設定を復号できなくなるため、
          // 同期の成否を待たずに両方を一緒に保存する
          const items: Record<string, unknown> = {
            [STORAGE_KEYS.VAULT_BYTES]: Array.from(vault.api_get_vault_bytes(DEFAULT_VAULT_ID)),
          }
          if (decryptedS3Config) {
            items[STORAGE_KEYS.S3_CONFIG] = vault.api_encrypt_config(
              DEFAULT_VAULT_ID,
              message.password,
              JSON.stringify(decryptedS3Config),
            )
          }
          await saveItemsToStorage(items)
          if (decryptedS3Config) {
            try {
              await pushAfterDekRotation(decryptedS3Config)
            } catch (err) {
              // ローテーション自体は完了しているので、新しいリカバリーキーは必ず返す
              console.error('[SW] push after DEK rotation failed:', err)
              await saveToStorage(STORAGE_KEYS.LAST_ERROR, {
                key: 'auto-sync',
                message: `同期に失敗しました: ${err}`,
                timestamp: Date.now(),
              })
            }
          }
          sendResponse({ success: true, recoveryKey })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'REGENERATE_RECOVERY_KEY': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          const recoveryKey = vault.api_regenerate_recovery_key(DEFAULT_VAULT_ID, message.password)
          await autoSync()
          sendResponse({ success: true, recoveryKey })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      // ========== Storage & Sync ==========

      case 'DOWNLOAD_VAULT': {
        try {
          // オンボーディング中はメッセージからS3設定を受け取る。既存セッションではメモリから使用。
          const s3Config: S3Config | null = message.s3Config ?? decryptedS3Config
          if (!s3Config) {
            sendResponse({ success: false, error: 'S3 config not found' })
            break
          }

          const client = new VaultS3Client(s3Config)
          try {
            const remote = await client.download()
            if (remote) {
              vault.api_load_vault(DEFAULT_VAULT_ID, remote.bytes, remote.etag)
              const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
              await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
              await saveToStorage(STORAGE_KEYS.VAULT_ETAG, remote.etag)
            }
            sendResponse({ success: true, vaultExists: !!remote })
          } finally {
            client.destroy()
          }
        } catch (err) {
          console.error('[SW] DOWNLOAD_VAULT: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DOWNLOAD': {
        try {
          const s3Config: S3Config | null = message.storageConfig
            ? JSON.parse(message.storageConfig)
            : decryptedS3Config

          if (!s3Config) {
            sendResponse({ success: false, error: 'S3 config not found' })
            break
          }

          const client = new VaultS3Client(s3Config)
          try {
            const remote = await client.download()
            if (remote) {
              vault.api_load_vault(DEFAULT_VAULT_ID, remote.bytes, remote.etag)
            }
            sendResponse({ success: true, result: !!remote })
          } finally {
            client.destroy()
          }
        } catch (err) {
          console.error('[SW] DOWNLOAD: Error:', err)
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'SYNC': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        if (syncing) {
          sendResponse({ success: false, error: 'Sync already in progress' })
          break
        }
        syncing = true
        try {
          if (!decryptedS3Config) {
            sendResponse({ success: true, status: 'idle', message: 'S3 config not set' })
            break
          }

          await syncWithS3(decryptedS3Config)
          // S3通信の await 中にロック・ログアウトされた場合は書き戻さない（autoSync と同様）
          if (!unlocked) throw new VaultLockedDuringSyncError()

          // 同期後、vault bytes と ETag を更新
          const vaultBytes = vault.api_get_vault_bytes(DEFAULT_VAULT_ID)
          await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
          const newEtag = vault.api_get_vault_etag(DEFAULT_VAULT_ID) ?? null
          await saveToStorage(STORAGE_KEYS.VAULT_ETAG, newEtag)

          const syncTime = Math.floor(Date.now() / 1000)
          await saveToStorage(STORAGE_KEYS.LAST_SYNC_TIME, syncTime)
          sendResponse({ success: true, status: 'synced', last_synced_at: syncTime })
        } catch (err) {
          console.error('[SW] SYNC: Error:', err)
          sendResponse({ success: false, error: String(err) })
        } finally {
          syncing = false
        }
        break
      }

      case 'GET_DECRYPTED_S3_CONFIG': {
        if (!unlocked || !decryptedS3Config) {
          sendResponse({ success: true, config: null })
        } else {
          sendResponse({ success: true, config: decryptedS3Config })
        }
        break
      }

      // ========== Settings ==========

      case 'GET_SETTINGS': {
        const settings = await loadSettings()
        sendResponse({ success: true, settings })
        break
      }

      case 'SAVE_SETTINGS': {
        try {
          await saveToStorage(STORAGE_KEYS.APP_SETTINGS, message.settings)
          if (unlocked) {
            if (message.settings.autolockMinutes > 0) {
              chrome.alarms.create('autolock', { delayInMinutes: message.settings.autolockMinutes })
            } else {
              chrome.alarms.clear('autolock')
            }
          }
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'VERIFY_PASSWORD': {
        if (!unlocked) {
          sendResponse({ success: false, error: 'Vault not unlocked' })
          break
        }
        try {
          vault.api_verify_password(DEFAULT_VAULT_ID, message.password)
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'DECRYPT_TRANSFER_CONFIG': {
        try {
          const configJson = vault.api_decrypt_transfer_config(
            message.password,
            message.transferString,
          )
          sendResponse({ success: true, configJson })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'ENCRYPT_TRANSFER_CONFIG': {
        try {
          const transferString = vault.api_encrypt_transfer_config(
            message.password,
            message.configJson,
          )
          sendResponse({ success: true, transferString })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      case 'CLIPBOARD_COPIED': {
        try {
          const settings = await loadSettings()
          lastCopiedText = message.text ?? null
          if (settings.clipboardClearSeconds > 0) {
            const minutes = settings.clipboardClearSeconds / 60
            chrome.alarms.create('clipboard-clear', { delayInMinutes: minutes })
          }
          sendResponse({ success: true })
        } catch (err) {
          sendResponse({ success: false, error: String(err) })
        }
        break
      }

      default:
        sendResponse({ success: false, error: 'Unknown message type' })
    }
  } catch (error) {
    console.error('[SW] Message handling error:', error)
    sendResponse({ success: false, error: String(error) })
  }
}

// ========== Alarm Setup ==========

function setupAlarms() {
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'autolock') {
      handleAutolockAlarm()
    } else if (alarm.name === 'clipboard-clear') {
      handleClipboardClearAlarm()
    } else if (alarm.name === 'autosync') {
      handleAutosyncAlarm()
    }
  })
}

async function handleAutolockAlarm() {
  // SW再起動後にアラームが発火した場合、セッションを復元してからロックする
  if (!unlocked) {
    await tryRestoreSession()
  }
  if (!unlocked) return
  try {
    const vaultBytes = vault.api_lock(DEFAULT_VAULT_ID)
    await saveToStorage(STORAGE_KEYS.VAULT_BYTES, Array.from(vaultBytes))
    await enterLockedState()
  } catch (err) {
    console.error('[SW] Autolock failed:', err)
  }
}

async function handleClipboardClearAlarm() {
  const expectedText = lastCopiedText
  lastCopiedText = null
  try {
    if (typeof chrome.offscreen !== 'undefined') {
      // Chrome: offscreen document 経由でクリップボードを確認＆クリア
      await chrome.offscreen.createDocument({
        url: chrome.runtime.getURL('src/background/offscreen.html'),
        reasons: ['CLIPBOARD' as chrome.offscreen.Reason],
        justification: 'Check and clear clipboard after copy timeout',
      })
      chrome.runtime.sendMessage({
        type: 'CHECK_AND_CLEAR_CLIPBOARD',
        expectedText,
      })
    } else {
      // Firefox: background page から直接クリップボードを確認＆クリア
      try {
        const current = await navigator.clipboard.readText()
        if (current === expectedText) {
          await navigator.clipboard.writeText('')
        }
      } catch {
        // readText 失敗時は安全側に倒して無条件クリア
        await navigator.clipboard.writeText('')
      }
    }
  } catch (err) {
    console.error('[SW] Clipboard clear failed:', err)
  }
}

// ========== Developer mode message handling ==========

async function handleDevModeMessageInBackground(
  // biome-ignore lint/suspicious/noExplicitAny: message shape varies by type
  message: Record<string, any>,
  _sender: chrome.runtime.MessageSender,
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies
  sendResponse: (response?: any) => void,
) {
  switch (message.type) {
    case 'DEV_MODE_PATTERNS_UPDATED':
    case 'DEV_MODE_DISABLED': {
      // Broadcast to all tabs
      const tabs = await chrome.tabs.query({})
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: message.type }).catch(() => {
            // Content script may not be loaded in this tab — ignore
          })
        }
      }
      sendResponse({ success: true })
      break
    }

    case 'DEV_MODE_DRY_RUN_TAB': {
      const tabId = message.tabId as number | undefined
      if (!tabId) {
        sendResponse({ success: false, error: 'tabId required' })
        break
      }
      try {
        const response = await chrome.tabs.sendMessage(tabId, { type: 'DEV_MODE_DRY_RUN' })
        sendResponse(response)
      } catch (e) {
        sendResponse({
          success: false,
          error: `Failed to reach content script in tab ${tabId}: ${e}`,
        })
      }
      break
    }

    default:
      sendResponse({ success: false, error: `Unknown dev mode message: ${message.type}` })
  }
}

async function handleAutosyncAlarm() {
  if (!unlocked) {
    await tryRestoreSession()
  }
  if (!unlocked) return
  await autoSync()
}
