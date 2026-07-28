// WebAuthn/Passkey message handling: rp_id validation, credential lookup,
// the create()/get() "ritual" (confirmation/selection) window, and the calls
// into vault-core (via wasm-bridge) that actually generate keys / sign
// assertions. See docs/webauthn-passkey.md Part 3 for the overall design.

import { DEFAULT_VAULT_ID, STORAGE_KEYS } from '../shared/constants'
import { isValidRpId } from '../shared/etld'
import { getFromStorage } from '../shared/storage'
import type {
  WebauthnRitualContext,
  WebauthnRitualDecision,
  WebauthnSwRequest,
} from '../shared/webauthn-messages'

const LOG_PREFIX = '[kura:webauthn:sw]'
const RITUAL_TIMEOUT_MS = 85_000

export interface WebauthnVaultApi {
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
  api_list_login_candidates(vaultId: string, pageHostname: string, strictSubdomain: boolean): string
}

let vaultApi: WebauthnVaultApi | null = null
let isUnlocked: () => boolean = () => false
let saveLocallyFn: (() => Promise<void>) | null = null
let autoSyncFn: (() => Promise<void>) | null = null

/** Initialize with references to vault state, mirroring initAutofill(). */
export function initWebauthn(
  api: WebauthnVaultApi,
  unlockedFn: () => boolean,
  saveLocally: () => Promise<void>,
  autoSync: () => Promise<void>,
) {
  vaultApi = api
  isUnlocked = unlockedFn
  saveLocallyFn = saveLocally
  autoSyncFn = autoSync
}

async function isPasskeyFeatureEnabled(): Promise<boolean> {
  const settings = await getFromStorage<{ passkeyEnabled?: boolean }>(STORAGE_KEYS.APP_SETTINGS)
  return settings?.passkeyEnabled === true
}

function buildClientDataJson(
  type: 'webauthn.create' | 'webauthn.get',
  challenge: string,
  origin: string,
): string {
  return JSON.stringify({ type, challenge, origin, crossOrigin: false })
}

// ========== Ritual window management ==========

interface PendingRitual {
  resolve: (decision: WebauthnRitualDecision) => void
  context: WebauthnRitualContext
  windowId?: number
  timeoutId: ReturnType<typeof setTimeout>
}

const pendingRituals = new Map<string, PendingRitual>()

function finishRitual(requestId: string, decision: WebauthnRitualDecision) {
  const pending = pendingRituals.get(requestId)
  if (!pending) return
  pendingRituals.delete(requestId)
  clearTimeout(pending.timeoutId)
  if (pending.windowId !== undefined) {
    chrome.windows.remove(pending.windowId).catch(() => {})
  }
  pending.resolve(decision)
}

chrome.windows.onRemoved.addListener((windowId) => {
  for (const [requestId, pending] of pendingRituals) {
    if (pending.windowId === windowId) {
      pendingRituals.delete(requestId)
      clearTimeout(pending.timeoutId)
      pending.resolve({ type: 'WEBAUTHN_RITUAL_DECISION', requestId, cancelled: true })
      break
    }
  }
})

/**
 * 儀式ウィンドウを開き、ユーザーの決定（確認/選択、またはキャンセル）を待つ。
 * ウィンドウが閉じられた場合・タイムアウトした場合はcancelled:trueで解決する。
 */
function runRitual(
  requestId: string,
  context: WebauthnRitualContext,
): Promise<WebauthnRitualDecision> {
  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      finishRitual(requestId, { type: 'WEBAUTHN_RITUAL_DECISION', requestId, cancelled: true })
    }, RITUAL_TIMEOUT_MS)

    pendingRituals.set(requestId, { resolve, context, timeoutId })

    const url = chrome.runtime.getURL(
      `src/popup/webauthn.html?requestId=${encodeURIComponent(requestId)}&kind=${context.kind}`,
    )
    chrome.windows.create({ url, type: 'popup', width: 420, height: 560, focused: true }, (win) => {
      const pending = pendingRituals.get(requestId)
      if (pending && win?.id !== undefined) {
        pending.windowId = win.id
      }
    })
  })
}

