import { describe, expect, it } from 'vitest'
import type { FieldClassification, FieldType } from '../content/field-classifier'
import { classifyFormType } from '../content/form-detector'

// Helper to create a minimal FieldClassification
function field(type: FieldType, score = 10): FieldClassification {
  return { type, score, element: document.createElement('input') }
}

describe('classifyFormType', () => {
  // Basic form types
  it('LOGIN: username + password', () => {
    expect(classifyFormType([field('username'), field('password')])).toBe('LOGIN')
  })

  it('LOGIN_USERNAME: username only', () => {
    expect(classifyFormType([field('username')])).toBe('LOGIN_USERNAME')
  })

  it('LOGIN_PASSWORD: password only', () => {
    expect(classifyFormType([field('password')])).toBe('LOGIN_PASSWORD')
  })

  it('REGISTRATION: username + new_password + another field (>= 3 fields)', () => {
    expect(
      classifyFormType([field('username'), field('new_password'), field('new_password')]),
    ).toBe('REGISTRATION')
  })

  it('PASSWORD_CHANGE: password + 2 new_passwords', () => {
    expect(
      classifyFormType([field('password'), field('new_password'), field('new_password')]),
    ).toBe('PASSWORD_CHANGE')
  })

  it('TOTP: single totp field', () => {
    expect(classifyFormType([field('totp')])).toBe('TOTP')
  })

  it('TOTP: totp + one other field (2 fields max)', () => {
    expect(classifyFormType([field('totp'), field('username')])).toBe('TOTP')
  })

  it('CREDIT_CARD: cc_number alone', () => {
    expect(classifyFormType([field('cc_number')])).toBe('CREDIT_CARD')
  })

  it('CREDIT_CARD: full credit card form', () => {
    expect(
      classifyFormType([
        field('cc_number'),
        field('cc_exp'),
        field('cc_cvc'),
        field('cc_name'),
      ]),
    ).toBe('CREDIT_CARD')
  })

  // Edge cases
  it('returns null for empty fields', () => {
    expect(classifyFormType([])).toBeNull()
  })

  it('TOTP does not match with > 2 fields', () => {
    expect(
      classifyFormType([field('totp'), field('totp'), field('totp')]),
    ).toBeNull()
  })

  it('LOGIN_USERNAME: username with no password or new_password', () => {
    expect(classifyFormType([field('username'), field('username')])).toBe('LOGIN_USERNAME')
  })

  it('LOGIN: username + password (even with extra username)', () => {
    expect(
      classifyFormType([field('username'), field('username'), field('password')]),
    ).toBe('LOGIN')
  })

  it('LOGIN_PASSWORD: multiple passwords without username', () => {
    expect(classifyFormType([field('password'), field('password')])).toBe('LOGIN_PASSWORD')
  })

  // Priority tests
  it('CREDIT_CARD takes priority over LOGIN when cc_number present', () => {
    expect(
      classifyFormType([field('username'), field('password'), field('cc_number')]),
    ).toBe('CREDIT_CARD')
  })

  it('TOTP takes priority when totp field present and <= 2 fields', () => {
    expect(classifyFormType([field('totp'), field('password')])).toBe('TOTP')
  })

  it('PASSWORD_CHANGE takes priority over LOGIN when conditions met', () => {
    expect(
      classifyFormType([
        field('username'),
        field('password'),
        field('new_password'),
        field('new_password'),
      ]),
    ).toBe('PASSWORD_CHANGE')
  })

  it('REGISTRATION requires new_password to distinguish from LOGIN', () => {
    // username + password + password (3 fields, but no new_password) -> LOGIN
    expect(
      classifyFormType([field('username'), field('password'), field('password')]),
    ).toBe('LOGIN')
  })

  it('REGISTRATION: username + password + new_password (>= 3 fields, has new_password)', () => {
    expect(
      classifyFormType([field('username'), field('password'), field('new_password')]),
    ).toBe('REGISTRATION')
  })
})
