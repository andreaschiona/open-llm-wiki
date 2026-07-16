/**
 * IndexedDB-backed FileOps implementation for browser environments.
 *
 * Provides persistent local storage via IndexedDB, surviving page refreshes.
 * Falls back gracefully when IndexedDB is unavailable (private browsing on
 * some older browsers).
 *
 * Path convention: POSIX-style relative paths, e.g. "wiki/ai-news/article.md"
 * Directory nodes are tracked as paths ending with "/".
 */

import type { FileOps } from '../wiki/wikiManager'

const DB_NAME = 'open-llm-wiki-fs'
const DB_VERSION = 1
const STORE_NAME = 'files'

interface FsEntry {
  path: string
  content: string
  isDirectory: boolean
  updatedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'path' })
        store.createIndex('isDirectory', 'isDirectory', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function normalizeDirPath(path: string): string {
  let p = path.replace(/\/$/, '') // strip trailing slash
  if (p && !p.endsWith('/')) p += '/'
  return p || '/'
}

function parentDir(path: string): string {
  const p = path.replace(/\/$/, '')
  const idx = p.lastIndexOf('/')
  if (idx <= 0) return '/'
  return p.slice(0, idx) + '/'
}

export class IndexedDbFileOps implements FileOps {
  private ready: Promise<IDBDatabase>

  constructor() {
    this.ready = openDb()
  }

  private async withDb<T>(fn: (db: IDBDatabase) => Promise<T>): Promise<T> {
    const db = await this.ready
    return fn(db)
  }

  async readFile(path: string): Promise<string> {
    return this.withDb(async (db) => {
      const entry = await this.getEntry(db, path)
      if (!entry) throw new Error(`File not found: ${path}`)
      if (entry.isDirectory) throw new Error(`Is a directory: ${path}`)
      return entry.content
    })
  }

  async writeFile(path: string, content: string): Promise<void> {
    return this.withDb(async (db) => {
      // Ensure parent directory exists
      const parent = parentDir(path)
      if (parent !== '/') {
        await this.ensureDir(db, parent)
      }

      await this.putEntry(db, {
        path,
        content,
        isDirectory: false,
        updatedAt: Date.now(),
      })
    })
  }

  async listDir(path: string): Promise<string[]> {
    return this.withDb(async (db) => {
      const prefix = normalizeDirPath(path)
      const all = await this.getAllEntries(db)
      const names = new Set<string>()

      for (const entry of all) {
        if (entry.path === prefix || entry.path === path) continue
        // Check if this entry is a direct child of the given path
        if (entry.path.startsWith(prefix)) {
          const rest = entry.path.slice(prefix.length)
          const child = rest.split('/')[0]
          if (child) names.add(child)
        }
      }

      return [...names].sort()
    })
  }

  async createDir(path: string): Promise<void> {
    return this.withDb(async (db) => {
      const dirPath = normalizeDirPath(path)
      const parent = parentDir(dirPath)
      if (parent !== '/') {
        await this.ensureDir(db, parent)
      }
      await this.putEntry(db, {
        path: dirPath,
        content: '',
        isDirectory: true,
        updatedAt: Date.now(),
      })
    })
  }

  async fileExists(path: string): Promise<boolean> {
    return this.withDb(async (db) => {
      const entry = await this.getEntry(db, path)
      return !!entry
    })
  }

  async deleteFile(path: string): Promise<void> {
    return this.withDb(async (db) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(path)
      await txDone(tx)
    })
  }

  async deleteDir(path: string, recursive?: boolean): Promise<void> {
    return this.withDb(async (db) => {
      const dirPath = normalizeDirPath(path)

      // Delete the directory entry itself
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.delete(dirPath)
      await txDone(tx)

      if (recursive) {
        // Delete all entries under this directory
        const all = await this.getAllEntries(db)
        const children = all.filter(
          (e) => e.path.startsWith(dirPath) && e.path !== dirPath,
        )
        if (children.length > 0) {
          const tx2 = db.transaction(STORE_NAME, 'readwrite')
          const store2 = tx2.objectStore(STORE_NAME)
          for (const child of children) {
            store2.delete(child.path)
          }
          await txDone(tx2)
        }
      }
    })
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private getEntry(
    db: IDBDatabase,
    path: string,
  ): Promise<FsEntry | undefined> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(path)
      req.onsuccess = () => resolve(req.result ?? undefined)
      req.onerror = () => reject(req.error)
    })
  }

  private putEntry(db: IDBDatabase, entry: FsEntry): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      store.put(entry)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  private getAllEntries(db: IDBDatabase): Promise<FsEntry[]> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  private async ensureDir(db: IDBDatabase, dirPath: string): Promise<void> {
    const dirKey = normalizeDirPath(dirPath.replace(/\/$/, ''))
    const exists = await this.getEntry(db, dirKey)
    if (!exists) {
      // Recursively ensure parent chain
      const parent = parentDir(dirKey)
      if (parent !== '/') await this.ensureDir(db, parent)
      await this.putEntry(db, {
        path: dirKey,
        content: '',
        isDirectory: true,
        updatedAt: Date.now(),
      })
    }
  }
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

/**
 * Determine if IndexedDB is available in the current environment.
 */
export function isIndexedDbAvailable(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && !!indexedDB
  } catch {
    return false
  }
}
