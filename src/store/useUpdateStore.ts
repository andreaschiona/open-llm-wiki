import { create } from 'zustand'
import type { UpdateInfo } from '../types'
import { logger } from '../lib/utils/logger'

interface UpdateState {
  updateInfo: UpdateInfo
  checkForUpdates: () => Promise<void>
  downloadAndInstall: () => Promise<void>
  installing: boolean
}

const GITHUB_API =
  'https://api.github.com/repos/andreaschiona/open-llm-wiki/releases/latest'

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !==
      undefined
  )
}

async function getCurrentVersion(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('get_app_version')
  } catch {
    try {
      const resp = await fetch('/VERSION')
      const text = await resp.text()
      const match = text.match(/version=(.+)/)
      if (match) return match[1].trim()
    } catch {
      logger.warn('useUpdateStore', 'Failed to read VERSION file')
    }
    return '0.0.0'
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  updateInfo: {
    currentVersion: '0.0.0',
    latestVersion: null,
    latestUrl: null,
    downloadUrl: null,
    status: 'up-to-date',
  },
  installing: false,

  checkForUpdates: async () => {
    set({
      updateInfo: {
        ...get().updateInfo,
        status: 'checking',
        error: undefined,
      },
    })

    try {
      const currentVersion = await getCurrentVersion()

      set({
        updateInfo: {
          ...get().updateInfo,
          currentVersion,
        },
      })

      if (isTauri()) {
        try {
          const { check } = await import('@tauri-apps/plugin-updater')
          const update = await check()
          if (update) {
            const latestTag = update.version.replace(/^v/, '')
            set({
              updateInfo: {
                currentVersion,
                latestVersion: latestTag,
                latestUrl: null,
                downloadUrl: null,
                status: 'available',
              },
            })
            return
          }
          set({
            updateInfo: {
              currentVersion,
              latestVersion: currentVersion,
              latestUrl: null,
              downloadUrl: null,
              status: 'up-to-date',
            },
          })
          return
        } catch {
          logger.warn(
            'useUpdateStore',
            'Tauri updater check failed, falling back to GitHub API',
          )
        }
      }

      const response = await fetch(GITHUB_API)
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }
      const data = await response.json()
      const latestTag = ((data.tag_name as string) || '').replace(/^v/, '')
      const latestUrl = (data.html_url as string) || ''
      const assets: Array<{ name: string; browser_download_url: string }> =
        data.assets || []
      const downloadUrl =
        assets.length > 0 ? assets[0].browser_download_url : null

      const isNewer =
        latestTag && compareVersions(latestTag, currentVersion) > 0

      set({
        updateInfo: {
          currentVersion,
          latestVersion: latestTag || null,
          latestUrl: latestUrl || null,
          downloadUrl: downloadUrl,
          status: isNewer ? 'available' : 'up-to-date',
        },
      })
    } catch (err) {
      set({
        updateInfo: {
          ...get().updateInfo,
          status: 'error',
          error: err instanceof Error ? err.message : 'Unknown error',
        },
      })
    }
  },

  downloadAndInstall: async () => {
    set({ installing: true })
    try {
      if (isTauri()) {
        try {
          const { check } = await import('@tauri-apps/plugin-updater')
          const update = await check()
          if (update) {
            set({
              updateInfo: {
                ...get().updateInfo,
                status: 'checking',
              },
            })
            await update.downloadAndInstall()
            set({
              updateInfo: {
                ...get().updateInfo,
                status: 'up-to-date',
              },
              installing: false,
            })
            return
          }
        } catch (err) {
          logger.warn(
            'useUpdateStore',
            'Tauri updater install failed, falling back to download',
            err,
          )
        }
      }

      const { updateInfo } = get()
      const url = updateInfo.downloadUrl || updateInfo.latestUrl
      if (url) {
        if (isTauri()) {
          const { open } = await import('@tauri-apps/plugin-shell')
          await open(url)
        } else {
          window.open(url, '_blank')
        }
      }
    } catch (err) {
      logger.error('useUpdateStore', 'Download failed', err)
    } finally {
      set({ installing: false })
    }
  },
}))
