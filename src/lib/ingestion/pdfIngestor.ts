import { logger } from '../utils/logger'

export interface PdfIngestResult {
  title: string
  content: string
  source: string
  pageCount: number
  fetchedAt: string
}

export class PdfIngestor {
  async ingest(filePath: string): Promise<PdfIngestResult> {
    logger.info('PdfIngestor', `Processing PDF: ${filePath}`)
    const response = await fetch(filePath)
    const buffer = await response.arrayBuffer()
    const text = await this.extractText(buffer)
    const title = filePath.split('/').pop()?.replace('.pdf', '') || 'Untitled'
    return {
      title,
      content: text,
      source: filePath,
      pageCount: 1,
      fetchedAt: new Date().toISOString(),
    }
  }

  async ingestFromBuffer(buffer: ArrayBuffer, fileName: string): Promise<PdfIngestResult> {
    const text = await this.extractText(buffer)
    const title = fileName.replace('.pdf', '')
    logger.info('PdfIngestor', `Processed PDF: ${fileName} (${text.length} chars)`)
    return {
      title,
      content: text,
      source: fileName,
      pageCount: 1,
      fetchedAt: new Date().toISOString(),
    }
  }

  private async extractText(_buffer: ArrayBuffer): Promise<string> {
    try {
      const pdfJsLib = await import('pdfjs-dist')
      const pdf = await pdfJsLib.getDocument({ data: _buffer }).promise
      let text = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        const pageText = content.items.map((item: { str?: string }) => item.str || '').join(' ')
        text += `\n\n--- Page ${i} ---\n\n${pageText}`
      }
      return text.trim()
    } catch {
      const decoder = new TextDecoder('utf-8', { fatal: false })
      return decoder.decode(_buffer)
    }
  }
}
