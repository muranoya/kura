// Message shapes for the WebAuthn/Passkey interception bridge:
//
//   webauthn-main.ts (MAIN world)
//     --window.postMessage-->  webauthn-bridge.ts (ISOLATED world)
//     --chrome.runtime.sendMessage-->  background/webauthn.ts (Service Worker)
//
// All BufferSource fields (challenge, credential ids, user.id, signatures, …)
// are base64url strings — see shared/webauthn-codec.ts.

export const KURA_WEBAUTHN_MAIN_SOURCE = 'kura-webauthn-main'
export const KURA_WEBAUTHN_BRIDGE_SOURCE = 'kura-webauthn-bridge'

export interface WebauthnMainRequest {
  source: typeof KURA_WEBAUTHN_MAIN_SOURCE
  requestId: string
  kind: 'create' | 'get'
  challenge: string
  rpId?: string
  rpName?: string
  userId?: string
  userName?: string
  userDisplayName?: string
  excludeCredentialIds?: string[]
  allowCredentialIds?: string[]
}

export interface WebauthnBridgeResponse {
  source: typeof KURA_WEBAUTHN_BRIDGE_SOURCE
  requestId: string
  status: 'ok' | 'passthrough' | 'error'
  clientDataJSON?: string
  credentialId?: string
  attestationObject?: string
  authenticatorData?: string
  signature?: string
  userHandle?: string
  errorName?: string
  errorMessage?: string
}

/** ISOLATED world → Service Worker (adds the bridge's own untainted origin/hostname) */
export interface WebauthnSwRequest {
  type: 'WEBAUTHN_CREATE_REQUEST' | 'WEBAUTHN_GET_REQUEST'
  requestId: string
  origin: string
  hostname: string
  challenge: string
  rpId?: string
  rpName?: string
  userId?: string
  userName?: string
  userDisplayName?: string
  excludeCredentialIds?: string[]
  allowCredentialIds?: string[]
}

export type WebauthnSwResponse =
  | { success: true; status: 'passthrough' }
  | {
      success: true
      status: 'ok'
      clientDataJSON: string
      credentialId: string
      attestationObject?: string
      authenticatorData?: string
      signature?: string
      userHandle?: string
    }
  | { success: false; errorName: string; error: string }

/** Ritual window (webauthn.html) ↔ Service Worker */
export interface WebauthnRitualContextRequest {
  type: 'WEBAUTHN_RITUAL_GET_CONTEXT'
  requestId: string
}

export interface WebauthnRitualCandidate {
  entryId: string
  entryName: string
  customFieldId: string
  credentialId: string
  userName: string
  userDisplayName: string
}

export interface WebauthnRitualEntryOption {
  id: string
  name: string
  username: string | null
}

export type WebauthnRitualContext =
  | {
      kind: 'get'
      rpId: string
      candidates: WebauthnRitualCandidate[]
    }
  | {
      kind: 'create'
      rpId: string
      rpName: string | null
      matchingEntries: WebauthnRitualEntryOption[]
    }

export interface WebauthnRitualDecision {
  type: 'WEBAUTHN_RITUAL_DECISION'
  requestId: string
  cancelled: boolean
  /** kind === 'get': the chosen candidate's credential_id */
  credentialId?: string
  /** kind === 'create': target entry id, or undefined/null to create a new login entry */
  entryId?: string | null
}
