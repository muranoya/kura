// Autofill message handler and content script injection management

import { DEFAULT_VAULT_ID } from '../shared/constants'
import { extractETldPlus1 } from '../shared/etld'
import type { AutofillCredentialCandidate, AutofillFillData } from '../shared/types'

const LOG_PREFIX = '[kura:autofill:sw]'

// These are set by initAutofill() from index.ts
let vaultApi: VaultApi | null = null
let isUnlocked: () => boolean = () => false

export interface VaultApi {
  api_list_login_urls(vaultId: string): string
  api_get_entry(vaultId: string, id: string): string
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
  api_generate_totp_from_value(value: string): string
  api_parse_totp_period(value: string): number
  api_create_entry(
    vaultId: string,
    entryType: string,
    name: string,
    notes: string | null,
    typedValue: string,
    labelIds: string[],
    customFields: string | null,
  ): string
}

let saveLocallyFn: (() => Promise<void>) | null = null
let autoSyncFn: (() => Promise<void>) | null = null

/** Initialize autofill module with references to vault state */
export function initAutofill(
  api: VaultApi,
  unlockedFn: () => boolean,
  saveLocally: () => Promise<void>,
  autoSync: () => Promise<void>,
) {
  console.log(LOG_PREFIX, 'Initializing autofill module')
  vaultApi = api
  isUnlocked = unlockedFn
  saveLocallyFn = saveLocally
  autoSyncFn = autoSync
}

// ========== Credential matching ==========

interface RawAutofillCandidate {
  id: string
  name: string
  url: string
  username: string | null
}

function getCredentialsForUrl(
  url: string,
  strictSubdomain?: boolean,
): AutofillCredentialCandidate[] {
  if (!vaultApi || !isUnlocked()) {
    console.log(LOG_PREFIX, 'getCredentialsForUrl: vault not ready or locked')
    return []
  }

  let pageHostname: string
  try {
    pageHostname = new URL(url).hostname
  } catch {
    console.warn(LOG_PREFIX, 'getCredentialsForUrl: invalid URL:', url)
    return []
  }

  const pageETld = extractETldPlus1(pageHostname)
  console.log(
    LOG_PREFIX,
    `getCredentialsForUrl: url=${url}, hostname=${pageHostname}, eTLD+1=${pageETld}, strictSubdomain=${!!strictSubdomain}`,
  )

  // Fetch all login entries with their URLs (no passwords)
  const result = vaultApi.api_list_login_urls(DEFAULT_VAULT_ID)
  const rawCandidates: RawAutofillCandidate[] = JSON.parse(result)
  console.log(
    LOG_PREFIX,
    `getCredentialsForUrl: found ${rawCandidates.length} login entries with URLs`,
  )

  const candidates: AutofillCredentialCandidate[] = []
  for (const entry of rawCandidates) {
    let entryHostname: string
    try {
      const urlStr = entry.url.includes('://') ? entry.url : `https://${entry.url}`
      entryHostname = new URL(urlStr).hostname
    } catch {
      console.warn(
        LOG_PREFIX,
        `getCredentialsForUrl: invalid entry URL "${entry.url}" for "${entry.name}"`,
      )
      continue
    }

    let matched: boolean
    if (strictSubdomain) {
      // Exact hostname match when strict_subdomain is enabled
      matched = pageHostname.toLowerCase() === entryHostname.toLowerCase()
    } else {
      // Default: eTLD+1 match
      const entryETld = extractETldPlus1(entryHostname)
      matched = pageETld === entryETld
    }

    console.log(
      LOG_PREFIX,
      `getCredentialsForUrl: entry "${entry.name}" url=${entry.url} hostname=${entryHostname} match=${matched}`,
    )
    if (matched) {
      candidates.push({
        entryId: entry.id,
        name: entry.name,
        username: entry.username,
      })
    }
  }

  console.log(LOG_PREFIX, `getCredentialsForUrl: ${candidates.length} candidates found`)
  return candidates
}

function getFillData(entryId: string): AutofillFillData | null {
  if (!vaultApi || !isUnlocked()) return null

  try {
    const result = vaultApi.api_get_entry(DEFAULT_VAULT_ID, entryId)
    const raw = JSON.parse(result)

    let typedValue = raw.typed_value as Record<string, unknown> | string | undefined
    if (typeof typedValue === 'string') {
      try {
        typedValue = JSON.parse(typedValue)
      } catch {
        return null
      }
    }
    if (!typedValue) return null

    const tv = typedValue as Record<string, unknown>
    const entryType = raw.entry_type as string | undefined

    if (entryType === 'credit_card') {
      return {
        username: null,
        password: null,
        ccNumber: (tv.number as string) ?? null,
        ccExp: (tv.expiry as string) ?? null,
        ccCvc: (tv.cvv as string) ?? null,
        ccName: (tv.cardholder as string) ?? null,
      }
    }

    return {
      username: (tv.username as string) ?? null,
      password: (tv.password as string) ?? null,
    }
  } catch (e) {
    console.error(LOG_PREFIX, 'getFillData: error:', e)
    return null
  }
}

