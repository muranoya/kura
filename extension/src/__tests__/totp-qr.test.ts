import { describe, expect, it } from 'vitest'
import { normalizeTotpQrPayload, rankTotpQrCandidates, TotpQrDecodeError } from '../shared/totp-qr'

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
