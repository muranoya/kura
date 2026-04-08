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
      classifyFormType([field('cc_number'), field('cc_exp'), field('cc_cvc'), field('cc_name')]),
    ).toBe('CREDIT_CARD')
  })

  // new_password does not trigger any form type on its own
  it('returns null for new_password only', () => {
    expect(classifyFormType([field('new_password')])).toBeNull()
  })

  it('LOGIN_USERNAME: username + new_password (new_password ignored)', () => {
    expect(classifyFormType([field('username'), field('new_password')])).toBe('LOGIN_USERNAME')
  })

  // Credit card individual fields
  it('CREDIT_CARD: cc_name alone', () => {
    expect(classifyFormType([field('cc_name')])).toBe('CREDIT_CARD')
  })

  it('CREDIT_CARD: cc_exp alone', () => {
    expect(classifyFormType([field('cc_exp')])).toBe('CREDIT_CARD')
  })

  it('CREDIT_CARD: cc_cvc alone', () => {
    expect(classifyFormType([field('cc_cvc')])).toBe('CREDIT_CARD')
  })

  it('CREDIT_CARD: cc_exp + cc_cvc without cc_number', () => {
    expect(classifyFormType([field('cc_exp'), field('cc_cvc')])).toBe('CREDIT_CARD')
  })

  // Edge cases
  it('returns null for empty fields', () => {
    expect(classifyFormType([])).toBeNull()
  })

  it('TOTP does not match with > 2 fields', () => {
    expect(classifyFormType([field('totp'), field('totp'), field('totp')])).toBeNull()
  })

  it('LOGIN_USERNAME: multiple usernames with no password', () => {
    expect(classifyFormType([field('username'), field('username')])).toBe('LOGIN_USERNAME')
  })

  it('LOGIN: username + password (even with extra username)', () => {
    expect(classifyFormType([field('username'), field('username'), field('password')])).toBe(
      'LOGIN',
    )
  })

  it('LOGIN_PASSWORD: multiple passwords without username', () => {
    expect(classifyFormType([field('password'), field('password')])).toBe('LOGIN_PASSWORD')
  })

  it('LOGIN: username + multiple passwords', () => {
    expect(classifyFormType([field('username'), field('password'), field('password')])).toBe(
      'LOGIN',
    )
  })

  it('LOGIN: username + password + extra fields', () => {
    expect(
      classifyFormType([
        field('username'),
        field('password'),
        field('password'),
        field('password'),
      ]),
    ).toBe('LOGIN')
  })

  // Priority tests
  it('CREDIT_CARD takes priority over LOGIN when cc_number present', () => {
    expect(classifyFormType([field('username'), field('password'), field('cc_number')])).toBe(
      'CREDIT_CARD',
    )
  })

  it('TOTP takes priority when totp field present and <= 2 fields', () => {
    expect(classifyFormType([field('totp'), field('password')])).toBe('TOTP')
  })
})
