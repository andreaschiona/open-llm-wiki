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

const fileOps = {
  readFile: async (path: string): Promise<string> => {
    try {
      const { readTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      return await readTextFile(path, { baseDir: BaseDirectory.AppData })
    } catch {
      try {
        const res = await fetch(`/static/${path}`)
        if (res.ok) return await res.text()
      } catch {}
      return ''
    }
  },
  writeFile: async (path: string, content: string): Promise<void> => {
    try {
      const { writeTextFile, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      await writeTextFile(path, content, { baseDir: BaseDirectory.AppData })
    } catch (e) {
      console.warn('File write error:', e)
    }
  },
  listDir: async (path: string): Promise<string[]> => {
    try {
      const { readDir, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      const entries = await readDir(path, { baseDir: BaseDirectory.AppData })
      return entries.map(e => e.name)
    } catch {
      return []
    }
  },
  createDir: async (path: string): Promise<void> => {
    try {
      const { mkdir, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      await mkdir(path, { baseDir: BaseDirectory.AppData, recursive: true })
    } catch {
      console.warn('Directory creation not available')
    }
  },
  fileExists: async (path: string): Promise<boolean> => {
    try {
      const { exists, BaseDirectory } = await import('@tauri-apps/plugin-fs')
      return await exists(path, { baseDir: BaseDirectory.AppData })
    } catch {
      return false
    }
  },
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>('wiki')
  const initWiki = useWikiStore(s => s.init)
  const initConfig = useConfigStore(s => s.init)
  const wikiInitialized = useWikiStore(s => s.initialized)
  const configInitialized = useConfigStore(s => s.initialized)
  const checkForUpdates = useUpdateStore(s => s.checkForUpdates)

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
      <main className="main-content">
        {renderView()}
      </main>
    </div>
  )
}
