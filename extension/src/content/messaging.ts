// Content Script ↔ Service Worker messaging

import type { AutofillCredentialCandidate, AutofillFillData } from '../shared/types'

interface SuccessResponse {
  success: true
  credentials?: AutofillCredentialCandidate[]
  fillData?: AutofillFillData
}

interface ErrorResponse {
  success: false
  error: string
}

type Response = SuccessResponse | ErrorResponse

export type GetCredentialsResult =
  | { status: 'ok'; credentials: AutofillCredentialCandidate[] }
  | { status: 'locked' }

function sendMessage(message: Record<string, unknown>): Promise<Response> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message || 'Unknown error' })
      } else {
        resolve(response || { success: false, error: 'No response' })
      }
    })
  })
}

export async function getCredentials(url: string): Promise<GetCredentialsResult> {
  const response = await sendMessage({ type: 'AUTOFILL_GET_CREDENTIALS', url })
  if (response.success && 'credentials' in response) {
    return { status: 'ok', credentials: response.credentials || [] }
  }
  if (!response.success && 'error' in response && response.error === 'Vault not unlocked') {
    return { status: 'locked' }
  }
  return { status: 'ok', credentials: [] }
}

export async function requestFillData(entryId: string): Promise<AutofillFillData | null> {
  const response = await sendMessage({ type: 'AUTOFILL_FILL_REQUEST', entryId })
  if (response.success && 'fillData' in response) {
    return response.fillData || null
  }
  return null
}

export async function requestOpenPopup(): Promise<boolean> {
  const response = await sendMessage({ type: 'AUTOFILL_OPEN_POPUP' })
  return response.success
}
