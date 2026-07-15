import TurndownService from 'turndown'
import { promises as dns } from 'node:dns'
import { isIPv4, isIPv6 } from 'node:net'
import { logger } from '../utils/logger'

export interface UrlIngestResult {
  title: string
  content: string
  source: string
  fetchedAt: string
}

const INTERNAL_HOSTNAME_SUFFIXES = [
  '.local',
  '.internal',
  '.consul',
  '.k8s.svc.cluster.local',
]

const INTERNAL_HOSTNAME_EXACT = ['host.docker.internal']

function toIPv4(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.')
}

function parseNumericIP(hostname: string): string | null {
  if (isIPv4(hostname)) return hostname
  if (isIPv6(hostname)) return hostname

  if (/^\d+$/.test(hostname)) {
    const n = Number(hostname)
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) return toIPv4(n)
    return null
  }

  if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
    const n = parseInt(hostname, 16)
    if (!isNaN(n) && n >= 0 && n <= 0xffffffff) return toIPv4(n)
    return null
  }

  if (/^0[0-7]+$/.test(hostname) && hostname !== '0') {
    const n = parseInt(hostname, 8)
    if (!isNaN(n) && n >= 0 && n <= 0xffffffff) return toIPv4(n)
    return null
  }

  const twoPart = hostname.match(/^(\d{1,3})\.(\d{1,10})$/)
  if (twoPart) {
    const a = parseInt(twoPart[1], 10)
    const b = parseInt(twoPart[2], 10)
    if (a >= 0 && a <= 255 && b >= 0 && b <= 0xffffff) {
      return [a, (b >>> 16) & 0xff, (b >>> 8) & 0xff, b & 0xff].join('.')
    }
  }

  const threePart = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,5})$/)
  if (threePart) {
    const a = parseInt(threePart[1], 10)
    const b = parseInt(threePart[2], 10)
    const c = parseInt(threePart[3], 10)
    if (a >= 0 && a <= 255 && b >= 0 && b <= 255 && c >= 0 && c <= 0xffff) {
      return [a, b, (c >>> 8) & 0xff, c & 0xff].join('.')
    }
  }

  return null
}

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number)
  if (p[0] === 0 && p[1] === 0 && p[2] === 0 && p[3] === 0) return true
  if (p[0] === 10) return true
  if (p[0] === 127) return true
  if (p[0] === 169 && p[1] === 254) return true
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true
  if (p[0] === 192 && p[1] === 168) return true
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true

  const v4MappedDecimal = normalized.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (v4MappedDecimal) return isPrivateIPv4(v4MappedDecimal[1])

  const v4MappedHex = normalized.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (v4MappedHex) {
    const hi = parseInt(v4MappedHex[1], 16)
    const lo = parseInt(v4MappedHex[2], 16)
    const ip = [(hi >>> 8) & 0xff, hi & 0xff, (lo >>> 8) & 0xff, lo & 0xff].join('.')
    if (isPrivateIPv4(ip)) return true
  }

  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('fe80')) return true
  return false
}

function isPrivateIP(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateIPv4(ip)
  if (isIPv6(ip)) return isPrivateIPv6(ip)
  return false
}

export class UrlIngestor {
  static async validateUrl(url: string): Promise<void> {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error(`URL non valida: ${url}`)
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(
        `Protocollo non permesso: ${parsed.protocol}. Solo http/https sono supportati.`,
      )
    }

    const hostname = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase()

    const resolvedIP = parseNumericIP(hostname)
    if (resolvedIP && isPrivateIP(resolvedIP)) {
      throw new Error('URL non permessa: indirizzo privato o locale')
    }

    if (
      INTERNAL_HOSTNAME_EXACT.includes(hostname) ||
      INTERNAL_HOSTNAME_SUFFIXES.some((s) => hostname.endsWith(s))
    ) {
      throw new Error('URL non permessa: hostname interni bloccati')
    }

    if (!resolvedIP && !isIPv4(hostname) && !isIPv6(hostname)) {
      try {
        const addresses = await dns.resolve4(hostname)
        for (const addr of addresses) {
          if (isPrivateIP(addr)) {
            throw new Error(
              "URL non permessa: l'hostname risolve a un indirizzo privato",
            )
          }
        }
      } catch (err) {
        if (err instanceof Error && err.message.startsWith('URL non permessa')) {
          throw err
        }
      }
    }
  }

  async ingest(url: string): Promise<UrlIngestResult> {
    await UrlIngestor.validateUrl(url)
    logger.info('UrlIngestor', `Fetching URL: ${url}`)
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const html = await response.text()
    const title = this.extractTitle(html)
    const content = this.htmlToMarkdown(html)
    logger.info('UrlIngestor', `Fetched: ${title} (${content.length} chars)`)

    return {
      title,
      content,
      source: url,
      fetchedAt: new Date().toISOString(),
    }
  }

  private extractTitle(html: string): string {
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    return match ? match[1].trim() : 'Untitled'
  }

  private htmlToMarkdown(html: string): string {
    const turndown = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      emDelimiter: '*',
      bulletListMarker: '-',
    })
    turndown.remove(['script', 'style', 'nav', 'header', 'footer', 'aside'])
    return turndown.turndown(html)
  }
}
