import type { LogEntry } from '../../types'

export class WikiLog {
  private entries: LogEntry[] = []

  fromMarkdown(content: string): void {
    this.entries = []
    const lines = content.split('\n')
    for (const line of lines) {
      const match = line.match(
        /^\s*[-*]\s+\*\*(\d{4}-\d{2}-\d{2}T[\d:.]+Z?)\*\*\s*\|\s*(\w+)\s*\|\s*(.+?)\s*[—–-]\s*(.+)/,
      )
      if (match) {
        this.entries.push({
          timestamp: match[1],
          operation: match[2] as LogEntry['operation'],
          source: match[3].trim(),
          description: match[4].trim(),
          pagesAffected: [],
        })
      }
    }
  }

  toMarkdown(): string {
    let md = '# Wiki Log\n\n'
    for (const entry of this.entries) {
      md += `- **${entry.timestamp}** | ${entry.operation} | ${entry.source} — ${entry.description}\n`
    }
    return md
  }

  addEntry(entry: LogEntry): void {
    this.entries.unshift(entry)
  }

  getEntries(): LogEntry[] {
    return [...this.entries]
  }

  getRecent(count = 20): LogEntry[] {
    return this.entries.slice(0, count)
  }
}
