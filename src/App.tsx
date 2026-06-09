import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { WikiBrowser } from './components/WikiBrowser'
import { ChatInterface } from './components/ChatInterface'
import { IngestionPanel } from './components/IngestionPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useWikiStore } from './store/useWikiStore'
import { useConfigStore } from './store/useConfigStore'
import { useUpdateStore } from './store/useUpdateStore'
import type { AppView } from './types'
import './App.css'
import './components/Sidebar.css'

const memStore = new Map<string, string>()
const memDirs = new Set<string>([
  'wiki',
  'wiki/ai-news',
  'wiki/strumenti-ai',
  'wiki/concetti',
  'raw',
  'raw/pdfs',
  'raw/meetings',
  'raw/audio',
  'raw/chat',
  'raw/code',
  'raw/data',
  'raw/other',
  'query',
  'query/plans',
  'query/outputs',
])

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !==
      undefined
  )
}

const fileOps = {
  readFile: async (path: string): Promise<string> => {
    if (isTauri()) {
      try {
        const { readTextFile, BaseDirectory } =
          await import('@tauri-apps/plugin-fs')
        return await readTextFile(path, { baseDir: BaseDirectory.AppData })
      } catch {}
    }
    return memStore.get(path) ?? ''
  },
  writeFile: async (path: string, content: string): Promise<void> => {
    if (isTauri()) {
      try {
        const { writeTextFile, BaseDirectory } =
          await import('@tauri-apps/plugin-fs')
        await writeTextFile(path, content, { baseDir: BaseDirectory.AppData })
        return
      } catch {}
    }
    memStore.set(path, content)
  },
  listDir: async (path: string): Promise<string[]> => {
    if (isTauri()) {
      try {
        const { readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs')
        const entries = await readDir(path, { baseDir: BaseDirectory.AppData })
        return entries.map((e) => e.name)
      } catch {}
    }
    const prefix = path.endsWith('/') ? path : path + '/'
    const names = new Set<string>()
    for (const key of memStore.keys()) {
      if (key.startsWith(prefix)) {
        const rest = key.slice(prefix.length)
        const name = rest.split('/')[0]
        if (name) names.add(name)
      }
    }
    return [...names].filter((n) => n.endsWith('.md'))
  },
  createDir: async (path: string): Promise<void> => {
    if (isTauri()) {
      try {
        const { mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs')
        await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true })
        return
      } catch {}
    }
    memDirs.add(path)
  },
  fileExists: async (path: string): Promise<boolean> => {
    if (isTauri()) {
      try {
        const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
        return await exists(path, { baseDir: BaseDirectory.AppData })
      } catch {}
    }
    return memStore.has(path) || memDirs.has(path)
  },
  deleteFile: async (path: string): Promise<void> => {
    if (isTauri()) {
      try {
        const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs')
        await remove(path, { baseDir: BaseDirectory.AppData })
        return
      } catch {}
    }
    memStore.delete(path)
  },
  deleteDir: async (path: string, recursive?: boolean): Promise<void> => {
    if (isTauri()) {
      const { remove, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      try {
        await remove(path, {
          baseDir: BaseDirectory.AppData,
          recursive: recursive ?? false,
        })
      } catch {
        if (recursive) {
          const { readDir } = await import('@tauri-apps/plugin-fs')
          const entries = await readDir(path, {
            baseDir: BaseDirectory.AppData,
          })
          for (const entry of entries) {
            const childPath = `${path}/${entry.name}`
            if (entry.isDirectory) {
              await remove(childPath, {
                baseDir: BaseDirectory.AppData,
                recursive: true,
              })
            } else {
              await remove(childPath, { baseDir: BaseDirectory.AppData })
            }
          }
          await remove(path, { baseDir: BaseDirectory.AppData })
        }
      }
      return
    }
    memDirs.delete(path)
    const prefix = path.endsWith('/') ? path : path + '/'
    for (const key of [...memStore.keys()]) {
      if (key.startsWith(prefix)) {
        memStore.delete(key)
      }
    }
  },
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('wiki')
  const initWiki = useWikiStore((s) => s.init)
  const initConfig = useConfigStore((s) => s.init)
  const wikiInitialized = useWikiStore((s) => s.initialized)
  const configInitialized = useConfigStore((s) => s.initialized)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)

  useEffect(() => {
    initWiki(fileOps)
    initConfig(fileOps)
  }, [initWiki, initConfig])

  useEffect(() => {
    if (wikiInitialized && configInitialized) {
      const timer = setTimeout(() => checkForUpdates(), 3000)
      return () => clearTimeout(timer)
    }
  }, [wikiInitialized, configInitialized, checkForUpdates])

  const renderView = () => {
    if (!wikiInitialized || !configInitialized) {
      return (
        <div className="loading-screen">
          <div className="spinner" />
          <p>Initializing LLM Wiki...</p>
        </div>
      )
    }
    switch (activeView) {
      case 'wiki':
        return <WikiBrowser />
      case 'chat':
        return <ChatInterface />
      case 'ingestion':
        return <IngestionPanel />
      case 'settings':
        return <SettingsPanel />
      default:
        return <WikiBrowser />
    }
  }

  return (
    <div className="app-container">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <main className="main-content">{renderView()}</main>
    </div>
  )
}
