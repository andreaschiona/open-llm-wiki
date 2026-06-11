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

    const hostname = parsed.hostname.toLowerCase()

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

  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&amp;': '&',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&nbsp;': ' ',
      '&#x27;': "'",
      '&#x2F;': '/',
    }
    const pattern = /&(?:amp|lt|gt|quot|#39|nbsp|#x27|#x2F);/g
    return text.replace(pattern, (m) => entities[m] || m)
  }

  private stripTagBlocks(text: string, tag: string): string {
    const open = new RegExp(`<${tag}[^>]*>`, 'gi')
    const close = new RegExp(`<\\/${tag}[^>]*>`, 'gi')
    let result = text
    // Remove complete blocks: <tag...>...</tag...>
    result = result.replace(
      new RegExp(`<${tag}[^>]*>[\\s\\S]*?<\\/${tag}[^>]*>`, 'gi'),
      '',
    )
    // Remove any remaining <tag and </tag fragments
    result = result.replace(open, '')
    result = result.replace(close, '')
    return result
  }

  private htmlToMarkdown(html: string): string {
    let text = html
    text = this.stripTagBlocks(text, 'script')
    text = this.stripTagBlocks(text, 'style')
    text = this.stripTagBlocks(text, 'nav')
    text = this.stripTagBlocks(text, 'header')
    text = this.stripTagBlocks(text, 'footer')
    text = this.stripTagBlocks(text, 'aside')

    text = text.replace(/<h1[^>]*>/gi, '\n# ')
    text = text.replace(/<h2[^>]*>/gi, '\n## ')
    text = text.replace(/<h3[^>]*>/gi, '\n### ')
    text = text.replace(/<h4[^>]*>/gi, '\n#### ')
    text = text.replace(/<h5[^>]*>/gi, '\n##### ')
    text = text.replace(/<h6[^>]*>/gi, '\n###### ')
    text = text.replace(/<\/h[1-6][^>]*>/gi, '\n')

    text = text.replace(/<p[^>]*>/gi, '\n')
    text = text.replace(/<\/p[^>]*>/gi, '\n')

    text = text.replace(/<strong[^>]*>/gi, '**')
    text = text.replace(/<\/strong[^>]*>/gi, '**')
    text = text.replace(/<b[^>]*>/gi, '**')
    text = text.replace(/<\/b[^>]*>/gi, '**')
    text = text.replace(/<em[^>]*>/gi, '*')
    text = text.replace(/<\/em[^>]*>/gi, '*')
    text = text.replace(/<i[^>]*>/gi, '*')
    text = text.replace(/<\/i[^>]*>/gi, '*')

    text = text.replace(/<ul[^>]*>/gi, '\n')
    text = text.replace(/<\/ul[^>]*>/gi, '\n')
    text = text.replace(/<li[^>]*>/gi, '\n- ')
    text = text.replace(/<\/li[^>]*>/gi, '')
    text = text.replace(/<ol[^>]*>/gi, '\n')
    text = text.replace(/<\/ol[^>]*>/gi, '\n')

    text = text.replace(/<code[^>]*>/gi, '`')
    text = text.replace(/<\/code[^>]*>/gi, '`')
    text = text.replace(/<pre[^>]*>/gi, '\n```\n')
    text = text.replace(/<\/pre[^>]*>/gi, '\n```\n')

    text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>/gi, '[$1](')
    text = text.replace(/<\/a[^>]*>/gi, ')')
    text = text.replace(/<br\s*\/?>/gi, '\n')
    text = text.replace(/<[^>]+>/g, '')

    text = this.decodeHtmlEntities(text)
    text = text.replace(/\n{3,}/g, '\n\n')
    text = text.replace(/^\s+|\s+$/g, '')
    text = text.replace(/\n\s+\n/g, '\n\n')

    return text
  }
}
