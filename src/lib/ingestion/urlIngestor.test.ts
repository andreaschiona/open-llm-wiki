import { describe, it, expect } from 'vitest'
import { UrlIngestor } from './urlIngestor'

describe('UrlIngestor.validateUrl', () => {
  it('should accept valid https URLs', async () => {
    await expect(
      UrlIngestor.validateUrl('https://example.com'),
    ).resolves.not.toThrow()
    await expect(
      UrlIngestor.validateUrl('https://docs.example.com/page?q=1'),
    ).resolves.not.toThrow()
    await expect(
      UrlIngestor.validateUrl('http://example.com'),
    ).resolves.not.toThrow()
  })

  it('should reject non-http protocols', async () => {
    await expect(UrlIngestor.validateUrl('file:///etc/passwd')).rejects.toThrow()
    await expect(UrlIngestor.validateUrl('data:text/plain,hello')).rejects.toThrow()
    await expect(UrlIngestor.validateUrl('blob:123')).rejects.toThrow()
    await expect(
      UrlIngestor.validateUrl('ftp://files.example.com'),
    ).rejects.toThrow()
  })

  it('should reject localhost', async () => {
    await expect(
      UrlIngestor.validateUrl('http://localhost:11434'),
    ).rejects.toThrow()
    await expect(
      UrlIngestor.validateUrl('http://127.0.0.1:8080'),
    ).rejects.toThrow()
    await expect(UrlIngestor.validateUrl('http://[::1]:3000')).rejects.toThrow()
  })

  it('should reject private IP ranges', async () => {
    await expect(UrlIngestor.validateUrl('http://10.0.0.1')).rejects.toThrow()
    await expect(UrlIngestor.validateUrl('http://192.168.1.1')).rejects.toThrow()
    await expect(UrlIngestor.validateUrl('http://172.16.0.1')).rejects.toThrow()
    await expect(
      UrlIngestor.validateUrl('http://172.31.255.255'),
    ).rejects.toThrow()
    await expect(UrlIngestor.validateUrl('http://169.254.1.1')).rejects.toThrow()
  })

  it('should reject internal hostnames', async () => {
    await expect(
      UrlIngestor.validateUrl('http://myhost.local'),
    ).rejects.toThrow()
    await expect(
      UrlIngestor.validateUrl('http://internal.host.internal'),
    ).rejects.toThrow()
    await expect(
      UrlIngestor.validateUrl('http://host.docker.internal:8080'),
    ).rejects.toThrow()
  })

  it('should reject invalid URL strings', async () => {
    await expect(UrlIngestor.validateUrl('not-a-url')).rejects.toThrow()
    await expect(UrlIngestor.validateUrl('')).rejects.toThrow()
  })

  it('should reject numeric decimal IP bypass', async () => {
    await expect(UrlIngestor.validateUrl('http://2130706433/')).rejects.toThrow()
  })

  it('should reject hex IP bypass', async () => {
    await expect(UrlIngestor.validateUrl('http://0x7f000001/')).rejects.toThrow()
  })

  it('should reject shorthand IP bypass (127.1)', async () => {
    await expect(UrlIngestor.validateUrl('http://127.1/')).rejects.toThrow()
  })

  it('should reject single zero hostname', async () => {
    await expect(UrlIngestor.validateUrl('http://0/')).rejects.toThrow()
  })

  it('should reject IPv6-mapped IPv4', async () => {
    await expect(
      UrlIngestor.validateUrl('http://[::ffff:127.0.0.1]/'),
    ).rejects.toThrow()
  })

  it('should reject internal .consul domains', async () => {
    await expect(
      UrlIngestor.validateUrl('http://myapp.service.consul/'),
    ).rejects.toThrow()
  })

  it('should reject Kubernetes internal domains', async () => {
    await expect(
      UrlIngestor.validateUrl('http://db.k8s.svc.cluster.local/'),
    ).rejects.toThrow()
  })
})
