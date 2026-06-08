import { useState } from 'react'
import { useChatStore } from '../store/useChatStore'
import { useWikiStore } from '../store/useWikiStore'
import { useConfigStore } from '../store/useConfigStore'
import { UrlIngestor } from '../lib/ingestion/urlIngestor'
import { PdfIngestor } from '../lib/ingestion/pdfIngestor'
import { IngestionPipeline } from '../lib/ingestion/ingestionPipeline'
import { createProvider } from '../lib/llm/providerFactory'
import { reportError } from '../lib/utils/errorReporter'
import type { IngestionTask } from '../types'

export function IngestionPanel() {
  const [urlInput, setUrlInput] = useState('')
  const [fileInput, setFileInput] = useState<File | null>(null)
  const { ingestionTasks, addIngestionTask, updateIngestionTask } = useChatStore()
  const { wikiManager } = useWikiStore()
  const { getActiveProvider } = useConfigStore()

  const createPipeline = () => {
    const activeConfig = getActiveProvider()
    if (!wikiManager || !activeConfig) return null

    const provider = createProvider(activeConfig)
    return new IngestionPipeline(wikiManager, provider, (progress) => {
      updateIngestionTask(progress.taskId, {
        progress: progress.progress,
        progressLabel: progress.message,
        status: progress.progress >= 100 ? 'done' : 'analyzing',
      })
    })
  }

  const handleUrlIngest = async () => {
    if (!urlInput.trim()) return

    const task: IngestionTask = {
      id: Date.now().toString(),
      type: 'url',
      source: urlInput,
      status: 'pending',
      progress: 0,
      progressLabel: 'Starting...',
      createdAt: new Date().toISOString(),
    }
    addIngestionTask(task)

    try {
      updateIngestionTask(task.id, { status: 'downloading', progress: 10, progressLabel: 'Downloading URL...' })
      const ingestor = new UrlIngestor()
      const result = await ingestor.ingest(urlInput)

      updateIngestionTask(task.id, { progress: 25, progressLabel: 'Downloaded, starting analysis...' })

      const pipeline = createPipeline()
      if (pipeline) {
        await pipeline.processRawSource(task.id, result.title, result.content, urlInput)
      }

      setUrlInput('')
      useWikiStore.getState().refreshIndex()
      useWikiStore.getState().refreshTree()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      updateIngestionTask(task.id, { status: 'error', error: msg })
      reportError(err instanceof Error ? err : new Error(msg), {
        context: 'handleUrlIngest',
        source: urlInput,
        taskId: task.id,
      })
    }
  }

  const handleFileIngest = async () => {
    if (!fileInput) return

    const task: IngestionTask = {
      id: Date.now().toString(),
      type: 'file',
      source: fileInput.name,
      status: 'pending',
      progress: 0,
      progressLabel: 'Starting...',
      createdAt: new Date().toISOString(),
    }
    addIngestionTask(task)

    try {
      updateIngestionTask(task.id, { status: 'downloading', progress: 10, progressLabel: 'Reading file...' })
      const buffer = await fileInput.arrayBuffer()
      const ingestor = new PdfIngestor()
      const result = await ingestor.ingestFromBuffer(buffer, fileInput.name)

      updateIngestionTask(task.id, { progress: 25, progressLabel: 'File read, starting analysis...' })

      const pipeline = createPipeline()
      if (pipeline) {
        await pipeline.processRawSource(task.id, result.title, result.content, fileInput.name)
      }

      setFileInput(null)
      useWikiStore.getState().refreshIndex()
      useWikiStore.getState().refreshTree()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      updateIngestionTask(task.id, { status: 'error', error: msg })
      reportError(err instanceof Error ? err : new Error(msg), {
        context: 'handleFileIngest',
        source: fileInput?.name || 'unknown',
        taskId: task.id,
      })
    }
  }

  return (
    <div className="ingestion-panel">
      <h2>Content Ingestion</h2>
      <p className="ingestion-subtitle">Add content to your wiki from URLs or files.</p>

      <div className="ingestion-section">
        <h3>Import from URL</h3>
        <div className="ingestion-input-row">
          <input
            type="url"
            className="input-field"
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            placeholder="https://example.com/article"
          />
          <button className="btn" onClick={handleUrlIngest} disabled={!urlInput.trim()}>
            Ingest URL
          </button>
        </div>
      </div>

      <div className="ingestion-section">
        <h3>Import from File</h3>
        <div className="ingestion-input-row">
          <input
            type="file"
            accept=".pdf,.txt,.md"
            onChange={e => setFileInput(e.target.files?.[0] || null)}
            className="file-input"
          />
          <button className="btn" onClick={handleFileIngest} disabled={!fileInput}>
            Ingest File
          </button>
        </div>
      </div>

      {ingestionTasks.length > 0 && (
        <div className="ingestion-tasks">
          <h3>Recent Tasks</h3>
          {ingestionTasks.map(task => (
            <div key={task.id} className={`ingestion-task ${task.status}`}>
              <div className="task-header">
                <span className="task-source">{task.source}</span>
                <span className={`task-status ${task.status}`}>{task.status}</span>
              </div>
              <div className="task-progress">
                <div
                  className="task-progress-bar"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
              <div className="task-label">{task.progressLabel}</div>
              {task.error && <div className="task-error">Error: {task.error}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
