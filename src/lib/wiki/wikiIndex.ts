import type { WikiIndexEntry } from '../../types'

export class WikiIndex {
  private entries: WikiIndexEntry[] = []

  constructor() {}

  fromMarkdown(content: string): void {
    this.entries = []
    let currentCategory = ''
    const lines = content.split('\n')
    for (const line of lines) {
      // Match ## or ### headings
      const catMatch = line.match(/^#+\s+(.+)/)
      if (catMatch) {
        const raw = catMatch[1].trim()
        // Extract label from [[path|label]] if present
        const pipeIdx = raw.indexOf('|')
        currentCategory =
          pipeIdx >= 0
            ? raw
                .slice(pipeIdx + 1, raw.lastIndexOf(']'))
                .trim()
                .toLowerCase()
            : raw.toLowerCase()
        continue
      }
      // Parse [[wikilink|label]] syntax
      const wikiLinkMatch = line.match(
        /^\s*[-*]\s+\[\[([^\]]+)\|([^\]]+)\]\]\s*[:-]{0,1}\s*(.*)/,
      )
      if (wikiLinkMatch && currentCategory) {
        this.entries.push({
          title: wikiLinkMatch[2],
          path: wikiLinkMatch[1],
          category: currentCategory,
          summary: wikiLinkMatch[3] || '',
          tags: [],
          updated: new Date().toISOString(),
        })
        continue
      }
      // Parse [title](path) syntax
      const entryMatch = line.match(
        /^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[:-]{0,1}\s*(.*)/,
      )
      if (entryMatch && currentCategory) {
        this.entries.push({
          title: entryMatch[1],
          path: entryMatch[2],
          category: currentCategory,
          summary: entryMatch[3] || '',
          tags: [],
          updated: new Date().toISOString(),
        })
      }
    }
  }

  toMarkdown(): string {
    const byCategory = new Map<string, WikiIndexEntry[]>()
    for (const entry of this.entries) {
      const cat = entry.category
      if (!byCategory.has(cat)) byCategory.set(cat, [])
      byCategory.get(cat)!.push(entry)
    }

    let md = `# Wiki Index\n\nUltimo aggiornamento: ${new Date().toISOString()}\n\n## Wiki tematiche\n\n`
    for (const [cat, items] of byCategory) {
      const label = cat
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
      md += `### [[${cat}/indice_wiki|${label}]]\n\n`
      if (items.length === 0) {
        md += '*Nessun articolo ancora*\n\n'
      } else {
        for (const item of items) {
          md += `- [[${item.path}|${item.title}]]${item.summary ? `: ${item.summary}` : ''}\n`
        }
        md += '\n'
      }
    }
    return md
  }

  toThematicIndexMarkdown(wiki: string, entries: WikiIndexEntry[]): string {
    const label = wiki
      .replace(/-/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase())
    let md = `# ${label} — Indice\n\n`
    if (entries.length === 0) {
      md +=
        '*Nessun articolo ancora. Usa \`ingest\` per aggiungere nuove fonti.*\n'
    } else {
      md += '## Articoli\n\n'
      md += entries
        .map(
          (e) =>
            `- [[${e.path}|${e.title}]]${e.summary ? `: ${e.summary}` : ''}`,
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
    return this.entries.filter(
      (e) =>
        e.title.toLowerCase().includes(term.toLowerCase()) ||
        e.summary.toLowerCase().includes(term.toLowerCase()) ||
        e.tags.some((t) => t.toLowerCase().includes(term.toLowerCase())),
    )
  }
}
