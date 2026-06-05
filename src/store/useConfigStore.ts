import { create } from 'zustand'
import type { LLMProviderConfig } from '../types'
import { ConfigManager } from '../lib/config/configManager'

interface ConfigState {
  configManager: ConfigManager | null
  providers: LLMProviderConfig[]
  activeProviderId: string | null
  initialized: boolean
  init: (fileOps: any) => Promise<void>
  addProvider: (provider: LLMProviderConfig) => Promise<void>
  updateProvider: (id: string, updates: Partial<LLMProviderConfig>) => Promise<void>
  removeProvider: (id: string) => Promise<void>
  setActiveProvider: (id: string) => Promise<void>
  getActiveProvider: () => LLMProviderConfig | undefined
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  configManager: null,
  providers: [],
  activeProviderId: null,
  initialized: false,

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
}))
