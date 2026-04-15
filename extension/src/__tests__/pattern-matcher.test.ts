import { describe, expect, it } from 'vitest'
import { evaluateCondition, findMatchingPattern, resolveField } from '../content/pattern-matcher'
import type { SitePattern } from '../shared/pattern-types'

// ========== findMatchingPattern ==========

describe('findMatchingPattern', () => {
  const patterns: SitePattern[] = [
    {
      description: 'Exact domain match',
      match: { type: 'domain', value: 'accounts.google.com' },
      forms: [],
    },
    {
      description: 'Domain suffix match',
      match: { type: 'domain_suffix', value: 'amazon.com' },
      forms: [],
    },
    {
      description: 'More specific suffix',
      match: { type: 'domain_suffix', value: 'login.amazon.com' },
      forms: [],
    },
    {
      description: 'Disabled pattern',
      match: { type: 'domain', value: 'disabled.example.com' },
      disabled: true,
      forms: [],
    },
    {
      description: 'Strict subdomain pattern',
      match: { type: 'domain_suffix', value: 'example.com', strict_subdomain: true },
    },
  ]

  it('matches exact domain', () => {
    const result = findMatchingPattern(patterns, 'accounts.google.com')
    expect(result?.description).toBe('Exact domain match')
  })

  it('does not match subdomain for domain type', () => {
    const result = findMatchingPattern(patterns, 'sub.accounts.google.com')
    expect(result).toBeNull()
  })

  it('matches domain_suffix for exact domain', () => {
    const result = findMatchingPattern(patterns, 'amazon.com')
    expect(result?.description).toBe('Domain suffix match')
  })

  it('matches domain_suffix for subdomain', () => {
    const result = findMatchingPattern(patterns, 'www.amazon.com')
    expect(result?.description).toBe('Domain suffix match')
  })

  it('prefers more specific domain_suffix', () => {
    const result = findMatchingPattern(patterns, 'login.amazon.com')
    expect(result?.description).toBe('More specific suffix')
  })

  it('prefers more specific suffix for sub.login.amazon.com', () => {
    const result = findMatchingPattern(patterns, 'sub.login.amazon.com')
    expect(result?.description).toBe('More specific suffix')
  })

  it('domain match takes priority over domain_suffix', () => {
    const patternsWithBoth: SitePattern[] = [
      {
        description: 'Suffix',
        match: { type: 'domain_suffix', value: 'google.com' },
      },
      {
        description: 'Exact',
        match: { type: 'domain', value: 'accounts.google.com' },
      },
    ]
    const result = findMatchingPattern(patternsWithBoth, 'accounts.google.com')
    expect(result?.description).toBe('Exact')
  })

  it('skips disabled patterns', () => {
    const result = findMatchingPattern(patterns, 'disabled.example.com')
    // Should match the example.com suffix, not the disabled exact match
    expect(result?.description).toBe('Strict subdomain pattern')
  })

  it('returns null when no match', () => {
    const result = findMatchingPattern(patterns, 'unknown.org')
    expect(result).toBeNull()
  })

  it('is case insensitive', () => {
    const result = findMatchingPattern(patterns, 'ACCOUNTS.GOOGLE.COM')
    expect(result?.description).toBe('Exact domain match')
  })

  it('returns empty patterns array → null', () => {
    expect(findMatchingPattern([], 'example.com')).toBeNull()
  })

  // このケースは本来ビルド時の重複検出でエラーになるべき組み合わせだが、
  // ランタイムに重複パターンが到達した場合の First-Match-Wins 挙動を固定する。
  it('returns the first pattern when duplicate (type, value) is present', () => {
    const dupPatterns: SitePattern[] = [
      { description: 'first', match: { type: 'domain', value: 'example.com' } },
      { description: 'second', match: { type: 'domain', value: 'example.com' } },
    ]
    expect(findMatchingPattern(dupPatterns, 'example.com')?.description).toBe('first')
  })

  it('returns the first pattern when duplicate domain_suffix with same value is present', () => {
    const dupPatterns: SitePattern[] = [
      { description: 'first-suffix', match: { type: 'domain_suffix', value: 'example.com' } },
      { description: 'second-suffix', match: { type: 'domain_suffix', value: 'example.com' } },
    ]
    expect(findMatchingPattern(dupPatterns, 'sub.example.com')?.description).toBe('first-suffix')
  })

  it('prefers domain over domain_suffix even when both have the same value', () => {
    const mixedPatterns: SitePattern[] = [
      { description: 'suffix-version', match: { type: 'domain_suffix', value: 'example.com' } },
      { description: 'domain-version', match: { type: 'domain', value: 'example.com' } },
    ]
    expect(findMatchingPattern(mixedPatterns, 'example.com')?.description).toBe('domain-version')
  })
})

