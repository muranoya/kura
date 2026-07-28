// base64url <-> ArrayBuffer/BufferSource helpers shared by the MAIN-world
// injection script, the ISOLATED-world bridge, and the Service Worker.
// All WebAuthn byte values (challenge, credential IDs, user.id, signatures, …)
// are encoded as base64url strings when crossing postMessage/runtime.sendMessage
// boundaries, matching what vault-core's webauthn module produces/consumes.

export function bufferSourceToBase64Url(buffer: BufferSource): string {
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

export function base64UrlToArrayBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = padded.length % 4 === 0 ? '' : '='.repeat(4 - (padded.length % 4))
  const binary = atob(padded + padding)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

export function stringToArrayBuffer(value: string): ArrayBuffer {
  return new TextEncoder().encode(value).buffer as ArrayBuffer
}