// ========== TOTP matching ==========

interface TotpResult {
  totpCode: string
  totpEntryName: string
}

function getTotpCandidatesForUrl(url: string): AutofillCredentialCandidate[] {
  if (!vaultApi || !isUnlocked()) return []

  const candidates = getCredentialsForUrl(url)
  const totpCandidates: AutofillCredentialCandidate[] = []
  for (const candidate of candidates) {
    try {
      const result = vaultApi.api_get_entry(DEFAULT_VAULT_ID, candidate.entryId)
      const raw = JSON.parse(result)
      const customFieldsRaw = raw.custom_fields
      const customFields = (
        typeof customFieldsRaw === 'string' ? JSON.parse(customFieldsRaw) : customFieldsRaw
      ) as Array<{ field_type: string; value: string }> | null
      if (!customFields) continue

      const totpField = customFields.find((f) => f.field_type === 'totp')
      if (!totpField?.value) continue

      const period = vaultApi.api_parse_totp_period(totpField.value)
      totpCandidates.push({ ...candidate, totpPeriod: period })
    } catch (e) {
      console.error(LOG_PREFIX, `getTotpCandidatesForUrl: error for entry ${candidate.entryId}:`, e)
    }
  }
  return totpCandidates
}

function getTotpForEntry(entryId: string): TotpResult | null {
  if (!vaultApi || !isUnlocked()) return null

  try {
    const result = vaultApi.api_get_entry(DEFAULT_VAULT_ID, entryId)
    const raw = JSON.parse(result)
    const customFieldsRaw = raw.custom_fields
    const customFields = (
      typeof customFieldsRaw === 'string' ? JSON.parse(customFieldsRaw) : customFieldsRaw
    ) as Array<{ field_type: string; value: string }> | null
    if (!customFields) return null

    const totpField = customFields.find((f) => f.field_type === 'totp')
    if (!totpField?.value) return null

    const code = vaultApi.api_generate_totp_from_value(totpField.value)
    return { totpCode: code, totpEntryName: raw.name || '' }
  } catch (e) {
    console.error(LOG_PREFIX, `getTotpForEntry: error for entry ${entryId}:`, e)
    return null
  }
}

// ========== Credit card matching ==========

function getCreditCards(): AutofillCredentialCandidate[] {
  if (!vaultApi || !isUnlocked()) return []

  try {
    const result = vaultApi.api_list_entries(
      DEFAULT_VAULT_ID,
      null,
      'credit_card',
      null,
      false,
      false,
      null,
      null,
    )
    const entries: Array<{ id: string; name: string; subtitle: string | null }> = JSON.parse(result)
    return entries.map((e) => ({
      entryId: e.id,
      name: e.name,
      username: e.subtitle,
    }))
  } catch (e) {
    console.error(LOG_PREFIX, 'getCreditCards: error:', e)
    return []
  }
}

// ========== Pending login flow (split login) ==========

interface PendingLoginFlow {
  domain: string
  entryId: string
  username: string
  timestamp: number
}

const pendingLoginFlows = new Map<number, PendingLoginFlow>()
const PENDING_FLOW_TIMEOUT_MS = 5 * 60 * 1000

function storePendingLoginFlow(tabId: number, domain: string, entryId: string, username: string) {
  pendingLoginFlows.set(tabId, { domain, entryId, username, timestamp: Date.now() })
  console.log(
    LOG_PREFIX,
    `storePendingLoginFlow: tabId=${tabId}, domain=${domain}, entryId=${entryId}`,
  )
}