// ========== create()/get() request handling ==========

interface RawCredentialCandidate {
  entry_id: string
  entry_name: string
  custom_field_id: string
  credential_id: string
  user_handle: string
  user_name: string
  user_display_name: string
}

async function handleGetRequest(
  req: WebauthnSwRequest,
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies by outcome
  sendResponse: (response?: any) => void,
) {
  if (!(await isPasskeyFeatureEnabled()) || !vaultApi || !isUnlocked()) {
    sendResponse({ success: true, status: 'passthrough' })
    return
  }

  const rpId = req.rpId || req.hostname
  if (!isValidRpId(req.hostname, rpId)) {
    sendResponse({
      success: false,
      errorName: 'SecurityError',
      error: 'rp_id does not match origin',
    })
    return
  }

  let candidates: RawCredentialCandidate[]
  try {
    const json = vaultApi.api_webauthn_find_credentials(
      DEFAULT_VAULT_ID,
      rpId,
      req.allowCredentialIds ?? [],
    )
    candidates = JSON.parse(json)
  } catch (err) {
    console.error(LOG_PREFIX, 'find_credentials failed', err)
    sendResponse({ success: false, errorName: 'NotAllowedError', error: String(err) })
    return
  }

  // 候補0件ならUIを一切開かずパススルー（サイドチャネル防止、Part 5参照）
  if (candidates.length === 0) {
    sendResponse({ success: true, status: 'passthrough' })
    return
  }

  try {
    const decision = await runRitual(req.requestId, {
      kind: 'get',
      rpId,
      candidates: candidates.map((c) => ({
        entryId: c.entry_id,
        entryName: c.entry_name,
        customFieldId: c.custom_field_id,
        credentialId: c.credential_id,
        userName: c.user_name,
        userDisplayName: c.user_display_name,
      })),
    })

    if (decision.cancelled || !decision.credentialId) {
      sendResponse({ success: false, errorName: 'NotAllowedError', error: 'User cancelled' })
      return
    }

    const chosen = candidates.find((c) => c.credential_id === decision.credentialId)
    if (!chosen) {
      sendResponse({ success: false, errorName: 'NotAllowedError', error: 'Invalid selection' })
      return
    }

    const clientDataJSON = buildClientDataJson('webauthn.get', req.challenge, req.origin)
    const assertionJson = vaultApi.api_webauthn_get_assertion(
      DEFAULT_VAULT_ID,
      chosen.entry_id,
      chosen.custom_field_id,
      clientDataJSON,
    )
    const assertion = JSON.parse(assertionJson)

    sendResponse({
      success: true,
      status: 'ok',
      clientDataJSON,
      credentialId: assertion.credential_id,
      authenticatorData: assertion.authenticator_data,
      signature: assertion.signature,
      userHandle: assertion.user_handle,
    })
  } catch (err) {
    console.error(LOG_PREFIX, 'get assertion failed', err)
    sendResponse({ success: false, errorName: 'NotAllowedError', error: String(err) })
  }
}

interface RawLoginCandidate {
  id: string
  name: string
  url: string
  username: string | null
}

