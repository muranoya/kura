/**
 * Secure-context origins as browsers define them (WebAuthn etc.): https, or
 * loopback hosts. Loopback traffic never crosses the network, so it cannot be
 * tampered with in transit even over plain http (local development).
 */
export function isPotentiallyTrustworthy(url: URL): boolean {
  if (url.protocol === 'https:') return true
  if (url.protocol !== 'http:') return false
  const host = url.hostname
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '[::1]' ||
    /^127(\.\d{1,3}){3}$/.test(host)
  )
}