function queryPendingLoginFlow(
  tabId: number,
  domain: string,
): { entryId: string; username: string } | null {
  const flow = pendingLoginFlows.get(tabId)
  if (!flow) return null

  if (Date.now() - flow.timestamp > PENDING_FLOW_TIMEOUT_MS) {
    console.log(LOG_PREFIX, `queryPendingLoginFlow: flow expired for tabId=${tabId}`)
    pendingLoginFlows.delete(tabId)
    return null
  }

  if (flow.domain !== domain) {
    console.log(
      LOG_PREFIX,
      `queryPendingLoginFlow: domain mismatch for tabId=${tabId}: flow=${flow.domain}, query=${domain}`,
    )
    return null
  }

  // Do not delete the flow — it remains available for the TOTP step.
  // Cleanup is handled by timeout (5 min) or tab close.
  console.log(LOG_PREFIX, `queryPendingLoginFlow: returning flow for tabId=${tabId}`)
  return { entryId: flow.entryId, username: flow.username }
}

export function cleanupPendingFlow(tabId: number) {
  pendingLoginFlows.delete(tabId)
}

// ========== Vault state notifications to content scripts ==========

/** Called when vault is unlocked — notify all tabs to dismiss locked UI */
export function onVaultUnlocked() {
  console.log(LOG_PREFIX, 'onVaultUnlocked: notifying all tabs')
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL_VAULT_UNLOCKED' }).catch(() => {
          // Tab might not have content script
        })
      }
    }
  })
}

/** Called when vault is locked — notify all tabs to hide UI */
export function onVaultLocked() {
  console.log(LOG_PREFIX, 'onVaultLocked: notifying all tabs')
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'AUTOFILL_VAULT_LOCKED' }).catch(() => {
          // Tab might not have content script (e.g. about: pages)
        })
      }
    }
  })
}

// ========== Message handler ==========

