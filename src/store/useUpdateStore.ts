import { create } from 'zustand'
import type { UpdateInfo } from '../types'

interface UpdateState {
  updateInfo: UpdateInfo
  checkForUpdates: () => Promise<void>
}

const GITHUB_API =
  'https://api.github.com/repos/andreaschiona/open-llm-wiki/releases/latest'

async function getCurrentVersion(): Promise<string> {
  try {
    const { invoke } = await import('@tauri-apps/api/core')
    return await invoke<string>('get_app_version')
  } catch {
    return '0.3.11'
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
    currentVersion: '0.3.11',
    latestVersion: null,
    latestUrl: null,
    status: 'up-to-date',
  },

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

      const response = await fetch(GITHUB_API)
      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.status}`)
      }
      const data = await response.json()
      const latestTag = ((data.tag_name as string) || '').replace(/^v/, '')
      const latestUrl = (data.html_url as string) || ''

      const isNewer =
        latestTag && compareVersions(latestTag, currentVersion) > 0

      set({
        updateInfo: {
          currentVersion,
          latestVersion: latestTag || null,
          latestUrl: latestUrl || null,
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
}))
