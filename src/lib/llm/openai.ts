import type { LLMProvider, ChatRequest, ChatResponse } from './provider'
import type { LLMModel } from '../../types'

export class OpenAIProvider implements LLMProvider {
  readonly id: string = 'openai'
  readonly name: string = 'OpenAI Compatible'
  readonly type: string = 'openai'

  private baseUrl: string
  private apiKey: string
  private defaultModel: string

  constructor(config: { baseUrl: string; apiKey: string; defaultModel: string }) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '')
    this.apiKey = config.apiKey
    this.defaultModel = config.defaultModel || 'gpt-4o-mini'
  }

  private async request(endpoint: string, body: unknown): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: request.model || this.defaultModel,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      stream: false,
    }
    const res = await this.request('/chat/completions', body)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
    }
    const data = await res.json()
    if (!data.choices?.[0]?.message?.content) {
      const snippet = JSON.stringify(data).slice(0, 200)
      throw new Error(`OpenAI API returned unexpected response — missing choices[0].message.content: ${snippet}`)
    }
    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : undefined,
    }
  }

  async streamChat(
    request: ChatRequest,
    onChunk: (chunk: string) => void
  ): Promise<ChatResponse> {
    const body = {
      model: request.model || this.defaultModel,
      messages: request.messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 2048,
      stream: true,
    }
    const res = await this.request('/chat/completions', body)
    if (!res.ok) {
      const err = await res.text()
      throw new Error(`OpenAI API error ${res.status}: ${err}`)
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
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue
        const data = trimmed.slice(6)
        if (data === '[DONE]') continue
        try {
          const parsed = JSON.parse(data)
          const delta = parsed.choices?.[0]?.delta?.content
          if (delta) {
            fullContent += delta
            onChunk(delta)
          }
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
      const url = `${this.baseUrl}/models`
      const headers: Record<string, string> = {}
      if (this.apiKey) headers['Authorization'] = `Bearer ${this.apiKey}`
      const res = await fetch(url, { headers })
      if (!res.ok) return []
      const data = await res.json()
      return (data.data || []).map((m: { id: string }) => ({
        id: m.id,
        name: m.id,
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
