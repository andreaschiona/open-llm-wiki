import type { LLMProvider } from '../llm/provider'
import { WikiManager } from '../wiki/wikiManager'
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
      const rawFilename =
        this.sanitizeFilename(title) + this.getExtension(source)
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
          this.emit(
            taskId,
            'reconciling',
            55,
            `Skipping existing concept: ${concept.name}`,
          )
        }
      }

      this.emit(taskId, 'writing', 60, 'Writing wiki pages...')

      const safeName = this.sanitizeFilename(title)
      const targetWiki = this.detectTargetWiki(source, analysis.tags)
      const pagePath = `${targetWiki}/${safeName}.md`
      const today = new Date().toISOString().split('T')[0]
      const pageContent = `---
tags: [${analysis.tags.length > 0 ? analysis.tags.map((t) => `"${t}"`).join(', ') : 'ingested'}]
data_creazione: ${today}
data_aggiornamento: ${today}
fonti:
  - raw/${rawCategory}/${rawFilename}
---

# ${title}

${analysis.summary}

## Articoli correlati

${
  newConcepts.length > 0
    ? newConcepts.map((c) => `- [[${c.name}]]`).join('\n')
    : ''
}
${
  analysis.relatedPages.length > 0
    ? analysis.relatedPages.map((r: string) => `- [[${r}]]`).join('\n')
    : ''
}

## Fonti

- \`raw/${rawCategory}/${rawFilename}\`
`
      await this.wikiManager.writePage(pagePath, pageContent)

      const createdPaths = [pagePath]
      const pathToTitle = new Map<string, string>()
      pathToTitle.set(pagePath, title)
      for (const concept of newConcepts) {
        const slug = this.sanitizeFilename(concept.name)
        const conceptPath = `concetti/${slug}.md`
        const existingConcept = await this.wikiManager.readPage(conceptPath)
        if (!existingConcept) {
          const conceptContent = `---
tags: [concept, extracted]
data_creazione: ${today}
data_aggiornamento: ${today}
fonti:
  - raw/${rawCategory}/${rawFilename}
---

# ${concept.name}

## Overview

${concept.description}

## Fonti

- \`raw/${rawCategory}/${rawFilename}\`
- [[${title}]]
`
          await this.wikiManager.writePage(conceptPath, conceptContent)
          createdPaths.push(conceptPath)
          pathToTitle.set(conceptPath, concept.name)
        }
      }

      this.emit(taskId, 'index', 85, 'Updating wiki index...')

      const newEntries = createdPaths.map((p) => ({
        title:
          pathToTitle.get(p) || p.split('/').pop()?.replace('.md', '') || '',
        path: p,
        summary: '',
        tags: [] as string[],
        updated: new Date().toISOString(),
        category: p.startsWith('concetti/') ? 'concetti' : targetWiki,
      }))

      // Update only the thematic indice_wiki.md files — indice.md is hand-authored
      const targetEntries = newEntries.filter((e) => e.category === targetWiki)
      if (targetEntries.length > 0) {
        await this.wikiManager.updateThematicWikiIndex(
          targetWiki,
          targetEntries,
        )
      }
      const concettiEntries = newEntries.filter(
        (e) => e.category === 'concetti',
      )
      if (concettiEntries.length > 0) {
        await this.wikiManager.updateThematicWikiIndex(
          'concetti',
          concettiEntries,
        )
      }

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
      logger.info(
        'IngestionPipeline',
        `Processed: ${title} (${newConcepts.length} new concepts)`,
      )
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
    const systemPrompt = `You are an LLM Wiki analyst following established wiki conventions.

Analyze the document and return a JSON object with this exact structure:
{
  "summary": "A structured markdown summary (see format below)",
  "concepts": [
    { "name": "Concept Name", "description": "3-5 sentence informative description" }
  ],
  "relatedPages": ["Related Topic 1", "Related Topic 2"],
  "tags": ["tag1", "tag2", "tag3"]
}

The summary MUST use this structure:

## Overview
2-3 paragraphs capturing what this document is about, its scope, and significance.

## Key Facts
A bullet list of specific, verifiable facts. Include dates, numbers, names, concrete claims.

## Key Points
Organized by thematic section with headings (###) and bullet points. Preserve important quotes verbatim.

## Data & Statistics
If the document contains quantitative data, extract it into a list or table.

## Open Questions / Debates
List unresolved questions, conflicting viewpoints, or areas of uncertainty.

Rules:
- Extract ALL important concepts, entities, and definitions
- Be precise with numbers, dates, and facts
- Concepts should be encyclopedic and reusable across pages
- Tags should be lowercase and generic
- CRITICAL: IGNORE PDF technical internals (FlateDecode, DeviceRGB, XObject, PDF/A, font descriptors, compression filters). Extract only the document's actual subject matter.
- If the document is mostly PDF metadata, return summary as "This document appears to contain primarily technical PDF metadata rather than readable content." and concepts as [].`

    const truncated = rawContent.slice(0, 15000)
    const response = await this.llmProvider.chat({
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Analyze this document titled "${title}":\n\n${truncated}`,
        },
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

  private detectTargetWiki(source: string, tags: string[]): string {
    const sourceLower = source.toLowerCase()
    let hostname = ''
    try {
      hostname = new URL(source).hostname.toLowerCase()
    } catch {
      hostname = ''
    }
    const allTags = tags.map((t) => t.toLowerCase())
    if (
      allTags.some((t) =>
        [
          'tool',
          'strumento',
          'framework',
          'platform',
          'ide',
          'cli',
          'libreria',
          'software',
        ].includes(t),
      ) ||
      hostname === 'github.com' ||
      hostname.endsWith('.github.com') ||
      sourceLower.includes('tool') ||
      sourceLower.includes('api')
    ) {
      return 'strumenti-ai'
    }
    if (
      allTags.some((t) =>
        [
          'news',
          'notizia',
          'release',
          'announcement',
          'update',
          'model',
          'benchmark',
        ].includes(t),
      )
    ) {
      return 'ai-news'
    }
    return 'concetti'
  }

  private detectRawCategory(source: string): string {
    const url = source.toLowerCase()
    const filename = source.split('/').pop()?.toLowerCase() || ''

    let hostname = ''
    try {
      hostname = new URL(source).hostname.toLowerCase()
    } catch {
      hostname = ''
    }
    const isGitHubHost =
      hostname === 'github.com' || hostname.endsWith('.github.com')

    if (filename.endsWith('.pdf')) return 'pdfs'
    if (
      filename.endsWith('.mp3') ||
      filename.endsWith('.wav') ||
      filename.endsWith('.ogg')
    )
      return 'audio'
    if (
      isGitHubHost ||
      filename.endsWith('.py') ||
      filename.endsWith('.js') ||
      filename.endsWith('.rs')
    )
      return 'code'
    if (
      filename.endsWith('.json') ||
      filename.endsWith('.csv') ||
      filename.endsWith('.sql')
    )
      return 'data'
    if (filename.endsWith('.txt') || filename.endsWith('.md')) return 'meetings'
    if (
      url.includes('chat') ||
      url.includes('slack') ||
      url.includes('discord')
    )
      return 'chat'
    return 'other'
  }

  private sanitizeFilename(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
  }

  private getExtension(source: string): string {
    const parts = source.split('.')
    return parts.length > 1
      ? `.${parts[parts.length - 1].split(/[/?#]/)[0].toLowerCase()}`
      : '.txt'
  }
}
