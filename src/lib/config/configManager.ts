import type { LLMProviderConfig } from '../../types'
import { logger } from '../utils/logger'
import { FREE_MODELS } from '../llm/openRouter'

const CONFIG_PATH = 'config/providers.json'

interface FileOps {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  createDir(path: string): Promise<void>
}

export class ConfigManager {
  private providers: LLMProviderConfig[] = []
  private activeProviderId: string | null = null
  private fileOps: FileOps

  constructor(fileOps: FileOps) {
    this.fileOps = fileOps
  }

  async init(): Promise<void> {
    const configDir = 'config'
    if (!(await this.fileOps.fileExists(configDir))) {
      await this.fileOps.createDir(configDir)
    }

    if (await this.fileOps.fileExists(CONFIG_PATH)) {
      try {
        const data = await this.fileOps.readFile(CONFIG_PATH)
        const parsed = JSON.parse(data)
        this.providers = parsed.providers || []
        this.activeProviderId = parsed.activeProviderId || null
      } catch (err) {
        logger.error('ConfigManager', 'Failed to load config', err)
        await this.createDefault()
      }
    } else {
      await this.createDefault()
    }
    logger.info('ConfigManager', `Loaded ${this.providers.length} providers`)
  }

  private async createDefault(): Promise<void> {
    logger.info('ConfigManager', 'Creating default configuration')

    const defaultProvider: LLMProviderConfig = {
      id: 'openrouter-default',
      name: 'OpenRouter Free',
      type: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      apiKey: '',
      defaultModel: FREE_MODELS[0].id,
      models: FREE_MODELS,
      isActive: true,
    }

    this.providers = [defaultProvider]
    this.activeProviderId = defaultProvider.id
    await this.save()
  }

  async save(): Promise<void> {
    const data = JSON.stringify(
      {
        providers: this.providers,
        activeProviderId: this.activeProviderId,
      },
      null,
      2,
    )
    await this.fileOps.writeFile(CONFIG_PATH, data)
  }

  getProviders(): LLMProviderConfig[] {
    return [...this.providers]
  }

  getActiveProvider(): LLMProviderConfig | undefined {
    return this.providers.find((p) => p.id === this.activeProviderId)
  }

  getProvider(id: string): LLMProviderConfig | undefined {
    return this.providers.find((p) => p.id === id)
  }

  async addProvider(provider: LLMProviderConfig): Promise<void> {
    this.providers.push(provider)
    if (this.providers.length === 1) {
      this.activeProviderId = provider.id
    }
    await this.save()
  }

  async updateProvider(
    id: string,
    updates: Partial<LLMProviderConfig>,
  ): Promise<void> {
    const idx = this.providers.findIndex((p) => p.id === id)
    if (idx < 0) throw new Error(`Provider ${id} not found`)
    this.providers[idx] = { ...this.providers[idx], ...updates }
    await this.save()
  }

  async removeProvider(id: string): Promise<void> {
    this.providers = this.providers.filter((p) => p.id !== id)
    if (this.activeProviderId === id) {
      this.activeProviderId = this.providers[0]?.id || null
    }
    await this.save()
  }

  async setActiveProvider(id: string): Promise<void> {
    if (!this.providers.find((p) => p.id === id)) {
      throw new Error(`Provider ${id} not found`)
    }
    this.activeProviderId = id
    await this.save()
  }

  async updateApiKey(providerId: string, apiKey: string): Promise<void> {
    await this.updateProvider(providerId, { apiKey })
  }
}
