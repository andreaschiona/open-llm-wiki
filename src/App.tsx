import { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { WikiBrowser } from './components/WikiBrowser'
import { ChatInterface } from './components/ChatInterface'
import { IngestionPanel } from './components/IngestionPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { useWikiStore } from './store/useWikiStore'
import { useConfigStore } from './store/useConfigStore'
import { useUpdateStore } from './store/useUpdateStore'
import { logger } from './lib/utils/logger'
import {
  IndexedDbFileOps,
  isIndexedDbAvailable,
} from './lib/fileOps/indexedDbFileOps'
import type { AppView } from './types'
import type { FileOps } from './lib/wiki/wikiManager'
import './App.css'
import './components/Sidebar.css'

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !==
      undefined
  )
}

function tauriOptions() {
  const workDir = useConfigStore.getState().workDir
  if (workDir) return { baseDir: undefined, pathPrefix: workDir } as const
  return { baseDir: 'AppData' as const, pathPrefix: '' } as const
}

function tauriPath(path: string): string {
  const opts = tauriOptions()
  return opts.pathPrefix ? `${opts.pathPrefix}/${path}` : path
}

/**
 * Build the default FileOps implementation for the current environment.
 *
 * Priority:
 * 1. Tauri (full native filesystem via @tauri-apps/plugin-fs)
 * 2. IndexedDB (persistent browser storage — survives refresh)
 * 3. In-memory fallback (ephemeral, last resort)
 */
function createFileOps(): FileOps {
  // Shared IndexedDB backend used by non-Tauri paths
  const indexedDb =
    typeof window !== 'undefined' && isIndexedDbAvailable()
      ? new IndexedDbFileOps()
      : null

  return {
    readFile: async (path: string): Promise<string> => {
      if (isTauri()) {
        try {
          const { readTextFile, BaseDirectory } =
            await import('@tauri-apps/plugin-fs')
          const opts = tauriOptions()
          if (opts.pathPrefix) {
            return await readTextFile(tauriPath(path))
          }
          return await readTextFile(path, { baseDir: BaseDirectory.AppData })
        } catch {
          logger.warn('fileOps.readFile', `Tauri readFile failed for ${path}`)
        }
      }
      if (indexedDb) return indexedDb.readFile(path)
      return ''
    },

    writeFile: async (path: string, content: string): Promise<void> => {
      if (isTauri()) {
        try {
          const { writeTextFile, BaseDirectory } =
            await import('@tauri-apps/plugin-fs')
          const opts = tauriOptions()
          if (opts.pathPrefix) {
            await writeTextFile(tauriPath(path), content)
          } else {
            await writeTextFile(path, content, {
              baseDir: BaseDirectory.AppData,
            })
          }
          return
        } catch {
          logger.warn(
            'fileOps.writeFile',
            `Tauri writeFile failed for ${path}`,
          )
        }
      }
      if (indexedDb) await indexedDb.writeFile(path, content)
    },

    listDir: async (path: string): Promise<string[]> => {
      if (isTauri()) {
        try {
          const { readDir, BaseDirectory } = await import(
            '@tauri-apps/plugin-fs'
          )
          const opts = tauriOptions()
          const entries = opts.pathPrefix
            ? await readDir(tauriPath(path))
            : await readDir(path, { baseDir: BaseDirectory.AppData })
          return entries.map((e) => e.name)
        } catch {
          logger.warn('fileOps.listDir', `Tauri listDir failed for ${path}`)
        }
      }
      if (indexedDb) return indexedDb.listDir(path)
      return []
    },

    createDir: async (path: string): Promise<void> => {
      if (isTauri()) {
        try {
          const { mkdir, BaseDirectory } = await import(
            '@tauri-apps/plugin-fs'
          )
          const opts = tauriOptions()
          if (opts.pathPrefix) {
            await mkdir(tauriPath(path), { recursive: true })
          } else {
            await mkdir(path, {
              baseDir: BaseDirectory.AppData,
              recursive: true,
            })
          }
          return
        } catch {
          logger.warn(
            'fileOps.createDir',
            `Tauri mkdir failed for ${path}`,
          )
        }
      }
      if (indexedDb) await indexedDb.createDir(path)
    },

    fileExists: async (path: string): Promise<boolean> => {
      if (isTauri()) {
        try {
          const { exists, BaseDirectory } = await import(
            '@tauri-apps/plugin-fs'
          )
          const opts = tauriOptions()
          if (opts.pathPrefix) {
            return await exists(tauriPath(path))
          }
          return await exists(path, { baseDir: BaseDirectory.AppData })
        } catch {
          logger.warn(
            'fileOps.fileExists',
            `Tauri fileExists failed for ${path}`,
          )
        }
      }
      if (indexedDb) return indexedDb.fileExists(path)
      return false
    },

    deleteFile: async (path: string): Promise<void> => {
      if (isTauri()) {
        try {
          const { remove, BaseDirectory } = await import(
            '@tauri-apps/plugin-fs'
          )
          const opts = tauriOptions()
          if (opts.pathPrefix) {
            await remove(tauriPath(path))
          } else {
            await remove(path, { baseDir: BaseDirectory.AppData })
          }
          return
        } catch {
          logger.warn(
            'fileOps.deleteFile',
            `Tauri remove failed for ${path}`,
          )
        }
      }
      if (indexedDb) await indexedDb.deleteFile(path)
    },

    deleteDir: async (
      path: string,
      recursive?: boolean,
    ): Promise<void> => {
      if (isTauri()) {
        const { remove, BaseDirectory } = await import(
          '@tauri-apps/plugin-fs'
        )
        const opts = tauriOptions()
        const fullPath = tauriPath(path)
        try {
          if (opts.pathPrefix) {
            await remove(fullPath, { recursive: recursive ?? false })
          } else {
            await remove(path, {
              baseDir: BaseDirectory.AppData,
              recursive: recursive ?? false,
            })
          }
        } catch {
          logger.warn(
            'fileOps.deleteDir',
            `Tauri remove failed for ${path}, trying recursive fallback`,
          )
          if (recursive) {
            const { readDir } = await import('@tauri-apps/plugin-fs')
            try {
              const entries = opts.pathPrefix
                ? await readDir(fullPath)
                : await readDir(path, { baseDir: BaseDirectory.AppData })
              for (const entry of entries) {
                const childPath = `${path}/${entry.name}`
                const childFull = `${fullPath}/${entry.name}`
                if (entry.isDirectory) {
                  if (opts.pathPrefix) {
                    await remove(childFull, { recursive: true })
                  } else {
                    await remove(childPath, {
                      baseDir: BaseDirectory.AppData,
                      recursive: true,
                    })
                  }
                } else {
                  if (opts.pathPrefix) {
                    await remove(childFull)
                  } else {
                    await remove(childPath, {
                      baseDir: BaseDirectory.AppData,
                    })
                  }
                }
              }
              if (opts.pathPrefix) {
                await remove(fullPath)
              } else {
                await remove(path, { baseDir: BaseDirectory.AppData })
              }
            } catch {
              logger.warn(
                'fileOps.deleteDir',
                `Tauri recursive delete failed for ${path}`,
              )
            }
          }
        }
        return
      }
      if (indexedDb) await indexedDb.deleteDir(path, recursive)
    },
  }
}

const fileOps = createFileOps()

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
