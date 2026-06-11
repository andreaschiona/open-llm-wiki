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

  it('should reject internal hostnames', () => {
    expect(() => UrlIngestor.validateUrl('http://myhost.local')).toThrow()
    expect(() =>
      UrlIngestor.validateUrl('http://internal.host.internal'),
    ).toThrow()
    expect(() =>
      UrlIngestor.validateUrl('http://host.docker.internal:8080'),
    ).toThrow()
  })

  it('should reject invalid URL strings', () => {
    expect(() => UrlIngestor.validateUrl('not-a-url')).toThrow()
    expect(() => UrlIngestor.validateUrl('')).toThrow()
  })
})
