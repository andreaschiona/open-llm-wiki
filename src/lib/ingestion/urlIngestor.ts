import { logger } from '../utils/logger'

export interface UrlIngestResult {
  title: string
  content: string
  source: string
  fetchedAt: string
}

export class UrlIngestor {
  async ingest(url: string): Promise<UrlIngestResult> {
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
    let text = html
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    text = text.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    text = text.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    text = text.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    text = text.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '')

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

    text = text.replace(/&amp;/g, '&')
    text = text.replace(/&lt;/g, '<')
    text = text.replace(/&gt;/g, '>')
    text = text.replace(/&quot;/g, '"')
    text = text.replace(/&#39;/g, "'")

    text = text.replace(/\n{3,}/g, '\n\n')
    text = text.replace(/^\s+|\s+$/g, '')
    text = text.replace(/\n\s+\n/g, '\n\n')

    return text
  }
}
