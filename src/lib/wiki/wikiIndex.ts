import type { WikiIndexEntry } from '../../types'

export class WikiIndex {
  private entries: WikiIndexEntry[] = []

  constructor() {}

  /**
   * Parse entries from a thematic indice_wiki.md, replacing all existing entries.
   * Category is set to the provided wiki slug (e.g. "ai-news") so it round-trips
   * correctly without going through a display-label transformation.
   */
  fromMarkdown(content: string, wikiSlug?: string): void {
    this.entries = []
    this.addFromMarkdown(content, wikiSlug)
  }

  /**
   * Append entries parsed from a thematic indice_wiki.md without clearing existing entries.
   */
  addFromMarkdown(content: string, wikiSlug?: string): void {
    let inArticoli = false
    const lines = content.split('\n')
    for (const line of lines) {
      // Detect ## Articoli section
      if (/^##\s+Articoli/.test(line)) {
        inArticoli = true
        continue
      }
      // Any other ## heading ends the Articoli section
      if (/^##\s+/.test(line) && inArticoli) {
        inArticoli = false
        continue
      }
      if (!inArticoli) continue

      // Parse [[path|label]] syntax
      const wikiLinkMatch = line.match(
        /^\s*[-*]\s+\[\[([^\]]+)\|([^\]]+)\]\]\s*[:-]?\s*(.*)/,
      )
      if (wikiLinkMatch) {
        this.entries.push({
          title: wikiLinkMatch[2].trim(),
          path: wikiLinkMatch[1].trim(),
          category: wikiSlug ?? wikiLinkMatch[1].split('/')[0],
          summary: wikiLinkMatch[3] || '',
          tags: [],
          updated: new Date().toISOString(),
        })
        continue
      }
      // Parse [title](path) syntax (legacy fallback)
      const mdLinkMatch = line.match(
        /^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[:-]?\s*(.*)/,
      )
      if (mdLinkMatch) {
        this.entries.push({
          title: mdLinkMatch[1].trim(),
          path: mdLinkMatch[2].trim(),
          category: wikiSlug ?? mdLinkMatch[2].split('/')[0],
          summary: mdLinkMatch[3] || '',
          tags: [],
          updated: new Date().toISOString(),
        })
      }
    }
  }

  /**
   * Regenerate the "## Articoli" section of a thematic indice_wiki.md,
   * preserving any existing intro paragraph (everything before ## Articoli).
   *
   * If the file has no ## Articoli section yet, it is appended.
   */
  updateThematicSection(
    existingContent: string,
    entries: WikiIndexEntry[],
  ): string {
    // Split at the first ## Articoli heading
    const articoliIdx = existingContent.search(/^## Articoli/m)
    const preamble =
      articoliIdx >= 0
        ? existingContent.slice(0, articoliIdx).trimEnd()
        : existingContent.trimEnd()

    const section = this.renderArticoliSection(entries)
    return `${preamble}\n\n${section}`
  }

  private renderArticoliSection(entries: WikiIndexEntry[]): string {
    let md = '## Articoli\n\n'
    if (entries.length === 0) {
      md +=
        '_Nessun articolo ancora. Usa `ingest` per aggiungere nuove fonti._\n'
    } else {
      md += entries
        .map(
          (e) =>
            `- [${e.title}](${e.path})${e.summary ? `: ${e.summary}` : ''}`,
        )
        .join('\n')
      md += '\n'
    }
    return md
  }

  addEntry(entry: WikiIndexEntry): void {
    const idx = this.entries.findIndex((e) => e.path === entry.path)
    if (idx >= 0) {
      this.entries[idx] = entry
    } else {
      this.entries.push(entry)
    }
  }

  removeEntry(path: string): void {
    this.entries = this.entries.filter((e) => e.path !== path)
  }

  getEntries(): WikiIndexEntry[] {
    return [...this.entries]
  }

  search(term: string): WikiIndexEntry[] {
    const stopWords = new Set([
      'di', 'che', 'e', 'a', 'il', 'la', 'le', 'gli', 'lo', 'i',
      'un', 'una', 'uno', 'per', 'con', 'su', 'in', 'da', 'non',
      'si', 'ci', 'vi', 'ne', 'mi', 'ti', 'li', 'ha', 'ho', 'hai',
      'hanno', 'ha', 'sono', 'era', 'stato', 'sta', 'stanno',
      'del', 'della', 'delle', 'degli', 'dei', 'dello',
      'al', 'alla', 'alle', 'agli', 'allo', 'ai',
      'dal', 'dalla', 'dalle', 'dagli', 'dallo', 'dai',
      'nel', 'nella', 'nelle', 'negli', 'nello', 'nei',
      'sul', 'sulla', 'sulle', 'sugli', 'sullo', 'sui',
      'cosa', 'come', 'quale', 'quali', 'quanto', 'quanta',
      'chi', 'cui', 'dove', 'quando', 'perche', 'perché',
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at',
      'to', 'for', 'of', 'by', 'with', 'from', 'is', 'are',
      'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can',
      'this', 'that', 'these', 'those', 'it', 'its',
      'what', 'which', 'who', 'whom', 'how', 'why',
    ])

    const keywords = term
      .toLowerCase()
      .split(/[\s,;:?!.]+/)
      .filter((w) => w.length > 2 && !stopWords.has(w))

    if (keywords.length === 0) {
      if (!term.trim()) return []
      return this.entries.filter(
        (e) =>
          e.title.toLowerCase().includes(term.toLowerCase()) ||
          e.summary.toLowerCase().includes(term.toLowerCase()) ||
          e.tags.some((t) => t.toLowerCase().includes(term.toLowerCase())),
      )
    }

    const scored = this.entries.map((e) => {
      const title = e.title.toLowerCase()
      const summary = e.summary.toLowerCase()
      const tags = e.tags.map((t) => t.toLowerCase())
      let score = 0
      for (const kw of keywords) {
        if (title.includes(kw)) score += 3
        if (tags.some((t) => t.includes(kw))) score += 2
        if (summary.includes(kw)) score += 1
        if (title.split(/\s+/).some((w) => w === kw)) score += 2
      }
      return { entry: e, score }
    })

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((s) => s.entry)
  }
}
