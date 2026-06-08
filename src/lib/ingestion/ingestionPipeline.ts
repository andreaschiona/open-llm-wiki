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
      this.emit(taskId, 'analyzing', 30, 'Analyzing content with LLM...')

      const summary = await this.generateSummary(rawContent, title)

      this.emit(taskId, 'saving', 60, 'Saving summary page...')

      const safeName = title
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase()
      const summaryPath = `summaries/${safeName}.md`
      const summaryContent = `# ${title}

> Summarized from: ${source}

${summary}

---

*Source: ${source}*  
*Imported: ${new Date().toISOString()}*
`
      await this.wikiManager.writePage(summaryPath, summaryContent)

      this.emit(taskId, 'entities', 75, 'Extracting entities and concepts...')

      await this.extractEntities(rawContent, safeName, title)

      this.emit(taskId, 'index', 90, 'Updating wiki index...')

      const indexContent = await this.wikiManager.getIndex()
      const wikiIndex = new WikiIndex()
      wikiIndex.fromMarkdown(indexContent)
      wikiIndex.addEntry({
        title,
        path: summaryPath,
        category: 'summaries',
        summary: summary.slice(0, 100) + '...',
        tags: [],
        updated: new Date().toISOString(),
      })
      await this.wikiManager.updateIndex(wikiIndex.toMarkdown())

      this.emit(taskId, 'log', 95, 'Updating change log...')

      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        operation: 'ingest',
        source,
        description: `Ingested "${title}" — summary page created`,
        pagesAffected: [summaryPath],
      }
      await this.wikiManager.appendLog(logEntry)

      this.emit(taskId, 'done', 100, 'Ingestion complete!')
      logger.info('IngestionPipeline', `Processed: ${title}`)
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

  private async generateSummary(
    rawContent: string,
    title: string,
  ): Promise<string> {
    const systemPrompt = `You are a Wiki summarizer. Given a document, create a detailed markdown summary that:
1. Captures the key points and main ideas
2. Uses bullet points for clarity
3. Preserves important facts, data, and quotes
4. Is well-structured with sections if needed

Document title: ${title}`

    const truncated = rawContent.slice(0, 15000)
    const response = await this.llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Summarize this document:\n\n${truncated}` },
      ],
      temperature: 0.3,
    })

    return response.content
  }

  private async extractEntities(
    rawContent: string,
    _pageSlug: string,
    title: string,
  ): Promise<void> {
    const systemPrompt = `You are an entity extractor. Given a document, extract the main entities and concepts mentioned.
For each entity/concept, provide a brief description (1-2 sentences).
Format as JSON array: [{"name": "...", "type": "entity|concept", "description": "..."}]`

    const truncated = rawContent.slice(0, 10000)
    try {
      const response = await this.llmProvider.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: truncated },
        ],
        temperature: 0.3,
      })

      const json = response.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim()
      const entities = JSON.parse(json) as Array<{
        name: string
        type: string
        description: string
      }>

      for (const entity of entities) {
        const slug = entity.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
        const category = entity.type === 'entity' ? 'entities' : 'concepts'
        const path = `${category}/${slug}.md`
        const existing = await this.wikiManager.readPage(path)

        if (!existing) {
          const content = `# ${entity.name}

${entity.description}

---

*Extracted from: [[${title}]]*
*Created: ${new Date().toISOString()}*
`
          await this.wikiManager.writePage(path, content)
        }
      }
    } catch (err) {
      logger.warn('IngestionPipeline', 'Entity extraction failed', err)
    }
  }
}
