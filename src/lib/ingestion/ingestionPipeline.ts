import type { LLMProvider } from '../llm/provider'
import { WikiManager } from '../wiki/wikiManager'
import { WikiIndex } from '../wiki/wikiIndex'
import { logger } from '../utils/logger'
import { reportError } from '../utils/errorReporter'
import type { LogEntry } from '../../types'

export interface PipelineProgress {
  taskId: string
  step: string
  progress: number
  message: string
}

export interface ExtractedEntity {
  name: string
  category: string
  path: string
  description: string
}

export class IngestionPipeline {
  private wikiManager: WikiManager
  private llmProvider: LLMProvider
  private onProgress?: (progress: PipelineProgress) => void

  constructor(
    wikiManager: WikiManager,
    llmProvider: LLMProvider,
    onProgress?: (progress: PipelineProgress) => void,
  ) {
    this.wikiManager = wikiManager
    this.llmProvider = llmProvider
    this.onProgress = onProgress
  }

  private emit(
    taskId: string,
    step: string,
    progress: number,
    message: string,
  ) {
    this.onProgress?.({ taskId, step, progress, message })
  }

  async processRawSource(
    taskId: string,
    title: string,
    rawContent: string,
    source: string,
  ): Promise<void> {
    try {
      this.emit(taskId, 'saving-raw', 10, 'Saving raw source...')

      const rawCategory = this.detectRawCategory(source)
      const rawFilename = this.sanitizeFilename(title) + this.getExtension(source)
      await this.wikiManager.writeRawFile(rawCategory, rawFilename, rawContent)

      this.emit(taskId, 'reading', 20, 'Reading full document...')

      this.emit(taskId, 'analyzing', 35, 'Analyzing content with LLM...')

      const analysis = await this.analyzeDocument(rawContent, title)

      this.emit(taskId, 'reconciling', 50, 'Reconciling with existing wiki...')

      const existingPages = await this.wikiManager.listAllWikiFiles()
      const existingTitles = new Set<string>()
      for (const p of existingPages) {
        const page = await this.wikiManager.readPage(p)
        if (page) existingTitles.add(page.meta.title.toLowerCase())
      }

      const newConcepts: { name: string; description: string }[] = []
      for (const concept of analysis.concepts) {
        if (!existingTitles.has(concept.name.toLowerCase())) {
          newConcepts.push(concept)
        } else {
          this.emit(taskId, 'reconciling', 55, `Skipping existing concept: ${concept.name}`)
        }
      }

      this.emit(taskId, 'writing', 60, 'Writing wiki pages...')

      const safeName = this.sanitizeFilename(title)
      const pagePath = `pages/${safeName}.md`
      const pageContent = `# ${title}

> Source: \`raw/${rawCategory}/${rawFilename}\`

${analysis.summary}

## Concepts

${newConcepts.length > 0
    ? newConcepts.map(c => `- [[${c.name}]] — ${c.description}`).join('\n')
    : '*No new concepts extracted*'}

## Related Pages

${analysis.relatedPages.length > 0
    ? analysis.relatedPages.map((r: string) => `- [[${r}]]`).join('\n')
    : '*None yet*'}

---

*Source: ${source}*
*Imported: ${new Date().toISOString()}*
`
      await this.wikiManager.writePage(pagePath, pageContent)

      const createdPaths = [pagePath]
      for (const concept of newConcepts) {
        const slug = this.sanitizeFilename(concept.name)
        const conceptPath = `pages/${slug}.md`
        const existingConcept = await this.wikiManager.readPage(conceptPath)
        if (!existingConcept) {
          const conceptContent = `# ${concept.name}

${concept.description}

---

*Extracted from: [[${title}]]*
*Created: ${new Date().toISOString()}*
`
          await this.wikiManager.writePage(conceptPath, conceptContent)
          createdPaths.push(conceptPath)
        }
      }

      this.emit(taskId, 'index', 85, 'Updating wiki index...')

      const indexContent = await this.wikiManager.getIndex()
      const wikiIndex = new WikiIndex()
      wikiIndex.fromMarkdown(indexContent)

      wikiIndex.addEntry({
        title,
        path: pagePath,
        category: 'pages',
        summary: analysis.summary.slice(0, 100) + '...',
        tags: analysis.tags || [],
        updated: new Date().toISOString(),
      })
      for (const concept of newConcepts) {
        const slug = this.sanitizeFilename(concept.name)
        wikiIndex.addEntry({
          title: concept.name,
          path: `pages/${slug}.md`,
          category: 'pages',
          summary: concept.description.slice(0, 100) + '...',
          tags: [],
          updated: new Date().toISOString(),
        })
      }
      await this.wikiManager.updateIndex(wikiIndex.toMarkdown())

      this.emit(taskId, 'log', 95, 'Updating change log...')

      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        operation: 'ingest',
        source,
        description: `Ingested "${title}" — ${newConcepts.length} new concepts, ${analysis.relatedPages.length} relations found`,
        pagesAffected: createdPaths,
      }
      await this.wikiManager.appendLog(logEntry)

      this.emit(taskId, 'done', 100, 'Ingestion complete!')
      logger.info('IngestionPipeline', `Processed: ${title} (${newConcepts.length} new concepts)`)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logger.error('IngestionPipeline', `Failed to process "${title}"`, {
        source,
        error: message,
      })
      this.emit(taskId, 'error', 0, `Error: ${message}`)
      reportError(err instanceof Error ? err : new Error(message), {
        module: 'IngestionPipeline',
        method: 'processRawSource',
        taskId,
        title,
        source,
      })
      throw err
    }
  }

  private async analyzeDocument(
    rawContent: string,
    title: string,
  ): Promise<{
    summary: string
    concepts: Array<{ name: string; description: string }>
    relatedPages: string[]
    tags: string[]
  }> {
    const systemPrompt = `You are a Wiki analyst. Your job is to analyze a document and produce structured knowledge.

Return a JSON object with this exact structure:
{
  "summary": "A thorough markdown summary of the document (preserve key facts, data, decisions, definitions)",
  "concepts": [
    { "name": "Concept Name", "description": "1-2 sentence description" }
  ],
  "relatedPages": ["Related Topic 1", "Related Topic 2"],
  "tags": ["tag1", "tag2", "tag3"]
}

Rules:
- Extract ALL important concepts, entities, and definitions
- Be precise with numbers, dates, and facts
- Concepts should be encyclopedic and reusable across pages
- Tags should be lowercase and generic`

    const truncated = rawContent.slice(0, 15000)
    const response = await this.llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Analyze this document titled "${title}":\n\n${truncated}` },
      ],
      temperature: 0.2,
    })

    try {
      const json = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      return JSON.parse(json)
    } catch {
      return {
        summary: response.content,
        concepts: [],
        relatedPages: [],
        tags: [],
      }
    }
  }

  private detectRawCategory(source: string): string {
    const url = source.toLowerCase()
    const filename = source.split('/').pop()?.toLowerCase() || ''

    if (filename.endsWith('.pdf')) return 'pdfs'
    if (filename.endsWith('.mp3') || filename.endsWith('.wav') || filename.endsWith('.ogg')) return 'audio'
    if (source.includes('github.com') || filename.endsWith('.py') || filename.endsWith('.js') || filename.endsWith('.rs')) return 'code'
    if (filename.endsWith('.json') || filename.endsWith('.csv') || filename.endsWith('.sql')) return 'data'
    if (filename.endsWith('.txt') || filename.endsWith('.md')) return 'meetings'
    if (url.includes('chat') || url.includes('slack') || url.includes('discord')) return 'chat'
    return 'other'
  }

  private sanitizeFilename(name: string): string {
    return name
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase()
  }

  private getExtension(source: string): string {
    const parts = source.split('.')
    return parts.length > 1 ? `.${parts[parts.length - 1].split(/[/?#]/)[0].toLowerCase()}` : '.txt'
  }
}
