import { useUpdateStore } from '../store/useUpdateStore'
import type { AppView } from '../types'

interface SidebarProps {
  activeView: AppView
  onNavigate: (view: AppView) => void
}

const navItems: { view: AppView; label: string; icon: string }[] = [
  { view: 'wiki', label: 'Wiki', icon: '📖' },
  { view: 'chat', label: 'Chat', icon: '💬' },
  { view: 'ingestion', label: 'Ingest', icon: '📥' },
  { view: 'settings', label: 'Settings', icon: '⚙️' },
]

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  const updateStatus = useUpdateStore(s => s.updateInfo.status)

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src="/app-icon.svg" alt="LLM Wiki" className="sidebar-logo" />
        <h1 className="sidebar-title">LLM Wiki</h1>
      </div>
      <nav className="sidebar-nav">
        {navItems.map(item => (
          <button
            key={item.view}
            className={`sidebar-item ${activeView === item.view ? 'active' : ''}`}
            onClick={() => onNavigate(item.view)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
            {item.view === 'settings' && updateStatus === 'available' && (
              <span className="update-badge" title="Update available" />
            )}
          </button>
        ))}
      </nav>
    </aside>
  )
}
