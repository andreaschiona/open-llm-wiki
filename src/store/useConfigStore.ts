import { create } from 'zustand'
import type { LLMProviderConfig, RoutingRule } from '../types'
import { ConfigManager } from '../lib/config/configManager'
import { logger } from '../lib/utils/logger'
import type { FileOps } from '../lib/wiki/wikiManager'

const GITHUB_TOKEN_KEY = 'open-llm-wiki:github_token'
const WORK_DIR_KEY = 'open-llm-wiki:work_dir'

interface ConfigState {
  configManager: ConfigManager | null
  providers: LLMProviderConfig[]
  activeProviderId: string | null
  initialized: boolean
  githubToken: string
  workDir: string
  thematicCategories: string[]
  routingRules: RoutingRule[]
  init: (fileOps: FileOps) => Promise<void>
  addProvider: (provider: LLMProviderConfig) => Promise<void>
  updateProvider: (
    id: string,
    updates: Partial<LLMProviderConfig>,
  ) => Promise<void>
  removeProvider: (id: string) => Promise<void>
  setActiveProvider: (id: string) => Promise<void>
  getActiveProvider: () => LLMProviderConfig | undefined
  setGitHubToken: (token: string) => Promise<void>
  setWorkDir: (dir: string) => Promise<void>
  setThematicCategories: (categories: string[]) => Promise<void>
  addThematicCategory: (name: string) => Promise<void>
  removeThematicCategory: (name: string) => Promise<void>
  setRoutingRules: (rules: RoutingRule[]) => Promise<void>
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
  } catch {
    /* localStorage not available */
  }
}

function loadWorkDir(): string {
  try {
    return localStorage.getItem(WORK_DIR_KEY) || ''
  } catch {
    return ''
  }
}

function saveWorkDir(dir: string): void {
  try {
    if (dir) {
      localStorage.setItem(WORK_DIR_KEY, dir)
    } else {
      localStorage.removeItem(WORK_DIR_KEY)
    }
  } catch {
    /* localStorage not available */
  }
}

export const useConfigStore = create<ConfigState>((set, get) => ({
  configManager: null,
  providers: [],
  activeProviderId: null,
  initialized: false,
  githubToken: '',
  workDir: '',
  thematicCategories: ['ai-news', 'strumenti-ai', 'concetti'],
  routingRules: [],

  init: async (fileOps) => {
    const cm = new ConfigManager(fileOps)
    await cm.init()
    // Prefer filesystem config, fall back to localStorage for backward compat
    const token = cm.getGitHubToken() || loadGitHubToken()
    const dir = cm.getWorkDir() || loadWorkDir()
    set({
      configManager: cm,
      providers: cm.getProviders(),
      activeProviderId: cm.getActiveProvider()?.id || null,
      githubToken: token,
      workDir: dir,
      thematicCategories: cm.getThematicCategories(),
      routingRules: cm.getRoutingRules(),
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
    return providers.find((p) => p.id === activeProviderId)
  },

  setGitHubToken: async (token: string) => {
    if (token) {
      logger.warn(
        'useConfigStore',
        'GitHub token salvato in localStorage (non sicuro per produzione)',
      )
    }
    const cm = get().configManager
    if (cm) {
      await cm.setGitHubToken(token)
    }
    saveGitHubToken(token)
    set({ githubToken: token })
  },

  setWorkDir: async (dir: string) => {
    const cm = get().configManager
    if (cm) {
      await cm.setWorkDir(dir)
    }
    saveWorkDir(dir)
    set({ workDir: dir })
  },

  setThematicCategories: async (categories: string[]) => {
    const cm = get().configManager
    if (cm) {
      await cm.setThematicCategories(categories)
    }
    set({ thematicCategories: [...categories] })
  },

  addThematicCategory: async (name: string) => {
    const cm = get().configManager
    if (!cm) return
    const categories = cm.getThematicCategories()
    if (categories.includes(name)) return
    await cm.setThematicCategories([...categories, name])
    set({ thematicCategories: cm.getThematicCategories() })
  },

  removeThematicCategory: async (name: string) => {
    const cm = get().configManager
    if (!cm) return
    const categories = cm.getThematicCategories().filter((c) => c !== name)
    await cm.setThematicCategories(categories)
    set({ thematicCategories: cm.getThematicCategories() })
  },

  setRoutingRules: async (rules: RoutingRule[]) => {
    const cm = get().configManager
    if (cm) {
      await cm.setRoutingRules(rules)
    }
    set({ routingRules: rules.map((r) => ({ ...r })) })
  },
}))
