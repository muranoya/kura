// eTLD+1 extraction using the Public Suffix List (PSL).
// Data is generated at build time from assets/public_suffix_list.dat.
// See: extension/scripts/generate-etld.ts

import { PSL_EXCEPTIONS, PSL_RULES, PSL_WILDCARDS } from './etld-data.generated'

/**
 * Find the length (in labels) of the effective TLD for a given set of labels.
 *
 * PSL lookup algorithm:
 * 1. Exception rules have highest priority — if matched, eTLD = exception minus 1 label
 * 2. Wildcard rules — *.X matches any label.X
 * 3. Normal rules — exact match, longest wins
 * 4. Default — the last label is the TLD (length = 1)
 */
function findETldLength(labels: string[]): number {
  // Check from most specific to least specific
  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.')

    // 1. Exception rule: !X.Y.Z — if matched, the eTLD is (labels.length - i - 1) labels
    if (PSL_EXCEPTIONS.has(candidate)) {
      // Exception means "this specific name is NOT under the wildcard"
      // eTLD length = number of labels in exception minus 1
      return labels.length - i - 1
    }
  }

  for (let i = 0; i < labels.length; i++) {
    const candidate = labels.slice(i).join('.')

    // 2. Normal rule match
    if (PSL_RULES.has(candidate)) {
      return labels.length - i
    }

    // 3. Wildcard rule: check if parent domain has a wildcard
    if (i + 1 < labels.length) {
      const parent = labels.slice(i + 1).join('.')
      if (PSL_WILDCARDS.has(parent)) {
        return labels.length - i
      }
    }
  }

  // 4. Default: last label is TLD
  return 1
}

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
  const labels = hostname.toLowerCase().split('.')
  if (labels.length <= 1) return hostname.toLowerCase()

  const etldLength = findETldLength(labels)

  // eTLD+1 = eTLD + one more label
  const etldPlus1Length = etldLength + 1

  if (etldPlus1Length > labels.length) {
    // The hostname itself is a public suffix (e.g. "com", "co.uk")
    return hostname.toLowerCase()
  }

  return labels.slice(labels.length - etldPlus1Length).join('.')
}

/**
 * Check if two hostnames share the same eTLD+1.
 */
export function isSameETldPlus1(hostname1: string, hostname2: string): boolean {
  return extractETldPlus1(hostname1) === extractETldPlus1(hostname2)
}