async function handleCreateRequest(
  req: WebauthnSwRequest,
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies by outcome
  sendResponse: (response?: any) => void,
) {
  if (!(await isPasskeyFeatureEnabled()) || !vaultApi || !isUnlocked()) {
    sendResponse({ success: true, status: 'passthrough' })
    return
  }

  const rpId = req.rpId || req.hostname
  if (!isValidRpId(req.hostname, rpId)) {
    sendResponse({
      success: false,
      errorName: 'SecurityError',
      error: 'rp_id does not match origin',
    })
    return
  }

  // excludeCredentialsチェックはUIを開く前に行う（一致すれば即座にreject、Part 3-6参照）
  if (req.excludeCredentialIds && req.excludeCredentialIds.length > 0) {
    try {
      const json = vaultApi.api_webauthn_find_credentials(
        DEFAULT_VAULT_ID,
        rpId,
        req.excludeCredentialIds,
      )
      const existing: RawCredentialCandidate[] = JSON.parse(json)
      if (existing.length > 0) {
        sendResponse({
          success: false,
          errorName: 'InvalidStateError',
          error: 'Credential already registered for this relying party',
        })
        return
      }
    } catch (err) {
      sendResponse({ success: false, errorName: 'NotAllowedError', error: String(err) })
      return
    }
  }

  let matchingEntries: { id: string; name: string; username: string | null }[] = []
  try {
    const json = vaultApi.api_list_login_candidates(DEFAULT_VAULT_ID, req.hostname, false)
    const raw: RawLoginCandidate[] = JSON.parse(json)
    matchingEntries = raw.map((e) => ({ id: e.id, name: e.name, username: e.username }))
  } catch (err) {
    console.error(LOG_PREFIX, 'list_login_candidates failed', err)
  }

  try {
    const decision = await runRitual(req.requestId, {
      kind: 'create',
      rpId,
      rpName: req.rpName ?? null,
      matchingEntries,
    })

    if (decision.cancelled) {
      sendResponse({ success: false, errorName: 'NotAllowedError', error: 'User cancelled' })
      return
    }

    const resultJson = vaultApi.api_webauthn_create_credential(
      DEFAULT_VAULT_ID,
      decision.entryId || null,
      rpId,
      req.rpName ?? null,
      req.userId ?? '',
      req.userName ?? '',
      req.userDisplayName ?? '',
      req.excludeCredentialIds ?? [],
    )
    const result = JSON.parse(resultJson)

    if (saveLocallyFn) await saveLocallyFn()
    if (autoSyncFn) autoSyncFn().catch((e) => console.error(LOG_PREFIX, 'sync failed', e))

    const clientDataJSON = buildClientDataJson('webauthn.create', req.challenge, req.origin)

    sendResponse({
      success: true,
      status: 'ok',
      clientDataJSON,
      credentialId: result.credential_id,
      attestationObject: result.attestation_object,
    })
  } catch (err) {
    console.error(LOG_PREFIX, 'create credential failed', err)
    sendResponse({ success: false, errorName: 'NotAllowedError', error: String(err) })
  }
}

// ========== Ritual window ↔ Service Worker messages ==========

function handleRitualGetContext(
  message: { requestId: string },
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies
  sendResponse: (response?: any) => void,
) {
  const pending = pendingRituals.get(message.requestId)
  if (!pending) {
    sendResponse({ success: false, error: 'Request not found or expired' })
    return
  }
  sendResponse({ success: true, context: pending.context })
}

function handleRitualDecision(
  message: WebauthnRitualDecision,
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies
  sendResponse: (response?: any) => void,
) {
  finishRitual(message.requestId, message)
  sendResponse({ success: true })
}

// ========== Entry point (delegated from background/index.ts) ==========

export async function handleWebauthnMessage(
  // biome-ignore lint/suspicious/noExplicitAny: message shape varies by type
  message: Record<string, any>,
  _sender: chrome.runtime.MessageSender,
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies by handler
  sendResponse: (response?: any) => void,
) {
  switch (message.type) {
    case 'WEBAUTHN_CREATE_REQUEST':
      return handleCreateRequest(message as WebauthnSwRequest, sendResponse)
    case 'WEBAUTHN_GET_REQUEST':
      return handleGetRequest(message as WebauthnSwRequest, sendResponse)
    case 'WEBAUTHN_RITUAL_GET_CONTEXT':
      return handleRitualGetContext(message as { requestId: string }, sendResponse)
    case 'WEBAUTHN_RITUAL_DECISION':
      return handleRitualDecision(message as WebauthnRitualDecision, sendResponse)
    default:
      sendResponse({ success: false, error: `Unknown webauthn message: ${message.type}` })
  }
}