export async function handleAutofillMessage(
  message: Record<string, unknown>,
  _sender: chrome.runtime.MessageSender,
  // biome-ignore lint/suspicious/noExplicitAny: response shape varies
  sendResponse: (response?: any) => void,
) {
  console.log(LOG_PREFIX, `handleAutofillMessage: type=${message.type}`)

  switch (message.type) {
    case 'AUTOFILL_GET_CREDENTIALS': {
      if (!isUnlocked()) {
        console.log(LOG_PREFIX, 'AUTOFILL_GET_CREDENTIALS: vault not unlocked')
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      const url = message.url as string
      if (!url) {
        sendResponse({ success: false, error: 'URL required' })
        break
      }
      const strictSubdomain = message.strictSubdomain as boolean | undefined
      const credentials = getCredentialsForUrl(url, strictSubdomain)
      console.log(
        LOG_PREFIX,
        `AUTOFILL_GET_CREDENTIALS: returning ${credentials.length} credentials`,
      )
      sendResponse({ success: true, credentials })
      break
    }

    case 'AUTOFILL_FILL_REQUEST': {
      if (!isUnlocked()) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      const entryId = message.entryId as string
      if (!entryId) {
        sendResponse({ success: false, error: 'Entry ID required' })
        break
      }
      const fillData = getFillData(entryId)
      if (!fillData) {
        sendResponse({ success: false, error: 'Entry not found' })
        break
      }
      console.log(LOG_PREFIX, `AUTOFILL_FILL_REQUEST: returning fill data for ${entryId}`)
      sendResponse({ success: true, fillData })
      break
    }

    case 'AUTOFILL_GET_TOTP': {
      if (!isUnlocked()) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      const totpEntryId = message.entryId as string
      const totpResult = getTotpForEntry(totpEntryId)
      console.log(LOG_PREFIX, `AUTOFILL_GET_TOTP: entryId=${totpEntryId}, found=${!!totpResult}`)

      if (totpResult) {
        sendResponse({ success: true, ...totpResult })
      } else {
        sendResponse({ success: true, totpCode: null })
      }
      break
    }

    case 'AUTOFILL_GET_TOTP_CANDIDATES': {
      if (!isUnlocked()) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      const totpCandidateUrl = message.url as string
      const totpCandidates = getTotpCandidatesForUrl(totpCandidateUrl)
      console.log(
        LOG_PREFIX,
        `AUTOFILL_GET_TOTP_CANDIDATES: returning ${totpCandidates.length} candidates`,
      )
      sendResponse({ success: true, totpCandidates })
      break
    }

    case 'AUTOFILL_GET_CREDIT_CARDS': {
      if (!isUnlocked()) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      const creditCards = getCreditCards()
      console.log(LOG_PREFIX, `AUTOFILL_GET_CREDIT_CARDS: returning ${creditCards.length} cards`)
      sendResponse({ success: true, creditCards })
      break
    }

    case 'AUTOFILL_PENDING_FLOW_STORE': {
      const storeTabId = _sender.tab?.id
      if (!storeTabId) {
        sendResponse({ success: false, error: 'No tab ID' })
        break
      }
      const storeUrl = message.url as string
      if (!storeUrl) {
        sendResponse({ success: false, error: 'URL required' })
        break
      }
      let storeDomain: string
      try {
        storeDomain = extractETldPlus1(new URL(storeUrl).hostname)
      } catch {
        sendResponse({ success: false, error: 'Invalid URL' })
        break
      }
      storePendingLoginFlow(
        storeTabId,
        storeDomain,
        message.entryId as string,
        (message.username as string) || '',
      )
      sendResponse({ success: true })
      break
    }

    case 'AUTOFILL_PENDING_FLOW_QUERY': {
      const queryTabId = _sender.tab?.id
      if (!queryTabId) {
        sendResponse({ success: false, error: 'No tab ID' })
        break
      }
      const queryUrl = message.url as string
      if (!queryUrl) {
        sendResponse({ success: false, error: 'URL required' })
        break
      }
      if (!isUnlocked()) {
        sendResponse({ success: true, pendingFlow: null })
        break
      }
      let queryDomain: string
      try {
        queryDomain = extractETldPlus1(new URL(queryUrl).hostname)
      } catch {
        sendResponse({ success: true, pendingFlow: null })
        break
      }
      const flow = queryPendingLoginFlow(queryTabId, queryDomain)
      if (flow) {
        const flowFillData = getFillData(flow.entryId)
        sendResponse({
          success: true,
          pendingFlow: {
            entryId: flow.entryId,
            username: flow.username,
            password: flowFillData?.password || '',
          },
        })
      } else {
        sendResponse({ success: true, pendingFlow: null })
      }
      break
    }

    case 'AUTOFILL_START_CAPTURE': {
      // Forward to active tab's content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0]
        if (activeTab?.id) {
          chrome.tabs
            .sendMessage(activeTab.id, { type: 'AUTOFILL_START_CAPTURE' })
            .then(() => sendResponse({ success: true }))
            .catch((e) => {
              console.warn(LOG_PREFIX, 'AUTOFILL_START_CAPTURE: failed to forward:', e)
              sendResponse({ success: false, error: String(e) })
            })
        } else {
          sendResponse({ success: false, error: 'No active tab' })
        }
      })
      return true // Keep message channel open for async response
    }

    case 'AUTOFILL_SAVE_CAPTURED': {
      if (!isUnlocked() || !vaultApi || !saveLocallyFn || !autoSyncFn) {
        sendResponse({ success: false, error: 'Vault not unlocked' })
        break
      }
      const syncFn = autoSyncFn
      const captureUrl = message.url as string
      const captureName = (message.name as string | null) ?? null
      const captureUsername = (message.username as string | null) ?? null
      const capturePassword = message.password as string
      if (!captureUrl || !capturePassword) {
        sendResponse({ success: false, error: 'URL and password required' })
        break
      }
      try {
        let entryName: string
        if (captureName?.trim()) {
          entryName = captureName.trim()
        } else {
          try {
            entryName = new URL(captureUrl).hostname
          } catch {
            entryName = captureUrl
          }
        }

        const typedValue = JSON.stringify({
          url: captureUrl,
          username: captureUsername,
          password: capturePassword,
          totp: null,
        })
        const entryId = vaultApi.api_create_entry(
          DEFAULT_VAULT_ID,
          'login',
          entryName,
          null,
          typedValue,
          [],
          null,
        )
        saveLocallyFn()
          .then(() => {
            syncFn().catch((e) => console.error(LOG_PREFIX, 'Sync failed:', e))
          })
          .catch((e) => console.error(LOG_PREFIX, 'Save failed:', e))
        console.log(LOG_PREFIX, `AUTOFILL_SAVE_CAPTURED: created entry ${entryId} for ${entryName}`)
        sendResponse({ success: true, entryId })
      } catch (e) {
        console.error(LOG_PREFIX, 'AUTOFILL_SAVE_CAPTURED: error:', e)
        sendResponse({ success: false, error: String(e) })
      }
      break
    }

    case 'AUTOFILL_OPEN_POPUP': {
      chrome.action
        .openPopup()
        .then(() => {
          sendResponse({ success: true })
        })
        .catch((e) => {
          console.warn(LOG_PREFIX, 'AUTOFILL_OPEN_POPUP: failed:', e)
          sendResponse({ success: false, error: String(e) })
        })
      return true // Keep message channel open for async response
    }

    default:
      console.warn(LOG_PREFIX, `Unknown message type: ${message.type}`)
      sendResponse({ success: false, error: `Unknown autofill message type: ${message.type}` })
  }
}
