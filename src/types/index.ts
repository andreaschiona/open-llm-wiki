export interface PageMeta {
  title: string
  path: string
  category: 'entity' | 'concept' | 'summary' | 'query'
  created: string
  updated: string
  tags: string[]
  source?: string
}

export interface WikiPage {
  meta: PageMeta
  content: string
}

export interface LogEntry {
  timestamp: string
  operation: 'ingest' | 'create' | 'update' | 'delete' | 'query'
  source: string
  description: string
  pagesAffected: string[]
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  citations?: string[]
  timestamp: string
}

export interface LLMModel {
  id: string
  name: string
  provider: string
}

export interface LLMProviderConfig {
  id: string
  name: string
  type: 'openai' | 'ollama' | 'openrouter' | 'gemini'
  baseUrl: string
  apiKey: string
  defaultModel: string
  models: LLMModel[]
  isActive: boolean
}

export interface IngestionTask {
  id: string
  type: 'url' | 'pdf' | 'file'
  source: string
  status: 'pending' | 'downloading' | 'analyzing' | 'updating' | 'done' | 'error'
  progress: number
  progressLabel: string
  error?: string
  createdAt: string
}

export interface WikiTreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: WikiTreeNode[]
}

export type AppView = 'wiki' | 'chat' | 'ingestion' | 'settings'

export interface WikiIndexEntry {
  title: string
  path: string
  category: string
  summary: string
  tags: string[]
  updated: string
}
