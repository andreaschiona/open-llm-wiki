/**
 * Cross-reference enrichment module — after a new article is written,
 * scans existing pages that share tags and adds back-links.
 *
 * Extracted from the original IngestionPipeline god class to allow
 * isolated testing.
 */

import type { WikiManager } from '../wiki/wikiManager'
import { sanitizeFilename } from './pipelineUtils'

export interface PageCacheEntry {
  content: string
  tags: string[]
}

/**
 * Enrich cross-references in existing wiki pages that share tags
 * with the newly ingested article.
 *
 * For each existing page whose tags overlap with the new article's tags
 * AND that does not already contain a link to the new article, add a
 * back-link in the "Articoli correlati" section.
 *
 * Also updates `data_aggiornamento` on every page it touches.
 */
export async function enrichCrossReferences(
  wikiManager: WikiManager,
  newTitle: string,
  newPagePath: string,
  newTags: string[],
  allFiles: string[],
  pageCache: Map<string, PageCacheEntry>,
  today: string,
): Promise<void> {
  const targetTags = newTags.map((t) => t.toLowerCase())
  const newSlug = sanitizeFilename(newTitle)

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
      lines.splice(fontiIdx, 0, `\n## Articoli correlati\n\n${newLink}\n`)
    } else {
      lines.push(`\n## Articoli correlati\n\n${newLink}\n`)
    }

    // Update data_aggiornamento — fixed: mutate BEFORE creating the string
    const dateLine = lines.findIndex((l) => l.startsWith('data_aggiornamento:'))
    if (dateLine >= 0) {
      lines[dateLine] = `data_aggiornamento: ${today}`
    }

    const updatedContent = lines.join('\n')
    await wikiManager.writePage(f, updatedContent)
  }
}
