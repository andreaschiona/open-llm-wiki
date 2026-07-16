/**
 * Ingestion pipeline coordinator.
 *
 * Orchestrates the full ingestion workflow by delegating to specialised
 * modules:
 * - `DocumentAnalyzer` — LLM-powered document analysis
 * - `ConceptMerger` — merging new concepts into existing wiki pages
 * - `CrossReferenceEnricher` — back-link enrichment among related pages
 * - `PipelineUtils` — filename sanitisation, category detection, etc.
 *
 * Each module can be tested in isolation with mocked dependencies.
 * The coordinator itself is thin — it chains the phases and handles
 * error recovery / rollback.
 */

import type { LLMProvider } from '../llm/provider'
import { WikiManager } from '../wiki/wikiManager'
import { WikiLint } from '../wiki/wikiLint'
import { logger } from '../utils/logger'
import { reportError } from '../utils/errorReporter'
import type { LogEntry, LintResult } from '../../types/index'
import { analyzeDocument } from './documentAnalyzer'
import { mergeConcept } from './conceptMerger'
import { enrichCrossReferences } from './crossReferenceEnricher'
import {
  sanitizeFilename,
  detectRawCategory,
  detectTargetWiki,
  getExtension,
} from './pipelineUtils'

// ── Public types ───────────────────────────────────────────────────────────

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

// ── The coordinator ────────────────────────────────────────────────────────

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

  // ── Main entry point ──────────────────────────────────────────────────

  async processRawSource(
    taskId: string,
    title: string,
    rawContent: string,
    source: string,
  ): Promise<PipelineResult> {
    try {
      this.emit(taskId, 'saving-raw', 10, 'Saving raw source...')

      const rawCategory = detectRawCategory(source)
      const rawFilename = sanitizeFilename(title) + getExtension(source)
      await this.wikiManager.writeRawFile(rawCategory, rawFilename, rawContent)

      this.emit(taskId, 'analyzing', 25, 'Analyzing content with LLM...')

      // Phase 1 — LLM document analysis via dedicated module
      const analysis = await analyzeDocument(
        this.llmProvider,
        rawContent,
        title,
      )

      this.emit(
        taskId,
        'reconciling',
        40,
        `Reconciling ${analysis.concepts.length} concepts with existing wiki...`,
      )

      // Build title→path and page caches
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

      const safeName = sanitizeFilename(title)
      const targetWiki = detectTargetWiki(source, analysis.tags)
      const pagePath = `${targetWiki}/${safeName}.md`
      const today = new Date().toISOString().split('T')[0]

      const createdPaths: string[] = []
      const updatedPaths: string[] = []
      const pathToTitle = new Map<string, string>()

      this.emit(
        taskId,
        'merging',
        50,
        'Merging concepts with existing wiki...',
      )

      // Phase 2 — Merge concepts via dedicated module
      for (const concept of analysis.concepts) {
        const slug = sanitizeFilename(concept.name)
        const conceptPath = `concetti/${slug}.md`
        const existingFilePath = titleToPath.get(concept.name.toLowerCase())

        if (existingFilePath) {
          const existing = pageCache.get(existingFilePath)
          if (existing) {
            const mergedContent = await mergeConcept(
              this.llmProvider,
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

      // Phase 3 — Cross-reference enrichment via dedicated module
      this.emit(taskId, 'cross-ref', 70, 'Enriching cross-references...')
      await enrichCrossReferences(
        this.wikiManager,
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
        tags: [...analysis.tags],
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

      // Phase 4 — Lint
      this.emit(taskId, 'lint', 90, 'Running lint checks...')
      const lintResult = await this.runAutoLint()

      // Phase 5 — Log
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

  // ── Private helper kept in the coordinator ────────────────────────────

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
}
