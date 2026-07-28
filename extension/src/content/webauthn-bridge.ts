// ISOLATED world relay between src/main-world/webauthn-main-injected.js (MAIN world)
// and the Service Worker. Runs in a separate JS realm from the page, so
// `window.location` here is the browser's real, unmodifiable Location object
// — this is the only origin/hostname value the Service Worker's rp_id
// validation trusts (see docs/webauthn-passkey.md 3-5). Values arriving from
// MAIN world are never used for that check.
import {
  KURA_WEBAUTHN_BRIDGE_SOURCE,
  KURA_WEBAUTHN_MAIN_SOURCE,
  type WebauthnBridgeResponse,
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

async function handleRequest(request: WebauthnMainRequest) {
  const swRequest: WebauthnSwRequest = {
    type: request.kind === 'create' ? 'WEBAUTHN_CREATE_REQUEST' : 'WEBAUTHN_GET_REQUEST',
    requestId: request.requestId,
    origin: window.location.origin,
    hostname: window.location.hostname,
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
