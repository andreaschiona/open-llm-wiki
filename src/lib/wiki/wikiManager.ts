import { logger } from '../utils/logger'
import { WikiIndex } from './wikiIndex'
import type {
  WikiPage,
  PageMeta,
  LogEntry,
  WikiTreeNode,
  RawFileInfo,
  WikiIndexEntry,
} from '../../types'

const WIKI_BASE = 'wiki'
const RAW_BASE = 'raw'
const QUERY_BASE = 'query'

export interface FileOps {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  listDir(path: string): Promise<string[]>
  createDir(path: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  deleteFile?(path: string): Promise<void>
  deleteDir?(path: string, recursive?: boolean): Promise<void>
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

  private resolveRaw(subpath: string): string {
    return `${RAW_BASE}/${subpath}`
  }

  private resolveQuery(subpath: string): string {
    return `${QUERY_BASE}/${subpath}`
  }

  private readonly thematicWikis = ['ai-news', 'strumenti-ai', 'concetti']

  async init(): Promise<void> {
    for (const dir of this.thematicWikis) {
      const fullPath = this.resolvePath(dir)
      if (!(await this.fileOps.fileExists(fullPath))) {
        await this.fileOps.createDir(fullPath)
        logger.info('WikiManager', `Created thematic wiki: ${fullPath}`)
      }
    }

    const rawDirs = [
      'pdfs',
      'meetings',
      'audio',
      'chat',
      'code',
      'data',
      'other',
    ]
    for (const dir of rawDirs) {
      const fullPath = this.resolveRaw(dir)
      if (!(await this.fileOps.fileExists(fullPath))) {
        await this.fileOps.createDir(fullPath)
        logger.info('WikiManager', `Created directory: ${fullPath}`)
      }
    }

    const queryDirs = ['plans', 'outputs']
    for (const dir of queryDirs) {
      const fullPath = this.resolveQuery(dir)
      if (!(await this.fileOps.fileExists(fullPath))) {
        await this.fileOps.createDir(fullPath)
        logger.info('WikiManager', `Created directory: ${fullPath}`)
      }
    }

    const indiceMd = this.resolvePath('indice.md')
    if (!(await this.fileOps.fileExists(indiceMd))) {
      await this.fileOps.writeFile(indiceMd, this.generateInitialIndex())
    }
    const logMd = this.resolvePath('log.md')
    if (!(await this.fileOps.fileExists(logMd))) {
      await this.fileOps.writeFile(logMd, '# Wiki Log\n\n')
    }
    logger.info('WikiManager', 'Wiki initialized with thematic wiki structure')
  }

  private generateInitialIndex(): string {
    const wikis = this.thematicWikis
      .map((w) => {
        const label = w
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
        return `### [[${w}/indice_wiki|${label}]]\nDescrizione della wiki tematica ${label}.`
      })
      .join('\n\n')
    return `# Wiki Index

Ultimo aggiornamento: ${new Date().toISOString()}

## Wiki tematiche

${wikis}

---

*Usa \`ingest\` per aggiungere nuovi contenuti.*
`
  }

  async readPage(path: string): Promise<WikiPage | null> {
    try {
      const fullPath = path.startsWith('wiki/') ? path : this.resolvePath(path)
      const content = await this.fileOps.readFile(fullPath)
      const meta = this.parseMeta(content, path)
      return { meta, content }
    } catch {
      return null
    }
  }

  async writePage(path: string, content: string): Promise<void> {
    const fullPath = path.startsWith('wiki/') ? path : this.resolvePath(path)
    await this.fileOps.writeFile(fullPath, content)
    logger.info('WikiManager', `Written page: ${path}`)
  }

  async deletePage(path: string): Promise<void> {
    const fullPath = path.startsWith('wiki/') ? path : this.resolvePath(path)
    if (this.fileOps.deleteFile) {
      await this.fileOps.deleteFile(fullPath)
    } else {
      await this.fileOps.writeFile(fullPath, '')
    }
    logger.info('WikiManager', `Deleted page: ${path}`)
  }

  async listPages(): Promise<string[]> {
    const all: string[] = []
    for (const wiki of this.thematicWikis) {
      const path = this.resolvePath(wiki)
      try {
        const entries = await this.fileOps.listDir(path)
        for (const e of entries) {
          if (e.endsWith('.md') && e !== 'indice_wiki.md') {
            all.push(`${wiki}/${e}`)
          }
        }
      } catch {
        /* skip */
      }
    }
    return all
  }

  async listAllWikiFiles(): Promise<string[]> {
    const all: string[] = []
    for (const wiki of this.thematicWikis) {
      try {
        const path = this.resolvePath(wiki)
        const entries = await this.fileOps.listDir(path)
        for (const e of entries) {
          if (e.endsWith('.md')) {
            all.push(`${wiki}/${e}`)
          }
        }
      } catch {
        /* skip */
      }
    }
    const indexMd = this.resolvePath('indice.md')
    try {
      await this.fileOps.readFile(indexMd)
      all.push('indice.md')
    } catch {
      /* skip */
    }
    return all
  }

  async listThematicWikis(): Promise<string[]> {
    const result: string[] = []
    for (const wiki of this.thematicWikis) {
      const path = this.resolvePath(wiki)
      try {
        await this.fileOps.listDir(path)
        result.push(wiki)
      } catch {
        /* skip */
      }
    }
    return result
  }

  async getTree(): Promise<WikiTreeNode[]> {
    const root: WikiTreeNode[] = []

    const wikiNode: WikiTreeNode = {
      name: 'wiki',
      path: 'wiki',
      type: 'directory',
      children: [],
    }
    const wikis = await this.listThematicWikis()
    wikiNode.children = await Promise.all(
      wikis.map(async (w) => {
        const files = await this.listWikiFiles(w)
        return {
          name: w,
          path: `wiki/${w}`,
          type: 'directory' as const,
          children: files.map((f) => ({
            name: f,
            path: `wiki/${w}/${f}`,
            type: 'file' as const,
          })),
        }
      }),
    )
    // Add indice.md and log.md at wiki root
    wikiNode.children.push({
      name: 'indice.md',
      path: 'wiki/indice.md',
      type: 'file' as const,
    })
    wikiNode.children.push({
      name: 'log.md',
      path: 'wiki/log.md',
      type: 'file' as const,
    })
    root.push(wikiNode)

    const rawNode: WikiTreeNode = {
      name: 'raw',
      path: 'raw',
      type: 'directory',
      children: [],
    }
    const rawDirs = [
      'pdfs',
      'meetings',
      'audio',
      'chat',
      'code',
      'data',
      'other',
    ]
    for (const cat of rawDirs) {
      const catNode: WikiTreeNode = {
        name: cat,
        path: `raw/${cat}`,
        type: 'directory',
        children: [],
      }
      const files = await this.listRawFiles(cat)
      catNode.children = files.map((f) => ({
        name: f,
        path: `raw/${cat}/${f}`,
        type: 'file' as const,
      }))
      if (rawNode.children) rawNode.children.push(catNode)
    }
    root.push(rawNode)

    const queryNode: WikiTreeNode = {
      name: 'query',
      path: 'query',
      type: 'directory',
      children: [],
    }
    const queryDirs = ['plans', 'outputs']
    for (const cat of queryDirs) {
      const catNode: WikiTreeNode = {
        name: cat,
        path: `query/${cat}`,
        type: 'directory',
        children: [],
      }
      const files = await this.listQueryFiles(cat)
      catNode.children = files.map((f) => ({
        name: f,
        path: `query/${cat}/${f}`,
        type: 'file' as const,
      }))
      if (queryNode.children) queryNode.children.push(catNode)
    }
    root.push(queryNode)

    return root
  }

  async appendLog(entry: LogEntry): Promise<void> {
    const logPath = this.resolvePath('log.md')
    const line = `- **${entry.timestamp}** | ${entry.operation} | ${entry.source} — ${entry.description}\n`
    const existing = await this.fileOps.readFile(logPath)
    await this.fileOps.writeFile(logPath, existing + line)
    logger.info(
      'WikiManager',
      `Log entry added: ${entry.operation} ${entry.source}`,
    )
  }

  private async listWikiFiles(wiki: string): Promise<string[]> {
    const path = this.resolvePath(wiki)
    try {
      const entries = await this.fileOps.listDir(path)
      return entries.filter((e) => e.endsWith('.md'))
    } catch {
      return []
    }
  }

  async getLog(): Promise<string> {
    return this.fileOps.readFile(this.resolvePath('log.md'))
  }

  async getIndex(): Promise<string> {
    return this.fileOps.readFile(this.resolvePath('indice.md'))
  }

  async updateIndex(content: string): Promise<void> {
    await this.fileOps.writeFile(this.resolvePath('indice.md'), content)
  }

  async updateThematicWikiIndex(
    wiki: string,
    newEntries: WikiIndexEntry[],
  ): Promise<void> {
    const indexPath = `${wiki}/indice_wiki.md`
    const fullPath = this.resolvePath(indexPath)
    try {
      const existing = await this.fileOps.readFile(fullPath)
      const wi = new WikiIndex()
      wi.fromMarkdown(existing, wiki)
      for (const e of newEntries) {
        wi.addEntry(e)
      }
      const updated = wi.updateThematicSection(existing, wi.getEntries())
      await this.fileOps.writeFile(fullPath, updated)
      logger.info(
        'WikiManager',
        `Updated ${indexPath} with ${newEntries.length} new entries`,
      )
    } catch {
      // File doesn't exist yet — create it with just the Articoli section
      const wi = new WikiIndex()
      for (const e of newEntries) {
        wi.addEntry(e)
      }
      const content = wi.updateThematicSection('', wi.getEntries())
      await this.fileOps.writeFile(fullPath, content)
      logger.info(
        'WikiManager',
        `Created ${indexPath} with ${newEntries.length} entries`,
      )
    }
  }

  async searchIndex(keyword: string): Promise<string[]> {
    const index = await this.getIndex()
    const lines = index.split('\n')
    return lines
      .filter((l) => l.toLowerCase().includes(keyword.toLowerCase()))
      .map((l) => l.replace(/^[-*]\s*\[([^\]]+)\]\(([^)]+)\)/, '$2').trim())
  }

  async readRawFile(category: string, filename: string): Promise<string> {
    return this.fileOps.readFile(this.resolveRaw(`${category}/${filename}`))
  }

  async writeRawFile(
    category: string,
    filename: string,
    content: string,
  ): Promise<void> {
    const path = this.resolveRaw(`${category}/${filename}`)
    await this.fileOps.writeFile(path, content)
    logger.info('WikiManager', `Raw file saved: ${category}/${filename}`)
  }

  async deleteRawFile(category: string, filename: string): Promise<void> {
    const path = this.resolveRaw(`${category}/${filename}`)
    if (this.fileOps.deleteFile) {
      await this.fileOps.deleteFile(path)
    } else {
      await this.fileOps.writeFile(path, '')
    }
  }

  async listRawFiles(category?: string): Promise<string[]> {
    const path = category ? this.resolveRaw(category) : this.resolveRaw('')
    try {
      return await this.fileOps.listDir(path)
    } catch {
      return []
    }
  }

  async getAllRawFiles(): Promise<RawFileInfo[]> {
    const result: RawFileInfo[] = []
    const categories = [
      'pdfs',
      'meetings',
      'audio',
      'chat',
      'code',
      'data',
      'other',
    ]
    for (const cat of categories) {
      const files = await this.listRawFiles(cat)
      for (const f of files) {
        result.push({
          name: f,
          path: `raw/${cat}/${f}`,
          type:
            cat === 'pdfs'
              ? 'pdf'
              : cat === 'meetings'
                ? 'meeting'
                : (cat as RawFileInfo['type']),
          size: 0,
          importedAt: new Date().toISOString(),
          ingested: false,
        })
      }
    }
    return result
  }

  async writeQueryPlan(queryId: string, content: string): Promise<void> {
    const path = this.resolveQuery(`plans/${queryId}.md`)
    await this.fileOps.writeFile(path, content)
  }

  async writeQueryOutput(queryId: string, content: string): Promise<void> {
    const path = this.resolveQuery(`outputs/${queryId}.md`)
    await this.fileOps.writeFile(path, content)
  }

  async readQueryPlan(queryId: string): Promise<string> {
    return this.fileOps.readFile(this.resolveQuery(`plans/${queryId}.md`))
  }

  async readQueryOutput(queryId: string): Promise<string> {
    return this.fileOps.readFile(this.resolveQuery(`outputs/${queryId}.md`))
  }

  async listQueryFiles(category?: string): Promise<string[]> {
    const path = category ? this.resolveQuery(category) : this.resolveQuery('')
    try {
      const entries = await this.fileOps.listDir(path)
      return entries.filter((e) => e.endsWith('.md'))
    } catch {
      return []
    }
  }

  async readFile(path: string): Promise<string> {
    return this.fileOps.readFile(path)
  }

  async clearAll(): Promise<void> {
    const roots = [WIKI_BASE, RAW_BASE, QUERY_BASE]
    for (const root of roots) {
      if (this.fileOps.deleteDir) {
        try {
          await this.fileOps.deleteDir(root, true)
          continue
        } catch {
          /* fall through to per-file deletion */
        }
      }
      try {
        const entries = await this.fileOps.listDir(root)
        for (const entry of entries) {
          const fullPath = `${root}/${entry}`
          if (this.fileOps.deleteFile) {
            await this.fileOps.deleteFile(fullPath)
          }
        }
      } catch {
        /* skip */
      }
    }
    await this.init()
    logger.info('WikiManager', 'All wiki, raw, and query data cleared')
  }

  private parseMeta(content: string, path: string): PageMeta {
    const titleMatch = content.match(/^#\s+(.+)/m)
    const tagsMatch = content.match(/^tags:\s*(.+)$/m)
    const parts = path.split('/')
    const cat = parts.length >= 2 && parts[0] === 'wiki' ? parts[1] : parts[0]
    return {
      title:
        titleMatch?.[1] || path.split('/').pop()?.replace('.md', '') || path,
      path,
      category: cat === 'wiki' ? 'root' : cat,
      created: '',
      updated: new Date().toISOString(),
      tags: tagsMatch?.[1]?.split(',').map((t) => t.trim()) || [],
    }
  }
}
