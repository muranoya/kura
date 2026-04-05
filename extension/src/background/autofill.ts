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
}

/** Initialize autofill module with references to vault state */
export function initAutofill(api: VaultApi, unlockedFn: () => boolean) {
  console.log(LOG_PREFIX, 'Initializing autofill module')
  vaultApi = api
  isUnlocked = unlockedFn
}

// ========== Credential matching ==========

interface RawAutofillCandidate {
  id: string
  name: string
  url: string
  username: string | null
}

function getCredentialsForUrl(url: string): AutofillCredentialCandidate[] {
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
    `getCredentialsForUrl: url=${url}, hostname=${pageHostname}, eTLD+1=${pageETld}`,
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

    const entryETld = extractETldPlus1(entryHostname)
    console.log(
      LOG_PREFIX,
      `getCredentialsForUrl: entry "${entry.name}" url=${entry.url} eTLD+1=${entryETld} match=${pageETld === entryETld}`,
    )
    if (pageETld === entryETld) {
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

    return {
      username: ((typedValue as Record<string, unknown>).username as string) ?? null,
      password: ((typedValue as Record<string, unknown>).password as string) ?? null,
    }
  } catch (e) {
    console.error(LOG_PREFIX, 'getFillData: error:', e)
    return null
  }
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
      const credentials = getCredentialsForUrl(url)
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
