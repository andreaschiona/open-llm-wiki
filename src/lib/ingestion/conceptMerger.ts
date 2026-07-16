/**
 * Concept merging module — merges new information extracted by the LLM
 * into existing wiki concept pages.
 *
 * Extracted from the original IngestionPipeline god class to allow
 * isolated testing with mocked LLM providers.
 */

import type { LLMProvider } from '../llm/provider'

/**
 * Merge a new description from an ingestion run into an existing concept page.
 *
 * Uses the LLM to intelligently blend old and new content, then updates
 * the YAML front-matter (data_aggiornamento, fonti) and inserts a
 * back-link to the new article.
 */
export async function mergeConcept(
  llmProvider: LLMProvider,
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
  const existingBody =
    bodyStart >= 0
      ? existingLines.slice(bodyStart).join('\n')
      : existingContent

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

  const response = await llmProvider.chat({
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

  // Update data_aggiornamento
  const dateLine = lines.findIndex((l) => l.startsWith('data_aggiornamento:'))
  if (dateLine >= 0) {
    lines[dateLine] = `data_aggiornamento: ${today}`
  }

  // Add new source to fonti
  const newSourceLine = `  - raw/${rawCategory}/${rawFilename}`
  const existingSourceIdx = lines.findIndex((l) =>
    l.trim().includes(newSourceLine.trim()),
  )
  if (existingSourceIdx < 0) {
    const fontiEnd = lines.length
    let insertAt = -1
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('  - raw/') || lines[i].startsWith('- raw/')) {
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

  // Add back-link to new article
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

  // Replace overview section with merged content
  if (overviewIdx >= 0 && fontiIdx > overviewIdx) {
    const merged = response.content
      .replace(/```markdown\n?/gi, '')
      .replace(/```\n?/g, '')
      .trim()
    lines.splice(overviewIdx + 1, fontiIdx - overviewIdx - 1, `\n${merged}\n`)
  }

  return lines.join('\n')
}
