import type { LLMProvider } from '../llm/provider'
import { WikiManager } from '../wiki/wikiManager'
import { WikiLint } from '../wiki/wikiLint'
import { logger } from '../utils/logger'
import { reportError } from '../utils/errorReporter'
import type { LogEntry, LintResult } from '../../types'

export interface PipelineResult {
  createdPaths: string[]
  updatedPaths: string[]
  lintResult?: LintResult
}

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
  ): Promise<PipelineResult> {
    try {
      this.emit(taskId, 'saving-raw', 10, 'Saving raw source...')

      const rawCategory = this.detectRawCategory(source)
      const rawFilename =
        this.sanitizeFilename(title) + this.getExtension(source)
      await this.wikiManager.writeRawFile(rawCategory, rawFilename, rawContent)

      this.emit(taskId, 'analyzing', 25, 'Analyzing content with LLM...')

      const analysis = await this.analyzeDocument(rawContent, title)

      this.emit(
        taskId,
        'reconciling',
        40,
        `Reconciling ${analysis.concepts.length} concepts with existing wiki...`,
      )

      const allFiles = await this.wikiManager.listAllWikiFiles()
      const titleToPath = new Map<string, string>()
      const pageCache = new Map<string, { content: string; tags: string[] }>()
      for (const f of allFiles) {
        const page = await this.wikiManager.readPage(f)
        if (page) {
          titleToPath.set(page.meta.title.toLowerCase(), f)
          pageCache.set(f, {
            content: page.content,
            tags: page.meta.tags,
          })
        }
      }

      const safeName = this.sanitizeFilename(title)
      const targetWiki = this.detectTargetWiki(source, analysis.tags)
      const pagePath = `${targetWiki}/${safeName}.md`
      const today = new Date().toISOString().split('T')[0]

      const createdPaths: string[] = []
      const updatedPaths: string[] = []
      const pathToTitle = new Map<string, string>()

      this.emit(taskId, 'merging', 50, 'Merging concepts with existing wiki...')

      for (const concept of analysis.concepts) {
        const slug = this.sanitizeFilename(concept.name)
        const conceptPath = `concetti/${slug}.md`
        const existingFilePath = titleToPath.get(concept.name.toLowerCase())

        if (existingFilePath) {
          const existing = pageCache.get(existingFilePath)
          if (existing) {
            const mergedContent = await this.mergeConcept(
              concept.name,
              concept.description,
              existing.content,
              title,
              rawCategory,
              rawFilename,
              today,
            )
            await this.wikiManager.writePage(existingFilePath, mergedContent)
            updatedPaths.push(existingFilePath)
            pathToTitle.set(existingFilePath, concept.name)
          }
        } else {
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

      this.emit(taskId, 'writing', 60, 'Writing article page...')

      const allConceptNames = analysis.concepts.map((c) => c.name)
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
  allConceptNames.length > 0
    ? allConceptNames.map((c) => `- [[${c}]]`).join('\n')
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
      createdPaths.push(pagePath)
      pathToTitle.set(pagePath, title)

      this.emit(taskId, 'cross-ref', 70, 'Enriching cross-references...')
      await this.enrichCrossReferences(
        title,
        pagePath,
        analysis.tags,
        allFiles,
        pageCache,
        today,
      )

      this.emit(taskId, 'index', 80, 'Updating wiki index...')

      const allPaths = [...createdPaths, ...updatedPaths]
      const newEntries = allPaths.map((p) => ({
        title:
          pathToTitle.get(p) || p.split('/').pop()?.replace('.md', '') || '',
        path: p,
        summary: '',
        tags: [] as string[],
        updated: new Date().toISOString(),
        category: p.startsWith('concetti/') ? 'concetti' : targetWiki,
      }))

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

      await this.wikiManager.updateMainIndex()

      this.emit(taskId, 'lint', 90, 'Running lint checks...')
      const lintResult = await this.runAutoLint()

      this.emit(taskId, 'log', 95, 'Updating change log...')

      const updatedCount = updatedPaths.length
      const logEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        operation: 'ingest',
        source,
        description: `Ingested "${title}" — ${allConceptNames.length} concepts (${updatedCount} updated), ${analysis.relatedPages.length} relations found${
          lintResult && !lintResult.passed
            ? `, ${lintResult.issues.length} lint issues`
            : ''
        }`,
        pagesAffected: allPaths,
      }
      await this.wikiManager.appendLog(logEntry)

      this.emit(
        taskId,
        'done',
        100,
        lintResult && !lintResult.passed
          ? `Ingestion complete! ${lintResult.issues.length} lint issues found (check Settings).`
          : 'Ingestion complete!',
      )
      logger.info(
        'IngestionPipeline',
        `Processed: ${title} (${createdPaths.length} new, ${updatedCount} updated concepts)`,
      )

      return { createdPaths, updatedPaths, lintResult }
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

  private async mergeConcept(
    _name: string,
    newDescription: string,
    existingContent: string,
    newArticleTitle: string,
    rawCategory: string,
    rawFilename: string,
    today: string,
  ): Promise<string> {
    const existingLines = existingContent.split('\n')
    const bodyStart = existingLines.findIndex(
      (l) => l.startsWith('# ') || l.startsWith('## Overview'),
    )
    const existingBody = bodyStart >= 0 ? existingLines.slice(bodyStart).join('\n') : existingContent

    const mergePrompt = `You are merging new information into an existing wiki concept page.

Existing concept content:
${existingBody.slice(0, 4000)}

New information extracted from "${newArticleTitle}":
${newDescription}

Return ONLY a merged markdown "## Overview" section that:
1. Preserves all factual information from the existing content
2. Integrates the new information where relevant
3. If the new information contradicts the existing content, keep BOTH versions and add a note: "> [!warning] Contradiction: [description of conflicting claims]"
4. Do NOT include the page title, tags, or fonti sections — only the overview content
5. Keep the same style and tone as the existing wiki`

    const response = await this.llmProvider.chat({
      messages: [
        {
          role: 'system',
          content: 'You are a wiki editor merging old and new knowledge.',
        },
        { role: 'user', content: mergePrompt },
      ],
      temperature: 0.2,
    })

    const lines = existingContent.split('\n')
    const overviewIdx = lines.findIndex((l) => l === '## Overview')
    const fontiIdx = lines.findIndex((l) => l === '## Fonti')

    const updatedDate = today
    const dateLine = lines.findIndex(
      (l) => l.startsWith('data_aggiornamento:'),
    )
    if (dateLine >= 0) {
      lines[dateLine] = `data_aggiornamento: ${updatedDate}`
    }

    const newSourceLine = `  - raw/${rawCategory}/${rawFilename}`
    const existingSourceIdx = lines.findIndex((l) =>
      l.trim().includes(newSourceLine.trim()),
    )
    if (existingSourceIdx < 0) {
      const fontiEnd = lines.length
      let insertAt = -1
      for (let i = lines.length - 1; i >= 0; i--) {
        if (
          lines[i].startsWith('  - raw/') ||
          lines[i].startsWith('- raw/')
        ) {
          insertAt = i
          break
        }
      }
      if (insertAt >= 0) {
        lines.splice(insertAt + 1, 0, newSourceLine)
      } else {
        lines.splice(fontiEnd, 0, `\n## Fonti\n\n${newSourceLine}`)
      }
    }

    const newLink = `- [[${newArticleTitle}]]`
    const hasNewLink = lines.some((l) =>
      l.trim().toLowerCase().includes(newArticleTitle.toLowerCase()),
    )
    if (!hasNewLink) {
      const fontiSection = lines.findIndex((l) => l === '## Fonti')
      if (fontiSection >= 0) {
        lines.splice(fontiSection, 0, newLink)
      }
    }

    if (overviewIdx >= 0 && fontiIdx > overviewIdx) {
      const merged = response.content
        .replace(/```markdown\n?/gi, '')
        .replace(/```\n?/g, '')
        .trim()
      lines.splice(overviewIdx + 1, fontiIdx - overviewIdx - 1, `\n${merged}\n`)
    }

    return lines.join('\n')
  }

  private async enrichCrossReferences(
    newTitle: string,
    newPagePath: string,
    newTags: string[],
    allFiles: string[],
    pageCache: Map<string, { content: string; tags: string[] }>,
    today: string,
  ): Promise<void> {
    const targetTags = newTags.map((t) => t.toLowerCase())
    const newSlug = this.sanitizeFilename(newTitle)

    for (const f of allFiles) {
      if (f === newPagePath) continue
      const cached = pageCache.get(f)
      if (!cached) continue

      const pageTags = cached.tags.map((t) => t.toLowerCase())
      const hasOverlap = targetTags.some((t) => pageTags.includes(t))
      if (!hasOverlap) continue

      const hasLink =
        cached.content.toLowerCase().includes(newTitle.toLowerCase()) ||
        cached.content.toLowerCase().includes(newSlug)

      if (hasLink) continue

      const lines = cached.content.split('\n')
      const fontiIdx = lines.findIndex((l) => l === '## Fonti')
      const correlatiIdx = lines.findIndex((l) =>
        l.startsWith('## Articoli correlati'),
      )

      const newLink = `- [[${newTitle}]]`
      if (correlatiIdx >= 0) {
        lines.splice(correlatiIdx + 1, 0, newLink)
      } else if (fontiIdx >= 0) {
        lines.splice(
          fontiIdx,
          0,
          `\n## Articoli correlati\n\n${newLink}\n`,
        )
      } else {
        lines.push(`\n## Articoli correlati\n\n${newLink}\n`)
      }

      const updatedContent = lines.join('\n')
      const dateLine = lines.findIndex((l) =>
        l.startsWith('data_aggiornamento:'),
      )
      if (dateLine >= 0) {
        lines[dateLine] = `data_aggiornamento: ${today}`
      }

      await this.wikiManager.writePage(f, updatedContent)
    }
  }

  private async runAutoLint(): Promise<LintResult | undefined> {
    try {
      const linter = new WikiLint(this.wikiManager)
      const result = await linter.runLint()
      if (!result.passed) {
        logger.warn(
          'IngestionPipeline',
          `Auto-lint: ${result.issues.length} issues found (${result.stats.brokenLinks} broken links, ${result.stats.contradictions} contradictions)`,
        )
      }
      return result
    } catch (err) {
      logger.warn('IngestionPipeline', 'Auto-lint failed', err)
      return undefined
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
