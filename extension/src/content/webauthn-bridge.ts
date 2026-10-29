// ISOLATED world relay between src/main-world/webauthn-main-injected.js (MAIN world)
// and the Service Worker. The requesting origin is not sent: the Service
// Worker derives it from the message sender (see docs/webauthn-passkey.md 3-5),
// so values arriving from MAIN world are never used for rp_id validation.
import { STORAGE_KEYS } from '../shared/constants'
import { getFromStorage } from '../shared/storage'
import {
  KURA_WEBAUTHN_BRIDGE_SOURCE,
  KURA_WEBAUTHN_MAIN_SOURCE,
  type WebauthnBridgeResponse,
  type WebauthnFeatureStateMessage,
  type WebauthnMainRequest,
  type WebauthnSwRequest,
  type WebauthnSwResponse,
} from '../shared/webauthn-messages'

window.addEventListener('message', (event) => {
  if (event.source !== window) return
  const data = event.data as WebauthnMainRequest | undefined
  if (!data || data.source !== KURA_WEBAUTHN_MAIN_SOURCE) return

  handleRequest(data)
})

// MAIN world (webauthn-main-injected.js) has no chrome.* access, so it can't
// read `passkeyEnabled` itself. Push the current value now and every time it
// changes, so `isUserVerifyingPlatformAuthenticatorAvailable()` there only
// ever reports `true` while the feature is actually enabled — see the
// override's rationale note in webauthn-main-injected.js.
async function pushFeatureState() {
  const settings = await getFromStorage<{ passkeyEnabled?: boolean }>(STORAGE_KEYS.APP_SETTINGS)
  const message: WebauthnFeatureStateMessage = {
    source: KURA_WEBAUTHN_BRIDGE_SOURCE,
    type: 'feature-state',
    enabled: settings?.passkeyEnabled === true,
  }
  window.postMessage(message, window.location.origin)
}

pushFeatureState()

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && STORAGE_KEYS.APP_SETTINGS in changes) {
    pushFeatureState()
  }
})

async function handleRequest(request: WebauthnMainRequest) {
  // WebAuthn is only available in secure contexts. navigator.credentials does
  // not even exist on http: pages, but a page can still post a request to this
  // bridge directly, so refuse here as well (the Service Worker re-checks).
  if (!window.isSecureContext) {
    postToMain({
      source: KURA_WEBAUTHN_BRIDGE_SOURCE,
      requestId: request.requestId,
      status: 'error',
      errorName: 'SecurityError',
      errorMessage: 'WebAuthn requires a secure context',
    })
    return
  }

  const swRequest: WebauthnSwRequest = {
    type: request.kind === 'create' ? 'WEBAUTHN_CREATE_REQUEST' : 'WEBAUTHN_GET_REQUEST',
    requestId: request.requestId,
    challenge: request.challenge,
    rpId: request.rpId,
    rpName: request.rpName,
    userId: request.userId,
    userName: request.userName,
    userDisplayName: request.userDisplayName,
    excludeCredentialIds: request.excludeCredentialIds,
    allowCredentialIds: request.allowCredentialIds,
  }

  let swResponse: WebauthnSwResponse
  try {
    swResponse = await new Promise<WebauthnSwResponse>((resolve, reject) => {
      chrome.runtime.sendMessage(swRequest, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message))
        } else {
          resolve(response as WebauthnSwResponse)
        }
      })
    })
  } catch (err) {
    postToMain({
      source: KURA_WEBAUTHN_BRIDGE_SOURCE,
      requestId: request.requestId,
      status: 'error',
      errorName: 'NotAllowedError',
      errorMessage: String(err),
    })
    return
  }

  if (!swResponse.success) {
    postToMain({
      source: KURA_WEBAUTHN_BRIDGE_SOURCE,
      requestId: request.requestId,
      status: 'error',
      errorName: swResponse.errorName || 'NotAllowedError',
      errorMessage: swResponse.error,
    })
    return
  }

  if (swResponse.status === 'passthrough') {
    postToMain({
      source: KURA_WEBAUTHN_BRIDGE_SOURCE,
      requestId: request.requestId,
      status: 'passthrough',
    })
    return
  }

  postToMain({
    source: KURA_WEBAUTHN_BRIDGE_SOURCE,
    requestId: request.requestId,
    status: 'ok',
    clientDataJSON: swResponse.clientDataJSON,
    credentialId: swResponse.credentialId,
    attestationObject: swResponse.attestationObject,
    authenticatorData: swResponse.authenticatorData,
    signature: swResponse.signature,
    userHandle: swResponse.userHandle,
  })
}

function postToMain(response: WebauthnBridgeResponse) {
  window.postMessage(response, window.location.origin)
}
