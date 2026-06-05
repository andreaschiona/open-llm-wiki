import type { LLMProvider } from './provider'
import type { LLMProviderConfig } from '../../types'
import { OpenAIProvider } from './openai'
import { OllamaProvider } from './ollama'
import { OpenRouterProvider } from './openRouter'

export function createProvider(config: LLMProviderConfig): LLMProvider {
  switch (config.type) {
    case 'openai':
      return new OpenAIProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultModel: config.defaultModel,
      })
    case 'ollama':
      return new OllamaProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultModel: config.defaultModel,
      })
    case 'openrouter':
      return new OpenRouterProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        defaultModel: config.defaultModel,
      })
    case 'gemini':
      return new OpenAIProvider({
        baseUrl: config.baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai',
        apiKey: config.apiKey,
        defaultModel: config.defaultModel || 'gemini-2.0-flash',
      })
    default:
      throw new Error(`Unknown provider type: ${config.type}`)
  }
}
