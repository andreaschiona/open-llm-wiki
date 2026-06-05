import type { WikiIndexEntry } from '../../types'

export class WikiIndex {
  private entries: WikiIndexEntry[] = []

  constructor() {}

  fromMarkdown(content: string): void {
    this.entries = []
    let currentCategory = ''
    const lines = content.split('\n')
    for (const line of lines) {
      const catMatch = line.match(/^##\s+(.+)/)
      if (catMatch) {
        currentCategory = catMatch[1].toLowerCase()
        continue
      }
      const entryMatch = line.match(/^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)\s*[:-]{0,1}\s*(.*)/)
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

    let md = `# Wiki Index\n\nLast updated: ${new Date().toISOString()}\n\n`
    for (const [cat, items] of byCategory) {
      md += `## ${cat.charAt(0).toUpperCase() + cat.slice(1)}\n\n`
      if (items.length === 0) {
        md += '*No entries yet*\n\n'
      } else {
        for (const item of items) {
          md += `- [${item.title}](${item.path})${item.summary ? `: ${item.summary}` : ''}\n`
        }
        md += '\n'
      }
    }
    return md
  }

  addEntry(entry: WikiIndexEntry): void {
    const idx = this.entries.findIndex(e => e.path === entry.path)
    if (idx >= 0) {
      this.entries[idx] = entry
    } else {
      this.entries.push(entry)
    }
  }

  removeEntry(path: string): void {
    this.entries = this.entries.filter(e => e.path !== path)
  }

  getEntries(): WikiIndexEntry[] {
    return [...this.entries]
  }

  search(term: string): WikiIndexEntry[] {
    return this.entries.filter(e =>
      e.title.toLowerCase().includes(term.toLowerCase()) ||
      e.summary.toLowerCase().includes(term.toLowerCase()) ||
      e.tags.some(t => t.toLowerCase().includes(term.toLowerCase()))
    )
  }
}
