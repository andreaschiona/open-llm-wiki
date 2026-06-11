import TurndownService from 'turndown'
import { logger } from '../utils/logger'

export interface UrlIngestResult {
  title: string
  content: string
  source: string
  fetchedAt: string
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

    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1'
    ) {
      throw new Error('URL non permessa: indirizzi localhost bloccati')
    }

    const parts = hostname.split('.').map(Number)
    if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
      if (parts[0] === 10)
        throw new Error('URL non permessa: rete privata 10.x.x.x bloccata')
      if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
        throw new Error('URL non permessa: rete privata 172.16-31.x.x bloccata')
      if (parts[0] === 192 && parts[1] === 168)
        throw new Error('URL non permessa: rete privata 192.168.x.x bloccata')
      if (parts[0] === 169 && parts[1] === 254)
        throw new Error('URL non permessa: link-local 169.254.x.x bloccata')
      if (parts[0] === 127)
        throw new Error('URL non permessa: loopback bloccato')
    }

    if (
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal') ||
      hostname === 'host.docker.internal'
    ) {
      throw new Error('URL non permessa: hostname interni bloccati')
    }
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
