import { useState } from 'react'
import { useConfigStore } from '../store/useConfigStore'
import { useUpdateStore } from '../store/useUpdateStore'
import { useWikiStore } from '../store/useWikiStore'
import { createProvider } from '../lib/llm/providerFactory'
import { WikiLint } from '../lib/wiki/wikiLint'
import { logger } from '../lib/utils/logger'
import type { LLMProviderConfig, LintResult, RoutingRule } from '../types'

function isTauri(): boolean {
  return (
    typeof window !== 'undefined' &&
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !==
      undefined
  )
}

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
    thematicCategories,
    routingRules,
    addProvider,
    updateProvider,
    removeProvider,
    setActiveProvider,
    setGitHubToken,
    setThematicCategories,
    addThematicCategory,
    removeThematicCategory,
    setRoutingRules,
  } = useConfigStore()

  const { wikiManager, refreshTree, refreshIndex } = useWikiStore()

  const { workDir, setWorkDir } = useConfigStore()

  const [tokenDraft, setTokenDraft] = useState(githubToken)
  const [tokenSaved, setTokenSaved] = useState(false)

  const updateInfo = useUpdateStore((s) => s.updateInfo)
  const checkForUpdates = useUpdateStore((s) => s.checkForUpdates)
  const downloadAndInstall = useUpdateStore((s) => s.downloadAndInstall)
  const installing = useUpdateStore((s) => s.installing)

  const [editing, setEditing] = useState<LLMProviderConfig | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{
    id: string
    ok: boolean
    msg: string
  } | null>(null)

  const [cleaning, setCleaning] = useState(false)
  const [cleanResult, setCleanResult] = useState<string | null>(null)

  const [linting, setLinting] = useState(false)
  const [lintResult, setLintResult] = useState<LintResult | null>(null)
  const [lintProgress, setLintProgress] = useState('')
  const [fixing, setFixing] = useState(false)

  const [newCategoryName, setNewCategoryName] = useState('')
  const [addingCategory, setAddingCategory] = useState(false)
  const [newRulePattern, setNewRulePattern] = useState('')
  const [newRuleTarget, setNewRuleTarget] = useState('')
  const [addingRule, setAddingRule] = useState(false)

  const defaultNewProvider: LLMProviderConfig = {
    id: '',
    name: '',
    type: 'openai',
    baseUrl: '',
    apiKey: '',
    defaultModel: 'gpt-4o-mini',
    models: [],
    isActive: false,
    supportedInputs: ['text', 'pdf'],
  }

  const [newProvider, setNewProvider] =
    useState<LLMProviderConfig>(defaultNewProvider)

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

  const [workDirSaved, setWorkDirSaved] = useState(false)

  const handleSaveToken = async () => {
    await setGitHubToken(tokenDraft)
    setTokenSaved(true)
    setTimeout(() => setTokenSaved(false), 2000)
  }

  const handleSelectWorkDir = async () => {
    if (!isTauri()) return
    try {
      const { open } = await import('@tauri-apps/plugin-dialog')
      const selected = await open({ directory: true, multiple: false })
      if (selected && typeof selected === 'string') {
        await setWorkDir(selected)
        setWorkDirSaved(true)
        setTimeout(() => setWorkDirSaved(false), 2000)
      }
    } catch (err) {
      logger.error('SettingsPanel', 'Failed to open folder picker', err)
    }
  }

  const handleResetWorkDir = async () => {
    await setWorkDir('')
    setWorkDirSaved(true)
    setTimeout(() => setWorkDirSaved(false), 2000)
  }

  const handleAddCategory = async () => {
    const name = newCategoryName.trim().toLowerCase().replace(/\s+/g, '-')
    if (!name || thematicCategories.includes(name)) return
    setAddingCategory(true)
    try {
      const { wikiManager } = useWikiStore.getState()
      if (wikiManager) {
        await wikiManager.createWikiCategory(name)
      }
      await addThematicCategory(name)
      await refreshTree()
      setNewCategoryName('')
    } finally {
      setAddingCategory(false)
    }
  }

  const handleRemoveCategory = async (name: string) => {
    const confirmed = window.confirm(
      `Remove category "${name}"? This will delete all files in wiki/${name}.`,
    )
    if (!confirmed) return
    try {
      const { wikiManager } = useWikiStore.getState()
      if (wikiManager) {
        await wikiManager.deleteWikiCategory(name)
      }
      await removeThematicCategory(name)
      await refreshTree()
      await refreshIndex()
    } catch (err) {
      logger.error('SettingsPanel', `Failed to remove category ${name}`, err)
    }
  }

  const handleAddRule = async () => {
    const pattern = newRulePattern.trim()
    const target = newRuleTarget.trim()
    if (!pattern || !target) return
    setAddingRule(true)
    try {
      const newRules = [...routingRules, { pattern, target }]
      await setRoutingRules(newRules)
      setNewRulePattern('')
      setNewRuleTarget('')
    } finally {
      setAddingRule(false)
    }
  }

  const handleRemoveRule = async (index: number) => {
    const newRules = routingRules.filter((_, i) => i !== index)
    await setRoutingRules(newRules)
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
      setCleanResult(
        'All wiki pages, raw sources, and queries have been cleaned.',
      )
    } catch (err) {
      setCleanResult(
        `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
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
      setLintProgress(
        result.passed
          ? 'All checks passed!'
          : `${result.issues.length} issues found`,
      )
    } catch (err) {
      setLintProgress(
        `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setLinting(false)
    }
  }

  const handleLintAndFix = async () => {
    if (!wikiManager) return
    setFixing(true)
    setLintResult(null)
    setLintProgress('Starting lint and fix...')
    try {
      const linter = new WikiLint(wikiManager, (step, current, total) => {
        setLintProgress(`${step}: ${current}/${total}`)
      })
      const result = await linter.runLintAndFix()
      setLintResult(result)
      if (result.fixes) {
        setLintProgress(
          `Fixed ${result.fixes.fixed} issues. ${result.issues.length} issues remaining.`,
        )
      } else {
        setLintProgress(
          result.passed
            ? 'All checks passed!'
            : `${result.issues.length} issues found (none auto-fixable)`,
        )
      }
      await refreshTree()
      await refreshIndex()
    } catch (err) {
      setLintProgress(
        `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      )
    } finally {
      setFixing(false)
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
                Delete all wiki pages, raw source files, and query records to
                start fresh.
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
            <div
              className={`maintenance-result ${cleanResult.startsWith('Error') ? 'error' : 'success'}`}
            >
              {cleanResult}
            </div>
          )}

          <div className="maintenance-row">
            <div className="maintenance-info">
              <strong>Run Lint</strong>
              <p className="settings-description">
                Check wiki for broken links, duplicate pages, contradictions,
                and schema violations.
              </p>
            </div>
            <div className="maintenance-btn-group">
              <button
                className="btn"
                onClick={handleLint}
                disabled={linting || fixing || !wikiManager}
              >
                {linting ? 'Running...' : 'Run Lint'}
              </button>
              <button
                className="btn btn-warning"
                onClick={handleLintAndFix}
                disabled={linting || fixing || !wikiManager}
              >
                {fixing ? 'Fixing...' : 'Lint & Fix'}
              </button>
            </div>
          </div>
          {lintProgress && (
            <div className="maintenance-result">{lintProgress}</div>
          )}
          {lintResult && (
            <div
              className={`lint-report ${lintResult.passed ? 'success' : 'warning'}`}
            >
              <div className="lint-summary">
                <span
                  className={`lint-badge ${lintResult.passed ? 'pass' : 'fail'}`}
                >
                  {lintResult.passed ? 'PASSED' : 'ISSUES FOUND'}
                </span>
                <span className="lint-stats">
                  {lintResult.stats.totalFiles} files |{' '}
                  {lintResult.stats.brokenLinks} broken links |{' '}
                  {lintResult.stats.duplicates} duplicates |{' '}
                  {lintResult.stats.contradictions} contradictions |{' '}
                  {lintResult.stats.schemaViolations} schema violations
                </span>
              </div>
              {lintResult.fixes && (
                <div className="lint-fixes">
                  <strong>
                    Auto-fixes applied ({lintResult.fixes.fixed}):
                  </strong>
                  <ul>
                    {lintResult.fixes.details.map((d, i) => (
                      <li key={i}>{d}</li>
                    ))}
                  </ul>
                </div>
              )}
              {lintResult.issues.length > 0 && (
                <div className="lint-issues">
                  {lintResult.issues.map((issue, i) => (
                    <div
                      key={i}
                      className={`lint-issue lint-${issue.severity}`}
                    >
                      <span className="lint-issue-type">{issue.type}</span>
                      <span className="lint-issue-severity">
                        {issue.severity}
                      </span>
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
              {(updateInfo.downloadUrl || updateInfo.latestUrl) && (
                <button
                  className="btn btn-small"
                  onClick={downloadAndInstall}
                  disabled={installing}
                >
                  {installing ? 'Installing...' : 'Download'}
                </button>
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
          <h3>Working Directory</h3>
        </div>
        <p className="settings-description">
          Choose a folder on your computer where wiki files, raw sources, and
          queries will be saved. Uses the default app data directory if not set.
        </p>
        <div className="workdir-form">
          <div className="workdir-display">
            <span className="workdir-path">
              {workDir || '(default app data directory)'}
            </span>
          </div>
          <div className="workdir-actions">
            {isTauri() && (
              <button className="btn" onClick={handleSelectWorkDir}>
                Choose Folder
              </button>
            )}
            <button
              className="btn btn-secondary"
              onClick={handleResetWorkDir}
              disabled={!workDir}
            >
              Reset to Default
            </button>
            {workDirSaved && <span className="workdir-saved">Saved!</span>}
          </div>
          {!isTauri() && (
            <p className="workdir-browser-note">
              Folder selection is available only in the desktop app.
            </p>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <h3>Error Reporting</h3>
        </div>
        <div className="github-token-form">
          <p className="settings-description">
            Set a GitHub Personal Access Token to automatically create issues
            when errors occur.
          </p>
          <div className="token-input-row">
            <input
              type="password"
              className="input-field"
              value={tokenDraft}
              onChange={(e) => setTokenDraft(e.target.value)}
              placeholder="ghp_..."
            />
            <button className="btn" onClick={handleSaveToken}>
              {tokenSaved ? 'Saved!' : 'Save Token'}
            </button>
          </div>
          {githubToken && <p className="token-status ok">Token configured</p>}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <h3>Wiki Categories</h3>
          <button
            className="btn btn-small"
            onClick={handleAddCategory}
            disabled={addingCategory || !newCategoryName.trim()}
          >
            {addingCategory ? 'Adding...' : '+ Add Category'}
          </button>
        </div>
        <p className="settings-description">
          Manage thematic wiki categories. Each category creates a directory
          under <code>wiki/</code>. Removing a category deletes its files.
        </p>
        <div className="category-input-row">
          <input
            type="text"
            className="input-field"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            placeholder="New category name (e.g. deep-learning)"
            onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
          />
        </div>
        <div className="categories-list">
          {thematicCategories.map((cat) => (
            <div key={cat} className="category-item">
              <span className="category-name">{cat}</span>
              <button
                className="btn-tiny btn-danger"
                onClick={() => handleRemoveCategory(cat)}
              >
                Remove
              </button>
            </div>
          ))}
          {thematicCategories.length === 0 && (
            <p className="empty-state">No categories configured.</p>
          )}
        </div>
      </section>

      <section className="settings-section">
        <div className="settings-section-header">
          <h3>Routing Rules</h3>
          <button
            className="btn btn-small"
            onClick={handleAddRule}
            disabled={addingRule || !newRulePattern.trim() || !newRuleTarget.trim()}
          >
            {addingRule ? 'Adding...' : '+ Add Rule'}
          </button>
        </div>
        <p className="settings-description">
          Define rules to route ingested sources to specific wiki categories.
          If a source URL, hostname, or tag matches a rule pattern, it is
          routed to the target category. Falls back to built-in heuristics
          when no rule matches.
        </p>
        <div className="rule-input-row">
          <input
            type="text"
            className="input-field"
            value={newRulePattern}
            onChange={(e) => setNewRulePattern(e.target.value)}
            placeholder="Pattern (keyword in URL/tag)"
          />
          <select
            className="input-field"
            value={newRuleTarget}
            onChange={(e) => setNewRuleTarget(e.target.value)}
          >
            <option value="">Select target...</option>
            {thematicCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="rules-list">
          {routingRules.map((rule, i) => (
            <div key={i} className="rule-item">
              <span className="rule-pattern">{rule.pattern}</span>
              <span className="rule-arrow">&rarr;</span>
              <span className="rule-target">{rule.target}</span>
              <button
                className="btn-tiny btn-danger"
                onClick={() => handleRemoveRule(i)}
              >
                Remove
              </button>
            </div>
          ))}
          {routingRules.length === 0 && (
            <p className="empty-state">
              No custom routing rules. Built-in heuristics will be used.
            </p>
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
              <label>
                Name
                <input
                  value={newProvider.name}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, name: e.target.value })
                  }
                />
              </label>
              <label>
                Type
                <select
                  value={newProvider.type}
                  onChange={(e) =>
                    setNewProvider({
                      ...newProvider,
                      type: e.target.value as
                        | 'openai'
                        | 'ollama'
                        | 'openrouter'
                        | 'gemini',
                    })
                  }
                >
                  {PROVIDER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Base URL
                <input
                  value={newProvider.baseUrl}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, baseUrl: e.target.value })
                  }
                />
              </label>
              <label>
                API Key
                <input
                  type="password"
                  value={newProvider.apiKey}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, apiKey: e.target.value })
                  }
                />
              </label>
              <label>
                Default Model
                <input
                  value={newProvider.defaultModel}
                  onChange={(e) =>
                    setNewProvider({
                      ...newProvider,
                      defaultModel: e.target.value,
                    })
                  }
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newProvider.supportedInputs?.includes('pdf') ?? true}
                  onChange={(e) =>
                    setNewProvider({
                      ...newProvider,
                      supportedInputs: e.target.checked
                        ? [...(newProvider.supportedInputs || ['text']), 'pdf']
                        : (newProvider.supportedInputs || ['text']).filter(
                            (f) => f !== 'pdf',
                          ),
                    })
                  }
                />
                Supports PDF input
              </label>
            </div>
            <div className="form-actions">
              <button className="btn" onClick={handleCreate}>
                Create
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowNew(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="providers-list">
          {providers.map((p) => (
            <div
              key={p.id}
              className={`provider-card ${editing?.id === p.id ? 'editing' : ''}`}
            >
              {editing?.id === p.id ? (
                <div className="provider-form">
                  <h4>Edit Provider</h4>
                  <div className="form-grid">
                    <label>
                      Name
                      <input
                        value={editing.name}
                        onChange={(e) =>
                          setEditing({ ...editing, name: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Base URL
                      <input
                        value={editing.baseUrl}
                        onChange={(e) =>
                          setEditing({ ...editing, baseUrl: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      API Key
                      <input
                        type="password"
                        value={editing.apiKey}
                        onChange={(e) =>
                          setEditing({ ...editing, apiKey: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Default Model
                      <input
                        value={editing.defaultModel}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            defaultModel: e.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={
                          editing.supportedInputs?.includes('pdf') ?? true
                        }
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            supportedInputs: e.target.checked
                              ? [
                                  ...(editing.supportedInputs || ['text']),
                                  'pdf',
                                ]
                              : (editing.supportedInputs || ['text']).filter(
                                  (f) => f !== 'pdf',
                                ),
                          })
                        }
                      />
                      Supports PDF input
                    </label>
                  </div>
                  <div className="form-actions">
                    <button className="btn" onClick={handleSave}>
                      Save
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
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
                      <button
                        className="btn-tiny"
                        onClick={() => setActiveProvider(p.id)}
                      >
                        Activate
                      </button>
                      <button
                        className="btn-tiny"
                        onClick={() => setEditing({ ...p })}
                      >
                        Edit
                      </button>
                      <button
                        className="btn-tiny"
                        onClick={() => handleTest(p)}
                        disabled={testingId === p.id}
                      >
                        {testingId === p.id ? 'Testing...' : 'Test'}
                      </button>
                      <button
                        className="btn-tiny btn-danger"
                        onClick={() => removeProvider(p.id)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="provider-details">
                    <div>Model: {p.defaultModel}</div>
                    <div>URL: {p.baseUrl || '(default)'}</div>
                    <div>API Key: {p.apiKey ? '••••••••' : '(not set)'}</div>
                    <div>
                      PDF Input:{' '}
                      {p.supportedInputs?.includes('pdf')
                        ? 'Supported'
                        : 'Not supported'}
                    </div>
                  </div>
                  {testResult?.id === p.id && (
                    <div
                      className={`test-result ${testResult.ok ? 'success' : 'error'}`}
                    >
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
