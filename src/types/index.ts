export interface PageMeta {
  title: string
  path: string
  category: string
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
  supportedInputs?: string[]
}

export interface IngestionTask {
  id: string
  type: 'url' | 'pdf' | 'file'
  source: string
  status:
    | 'pending'
    | 'downloading'
    | 'analyzing'
    | 'updating'
    | 'done'
    | 'error'
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

export type UpdateStatus = 'checking' | 'up-to-date' | 'available' | 'error'

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string | null
  latestUrl: string | null
  downloadUrl: string | null
  status: UpdateStatus
  error?: string
}

export interface WikiIndexEntry {
  title: string
  path: string
  category: string
  summary: string
  tags: string[]
  updated: string
}

export interface LintIssue {
  type: 'broken-link' | 'duplicate' | 'contradiction' | 'schema-violation'
  severity: 'error' | 'warning' | 'info'
  file: string
  line?: number
  message: string
  detail?: string
}

export interface LintFixResult {
  fixed: number
  details: string[]
}

export interface LintResult {
  passed: boolean
  issues: LintIssue[]
  checkedAt: string
  stats: {
    totalFiles: number
    brokenLinks: number
    duplicates: number
    contradictions: number
    schemaViolations: number
  }
  fixes?: LintFixResult
}

export interface RawFileInfo {
  name: string
  path: string
  type: 'pdf' | 'audio' | 'chat' | 'code' | 'data' | 'meeting' | 'other'
  size: number
  importedAt: string
  ingested: boolean
}

export interface QueryRecord {
  id: string
  question: string
  answer: string
  planFile: string
  outputFile: string
  createdAt: string
  pagesReferenced: string[]
}