// ========== evaluateCondition ==========

describe('evaluateCondition', () => {
  it('returns true when condition is undefined', () => {
    expect(evaluateCondition(undefined)).toBe(true)
  })

  it('returns true when condition is empty object', () => {
    expect(evaluateCondition({})).toBe(true)
  })

  it('evaluates url_path regex', () => {
    // Set up window.location for test
    Object.defineProperty(window, 'location', {
      value: {
        pathname: '/ap/signin',
        hostname: 'amazon.com',
        href: 'https://amazon.com/ap/signin',
      },
      writable: true,
    })

    expect(evaluateCondition({ url_path: '^/ap/signin' })).toBe(true)
    expect(evaluateCondition({ url_path: '^/login' })).toBe(false)
  })

  it('evaluates element_exists', () => {
    const el = document.createElement('input')
    el.id = 'test-exists'
    document.body.appendChild(el)

    expect(evaluateCondition({ element_exists: '#test-exists' })).toBe(true)
    expect(evaluateCondition({ element_exists: '#nonexistent' })).toBe(false)

    el.remove()
  })

  it('evaluates element_not_exists', () => {
    expect(evaluateCondition({ element_not_exists: '#definitely-not-here' })).toBe(true)

    const el = document.createElement('input')
    el.id = 'test-not-exists'
    document.body.appendChild(el)

    expect(evaluateCondition({ element_not_exists: '#test-not-exists' })).toBe(false)

    el.remove()
  })

  it('ANDs all conditions', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/login', hostname: 'example.com', href: 'https://example.com/login' },
      writable: true,
    })

    const el = document.createElement('input')
    el.id = 'and-test'
    document.body.appendChild(el)

    // All true
    expect(
      evaluateCondition({
        url_path: '^/login',
        element_exists: '#and-test',
        element_not_exists: '#nonexistent',
      }),
    ).toBe(true)

    // One false → all false
    expect(
      evaluateCondition({
        url_path: '^/login',
        element_exists: '#nonexistent',
        element_not_exists: '#nonexistent',
      }),
    ).toBe(false)

    el.remove()
  })

  it('returns false for invalid regex in url_path', () => {
    Object.defineProperty(window, 'location', {
      value: { pathname: '/test', hostname: 'example.com', href: 'https://example.com/test' },
      writable: true,
    })

    expect(evaluateCondition({ url_path: '[invalid' })).toBe(false)
  })
})

// ========== resolveField ==========

describe('resolveField', () => {
  it('resolves primary selector', () => {
    const el = document.createElement('input')
    el.id = 'primary-field'
    document.body.appendChild(el)

    const result = resolveField({ selector: '#primary-field' })
    expect(result).toBe(el)

    el.remove()
  })

  it('falls back to fallback_selectors when primary fails', () => {
    const el = document.createElement('input')
    el.id = 'fallback-field'
    document.body.appendChild(el)

    const result = resolveField({
      selector: '#nonexistent',
      fallback_selectors: ['#also-nonexistent', '#fallback-field'],
    })
    expect(result).toBe(el)

    el.remove()
  })

  it('returns null when no selector matches', () => {
    const result = resolveField({
      selector: '#nonexistent',
      fallback_selectors: ['#also-nonexistent'],
    })
    expect(result).toBeNull()
  })

  it('returns null when no fallback_selectors provided and primary fails', () => {
    const result = resolveField({ selector: '#nonexistent' })
    expect(result).toBeNull()
  })
})
