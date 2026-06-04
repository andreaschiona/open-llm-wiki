import { logger } from '../utils/logger'
import type { WikiPage, PageMeta, LogEntry, WikiTreeNode } from '../../types'

const WIKI_BASE = 'wiki'

interface FileOps {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  listDir(path: string): Promise<string[]>
  createDir(path: string): Promise<void>
  fileExists(path: string): Promise<boolean>
}

export class WikiManager {
  private fileOps: FileOps
  private basePath: string

  constructor(fileOps: FileOps, basePath = WIKI_BASE) {
    this.fileOps = fileOps
    this.basePath = basePath
  }

  private resolvePath(subpath: string): string {
    return `${this.basePath}/${subpath}`
  }

  async init(): Promise<void> {
    const dirs = [
      '',
      'entities',
      'concepts',
      'summaries',
      'queries',
    ]
    for (const dir of dirs) {
      const fullPath = this.resolvePath(dir)
      if (!(await this.fileOps.fileExists(fullPath))) {
        await this.fileOps.createDir(fullPath)
        logger.info('WikiManager', `Created directory: ${fullPath}`)
      }
    }
    const indexMd = this.resolvePath('index.md')
    if (!(await this.fileOps.fileExists(indexMd))) {
      await this.fileOps.writeFile(indexMd, this.generateInitialIndex())
    }
    const logMd = this.resolvePath('log.md')
    if (!(await this.fileOps.fileExists(logMd))) {
      await this.fileOps.writeFile(logMd, '# Wiki Log\n\n')
    }
    logger.info('WikiManager', 'Wiki initialized')
  }

  private generateInitialIndex(): string {
    return `# Wiki Index

Last updated: ${new Date().toISOString()}

## Entities

*No entities yet*

## Concepts

*No concepts yet*

## Summaries

*No summaries yet*

## Queries

*No queries yet*
`
  }

  async readPage(path: string): Promise<WikiPage | null> {
    try {
      const fullPath = this.resolvePath(path)
      const content = await this.fileOps.readFile(fullPath)
      const meta = this.parseMeta(content, path)
      return { meta, content }
    } catch {
      return null
    }
  }

  async writePage(path: string, content: string): Promise<void> {
    const fullPath = this.resolvePath(path)
    await this.fileOps.writeFile(fullPath, content)
    logger.info('WikiManager', `Written page: ${path}`)
  }

  async deletePage(path: string): Promise<void> {
    const fullPath = this.resolvePath(path)
    await this.fileOps.writeFile(fullPath, '')
    logger.info('WikiManager', `Deleted page: ${path}`)
  }

  async listPages(category?: string): Promise<string[]> {
    const searchPath = category ? this.resolvePath(category) : this.resolvePath('')
    const entries = await this.fileOps.listDir(searchPath)
    return entries.filter(e => e.endsWith('.md'))
  }

  async getTree(): Promise<WikiTreeNode[]> {
    const root: WikiTreeNode[] = []
    const categories = ['entities', 'concepts', 'summaries', 'queries']
    for (const cat of categories) {
      const node: WikiTreeNode = {
        name: cat,
        path: cat,
        type: 'directory',
        children: [],
      }
      const files = await this.listPages(cat)
      node.children = files.map(f => ({
        name: f.split('/').pop() || f,
        path: f,
        type: 'file' as const,
      }))
      root.push(node)
    }
    return root
  }

  async appendLog(entry: LogEntry): Promise<void> {
    const logPath = this.resolvePath('log.md')
    const line = `- **${entry.timestamp}** | ${entry.operation} | ${entry.source} — ${entry.description}\n`
    const existing = await this.fileOps.readFile(logPath)
    await this.fileOps.writeFile(logPath, existing + line)
    logger.info('WikiManager', `Log entry added: ${entry.operation} ${entry.source}`)
  }

  async getLog(): Promise<string> {
    return this.fileOps.readFile(this.resolvePath('log.md'))
  }

  async getIndex(): Promise<string> {
    return this.fileOps.readFile(this.resolvePath('index.md'))
  }

  async updateIndex(content: string): Promise<void> {
    await this.fileOps.writeFile(this.resolvePath('index.md'), content)
  }

  async searchIndex(keyword: string): Promise<string[]> {
    const index = await this.getIndex()
    const lines = index.split('\n')
    return lines
      .filter(l => l.toLowerCase().includes(keyword.toLowerCase()))
      .map(l => l.replace(/^[-*]\s*\[([^\]]+)\]\(([^)]+)\)/, '$2').trim())
  }

  private parseMeta(content: string, path: string): PageMeta {
    const titleMatch = content.match(/^#\s+(.+)/m)
    const tagsMatch = content.match(/^tags:\s*(.+)$/m)
    const cat = path.split('/')[0]
    return {
      title: titleMatch?.[1] || path.split('/').pop()?.replace('.md', '') || path,
      path,
      category: (cat as PageMeta['category']) || 'entity',
      created: '',
      updated: new Date().toISOString(),
      tags: tagsMatch?.[1]?.split(',').map(t => t.trim()) || [],
    }
  }
}
