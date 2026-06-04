import { useState, useEffect } from 'react'
import { useConfigStore } from '../store/useConfigStore'
import { createProvider } from '../lib/llm/providerFactory'
import type { LLMProviderConfig } from '../types'

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
    addProvider,
    updateProvider,
    removeProvider,
    setActiveProvider,
  } = useConfigStore()

  const [editing, setEditing] = useState<LLMProviderConfig | null>(null)
  const [showNew, setShowNew] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; msg: string } | null>(null)

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

  if (!initialized) {
    return <div className="settings-panel">Loading...</div>
  }

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

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
