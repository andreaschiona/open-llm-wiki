import TurndownService from 'turndown'
import { logger } from '../utils/logger'

export interface UrlIngestResult {
  title: string
  content: string
  source: string
  fetchedAt: string
}

// Simple IPv4 check — no `node:net` dependency needed
function isIPv4(s: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)
}

// Simple IPv6 check — relaxed, just enough to filter private ranges
function isIPv6(s: string): boolean {
  return s.includes(':') && /^[0-9a-f:.]+$/i.test(s)
}

function toIPv4(n: number): string {
  return [
    (n >>> 24) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 8) & 0xff,
    n & 0xff,
  ].join('.')
}

/**
 * Parse numeric/compressed IP representations that `new URL()` normalises
 * to their canonical dotted‑decimal form.
 *
 * Handles: decimal integer (2130706433), hex (0x7f000001),
 * octal (0177..), 2‑part (127.1), 3‑part (127.0.1), bare IPv4/v6.
 */
function parseNumericIP(hostname: string): string | null {
  if (isIPv4(hostname)) return hostname
  if (isIPv6(hostname)) return hostname

  // Decimal integer → 127.0.0.1
  if (/^\d+$/.test(hostname)) {
    const n = Number(hostname)
    if (Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff) return toIPv4(n)
    return null
  }

  // Hex
  if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
    const n = parseInt(hostname, 16)
    if (!isNaN(n) && n >= 0 && n <= 0xffffffff) return toIPv4(n)
    return null
  }

  // Octal
  if (/^0[0-7]+$/.test(hostname) && hostname !== '0') {
    const n = parseInt(hostname, 8)
    if (!isNaN(n) && n >= 0 && n <= 0xffffffff) return toIPv4(n)
    return null
  }

  // 2‑part shorthand: 127.1 → 127.0.0.1
  const twoPart = hostname.match(/^(\d{1,3})\.(\d{1,10})$/)
  if (twoPart) {
    const a = parseInt(twoPart[1], 10)
    const b = parseInt(twoPart[2], 10)
    if (a >= 0 && a <= 255 && b >= 0 && b <= 0xffffff) {
      return [a, (b >>> 16) & 0xff, (b >>> 8) & 0xff, b & 0xff].join('.')
    }
  }

  // 3‑part shorthand: 127.0.1 → 127.0.0.1
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
  if (p[0] === 0 && p[1] === 0 && p[2] === 0 && p[3] === 0) return true   // "this host"
  if (p[0] === 10) return true                                              // 10.0.0.0/8
  if (p[0] === 127) return true                                             // 127.0.0.0/8 loopback
  if (p[0] === 169 && p[1] === 254) return true                            // 169.254.0.0/16 link-local
  if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true                // 172.16.0.0/12
  if (p[0] === 192 && p[1] === 168) return true                            // 192.168.0.0/16
  return false
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase()
  // Loopback
  if (normalized === '::1' || normalized === '0:0:0:0:0:0:0:1') return true

  // IPv4‑mapped IPv6 — dotted‑decimal: ::ffff:127.0.0.1
  const v4MappedDec = normalized.match(/^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/)
  if (v4MappedDec) return isPrivateIPv4(v4MappedDec[1])

  // IPv4‑mapped IPv6 — hex notation: ::ffff:7f00:1
  const v4MappedHex = normalized.match(/^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (v4MappedHex) {
    const hi = parseInt(v4MappedHex[1], 16)
    const lo = parseInt(v4MappedHex[2], 16)
    const ip = [(hi >>> 8) & 0xff, hi & 0xff, (lo >>> 8) & 0xff, lo & 0xff].join('.')
    if (isPrivateIPv4(ip)) return true
  }

  // ULA (fc00::/7) and link‑local (fe80::/10)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  if (normalized.startsWith('fe80')) return true
  return false
}

function isPrivateIP(ip: string): boolean {
  if (isIPv4(ip)) return isPrivateIPv4(ip)
  if (isIPv6(ip)) return isPrivateIPv6(ip)
  // Can't determine best‑effort — reject to be safe
  return true
}

export class UrlIngestor {
  static validateUrl(url: string): void {
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

    // 1. Try to interpret the hostname as an IP in any numeric encoding
    const resolvedIP = parseNumericIP(hostname)
    if (resolvedIP && isPrivateIP(resolvedIP)) {
      throw new Error('URL non permessa: indirizzo privato o locale')
    }

    // 2. Check known internal hostnames / TLDs
    const internalSuffixes = [
      '.local',
      '.internal',
      '.consul',
      '.k8s.svc.cluster.local',
    ]
    const internalExact = ['host.docker.internal']

    if (
      internalExact.includes(hostname) ||
      internalSuffixes.some((s) => hostname.endsWith(s))
    ) {
      throw new Error('URL non permessa: hostname interni bloccati')
    }

    // 3. Check the original hostname for private ranges (catches bare 10.x.x.x etc.)
    if (isIPv4(hostname) && isPrivateIPv4(hostname)) {
      throw new Error('URL non permessa: indirizzo privato')
    }
    if (isIPv6(hostname) && isPrivateIPv6(hostname)) {
      throw new Error('URL non permessa: indirizzo privato')
    }

    // Backward‑compat: legacy raw‑IP block for hostnames the numeric parser
    // may not have caught (e.g. bare 10.x.x.x that passed through).
    // Note: DNS‑rebinding validation is not feasible client‑side in a
    // browser / Tauri webview. See issue #99 for discussion.
  }

  async ingest(url: string): Promise<UrlIngestResult> {
    UrlIngestor.validateUrl(url)
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
