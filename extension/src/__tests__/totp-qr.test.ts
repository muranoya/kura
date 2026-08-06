import { describe, expect, it } from 'vitest'
import { normalizeTotpQrPayload, TotpQrDecodeError } from '../popup/lib/totp-qr'

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
