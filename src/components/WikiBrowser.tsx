import { useEffect, useState } from 'react'
import { useWikiStore } from '../store/useWikiStore'
import { MarkdownRenderer } from './MarkdownRenderer'

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
  } = useWikiStore()

  const [view, setView] = useState<'tree' | 'index' | 'log'>('index')
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(
    new Set(['wiki']),
  )
  const [showMobileSidebar, setShowMobileSidebar] = useState(false)

  useEffect(() => {
    if (initialized) {
      refreshTree()
      refreshIndex()
    }
  }, [initialized, refreshTree, refreshIndex])

  const toggleDir = (name: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="wiki-browser">
      <div
        className={`wiki-sidebar-backdrop${showMobileSidebar ? ' visible' : ''}`}
        onClick={() => setShowMobileSidebar(false)}
      />
      <div className={`wiki-sidebar${showMobileSidebar ? ' wiki-sidebar-mobile-visible' : ''}`}>
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
                                  onClick={() => navigateToPage(subchild.path)}
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
                            onClick={() => navigateToPage(child.path)}
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
        {currentPage ? (
          <MarkdownRenderer content={currentPage.content} />
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
