import { useState, useEffect } from 'react'
import { useWikiStore } from '../store/useWikiStore'
import { MarkdownRenderer } from './MarkdownRenderer'

export function PageEditor() {
  const currentPage = useWikiStore((s) => s.currentPage)
  const currentPath = useWikiStore((s) => s.currentPath)
  const updatePage = useWikiStore((s) => s.updatePage)
  const setEditingPage = useWikiStore((s) => s.setEditingPage)

  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [showPreview, setShowPreview] = useState(true)

  useEffect(() => {
    if (currentPage) {
      setContent(currentPage.content)
    }
  }, [currentPage])

  const handleSave = async () => {
    if (!currentPath) return
    setSaving(true)
    try {
      await updatePage(currentPath, content)
    } catch (err) {
      console.error('Failed to save page:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditingPage(null)
  }

  if (!currentPage) {
    return (
      <div className="page-editor page-editor-empty">
        <p>No page selected. Navigate to a page first to edit it.</p>
        <button className="editor-btn editor-btn-secondary" onClick={handleCancel}>
          Back
        </button>
      </div>
    )
  }

  return (
    <div className="page-editor">
      <div className="page-editor-header">
        <h2 className="page-editor-title">
          Editing: {currentPage.meta.title}
        </h2>
        <div className="page-editor-actions">
          <button
            className="editor-btn editor-btn-secondary"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>
          <button
            className="editor-btn editor-btn-secondary"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="editor-btn editor-btn-primary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
      <div className={`page-editor-body ${showPreview ? 'page-editor-split' : ''}`}>
        <div className="page-editor-textarea-wrapper">
          <textarea
            className="page-editor-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Enter Markdown content here..."
            spellCheck={false}
          />
        </div>
        {showPreview && (
          <div className="page-editor-preview">
            <div className="page-editor-preview-label">Preview</div>
            <MarkdownRenderer content={content} currentPath={currentPath} />
          </div>
        )}
      </div>
    </div>
  )
}
