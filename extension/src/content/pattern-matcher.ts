// Pattern DB matching engine — matches site patterns to current page URL

import type { FieldDef, FormCondition, SitePattern } from '../shared/pattern-types'

/**
 * Find the best matching pattern for the given hostname.
 * Evaluation order: domain exact match → domain_suffix match.
 * Returns null if no pattern matches.
 */
export function findMatchingPattern(patterns: SitePattern[], hostname: string): SitePattern | null {
  const lowerHostname = hostname.toLowerCase()

  // First pass: exact domain match (highest priority)
  for (const pattern of patterns) {
    if (pattern.disabled) continue
    if (pattern.match.type === 'domain' && pattern.match.value.toLowerCase() === lowerHostname) {
      return pattern
    }
  }

  // Second pass: domain_suffix match (longer suffix = more specific)
  let bestMatch: SitePattern | null = null
  let bestLength = 0

  for (const pattern of patterns) {
    if (pattern.disabled) continue
    if (pattern.match.type !== 'domain_suffix') continue

    const suffix = pattern.match.value.toLowerCase()
    if (lowerHostname === suffix || lowerHostname.endsWith(`.${suffix}`)) {
      if (suffix.length > bestLength) {
        bestMatch = pattern
        bestLength = suffix.length
      }
    }
  }

  return bestMatch
}

/**
 * Evaluate a form condition against the current page state.
 * All specified conditions are ANDed. Omitted conditions are always true.
 */
export function evaluateCondition(condition: FormCondition | undefined): boolean {
  if (!condition) return true

  if (condition.url_path) {
    try {
      const regex = new RegExp(condition.url_path)
      if (!regex.test(window.location.pathname)) {
        return false
      }
    } catch {
      return false
    }
  }

  if (condition.element_exists) {
    if (!document.querySelector(condition.element_exists)) {
      return false
    }
  }

  if (condition.element_not_exists) {
    if (document.querySelector(condition.element_not_exists)) {
      return false
    }
  }

  return true
}

/**
 * Resolve a field definition to an HTMLInputElement.
 * Tries the primary selector first, then fallback selectors in order.
 */
export function resolveField(fieldDef: FieldDef): HTMLInputElement | null {
  const el = document.querySelector<HTMLInputElement>(fieldDef.selector)
  if (el) return el

  if (fieldDef.fallback_selectors) {
    for (const selector of fieldDef.fallback_selectors) {
      const fallback = document.querySelector<HTMLInputElement>(selector)
      if (fallback) return fallback
    }
  }

  return null
}

/**
 * Wait for an element matching the CSS selector to appear in the DOM.
 * Returns the element if found, null on timeout.
 */
export function waitForElement(selector: string, timeoutMs = 5000): Promise<Element | null> {
  // Check immediately
  const existing = document.querySelector(selector)
  if (existing) return Promise.resolve(existing)

  return new Promise((resolve) => {
    let resolved = false

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector)
      if (el && !resolved) {
        resolved = true
        observer.disconnect()
        resolve(el)
      }
    })

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    })

    setTimeout(() => {
      if (!resolved) {
        resolved = true
        observer.disconnect()
        resolve(null)
      }
    }, timeoutMs)
  })
}
