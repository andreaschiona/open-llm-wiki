import type { LLMProvider, ChatRequest, ChatResponse } from './provider'
import type { LLMModel } from '../../types'

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama'
  readonly name = 'Ollama'
  readonly type = 'ollama'

  private baseUrl: string
  private defaultModel: string

  constructor(config: { baseUrl: string; apiKey?: string; defaultModel: string }) {
    this.baseUrl = (config.baseUrl || 'http://localhost:11434').replace(/\/+$/, '')
    this.defaultModel = config.defaultModel || 'llama3.2'
  }

  private async request(endpoint: string, body: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: request.model || this.defaultModel,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
      },
    }
    const res = await this.request('/api/chat', body)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Ollama API error ${res.status}: ${err}`)
    }
    const data = await res.json()
    return {
      content: data.message?.content || '',
      model: data.model,
    }
  }

  async streamChat(
    request: ChatRequest,
    onChunk: (chunk: string) => void
  ): Promise<ChatResponse> {
    const body = {
      model: request.model || this.defaultModel,
      messages: request.messages.map(m => ({
        role: m.role,
        content: m.content,
      })),
      stream: true,
      options: {
        temperature: request.temperature ?? 0.7,
      },
    }
    const res = await this.request('/api/chat', body)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Ollama API error ${res.status}: ${err}`)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    let fullContent = ''
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const parsed = JSON.parse(line)
          const delta = parsed.message?.content
          if (delta) {
            fullContent += delta
            onChunk(delta)
          }
          if (parsed.done) break
        } catch {
          // skip parse errors
        }
      }
    }

    return {
      content: fullContent,
      model: request.model || this.defaultModel,
    }
  }

  async listModels(): Promise<LLMModel[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`)
      if (!res.ok) return []
      const data = await res.json()
      return (data.models || []).map((m: { name: string }) => ({
        id: m.name,
        name: m.name,
        provider: this.id,
      }))
    } catch {
      return [{ id: this.defaultModel, name: this.defaultModel, provider: this.id }]
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const models = await this.listModels()
      return models.length > 0
    } catch {
      return false
    }
  }
}
