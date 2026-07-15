import { describe, it, expect } from 'vitest'
import { UrlIngestor } from './urlIngestor'

describe('UrlIngestor.validateUrl', () => {
  it('should accept valid https URLs', () => {
    expect(() => UrlIngestor.validateUrl('https://example.com')).not.toThrow()
    expect(() =>
      UrlIngestor.validateUrl('https://docs.example.com/page?q=1'),
    ).not.toThrow()
    expect(() => UrlIngestor.validateUrl('http://example.com')).not.toThrow()
  })

  it('should reject non-http protocols', () => {
    expect(() => UrlIngestor.validateUrl('file:///etc/passwd')).toThrow()
    expect(() => UrlIngestor.validateUrl('data:text/plain,hello')).toThrow()
    expect(() => UrlIngestor.validateUrl('blob:123')).toThrow()
    expect(() => UrlIngestor.validateUrl('ftp://files.example.com')).toThrow()
  })

  it('should reject localhost', () => {
    expect(() => UrlIngestor.validateUrl('http://localhost:11434')).toThrow()
    expect(() => UrlIngestor.validateUrl('http://127.0.0.1:8080')).toThrow()
    expect(() => UrlIngestor.validateUrl('http://[::1]:3000')).toThrow()
  })

  it('should reject private IP ranges', () => {
    expect(() => UrlIngestor.validateUrl('http://10.0.0.1')).toThrow()
    expect(() => UrlIngestor.validateUrl('http://192.168.1.1')).toThrow()
    expect(() => UrlIngestor.validateUrl('http://172.16.0.1')).toThrow()
    expect(() => UrlIngestor.validateUrl('http://172.31.255.255')).toThrow()
    expect(() => UrlIngestor.validateUrl('http://169.254.1.1')).toThrow()
  })

  it('should reject numeric IP representations (SSRF bypasses)', () => {
    // Decimal integer: 2130706433 = 127.0.0.1
    expect(() => UrlIngestor.validateUrl('http://2130706433/')).toThrow()
    // Hex: 0x7f000001 = 127.0.0.1
    expect(() => UrlIngestor.validateUrl('http://0x7f000001/')).toThrow()
    // Octal: 0177.0.0.1 = 127.0.0.1
    expect(() => UrlIngestor.validateUrl('http://0177.0.0.1/')).toThrow()
    // 2-part shorthand: 127.1 = 127.0.0.1
    expect(() => UrlIngestor.validateUrl('http://127.1/')).toThrow()
    // 3-part shorthand: 127.0.1 = 127.0.0.1
    expect(() => UrlIngestor.validateUrl('http://127.0.1/')).toThrow()
    // Bare 0 = 0.0.0.0 (bound to all interfaces, blocked as private)
    expect(() => UrlIngestor.validateUrl('http://0/')).toThrow()
  })

  it('should reject IPv6-mapped IPv4 addresses', () => {
    // IPv4-mapped IPv6 dotted-decimal
    expect(() =>
      UrlIngestor.validateUrl('http://[::ffff:127.0.0.1]:8080'),
    ).toThrow()
    // IPv4-mapped IPv6 hex notation
    expect(() =>
      UrlIngestor.validateUrl('http://[::ffff:7f00:1]:8080'),
    ).toThrow()
    // IPv4-mapped private 10.x.x.x
    expect(() =>
      UrlIngestor.validateUrl('http://[::ffff:10.0.0.5]/'),
    ).toThrow()
    // IPv6 ULA
    expect(() => UrlIngestor.validateUrl('http://[fc00::1]/')).toThrow()
    // IPv6 link-local
    expect(() => UrlIngestor.validateUrl('http://[fe80::1]/')).toThrow()
  })

  it('should reject 0.0.0.0', () => {
    expect(() => UrlIngestor.validateUrl('http://0.0.0.0:8000/')).toThrow()
  })

  it('should reject internal hostnames', () => {
    expect(() => UrlIngestor.validateUrl('http://myhost.local')).toThrow()
    expect(() =>
      UrlIngestor.validateUrl('http://internal.host.internal'),
    ).toThrow()
    expect(() =>
      UrlIngestor.validateUrl('http://host.docker.internal:8080'),
    ).toThrow()
    expect(() => UrlIngestor.validateUrl('http://service.consul/')).toThrow()
  })

  it('should reject invalid URL strings', () => {
    expect(() => UrlIngestor.validateUrl('not-a-url')).toThrow()
    expect(() => UrlIngestor.validateUrl('')).toThrow()
  })
})
