import { create } from 'zustand'
import { WikiManager, type FileOps } from '../lib/wiki/wikiManager'
import { WikiIndex } from '../lib/wiki/wikiIndex'
import type { WikiPage, WikiTreeNode, WikiIndexEntry } from '../types'

interface WikiState {
  wikiManager: WikiManager | null
  wikiIndex: WikiIndex
  tree: WikiTreeNode[]
  currentPage: WikiPage | null
  currentPath: string | null
  indexContent: string
  logContent: string
  searchResults: WikiIndexEntry[]
  initialized: boolean
  editingPage: string | null
  init: (fileOps: FileOps) => Promise<void>
  navigateToPage: (path: string) => Promise<void>
  refreshTree: () => Promise<void>
  refreshIndex: () => Promise<void>
  refreshLog: () => Promise<void>
  search: (term: string) => Promise<void>
  updatePage: (path: string, content: string) => Promise<void>
  setEditingPage: (path: string | null) => void
}

export const useWikiStore = create<WikiState>((set, get) => ({
  wikiManager: null,
  wikiIndex: new WikiIndex(),
  tree: [],
  currentPage: null,
  currentPath: null,
  indexContent: '',
  logContent: '',
  searchResults: [],
  initialized: false,
  editingPage: null,

  init: async (fileOps) => {
    const wm = new WikiManager(fileOps)
    await wm.init()
    const tree = await wm.getTree()
    const indexContent = await wm.getIndex()
    const logContent = await wm.getLog()
    const wi = new WikiIndex()
    const wikis = await wm.listThematicWikis()
    for (const wiki of wikis) {
      try {
        const content = await wm.readFile(`wiki/${wiki}/indice_wiki.md`)
        wi.addFromMarkdown(content, wiki)
      } catch {
        /* thematic index not yet created */
      }
    }
    set({
      wikiManager: wm,
      wikiIndex: wi,
      tree,
      indexContent,
      logContent,
      initialized: true,
    })
  },

  navigateToPage: async (path) => {
    const wm = get().wikiManager
    if (!wm) return
    const tryPaths = [path]
    if (!path.endsWith('.md')) tryPaths.push(`${path}.md`)
    for (const p of tryPaths) {
      const page = await wm.readPage(p)
      if (page) {
        set({ currentPage: page, currentPath: p, editingPage: null })
        return
      }
    }
    try {
      const content = await wm.readFile(path)
      const title =
        path
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '') || path
      const rawPage: WikiPage = {
        meta: {
          title,
          path,
          category: 'page',
          created: '',
          updated: '',
          tags: [],
        },
        content: `# ${title}\n\n\`\`\`\n${content.slice(0, 10000)}\n\`\`\``,
      }
      set({ currentPage: rawPage, currentPath: path, editingPage: null })
    } catch {
      set({ currentPage: null, currentPath: path, editingPage: null })
    }
  },

  refreshTree: async () => {
    const wm = get().wikiManager
    if (!wm) return
    const tree = await wm.getTree()
    set({ tree })
  },

  refreshIndex: async () => {
    const wm = get().wikiManager
    if (!wm) return
    const indexContent = await wm.getIndex()
    const wi = new WikiIndex()
    const wikis = await wm.listThematicWikis()
    for (const wiki of wikis) {
      try {
        const content = await wm.readFile(`wiki/${wiki}/indice_wiki.md`)
        wi.addFromMarkdown(content, wiki)
      } catch {
        /* thematic index not yet created */
      }
    }
    set({ indexContent, wikiIndex: wi })
  },

  refreshLog: async () => {
    const wm = get().wikiManager
    if (!wm) return
    const logContent = await wm.getLog()
    set({ logContent })
  },

  search: async (term) => {
    const wi = get().wikiIndex
    const results = wi.search(term)
    set({ searchResults: results })
  },

  updatePage: async (path, content) => {
    const wm = get().wikiManager
    if (!wm) return
    await wm.writePage(path, content)
    // Refresh the current page display
    const page = await wm.readPage(path)
    set({ currentPage: page, currentPath: path, editingPage: null })
    // Refresh tree and index to reflect changes
    get().refreshTree()
    get().refreshIndex()
  },

  setEditingPage: (path) => {
    set({ editingPage: path })
  },
}))
