import { describe, expect, it } from 'vitest'
import {
  type FieldSignals,
  type FieldType,
  type SkipCheckInput,
  computeScores,
  shouldSkipField,
} from '../content/field-classifier'

// Helper: create FieldSignals with defaults
function signals(overrides: Partial<FieldSignals> = {}): FieldSignals {
  return {
    autocomplete: '',
    inputType: 'text',
    nameId: '',
    textSignals: '',
    labelText: '',
    urlPath: '/',
    ...overrides,
  }
}

// Helper: get the highest scoring field type
function bestMatch(s: FieldSignals): { type: FieldType; score: number } | null {
  const scores = computeScores(s)
  let best: { type: FieldType; score: number } | null = null
  for (const [type, score] of scores) {
    if (!best || score > best.score) {
      best = { type, score }
    }
  }
  return best
}

describe('shouldSkipField', () => {
  function skipInput(overrides: Partial<SkipCheckInput> = {}): SkipCheckInput {
    return {
      type: 'text',
      name: '',
      ariaLabel: '',
      matchesSearchSelector: false,
      ...overrides,
    }
  }

  it('skips search selector matches', () => {
    expect(shouldSkipField(skipInput({ matchesSearchSelector: true }))).toBe(true)
  })

  it('skips hidden input type', () => {
    expect(shouldSkipField(skipInput({ type: 'hidden' }))).toBe(true)
  })

  it('skips submit input type', () => {
    expect(shouldSkipField(skipInput({ type: 'submit' }))).toBe(true)
  })

  it('skips button input type', () => {
    expect(shouldSkipField(skipInput({ type: 'button' }))).toBe(true)
  })

  it('skips checkbox input type', () => {
    expect(shouldSkipField(skipInput({ type: 'checkbox' }))).toBe(true)
  })

  it('skips radio input type', () => {
    expect(shouldSkipField(skipInput({ type: 'radio' }))).toBe(true)
  })

  it('skips file input type', () => {
    expect(shouldSkipField(skipInput({ type: 'file' }))).toBe(true)
  })

  it('skips name containing "search"', () => {
    expect(shouldSkipField(skipInput({ name: 'search_query' }))).toBe(true)
  })

  it('skips name containing "query"', () => {
    expect(shouldSkipField(skipInput({ name: 'query' }))).toBe(true)
  })

  it('skips aria-label containing "search"', () => {
    expect(shouldSkipField(skipInput({ ariaLabel: 'Search items' }))).toBe(true)
  })

  it('does not skip text input with normal name', () => {
    expect(shouldSkipField(skipInput({ type: 'text', name: 'username' }))).toBe(false)
  })

  it('does not skip password input', () => {
    expect(shouldSkipField(skipInput({ type: 'password' }))).toBe(false)
  })

  it('does not skip email input', () => {
    expect(shouldSkipField(skipInput({ type: 'email' }))).toBe(false)
  })
})

