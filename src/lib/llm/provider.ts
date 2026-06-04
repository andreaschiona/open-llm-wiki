import type { LLMModel } from '../../types'

export interface ChatRequest {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[]
  model?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}

export interface ChatResponse {
  content: string
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export interface LLMProvider {
  readonly id: string
  readonly name: string
  readonly type: string

  chat(request: ChatRequest): Promise<ChatResponse>
  streamChat(
    request: ChatRequest,
    onChunk: (chunk: string) => void
  ): Promise<ChatResponse>
  listModels(): Promise<LLMModel[]>
  testConnection(): Promise<boolean>
}

export type ProviderConstructor = new (config: {
  baseUrl: string
  apiKey: string
  defaultModel: string
}) => LLMProvider
