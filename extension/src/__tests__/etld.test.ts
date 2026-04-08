import { describe, expect, it } from 'vitest'
import { extractETldPlus1, isSameETldPlus1 } from '../shared/etld'

describe('extractETldPlus1', () => {
  it('returns eTLD+1 as-is for simple domains', () => {
    expect(extractETldPlus1('example.com')).toBe('example.com')
  })

  it('strips subdomain', () => {
    expect(extractETldPlus1('login.example.com')).toBe('example.com')
  })

  it('strips deep subdomains', () => {
    expect(extractETldPlus1('a.b.c.example.com')).toBe('example.com')
  })

  it('handles multi-part TLD: co.jp', () => {
    expect(extractETldPlus1('www.example.co.jp')).toBe('example.co.jp')
  })

  it('handles multi-part TLD: co.uk', () => {
    expect(extractETldPlus1('sub.example.co.uk')).toBe('example.co.uk')
  })

  it('handles effective TLD: blogspot.com', () => {
    expect(extractETldPlus1('sub.blogspot.com')).toBe('sub.blogspot.com')
  })

  it('handles effective TLD: herokuapp.com', () => {
    expect(extractETldPlus1('my.herokuapp.com')).toBe('my.herokuapp.com')
  })

  it('handles effective TLD: github.io', () => {
    expect(extractETldPlus1('user.github.io')).toBe('user.github.io')
  })

  it('handles ccSLD: com.au', () => {
    expect(extractETldPlus1('sub.example.com.au')).toBe('example.com.au')
  })

  it('handles ccSLD: com.br', () => {
    expect(extractETldPlus1('www.example.com.br')).toBe('example.com.br')
  })

  it('normalizes to lowercase', () => {
    expect(extractETldPlus1('EXAMPLE.COM')).toBe('example.com')
    expect(extractETldPlus1('Login.Example.Co.JP')).toBe('example.co.jp')
  })

  it('returns single-label hostname as-is', () => {
    expect(extractETldPlus1('localhost')).toBe('localhost')
  })

  it('returns two-part hostname as-is', () => {
    expect(extractETldPlus1('example.com')).toBe('example.com')
  })

  // PSL-specific cases
  it('handles wildcard rule: *.ck (example.ck is a public suffix)', () => {
    // *.ck means example.ck is a public suffix, so sub.example.ck → eTLD+1 = sub.example.ck
    expect(extractETldPlus1('sub.example.ck')).toBe('sub.example.ck')
    // With 4 labels, the eTLD+1 correctly strips the outermost label
    expect(extractETldPlus1('a.sub.example.ck')).toBe('sub.example.ck')
  })

  it('handles exception rule: !www.ck', () => {
    // !www.ck is an exception — www.ck itself is NOT a public suffix
    // So www.ck is an eTLD+1
    expect(extractETldPlus1('www.ck')).toBe('www.ck')
  })

  it('handles s3.amazonaws.com as public suffix', () => {
    // s3.amazonaws.com is explicitly in PSL, so mybucket.s3.amazonaws.com → eTLD+1
    expect(extractETldPlus1('mybucket.s3.amazonaws.com')).toBe('mybucket.s3.amazonaws.com')
  })

  it('handles cloudfront.net', () => {
    expect(extractETldPlus1('d111111abcdef8.cloudfront.net')).toBe('d111111abcdef8.cloudfront.net')
  })

  it('handles appspot.com', () => {
    expect(extractETldPlus1('myapp.appspot.com')).toBe('myapp.appspot.com')
  })

  it('returns public suffix itself when hostname is a TLD', () => {
    expect(extractETldPlus1('com')).toBe('com')
  })

  it('handles org.uk', () => {
    expect(extractETldPlus1('www.example.org.uk')).toBe('example.org.uk')
  })
})

describe('isSameETldPlus1', () => {
  it('returns true for same eTLD+1 with different subdomains', () => {
    expect(isSameETldPlus1('login.example.com', 'www.example.com')).toBe(true)
  })

  it('returns true for same domain', () => {
    expect(isSameETldPlus1('example.com', 'example.com')).toBe(true)
  })

  it('returns false for different domains', () => {
    expect(isSameETldPlus1('example.com', 'evil.com')).toBe(false)
  })

  it('returns false for different eTLD+1 under same TLD', () => {
    expect(isSameETldPlus1('a.co.jp', 'b.co.jp')).toBe(false)
  })

  it('is case-insensitive', () => {
    expect(isSameETldPlus1('Example.COM', 'EXAMPLE.com')).toBe(true)
  })
})