describe('computeScores', () => {
  describe('autocomplete signal (weight: 10)', () => {
    it('username autocomplete', () => {
      const scores = computeScores(signals({ autocomplete: 'username' }))
      expect(scores.get('username')).toBeGreaterThanOrEqual(10)
    })

    it('current-password autocomplete', () => {
      const scores = computeScores(signals({ autocomplete: 'current-password' }))
      expect(scores.get('password')).toBeGreaterThanOrEqual(10)
    })

    it('new-password autocomplete', () => {
      const scores = computeScores(signals({ autocomplete: 'new-password' }))
      expect(scores.get('new_password')).toBeGreaterThanOrEqual(10)
    })

    it('one-time-code autocomplete', () => {
      const scores = computeScores(signals({ autocomplete: 'one-time-code' }))
      expect(scores.get('totp')).toBeGreaterThanOrEqual(10)
    })

    it('cc-number autocomplete', () => {
      const scores = computeScores(signals({ autocomplete: 'cc-number' }))
      expect(scores.get('cc_number')).toBeGreaterThanOrEqual(10)
    })

    it('cc-csc autocomplete', () => {
      const scores = computeScores(signals({ autocomplete: 'cc-csc' }))
      expect(scores.get('cc_cvc')).toBeGreaterThanOrEqual(10)
    })

    it('cc-name autocomplete', () => {
      const scores = computeScores(signals({ autocomplete: 'cc-name' }))
      expect(scores.get('cc_name')).toBeGreaterThanOrEqual(10)
    })

    it('cc-exp autocomplete', () => {
      const scores = computeScores(signals({ autocomplete: 'cc-exp' }))
      expect(scores.get('cc_exp')).toBeGreaterThanOrEqual(10)
    })
  })

  describe('type attribute signal (weight: 8)', () => {
    it('password type gives password higher score than new_password', () => {
      const scores = computeScores(signals({ inputType: 'password' }))
      expect(scores.get('password')).toBe(8)
      expect(scores.get('new_password')).toBe(6) // 8 - 2
    })

    it('email type scores for username', () => {
      const scores = computeScores(signals({ inputType: 'email' }))
      expect(scores.get('username')).toBe(8)
    })

    it('tel type scores for username and totp', () => {
      const scores = computeScores(signals({ inputType: 'tel' }))
      expect(scores.get('username')).toBe(8)
      expect(scores.get('totp')).toBe(8)
    })
  })

  describe('name/id patterns (weight: 6)', () => {
    it('name containing "email" scores for username', () => {
      const scores = computeScores(signals({ nameId: 'email_input' }))
      expect(scores.get('username')).toBeGreaterThanOrEqual(6)
    })

    it('name containing "user" scores for username', () => {
      const scores = computeScores(signals({ nameId: 'user_name' }))
      expect(scores.get('username')).toBeGreaterThanOrEqual(6)
    })

    it('name containing "pass" scores for password', () => {
      const scores = computeScores(signals({ nameId: 'password' }))
      expect(scores.get('password')).toBeGreaterThanOrEqual(6)
    })

    it('name containing "otp" scores for totp', () => {
      const scores = computeScores(signals({ nameId: 'otp_code' }))
      expect(scores.get('totp')).toBeGreaterThanOrEqual(6)
    })

    it('name containing "card_number" scores for cc_number', () => {
      const scores = computeScores(signals({ nameId: 'card_number' }))
      expect(scores.get('cc_number')).toBeGreaterThanOrEqual(6)
    })
  })

  describe('text signals - placeholder/aria-label/title (weight: 4)', () => {
    it('placeholder "Email address" scores for username', () => {
      const scores = computeScores(signals({ textSignals: 'Email address' }))
      expect(scores.get('username')).toBeGreaterThanOrEqual(4)
    })

    it('placeholder "Password" scores for password', () => {
      const scores = computeScores(signals({ inputType: 'password', textSignals: 'Password' }))
      expect(scores.get('password')).toBeGreaterThanOrEqual(4)
    })

    it('placeholder "認証コード" scores for totp', () => {
      const scores = computeScores(signals({ textSignals: '認証コード' }))
      expect(scores.get('totp')).toBeGreaterThanOrEqual(4)
    })
  })

  describe('label text (weight: 4)', () => {
    it('label "Username" scores for username', () => {
      const scores = computeScores(signals({ labelText: 'Username' }))
      expect(scores.get('username')).toBeGreaterThanOrEqual(4)
    })

    it('label "Password" scores for password', () => {
      const scores = computeScores(signals({ labelText: 'Password' }))
      expect(scores.get('password')).toBeGreaterThanOrEqual(4)
    })

    it('label text and text signals stack (both weight 4)', () => {
      const scores = computeScores(
        signals({ textSignals: 'Password', labelText: 'Password' }),
      )
      expect(scores.get('password')).toBe(8) // 4 + 4
    })
  })

  describe('URL context (weight: 2)', () => {
    // Use inputType that doesn't match any typeHints to isolate URL signal
    it('/login path adds score to username and password', () => {
      const scores = computeScores(signals({ inputType: 'date', urlPath: '/login' }))
      expect(scores.get('username')).toBe(2)
      expect(scores.get('password')).toBe(2)
    })

    it('/signin path adds score to username and password', () => {
      const scores = computeScores(signals({ inputType: 'date', urlPath: '/signin' }))
      expect(scores.get('username')).toBe(2)
      expect(scores.get('password')).toBe(2)
    })

    it('/register path adds score to username and new_password', () => {
      const scores = computeScores(signals({ inputType: 'date', urlPath: '/register' }))
      expect(scores.get('username')).toBe(2)
      expect(scores.get('new_password')).toBe(2)
    })

    it('/signup path adds score to username and new_password', () => {
      const scores = computeScores(signals({ inputType: 'date', urlPath: '/signup' }))
      expect(scores.get('username')).toBe(2)
      expect(scores.get('new_password')).toBe(2)
    })

    it('unrelated path adds no score', () => {
      const scores = computeScores(signals({ inputType: 'date', urlPath: '/settings' }))
      expect(scores.size).toBe(0)
    })
  })

  describe('combined signals and disambiguation', () => {
    it('autocomplete + type stacks: username', () => {
      const scores = computeScores(
        signals({ autocomplete: 'username', inputType: 'email' }),
      )
      expect(scores.get('username')).toBe(18) // 10 + 8
    })

    it('password type + new_password name: new_password wins', () => {
      const match = bestMatch(
        signals({ inputType: 'password', nameId: 'new_password' }),
      )
      expect(match?.type).toBe('new_password')
      // new_password: type(6) + name(6) = 12
      // password: type(8) = 8
      expect(match?.score).toBe(12)
    })

    it('password type only: password wins over new_password', () => {
      const match = bestMatch(signals({ inputType: 'password' }))
      expect(match?.type).toBe('password')
      expect(match?.score).toBe(8)
    })

    it('no signals: empty scores', () => {
      const scores = computeScores(signals({ inputType: 'date' }))
      expect(scores.size).toBe(0)
    })

    it('text type with email name: username detected', () => {
      const match = bestMatch(signals({ inputType: 'text', nameId: 'email' }))
      expect(match?.type).toBe('username')
      // type(8) + name(6) = 14
      expect(match?.score).toBe(14)
    })

    it('full login field: autocomplete + type + name + placeholder + label', () => {
      const scores = computeScores(
        signals({
          autocomplete: 'current-password',
          inputType: 'password',
          nameId: 'password',
          textSignals: 'Password',
          labelText: 'Password',
        }),
      )
      // password: autocomplete(10) + type(8) + name(6) + textSignals(4) + label(4) = 32
      expect(scores.get('password')).toBe(32)
    })
  })
})
