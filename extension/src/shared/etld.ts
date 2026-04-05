// Simplified eTLD+1 extraction using a hardcoded list of common multi-part TLDs.
// Full Public Suffix List (PSL) bundling is deferred to a future phase.

const MULTI_PART_TLDS = new Set([
  // Country-code second-level domains
  'co.uk',
  'co.jp',
  'co.kr',
  'co.nz',
  'co.za',
  'co.in',
  'co.id',
  'co.th',
  'co.il',
  'com.au',
  'com.br',
  'com.cn',
  'com.mx',
  'com.tw',
  'com.ar',
  'com.co',
  'com.tr',
  'com.sg',
  'com.hk',
  'com.my',
  'com.ph',
  'com.vn',
  'com.pk',
  'com.ng',
  'com.eg',
  'com.ua',
  'net.au',
  'net.br',
  'org.au',
  'org.uk',
  'org.br',
  'org.cn',
  'ac.uk',
  'ac.jp',
  'ac.kr',
  'ne.jp',
  'or.jp',
  'or.kr',
  'go.jp',
  'go.kr',
  'gov.uk',
  'gov.au',
  'gov.br',
  'gov.cn',
  'edu.au',
  'edu.cn',
  // Generic multi-part
  'blogspot.com',
  'github.io',
  'herokuapp.com',
  'appspot.com',
  'amazonaws.com',
  'cloudfront.net',
])

/**
 * Extract eTLD+1 from a hostname.
 *
 * Examples:
 *   "login.example.com"     → "example.com"
 *   "www.example.co.jp"     → "example.co.jp"
 *   "sub.blogspot.com"      → "sub.blogspot.com"
 *   "example.com"           → "example.com"
 */
export function extractETldPlus1(hostname: string): string {
  const parts = hostname.toLowerCase().split('.')
  if (parts.length <= 2) return hostname.toLowerCase()

  // Check for multi-part TLDs (longest match first)
  for (let i = 1; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join('.')
    if (MULTI_PART_TLDS.has(suffix)) {
      // eTLD+1 = one label before the matched suffix
      if (i >= 1) {
        return `${parts[i - 1]}.${suffix}`
      }
      return hostname.toLowerCase()
    }
  }

  // Default: last two segments
  return parts.slice(-2).join('.')
}

/**
 * Check if two hostnames share the same eTLD+1.
 */
export function isSameETldPlus1(hostname1: string, hostname2: string): boolean {
  return extractETldPlus1(hostname1) === extractETldPlus1(hostname2)
}
