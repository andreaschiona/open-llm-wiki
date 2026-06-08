import { useState } from 'react'
import { useConfigStore } from '../store/useConfigStore'
import { useUpdateStore } from '../store/useUpdateStore'
import { useWikiStore } from '../store/useWikiStore'
import { createProvider } from '../lib/llm/providerFactory'
import { WikiLint } from '../lib/wiki/wikiLint'
import type { LLMProviderConfig, LintResult } from '../types'

const PROVIDER_TYPES = [
  { value: 'openai', label: 'OpenAI Compatible' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'gemini', label: 'Google Gemini' },
]

export function SettingsPanel() {
  const {
    providers,
    initialized,
    githubToken,
    addProvider,
    updateProvider,
    removeProvider,
    setActiveProvider,
    setGitHubToken,
  } = useConfigStore()

  const { wikiManager, refreshTree, refreshIndex } = useWikiStore()

  const [tokenDraft, setTokenDraft] = useState(githubToken)
  const [tokenSaved, setTokenSaved] = useState(false)

  const updateInfo = useUpdateStore(s => s.updateInfo)
  const checkForUpdates = useUpdateStore(s => s.checkForUpdates)

  const [editing, setEditing] = useState<LLMProviderConfig | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<string | null>(null)

  const [linting, setLinting] = useState(false)
  const [lintResult, setLintResult] = useState<LintResult | null>(null)
  const [lintProgress, setLintProgress] = useState('')

  const defaultNewProvider: LLMProviderConfig = {
    id: '',
    name: '',
    type: 'openai',
    baseUrl: '',
    apiKey: '',
    defaultModel: 'gpt-4o-mini',
    models: [],
    isActive: false,
  }

  const [newProvider, setNewProvider] = useState<LLMProviderConfig>(defaultNewProvider)

  const handleSave = async () => {
    if (editing) {
      await updateProvider(editing.id, editing)
      setEditing(null)
    }
  }

  const handleCreate = async () => {
    const provider: LLMProviderConfig = {
      ...newProvider,
      id: `provider-${Date.now()}`,
      isActive: providers.length === 0,
    }
    await addProvider(provider)
    setShowNew(false)
    setNewProvider(defaultNewProvider)
  }

  const handleTest = async (provider: LLMProviderConfig) => {
    setTestingId(provider.id)
    setTestResult(null)
    try {
      const instance = createProvider(provider)
      const ok = await instance.testConnection()
      setTestResult({
        id: provider.id,
        ok,
        msg: ok ? 'Connection successful!' : 'Connection failed',
      })
    } catch (err) {
      setTestResult({
        id: provider.id,
        ok: false,
        msg: err instanceof Error ? err.message : 'Connection failed',
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleSaveToken = () => {
    setGitHubToken(tokenDraft)
    setTokenSaved(true)
    setTimeout(() => setTokenSaved(false), 2000)
  }

  const handleCleanWiki = async () => {
    if (!wikiManager) return
    const confirmed = window.confirm(
      'This will delete all wiki pages, raw sources, and query files. Are you sure?',
    )
    if (!confirmed) return

    setCleaning(true)
    setCleanResult(null)
    try {
      await wikiManager.clearAll()
      await refreshTree()
      await refreshIndex()
      setCleanResult('All wiki pages, raw sources, and queries have been cleaned.')
    } catch (err) {
      setCleanResult(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setCleaning(false)
    }
  }

  const handleLint = async () => {
    if (!wikiManager) return
    setLinting(true)
    setLintResult(null)
    setLintProgress('Starting lint...')
    try {
      const linter = new WikiLint(wikiManager, (step, current, total) => {
        setLintProgress(`${step}: ${current}/${total}`)
      })
      const result = await linter.runLint()
      setLintResult(result)
      setLintProgress(result.passed ? 'All checks passed!' : `${result.issues.length} issues found`)
    } catch (err) {
      setLintProgress(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLinting(false)
    }
  }

  if (!initialized) {
    return <div className="settings-panel">Loading...</div>
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <section className="settings-section">
        <div className="settings-section-header">
          <h3>Wiki Maintenance</h3>
        </div>
        <div className="maintenance-actions">
          <div className="maintenance-row">
            <div className="maintenance-info">
              <strong>Clean Pages and Sources</strong>
              <p className="settings-description">
                Delete all wiki pages, raw source files, and query records to start fresh.
              </p>
            </div>
            <button
              className="btn btn-danger"
              onClick={handleCleanWiki}
              disabled={cleaning || !wikiManager}
            >
              {cleaning ? 'Cleaning...' : 'Clean Wiki'}
            </button>
          </div>
          {cleanResult && (
            <div className={`maintenance-result ${cleanResult.startsWith('Error') ? 'error' : 'success'}`}>
              {cleanResult}
            </div>
          )}

          <div className="maintenance-row">
            <div className="maintenance-info">
              <strong>Run Lint</strong>
              <p className="settings-description">
                Check wiki for broken links, duplicate pages, contradictions, and schema violations.
              </p>
            </div>
            <button
              className="btn"
              onClick={handleLint}
              disabled={linting || !wikiManager}
            >
              {linting ? 'Running...' : 'Run Lint'}
            </button>
          </div>
          {lintProgress && (
            <div className="maintenance-result">
              {lintProgress}
            </div>
          )}
          {lintResult && (
            <div className={`lint-report ${lintResult.passed ? 'success' : 'warning'}`}>
              <div className="lint-summary">
                <span className={`lint-badge ${lintResult.passed ? 'pass' : 'fail'}`}>
                  {lintResult.passed ? 'PASSED' : 'ISSUES FOUND'}
                </span>
                <span className="lint-stats">
                  {lintResult.stats.totalFiles} files | {lintResult.stats.brokenLinks} broken links | {lintResult.stats.duplicates} duplicates | {lintResult.stats.contradictions} contradictions | {lintResult.stats.schemaViolations} schema violations
                </span>
              </div>
              {lintResult.issues.length > 0 && (
                <div className="lint-issues">
                  {lintResult.issues.map((issue, i) => (
                    <div key={i} className={`lint-issue lint-${issue.severity}`}>
                      <span className="lint-issue-type">{issue.type}</span>
                      <span className="lint-issue-severity">{issue.severity}</span>
                      <span className="lint-issue-file">{issue.file}</span>
                      <span className="lint-issue-msg">{issue.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <h3>Version</h3>
          <button
            className="btn btn-small"
            onClick={checkForUpdates}
            disabled={updateInfo.status === 'checking'}
          >
            {updateInfo.status === 'checking' ? 'Checking...' : 'Check Now'}
          </button>
        </div>
        <div className="version-info">
          <div className="version-row">
            <span className="version-label">Current version</span>
            <span className="version-value">{updateInfo.currentVersion}</span>
          </div>
          {updateInfo.status === 'checking' && (
            <div className="version-status checking">
              <div className="spinner-small" />
              <span>Checking for updates...</span>
            </div>
          )}
          {updateInfo.status === 'available' && (
            <div className="version-status available">
              <span>Update available: {updateInfo.latestVersion}</span>
              {updateInfo.latestUrl && (
                <a
                  href={updateInfo.latestUrl}
                  className="btn btn-small"
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    e.preventDefault()
                    window.open(updateInfo.latestUrl!, '_blank')
                  }}
                >
                  Download
                </a>
              )}
            </div>
          )}
          {updateInfo.status === 'up-to-date' && updateInfo.latestVersion && (
            <div className="version-status up-to-date">
              <span>Up to date ({updateInfo.latestVersion})</span>
            </div>
          )}
          {updateInfo.status === 'error' && (
            <div className="version-status error">
              <span>Check failed: {updateInfo.error}</span>
            </div>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <h3>Error Reporting</h3>
        </div>
        <div className="github-token-form">
          <p className="settings-description">
            Set a GitHub Personal Access Token to automatically create issues when errors occur.
          </p>
          <div className="token-input-row">
            <input
              type="password"
              className="input-field"
              value={tokenDraft}
              onChange={e => setTokenDraft(e.target.value)}
              placeholder="ghp_..."
            />
            <button className="btn" onClick={handleSaveToken}>
              {tokenSaved ? 'Saved!' : 'Save Token'}
            </button>
          </div>
          {githubToken && (
            <p className="token-status ok">Token configured</p>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <h3>LLM Providers</h3>
          <button className="btn btn-small" onClick={() => setShowNew(true)}>
            + Add Provider
          </button>
        </div>

        {showNew && (
          <div className="provider-form">
            <h4>New Provider</h4>
            <div className="form-grid">
              <label>Name
                <input value={newProvider.name} onChange={e => setNewProvider({ ...newProvider, name: e.target.value })} />
              </label>
              <label>Type
                <select value={newProvider.type} onChange={e => setNewProvider({ ...newProvider, type: e.target.value as any })}>
                  {PROVIDER_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </label>
              <label>Base URL
                <input value={newProvider.baseUrl} onChange={e => setNewProvider({ ...newProvider, baseUrl: e.target.value })} />
              </label>
              <label>API Key
                <input type="password" value={newProvider.apiKey} onChange={e => setNewProvider({ ...newProvider, apiKey: e.target.value })} />
              </label>
              <label>Default Model
                <input value={newProvider.defaultModel} onChange={e => setNewProvider({ ...newProvider, defaultModel: e.target.value })} />
              </label>
            </div>
            <div className="form-actions">
              <button className="btn" onClick={handleCreate}>Create</button>
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancel</button>
            </div>
          </div>
        )}

        <div className="providers-list">
          {providers.map(p => (
            <div key={p.id} className={`provider-card ${editing?.id === p.id ? 'editing' : ''}`}>
              {editing?.id === p.id ? (
                <div className="provider-form">
                  <h4>Edit Provider</h4>
                  <div className="form-grid">
                    <label>Name
                      <input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                    </label>
                    <label>Base URL
                      <input value={editing.baseUrl} onChange={e => setEditing({ ...editing, baseUrl: e.target.value })} />
                    </label>
                    <label>API Key
                      <input type="password" value={editing.apiKey} onChange={e => setEditing({ ...editing, apiKey: e.target.value })} />
                    </label>
                    <label>Default Model
                      <input value={editing.defaultModel} onChange={e => setEditing({ ...editing, defaultModel: e.target.value })} />
                    </label>
                  </div>
                  <div className="form-actions">
                    <button className="btn" onClick={handleSave}>Save</button>
                    <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="provider-header">
                    <div className="provider-info">
                      <strong>{p.name}</strong>
                      <span className="provider-type">{p.type}</span>
                      {p.id === useConfigStore.getState().activeProviderId && (
                        <span className="badge active-badge">Active</span>
                      )}
                    </div>
                    <div className="provider-actions">
                      <button className="btn-tiny" onClick={() => setActiveProvider(p.id)}>Activate</button>
                      <button className="btn-tiny" onClick={() => setEditing({ ...p })}>Edit</button>
                      <button className="btn-tiny" onClick={() => handleTest(p)} disabled={testingId === p.id}>
                        {testingId === p.id ? 'Testing...' : 'Test'}
                      </button>
                      <button className="btn-tiny btn-danger" onClick={() => removeProvider(p.id)}>Remove</button>
                    </div>
                  </div>
                  <div className="provider-details">
                    <div>Model: {p.defaultModel}</div>
                    <div>URL: {p.baseUrl || '(default)'}</div>
                    <div>API Key: {p.apiKey ? '••••••••' : '(not set)'}</div>
                  </div>
                  {testResult?.id === p.id && (
                    <div className={`test-result ${testResult.ok ? 'success' : 'error'}`}>
                      {testResult.msg}
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
