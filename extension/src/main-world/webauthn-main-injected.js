// MAIN-world content script: overrides navigator.credentials.create()/get() so
// kura can act as a synced Passkey authenticator. Injected at document_start
// (before the page can cache references to the original functions) via a
// dist/manifest.json entry added by ../vite-inject-webauthn-main.ts — see that
// file and docs/webauthn-passkey.md Part 3-2 for why this has to be a single
// dependency-free plain script instead of a normal crx-bundled TS module.
//
// This file intentionally duplicates the source/message-shape constants from
// src/shared/webauthn-messages.ts and the base64url codec from
// src/shared/webauthn-codec.ts, because it cannot import them (see Part 3-2).
// Keep both copies in sync by hand if either side changes.
//
// Protocol (docs/webauthn-passkey.md Part 3-6):
//   this script --window.postMessage--> src/content/webauthn-bridge.ts (ISOLATED world)
//     --chrome.runtime.sendMessage--> src/background/webauthn.ts (Service Worker)
//
// The Service Worker is the only party that decides rp_id validity, feature
// enablement, and passthrough vs. ritual UI; this script never makes a
// security decision, it only translates between the page's WebAuthn API
// shape and kura's internal message shape.
;(() => {
  if (!navigator.credentials || typeof navigator.credentials.create !== 'function') return
  // Guard against double-injection (e.g. a stray second MAIN-world content
  // script match) re-wrapping an already-wrapped function.
  if (navigator.credentials.create.__kuraPatched) return

  const KURA_WEBAUTHN_MAIN_SOURCE = 'kura-webauthn-main'
  const KURA_WEBAUTHN_BRIDGE_SOURCE = 'kura-webauthn-bridge'
  // Independent of the ritual window's own timeouts (85s/180s, background/webauthn.ts) —
  // this is the "the page's Promise must always settle" backstop described in Part 5-5.
  const REQUEST_TIMEOUT_MS = 90000

  const originalCreate = navigator.credentials.create.bind(navigator.credentials)
  const originalGet = navigator.credentials.get.bind(navigator.credentials)

  // ---- src/shared/webauthn-codec.ts (duplicated) ----

  function bufferSourceToBase64Url(buffer) {
    const bytes =
      buffer instanceof ArrayBuffer
        ? new Uint8Array(buffer)
        : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }

  function base64UrlToArrayBuffer(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/')
    const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
    const binary = atob(padded + padding)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  function stringToArrayBuffer(value) {
    return new TextEncoder().encode(value).buffer
  }

  // ---- request/response plumbing ----

  const pending = new Map()

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== KURA_WEBAUTHN_BRIDGE_SOURCE) return
    const entry = pending.get(data.requestId)
    if (!entry) return
    pending.delete(data.requestId)
    clearTimeout(entry.timeoutId)
    entry.resolve(data)
  })

  function makeRequestId() {
    return typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  }

  /** Post a create/get request to webauthn-bridge.ts and await its reply, with our own hard timeout. */
  function sendRequest(kind, fields) {
    return new Promise((resolve) => {
      const requestId = makeRequestId()
      const timeoutId = setTimeout(() => {
        pending.delete(requestId)
        resolve({
          status: 'error',
          errorName: 'NotAllowedError',
          errorMessage: 'kura: request timed out',
        })
      }, REQUEST_TIMEOUT_MS)

      pending.set(requestId, { timeoutId, resolve })

      window.postMessage(
        Object.assign({ source: KURA_WEBAUTHN_MAIN_SOURCE, requestId, kind }, fields),
        window.location.origin,
      )
    })
  }

  function errorFromResponse(data) {
    const name = data.errorName || 'NotAllowedError'
    const message = data.errorMessage || 'kura rejected the request'
    try {
      return new DOMException(message, name)
    } catch {
      const err = new Error(message)
      err.name = name
      return err
    }
  }

  function getClientExtensionResults() {
    return {}
  }

  // Minimal, purpose-built reader for kura's own "none"-format attestationObject
  // CBOR shape (see vault-core/src/webauthn/mod.rs::build_attestation_object:
  // a fixed 3-entry definite-length map {fmt: "none", attStmt: {}, authData: bytes}).
  // This is NOT a general CBOR parser — it only knows how to walk this exact,
  // always-identically-encoded structure to pull out the authData byte string,
  // for getAuthenticatorData(). Byte-level CBOR construction/parsing otherwise
  // lives entirely in Rust (docs/webauthn-passkey.md Part 3-4); if this ever
  // fails to match, callers get null rather than a thrown error.
  function extractAuthDataFromAttestationObject(attestationObject) {
    try {
      const bytes = new Uint8Array(attestationObject)
      let offset = 0
      if (bytes[offset] !== 0xa3) return null // map(3), not our expected shape
      offset += 1
      for (let field = 0; field < 3; field++) {
        offset += skipTextString(bytes, offset) // key
        if (field < 2) {
          offset += skipValue(bytes, offset) // "none" text, or empty map
        } else {
          const { length, headerLength } = readByteStringHeader(bytes, offset)
          offset += headerLength
          return bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + length)
        }
      }
      return null
    } catch {
      return null
    }
  }

  function readLengthHeader(bytes, offset) {
    const additionalInfo = bytes[offset] & 0x1f
    if (additionalInfo < 24) return { length: additionalInfo, headerLength: 1 }
    if (additionalInfo === 24) return { length: bytes[offset + 1], headerLength: 2 }
    if (additionalInfo === 25) {
      return { length: (bytes[offset + 1] << 8) | bytes[offset + 2], headerLength: 3 }
    }
    throw new Error('unsupported CBOR length encoding')
  }

  function readByteStringHeader(bytes, offset) {
    return readLengthHeader(bytes, offset)
  }

  function skipTextString(bytes, offset) {
    const { length, headerLength } = readLengthHeader(bytes, offset)
    return headerLength + length
  }

  /** Skips either a text string value ("none") or an empty map ({}) — the only two non-authData values in our fixed shape. */
  function skipValue(bytes, offset) {
    const majorType = bytes[offset] >> 5
    if (majorType === 3) return skipTextString(bytes, offset) // text string
    if (majorType === 5) return 1 // empty map: single 0xa0 byte
    throw new Error('unexpected CBOR value')
  }

  // ---- navigator.credentials.create() override ----

  function createOverride(options) {
    if (!options?.publicKey || options.mediation === 'conditional') {
      return originalCreate(options)
    }
    const publicKey = options.publicKey

    return sendRequest('create', {
      challenge: bufferSourceToBase64Url(publicKey.challenge),
      rpId: publicKey.rp ? publicKey.rp.id : undefined,
      rpName: publicKey.rp ? publicKey.rp.name : undefined,
      userId: publicKey.user?.id ? bufferSourceToBase64Url(publicKey.user.id) : '',
      userName: publicKey.user ? publicKey.user.name : undefined,
      userDisplayName: publicKey.user ? publicKey.user.displayName : undefined,
      excludeCredentialIds: (publicKey.excludeCredentials || []).map((c) =>
        bufferSourceToBase64Url(c.id),
      ),
    }).then((data) => {
      if (data.status === 'passthrough') return originalCreate(options)
      if (data.status !== 'ok') throw errorFromResponse(data)

      const rawId = base64UrlToArrayBuffer(data.credentialId)
      const attestationObject = base64UrlToArrayBuffer(data.attestationObject)
      const clientDataJSON = stringToArrayBuffer(data.clientDataJSON)

      return {
        id: data.credentialId,
        rawId,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON,
          attestationObject,
          getTransports: () => ['internal'],
          getPublicKeyAlgorithm: () => -7, // ES256 — the only algorithm vault-core creates
          getPublicKey: () => null,
          getAuthenticatorData: () => extractAuthDataFromAttestationObject(attestationObject),
        },
        getClientExtensionResults,
        toJSON() {
          return {
            id: data.credentialId,
            rawId: data.credentialId,
            type: 'public-key',
            authenticatorAttachment: 'platform',
            clientExtensionResults: {},
            response: {
              clientDataJSON: data.clientDataJSON,
              attestationObject: data.attestationObject,
              transports: ['internal'],
            },
          }
        },
      }
    })
  }

  // ---- navigator.credentials.get() override ----

  function getOverride(options) {
    if (!options?.publicKey || options.mediation === 'conditional') {
      return originalGet(options)
    }
    const publicKey = options.publicKey

    return sendRequest('get', {
      challenge: bufferSourceToBase64Url(publicKey.challenge),
      rpId: publicKey.rpId,
      allowCredentialIds: (publicKey.allowCredentials || []).map((c) =>
        bufferSourceToBase64Url(c.id),
      ),
    }).then((data) => {
      if (data.status === 'passthrough') return originalGet(options)
      if (data.status !== 'ok') throw errorFromResponse(data)

      const rawId = base64UrlToArrayBuffer(data.credentialId)
      const clientDataJSON = stringToArrayBuffer(data.clientDataJSON)
      const authenticatorData = base64UrlToArrayBuffer(data.authenticatorData)
      const signature = base64UrlToArrayBuffer(data.signature)
      const userHandle = data.userHandle ? base64UrlToArrayBuffer(data.userHandle) : null

      return {
        id: data.credentialId,
        rawId,
        type: 'public-key',
        authenticatorAttachment: 'platform',
        response: {
          clientDataJSON,
          authenticatorData,
          signature,
          userHandle,
        },
        getClientExtensionResults,
        toJSON() {
          return {
            id: data.credentialId,
            rawId: data.credentialId,
            type: 'public-key',
            authenticatorAttachment: 'platform',
            clientExtensionResults: {},
            response: {
              clientDataJSON: data.clientDataJSON,
              authenticatorData: data.authenticatorData,
              signature: data.signature,
              userHandle: data.userHandle || null,
            },
          }
        },
      }
    })
  }

  createOverride.__kuraPatched = true
  navigator.credentials.create = createOverride
  navigator.credentials.get = getOverride

  // Part 5-7: without this, sites on platforms with no native platform
  // authenticator (e.g. Linux desktop) simply never offer a "Sign in with a
  // passkey" button. Safe to force unconditionally — actual gating (feature
  // toggle, vault lock state, whether a matching credential exists) happens
  // later in background/webauthn.ts / the ritual UI, not here.
  if (window.PublicKeyCredential) {
    window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = () =>
      Promise.resolve(true)
  }
})()
