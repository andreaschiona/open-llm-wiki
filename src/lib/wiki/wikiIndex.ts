import type { WikiIndexEntry } from '../../types'

export class WikiIndex {
  private entries: WikiIndexEntry[] = []

  constructor() {}

  fromMarkdown(content: string, wikiSlug?: string): void {
    this.entries = []
    this.addFromMarkdown(content, wikiSlug)
  }

  addFromMarkdown(content: string, wikiSlug?: string): void {
    let inSection = false
    const lines = content.split('\n')
    for (const line of lines) {
      if (/^##\s+/.test(line)) {
        inSection = true
        continue
      }
      if (!inSection) continue

      const entry = this.parseEntryLine(line, wikiSlug)
      if (entry) {
        this.addEntry(entry)
      }
    }
  }

  private parseEntryLine(
    line: string,
    wikiSlug?: string,
  ): WikiIndexEntry | null {
    const wikiLinkMatch = line.match(
      /^\s*[-*]\s+\[\[([^\]]+)\|([^\]]+)\]\]\s*[:-]?\s*(.*)/,
    )
    if (wikiLinkMatch) {
      const rest = wikiLinkMatch[3] || ''
      const { summary, tags } = this.parseEntryMetadata(rest)
      return {
        title: wikiLinkMatch[2].trim(),
        path: wikiLinkMatch[1].trim(),
        category: wikiSlug ?? wikiLinkMatch[1].split('/')[0],
        summary,
        tags,
        updated: new Date().toISOString(),
      }
    }

    const mdLinkMatch = line.match(
      /^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[:-]?\s*(.*)/,
    )
    if (mdLinkMatch) {
      const rest = mdLinkMatch[3] || ''
      const { summary, tags } = this.parseEntryMetadata(rest)
      return {
        title: mdLinkMatch[1].trim(),
        path: mdLinkMatch[2].trim(),
        category: wikiSlug ?? mdLinkMatch[2].split('/')[0],
        summary,
        tags,
        updated: new Date().toISOString(),
      }
    }

    return null
  }

  private parseEntryMetadata(rest: string): {
    summary: string
    tags: string[]
  } {
    const tagMatch = rest.match(/`tags:\s*(.+?)`\s*$/)
    if (tagMatch) {
      const summary = rest.slice(0, tagMatch.index).trim()
      const tags = tagMatch[1]
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
      return { summary, tags }
    }
    return { summary: rest.trim(), tags: [] }
  }

  updateThematicSection(
    existingContent: string,
    entries: WikiIndexEntry[],
  ): string {
    const sectionIdx = existingContent.search(/^##\s+/m)
    const preamble =
      sectionIdx >= 0
        ? existingContent.slice(0, sectionIdx).trimEnd()
        : existingContent.trimEnd()

    const section = this.renderDynamicSections(entries)
    return `${preamble}\n\n${section}`
  }

  private renderDynamicSections(entries: WikiIndexEntry[]): string {
    if (entries.length === 0) {
      return '## Generale\n\n_Nessun articolo ancora. Usa `ingest` per aggiungere nuove fonti._\n'
    }

    const tagMap = new Map<string, Set<WikiIndexEntry>>()
    const noTagEntries: WikiIndexEntry[] = []

    for (const e of entries) {
      if (e.tags.length === 0) {
        noTagEntries.push(e)
      } else {
        for (const tag of e.tags) {
          if (!tagMap.has(tag)) {
            tagMap.set(tag, new Set())
          }
          tagMap.get(tag)!.add(e)
        }
      }
    }

    const parts: string[] = []

    const sortedTags = [...tagMap.keys()].sort()
    for (const tag of sortedTags) {
      const tagEntries = [...tagMap.get(tag)!]
      parts.push(this.renderTagSection(tag, tagEntries))
    }

    if (noTagEntries.length > 0) {
      parts.push(this.renderTagSection('generale', noTagEntries))
    }

    return parts.join('\n')
  }

  private renderTagSection(tag: string, entries: WikiIndexEntry[]): string {
    const sectionName = tag.charAt(0).toUpperCase() + tag.slice(1)
    let md = `## ${sectionName}\n\n`
    md += entries
      .map((e) => {
        const tagStr =
          e.tags.length > 0 ? ` \`tags: ${e.tags.join(', ')}\`` : ''
        return `- [${e.title}](${e.path})${e.summary ? `: ${e.summary}${tagStr}` : tagStr}`
      })
      .join('\n')
    md += '\n'
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
      'di',
      'che',
      'e',
      'a',
      'il',
      'la',
      'le',
      'gli',
      'lo',
      'i',
      'un',
      'una',
      'uno',
      'per',
      'con',
      'su',
      'in',
      'da',
      'non',
      'si',
      'ci',
      'vi',
      'ne',
      'mi',
      'ti',
      'li',
      'ha',
      'ho',
      'hai',
      'hanno',
      'ha',
      'sono',
      'era',
      'stato',
      'sta',
      'stanno',
      'del',
      'della',
      'delle',
      'degli',
      'dello',
      'al',
      'alla',
      'alle',
      'agli',
      'allo',
      'ai',
      'dal',
      'dalla',
      'dalle',
      'dagli',
      'dallo',
      'dai',
      'nel',
      'nella',
      'nelle',
      'negli',
      'nello',
      'nei',
      'sul',
      'sulla',
      'sulle',
      'sugli',
      'sullo',
      'sui',
      'cosa',
      'come',
      'quale',
      'quali',
      'quanto',
      'quanta',
      'chi',
      'cui',
      'dove',
      'quando',
      'perche',
      'perché',
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'in',
      'on',
      'at',
      'to',
      'for',
      'of',
      'by',
      'with',
      'from',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'shall',
      'can',
      'this',
      'that',
      'these',
      'those',
      'it',
      'its',
      'what',
      'which',
      'who',
      'whom',
      'how',
      'why',
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
