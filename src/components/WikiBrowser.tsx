import { useEffect, useState, useRef } from 'react'
import { useWikiStore } from '../store/useWikiStore'
import { MarkdownRenderer } from './MarkdownRenderer'
import { PageEditor } from './PageEditor'

export function WikiBrowser() {
  const {
    tree,
    currentPage,
    currentPath,
    indexContent,
    logContent,
    initialized,
    navigateToPage,
    refreshTree,
    refreshIndex,
    searchResults,
    search,
    editingPage,
    setEditingPage,
  } = useWikiStore()

  const [view, setView] = useState<'tree' | 'index' | 'log'>('index')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(['wiki']),
  )
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (initialized) {
      refreshTree()
      refreshIndex()
    }
  }, [initialized, refreshTree, refreshIndex])

  // Click outside search dropdown to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearchResults(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const toggleDir = (name: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const handleSearchChange = async (value: string) => {
    setSearchTerm(value)
    if (value.trim().length >= 2) {
      await search(value)
      setShowSearchResults(true)
    } else {
      setShowSearchResults(false)
    }
  }

  const handleSearchResultClick = (path: string) => {
    setSearchTerm('')
    setShowSearchResults(false)
    navigateToPage(path)
  }

  const handleEditClick = () => {
    if (currentPath) {
      setEditingPage(currentPath)
    }
  }

  const isEditing = editingPage !== null

  return (
    <div className="wiki-browser">
      {showMobileSidebar && (
        <div
          className="wiki-sidebar-backdrop"
          onClick={() => setShowMobileSidebar(false)}
        />
      )}
      <div className={`wiki-sidebar${showMobileSidebar ? ' wiki-sidebar-mobile-visible' : ''}`}>
        {/* Search bar */}
        <div className="wiki-search-wrapper" ref={searchRef}>
          <input
            ref={searchInputRef}
            type="text"
            className="wiki-search-input"
            placeholder="Cerca nel wiki..."
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => {
              if (searchResults.length > 0) setShowSearchResults(true)
            }}
          />
          {showSearchResults && searchResults.length > 0 && (
            <div className="wiki-search-dropdown">
              {searchResults.map((result) => (
                <div
                  key={result.path}
                  className="wiki-search-result"
                  onClick={() => handleSearchResultClick(result.path)}
                >
                  <span className="wiki-search-result-title">
                    {result.title}
                  </span>
                  {result.summary && (
                    <span className="wiki-search-result-summary">
                      {result.summary.slice(0, 80)}
                      {result.summary.length > 80 ? '...' : ''}
                    </span>
                  )}
                  <span className="wiki-search-result-path">
                    {result.category}
                  </span>
                </div>
              ))}
            </div>
          )}
          {showSearchResults && searchTerm.trim().length >= 2 && searchResults.length === 0 && (
            <div className="wiki-search-dropdown wiki-search-no-results">
              Nessun risultato per "{searchTerm}"
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="wiki-sidebar-tabs">
          <button
            className={`tab ${view === 'index' ? 'active' : ''}`}
            onClick={() => setView('index')}
          >
            Index
          </button>
          <button
            className={`tab ${view === 'tree' ? 'active' : ''}`}
            onClick={() => setView('tree')}
          >
            Files
          </button>
          <button
            className={`tab ${view === 'log' ? 'active' : ''}`}
            onClick={() => setView('log')}
          >
            Log
          </button>
        </div>
        <div className="wiki-sidebar-content">
          {view === 'tree' && (
            <div className="wiki-tree">
              {tree.map((node) => (
                <div key={node.path}>
                  <div
                    className="tree-directory"
                    onClick={() => toggleDir(node.name)}
                  >
                    <span
                      className={`tree-arrow ${expandedDirs.has(node.name) ? 'expanded' : ''}`}
                    >
                      ▶
                    </span>
                    <span className="tree-folder">📁</span>
                    <span>{node.name}</span>
                  </div>
                  {expandedDirs.has(node.name) &&
                    node.children?.map((child) => (
                      <div key={child.path}>
                        {child.type === 'directory' ? (
                          <>
                            <div
                              className="tree-directory tree-subdir"
                              onClick={() => toggleDir(child.path)}
                            >
                              <span
                                className={`tree-arrow ${expandedDirs.has(child.path) ? 'expanded' : ''}`}
                              >
                                ▶
                              </span>
                              <span className="tree-folder">📁</span>
                              <span>{child.name}</span>
                            </div>
                            {expandedDirs.has(child.path) &&
                              child.children?.map((subchild) => (
                                <div
                                  key={subchild.path}
                                  className={`tree-file ${currentPath === subchild.path ? 'active' : ''}`}
                                  onClick={() => { navigateToPage(subchild.path); setShowMobileSidebar(false); }}
                                >
                                  <span className="tree-file-icon">📄</span>
                                  <span>
                                    {subchild.name.replace('.md', '')}
                                  </span>
                                </div>
                              ))}
                          </>
                        ) : (
                          <div
                            className={`tree-file ${currentPath === child.path ? 'active' : ''}`}
                            onClick={() => { navigateToPage(child.path); setShowMobileSidebar(false); }}
                          >
                            <span className="tree-file-icon">📄</span>
                            <span>{child.name.replace('.md', '')}</span>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
          {view === 'index' && (
            <div className="wiki-index-panel">
              <MarkdownRenderer content={indexContent} />
            </div>
          )}
          {view === 'log' && (
            <div className="wiki-log-panel">
              <MarkdownRenderer content={logContent} />
            </div>
          )}
        </div>
      </div>
      <div className="wiki-content">
        <button
          className="wiki-mobile-toggle"
          onClick={() => setShowMobileSidebar((prev) => !prev)}
          aria-label="Toggle sidebar"
        >
          ☰
        </button>
        {isEditing && currentPage ? (
          <PageEditor />
        ) : currentPage ? (
          <>
            <div className="wiki-content-header">
              <h1 className="wiki-page-title">{currentPage.meta.title}</h1>
              <button
                className="wiki-edit-btn"
                onClick={handleEditClick}
                title="Edit this page"
              >
                ✏️ Edit
              </button>
            </div>
            <MarkdownRenderer content={currentPage.content} currentPath={currentPath} />
          </>
        ) : (
          <div className="wiki-empty">
            <h2>Welcome to LLM Wiki</h2>
            <p>Select a page from the index or sidebar to start browsing.</p>
            <p>
              Use <strong>Ingest</strong> to add new content from URLs or files.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
