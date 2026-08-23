import { describe, expect, it } from 'vitest'
import {
  maskSecretFragment,
  normalizeTotpQrPayload,
  rankTotpQrCandidates,
  summarizeTotpQrCandidate,
  TotpQrDecodeError,
} from '../shared/totp-qr'

describe('normalizeTotpQrPayload', () => {
  it('trims whitespace', () => {
    expect(normalizeTotpQrPayload('  ABCDEFGH  ')).toBe('ABCDEFGH')
  })

  it('keeps otpauth URI intact', () => {
    const uri = 'otpauth://totp/Test:user@example.com?secret=JBSWY3DPEHPK3PXP&digits=6&period=30'
    expect(normalizeTotpQrPayload(uri)).toBe(uri)
  })

  it('rejects empty payload', () => {
    expect(() => normalizeTotpQrPayload('   ')).toThrow(TotpQrDecodeError)
    try {
      normalizeTotpQrPayload('')
    } catch (e) {
      expect(e).toBeInstanceOf(TotpQrDecodeError)
      expect((e as TotpQrDecodeError).code).toBe('empty')
    }
  })
})

describe('rankTotpQrCandidates', () => {
  it('prefers otpauth URIs over other payloads', () => {
    expect(
      rankTotpQrCandidates([
        'https://example.com',
        'otpauth://totp/A?secret=AAAA',
        'PLAINSECRET',
        'otpauth://totp/B?secret=BBBB',
      ]),
    ).toEqual([
      'otpauth://totp/A?secret=AAAA',
      'otpauth://totp/B?secret=BBBB',
      'https://example.com',
      'PLAINSECRET',
    ])
  })

  it('deduplicates and drops empty', () => {
    expect(rankTotpQrCandidates(['  x  ', 'x', '', '  '])).toEqual(['x'])
  })
})

describe('maskSecretFragment', () => {
  it('masks long secrets', () => {
    expect(maskSecretFragment('JBSWY3DPEHPK3PXP')).toBe('JBSW…3PXP')
  })

  it('fully masks short secrets', () => {
    expect(maskSecretFragment('ABCD')).toMatch(/^•+$/)
  })
})

describe('summarizeTotpQrCandidate', () => {
  it('parses otpauth issuer and account with masked secret', () => {
    const uri =
      'otpauth://totp/GitHub:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=GitHub&digits=6&period=30'
    const s = summarizeTotpQrCandidate(uri)
    expect(s.kind).toBe('otpauth')
    expect(s.issuer).toBe('GitHub')
    expect(s.account).toBe('user@example.com')
    expect(s.digits).toBe('6')
    expect(s.period).toBe('30')
    expect(s.secretMasked).toBe('JBSW…3PXP')
    expect(s.secretMasked).not.toContain('JBSWY3DPEHPK3PXP')
  })

  it('summarizes plain base32 as secret kind', () => {
    const s = summarizeTotpQrCandidate('JBSWY3DPEHPK3PXP')
    expect(s.kind).toBe('secret')
    expect(s.secretMasked).toBe('JBSW…3PXP')
  })
})
