import { describe, expect, it } from 'vitest'
import { validate, validateCrossFile } from '../../scripts/generate-patterns'

// ========== validateCrossFile ==========

describe('validateCrossFile', () => {
  it('returns no errors when all (type, value) pairs are unique', () => {
    const errors = validateCrossFile([
      {
        file: 'a.json',
        data: { description: 'a', match: { type: 'domain', value: 'a.example.com' } },
      },
      {
        file: 'b.json',
        data: { description: 'b', match: { type: 'domain', value: 'b.example.com' } },
      },
      {
        file: 'c.json',
        data: { description: 'c', match: { type: 'domain_suffix', value: 'example.com' } },
      },
    ])
    expect(errors).toEqual([])
  })

  it('detects duplicate (type, value) across files', () => {
    const errors = validateCrossFile([
      {
        file: 'google.json',
        data: {
          description: 'g',
          match: { type: 'domain', value: 'accounts.google.com' },
        },
      },
      {
        file: 'google-accounts.json',
        data: {
          description: 'ga',
          match: { type: 'domain', value: 'accounts.google.com' },
        },
      },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('Duplicate match rule')
    expect(errors[0].message).toContain('domain')
    expect(errors[0].message).toContain('accounts.google.com')
    expect(errors[0].message).toContain('google.json')
    expect(errors[0].message).toContain('google-accounts.json')
  })

  it('treats case differences in value as duplicates', () => {
    const errors = validateCrossFile([
      {
        file: 'a.json',
        data: { description: 'a', match: { type: 'domain', value: 'Example.com' } },
      },
      {
        file: 'b.json',
        data: { description: 'b', match: { type: 'domain', value: 'example.com' } },
      },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('Duplicate match rule')
  })

  it('does NOT treat same value with different types as duplicate', () => {
    const errors = validateCrossFile([
      {
        file: 'exact.json',
        data: { description: 'e', match: { type: 'domain', value: 'example.com' } },
      },
      {
        file: 'suffix.json',
        data: { description: 's', match: { type: 'domain_suffix', value: 'example.com' } },
      },
    ])
    expect(errors).toEqual([])
  })

  it('does NOT treat nested suffix rules as duplicates', () => {
    // amazon.com と login.amazon.com は正当な組み合わせ（より具体的な方が優先される）
    const errors = validateCrossFile([
      {
        file: 'amazon.json',
        data: { description: 'a', match: { type: 'domain_suffix', value: 'amazon.com' } },
      },
      {
        file: 'amazon-login.json',
        data: {
          description: 'al',
          match: { type: 'domain_suffix', value: 'login.amazon.com' },
        },
      },
    ])
    expect(errors).toEqual([])
  })

  it('reports all files involved in a duplicate (3+)', () => {
    const errors = validateCrossFile([
      { file: 'a.json', data: { match: { type: 'domain', value: 'x.com' } } },
      { file: 'b.json', data: { match: { type: 'domain', value: 'x.com' } } },
      { file: 'c.json', data: { match: { type: 'domain', value: 'x.com' } } },
    ])
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('a.json')
    expect(errors[0].message).toContain('b.json')
    expect(errors[0].message).toContain('c.json')
  })

  it('skips entries without a valid match object', () => {
    const errors = validateCrossFile([
      { file: 'bad.json', data: null },
      { file: 'also-bad.json', data: { description: 'no match' } },
      { file: 'good.json', data: { match: { type: 'domain', value: 'ok.com' } } },
    ])
    expect(errors).toEqual([])
  })
})

// ========== validate (forms[].id duplicate) ==========

describe('validate - forms[].id duplication', () => {
  it('reports duplicate form id within same pattern', () => {
    const errors = validate(
      {
        description: 'dup form ids',
        match: { type: 'domain', value: 'example.com' },
        forms: [
          {
            id: 'login',
            type: 'login',
            fields: { username: { selector: '#u' } },
          },
          {
            id: 'login',
            type: 'login_password',
            fields: { password: { selector: '#p' } },
          },
        ],
      },
      'dup.json',
    )
    const dupErr = errors.find((e) => e.message.includes('duplicated'))
    expect(dupErr).toBeDefined()
    expect(dupErr?.message).toContain('"login"')
  })

  it('accepts unique form ids', () => {
    const errors = validate(
      {
        description: 'unique form ids',
        match: { type: 'domain', value: 'example.com' },
        forms: [
          {
            id: 'step1',
            type: 'login_username',
            fields: { username: { selector: '#u' } },
          },
          {
            id: 'step2',
            type: 'login_password',
            fields: { password: { selector: '#p' } },
          },
        ],
      },
      'ok.json',
    )
    expect(errors.filter((e) => e.message.includes('duplicated'))).toEqual([])
  })
})
