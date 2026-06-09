import { OpenAIProvider } from './openai'
import type { LLMModel } from '../../types'

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'

const FREE_MODELS: LLMModel[] = [
  {
    id: 'google/gemini-2.0-flash-exp:free',
    name: 'Gemini 2.0 Flash (free)',
    provider: 'openrouter',
  },
  {
    id: 'meta-llama/llama-3.2-3b-instruct:free',
    name: 'Llama 3.2 3B (free)',
    provider: 'openrouter',
  },
  {
    id: 'mistral/mistral-7b-instruct:free',
    name: 'Mistral 7B (free)',
    provider: 'openrouter',
  },
  {
    id: 'microsoft/phi-3-mini-128k-instruct:free',
    name: 'Phi-3 Mini (free)',
    provider: 'openrouter',
  },
]

export class OpenRouterProvider extends OpenAIProvider {
  readonly id = 'openrouter'
  readonly name = 'OpenRouter'
  readonly type = 'openrouter'

  constructor(config: {
    baseUrl?: string
    apiKey: string
    defaultModel: string
  }) {
    super({
      baseUrl: config.baseUrl || OPENROUTER_BASE_URL,
      apiKey: config.apiKey,
      defaultModel: config.defaultModel || FREE_MODELS[0].id,
    })
  }

  async listModels(): Promise<LLMModel[]> {
    try {
      return await super.listModels()
    } catch {
      return FREE_MODELS
    }
  }
}

export { FREE_MODELS }
