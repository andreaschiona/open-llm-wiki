import { create } from 'zustand'
import type { LLMProviderConfig } from '../types'
import { ConfigManager } from '../lib/config/configManager'

const GITHUB_TOKEN_KEY = 'open-llm-wiki:github_token'

interface ConfigState {
  configManager: ConfigManager | null
  providers: LLMProviderConfig[]
  activeProviderId: string | null
  initialized: boolean
  githubToken: string
  init: (fileOps: any) => Promise<void>
  addProvider: (provider: LLMProviderConfig) => Promise<void>
  updateProvider: (id: string, updates: Partial<LLMProviderConfig>) => Promise<void>
  removeProvider: (id: string) => Promise<void>
  setActiveProvider: (id: string) => Promise<void>
  getActiveProvider: () => LLMProviderConfig | undefined
  setGitHubToken: (token: string) => void
}

function loadGitHubToken(): string {
  try {
    return localStorage.getItem(GITHUB_TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

function saveGitHubToken(token: string): void {
  try {
    if (token) {
      localStorage.setItem(GITHUB_TOKEN_KEY, token)
    } else {
      localStorage.removeItem(GITHUB_TOKEN_KEY)
    }
  } catch { /* localStorage not available */ }
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  configManager: null,
  providers: [],
  activeProviderId: null,
  initialized: false,
  githubToken: loadGitHubToken(),

  init: async (fileOps) => {
    const cm = new ConfigManager(fileOps)
    await cm.init()
    set({
      configManager: cm,
      providers: cm.getProviders(),
      activeProviderId: cm.getActiveProvider()?.id || null,
      initialized: true,
    })
  },

  addProvider: async (provider) => {
    const cm = get().configManager
    if (!cm) return
    await cm.addProvider(provider)
    set({
      providers: cm.getProviders(),
      activeProviderId: cm.getActiveProvider()?.id || null,
    })
  },

  updateProvider: async (id, updates) => {
    const cm = get().configManager
    if (!cm) return
    await cm.updateProvider(id, updates)
    set({ providers: cm.getProviders() })
  },

  removeProvider: async (id) => {
    const cm = get().configManager
    if (!cm) return
    await cm.removeProvider(id)
    set({
      providers: cm.getProviders(),
      activeProviderId: cm.getActiveProvider()?.id || null,
    })
  },

  setActiveProvider: async (id) => {
    const cm = get().configManager
    if (!cm) return
    await cm.setActiveProvider(id)
    set({ activeProviderId: id })
  },

  getActiveProvider: () => {
    const { providers, activeProviderId } = get()
    return providers.find(p => p.id === activeProviderId)
  },

  setGitHubToken: (token: string) => {
    saveGitHubToken(token)
    set({ githubToken: token })
  },
}))
