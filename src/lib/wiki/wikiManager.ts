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

  async init(): Promise<void> {
    if (!(await this.fileOps.fileExists(this.basePath))) {
      await this.fileOps.createDir(this.basePath)
    }
    if (!(await this.fileOps.fileExists(RAW_BASE))) {
      await this.fileOps.createDir(RAW_BASE)
    }
    if (!(await this.fileOps.fileExists(QUERY_BASE))) {
      await this.fileOps.createDir(QUERY_BASE)
    }

    const existing = await this.scanWikiCategories()
    if (existing.length === 0) {
      const defaults = ['ai-news', 'strumenti-ai', 'concetti']
      for (const dir of defaults) {
        const fullPath = this.resolvePath(dir)
        await this.fileOps.createDir(fullPath)
        logger.info('WikiManager', `Created thematic wiki: ${fullPath}`)
      }
    }

    const rawDirs = ['pdfs', 'meetings', 'audio', 'chat', 'code', 'data', 'other']
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
      await this.fileOps.writeFile(indiceMd, await this.generateInitialIndex())
    }
    const logMd = this.resolvePath('log.md')
    if (!(await this.fileOps.fileExists(logMd))) {
      await this.fileOps.writeFile(logMd, '# Wiki Log\n\n')
    }
    await this.updateMainIndex()
    logger.info('WikiManager', 'Wiki initialized with thematic wiki structure')
  }

  private async generateInitialIndex(): Promise<string> {
    const wikis = await this.scanWikiCategories()
    const sections = wikis.length > 0
      ? wikis.map((w) => {
          const label = w
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
          return `### [${label}](${w}/indice_wiki.md)\n_Ancora nessun articolo. Usa \`ingest\` per aggiungere contenuti._`
        }).join('\n\n')
      : '_Nessuna wiki tematica. Crea una categoria dalle impostazioni._'
    return `# Wiki Index

Ultimo aggiornamento: ${new Date().toISOString().split('T')[0]} — **0 articoli**

## Wiki tematiche

${sections}

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
    if (!this.fileOps.deleteFile) {
      throw new Error(
        'deletePage: FileOps.deleteFile non disponibile. ' +
          'La cancellazione richiede un backend Tauri.',
      )
    }
    await this.fileOps.deleteFile(fullPath)
    logger.info('WikiManager', `Deleted page: ${path}`)
  }

  async listPages(): Promise<string[]> {
    const all: string[] = []
    const wikis = await this.scanWikiCategories()
    for (const wiki of wikis) {
      const files = await this.listWikiFiles(wiki)
      for (const f of files) {
        if (f !== 'indice_wiki.md') {
          all.push(`${wiki}/${f}`)
        }
      }
    }
    return all
  }

  async listAllWikiFiles(): Promise<string[]> {
    const all: string[] = []
    const wikis = await this.scanWikiCategories()
    for (const wiki of wikis) {
      const files = await this.listWikiFiles(wiki)
      for (const f of files) {
        all.push(`${wiki}/${f}`)
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
    return this.scanWikiCategories()
  }

  async getTree(): Promise<WikiTreeNode[]> {
    const wikiNode = await this.buildDirTree(this.basePath, 'wiki')
    return [wikiNode]
  }

  private async buildDirTree(dirPath: string, displayPath: string): Promise<WikiTreeNode | null> {
    const name = dirPath.split('/').pop() || dirPath
    const node: WikiTreeNode = {
      name,
      path: displayPath,
      type: 'directory',
      children: [],
    }
    try {
      const entries = await this.fileOps.listDir(dirPath)
      for (const entry of entries.sort()) {
        const fullPath = `${dirPath}/${entry}`
        const childDisplayPath = `${displayPath}/${entry}`
        try {
          await this.fileOps.listDir(fullPath)
          const childNode = await this.buildDirTree(fullPath, childDisplayPath)
          if (childNode) {
            node.children!.push(childNode)
          }
        } catch {
          // file
          node.children!.push({
            name: entry,
            path: childDisplayPath,
            type: 'file',
          })
        }
      }
    } catch {
      /* directory doesn't exist */
    }
    // Skip empty directories and internal non-md files
    if (node.type === 'directory' && node.children!.length === 0) {
      return null
    }
    return node
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

  async updateMainIndex(): Promise<void> {
    const indexPath = this.resolvePath('indice.md')
    try {
      const sections: string[] = []
      let totalArticles = 0
      const wikis = await this.scanWikiCategories()

      for (const wiki of wikis) {
        const files = await this.listWikiFiles(wiki)
        const articles = files.filter((f) => f !== 'indice_wiki.md')
        if (articles.length === 0) {
          const label = wiki
            .replace(/-/g, ' ')
            .replace(/\b\w/g, (c) => c.toUpperCase())
          sections.push(
            `### [${label}](${wiki}/indice_wiki.md)\n\n_Nessun articolo in questa sezione._`,
          )
          continue
        }

        const label = wiki
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())

        const articleLines: string[] = []
        for (const article of articles) {
          const pagePath = `${wiki}/${article}`
          const page = await this.readPage(pagePath)
          const displayName = article.replace('.md', '')
          const summary = page
            ? page.content
                .split('\n')
                .slice(1)
                .find((l) => l.trim().length > 0 && !l.startsWith('#'))
                ?.replace(/^>\s*/, '')
                ?.trim() || ''
            : ''
          articleLines.push(
            `- [${displayName}](${pagePath})${summary ? `: ${summary.slice(0, 120)}` : ''}`,
          )
          totalArticles++
        }

        sections.push(
          `### [${label}](${wiki}/indice_wiki.md)\n\n${articleLines.join('\n')}`,
        )
      }

      const today = new Date().toISOString().split('T')[0]
      const content = `# Wiki Index

Ultimo aggiornamento: ${today} — **${totalArticles} articoli** in ${sections.length} sezioni

## Wiki tematiche

${sections.join('\n\n')}

---

*Usa \`ingest\` per aggiungere nuovi contenuti.*
`
      await this.fileOps.writeFile(indexPath, content)
    } catch (err) {
      logger.warn('WikiManager', 'updateMainIndex fallback to initial', err)
      await this.fileOps.writeFile(indexPath, await this.generateInitialIndex())
    }
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
      // File doesn't exist yet — create it with dynamic sections
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
    if (!this.fileOps.deleteFile) {
      throw new Error(
        'deleteRawFile: FileOps.deleteFile non disponibile. ' +
          'La cancellazione richiede un backend Tauri.',
      )
    }
    await this.fileOps.deleteFile(path)
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
    const categories = await this.scanRawCategories()
    for (const cat of categories) {
      const files = await this.listRawFiles(cat)
      for (const f of files) {
        result.push({
          name: f,
          path: `raw/${cat}/${f}`,
          type: this.inferRawType(cat),
          size: 0,
          importedAt: new Date().toISOString(),
          ingested: false,
        })
      }
    }
    return result
  }

  async scanWikiCategories(): Promise<string[]> {
    try {
      const entries = await this.fileOps.listDir(this.basePath)
      const categories: string[] = []
      for (const entry of entries) {
        if (entry === 'indice.md' || entry === 'log.md') continue
        try {
          await this.fileOps.listDir(this.resolvePath(entry))
          categories.push(entry)
        } catch {
          /* not a directory */
        }
      }
      return categories.sort()
    } catch {
      return []
    }
  }

  async scanRawCategories(): Promise<string[]> {
    try {
      const entries = await this.fileOps.listDir(RAW_BASE)
      const categories: string[] = []
      for (const entry of entries) {
        try {
          await this.fileOps.listDir(this.resolveRaw(entry))
          categories.push(entry)
        } catch {
          /* not a directory */
        }
      }
      return categories.sort()
    } catch {
      return []
    }
  }

  async scanQueryCategories(): Promise<string[]> {
    try {
      const entries = await this.fileOps.listDir(QUERY_BASE)
      const categories: string[] = []
      for (const entry of entries) {
        try {
          await this.fileOps.listDir(this.resolveQuery(entry))
          categories.push(entry)
        } catch {
          /* not a directory */
        }
      }
      return categories.sort()
    } catch {
      return []
    }
  }

  async createWikiCategory(name: string): Promise<void> {
    const fullPath = this.resolvePath(name)
    if (await this.fileOps.fileExists(fullPath)) return
    await this.fileOps.createDir(fullPath)
    logger.info('WikiManager', `Created wiki category: ${name}`)
  }

  async deleteWikiCategory(name: string): Promise<void> {
    const fullPath = this.resolvePath(name)
    if (!(await this.fileOps.fileExists(fullPath))) return
    if (this.fileOps.deleteDir) {
      await this.fileOps.deleteDir(fullPath, true)
    }
    logger.info('WikiManager', `Deleted wiki category: ${name}`)
  }

  private inferRawType(category: string): RawFileInfo['type'] {
    switch (category) {
      case 'pdfs': return 'pdf'
      case 'meetings': return 'meeting'
      case 'audio': return 'audio'
      case 'chat': return 'chat'
      case 'code': return 'code'
      case 'data': return 'data'
      default: return 'other'
    }
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
        await this.deleteDirRecursive(root)
      } catch {
        /* skip */
      }
    }
    await this.init()
    logger.info('WikiManager', 'All wiki, raw, and query data cleared')
  }

  /**
   * Recursively delete all files and directories under the given path.
   * Used as a fallback when FileOps.deleteDir is not available.
   */
  private async deleteDirRecursive(dir: string): Promise<void> {
    const entries = await this.fileOps.listDir(dir)
    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`
      try {
        // Try as file first
        if (this.fileOps.deleteFile) {
          await this.fileOps.deleteFile(fullPath)
        }
      } catch {
        // Not a file, try as subdirectory
        await this.deleteDirRecursive(fullPath)
      }
    }
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
