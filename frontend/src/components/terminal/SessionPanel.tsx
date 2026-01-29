import { useState, useEffect, useCallback } from 'react'

const SESSIONS_KEY = 'loom-terminal-sessions'
const API_BASE = 'http://localhost:8000'

interface SessionInfo {
  savedAt: number
  entryCount: number
  mediaFiles?: string[]
}

interface SessionPanelProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
  onLoadSession: (name: string) => void
  onSaveSession: () => void
  onNewSession: () => void
  onDeleteSession?: (name: string) => void
  currentEntryCount: number
  currentSessionName?: string | null
}

export function SessionPanel({
  isCollapsed,
  onToggleCollapse,
  onLoadSession,
  onSaveSession,
  onNewSession,
  onDeleteSession,
  currentEntryCount,
  currentSessionName,
}: SessionPanelProps) {
  const [sessions, setSessions] = useState<Record<string, SessionInfo>>({})
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)

  // Load sessions index (from backend with localStorage fallback)
  const refreshSessions = useCallback(async () => {
    try {
      // Try backend first
      const res = await fetch(`${API_BASE}/api/sessions`)
      if (res.ok) {
        const data = await res.json()
        setSessions(data.sessions || {})
        return
      }
    } catch (e) {
      console.warn('[LOOM] Backend unavailable, using localStorage:', e)
    }
    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(SESSIONS_KEY)
      if (stored) {
        setSessions(JSON.parse(stored))
      } else {
        setSessions({})
      }
    } catch (e) {
      console.warn('[LOOM] Failed to load sessions:', e)
      setSessions({})
    }
  }, [])

  useEffect(() => {
    refreshSessions()

    // Refresh on storage changes (from other tabs or commands)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === SESSIONS_KEY) {
        refreshSessions()
      }
    }

    // Refresh immediately on session save/delete events
    const handleSessionChange = () => {
      refreshSessions()
    }

    window.addEventListener('storage', handleStorage)
    window.addEventListener('loom:session-saved', handleSessionChange)
    window.addEventListener('loom:session-deleted', handleSessionChange)

    // Reduced polling interval - autosave doesn't trigger events, so poll catches it
    const interval = setInterval(refreshSessions, 5000)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('loom:session-saved', handleSessionChange)
      window.removeEventListener('loom:session-deleted', handleSessionChange)
      clearInterval(interval)
    }
  }, [refreshSessions])

  const sessionList = Object.entries(sessions)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt) // Most recent first

  const formatDate = (ts: number) => {
    const date = new Date(ts)
    const now = new Date()
    const diffDays = Math.floor((now.getTime() - ts) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (diffDays === 1) {
      return 'Yesterday'
    } else if (diffDays < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
    }
  }

  return (
    <div
      className={`h-full bg-void border-r border-terminal-border transition-all duration-200 flex flex-col ${isCollapsed ? 'w-10' : 'w-44'
        }`}
    >
      {/* Header */}
      <div className="border-b border-terminal-border flex items-center">
        {!isCollapsed && (
          <div className="flex-1 px-3 py-2">
            <div className="text-[9px] text-terminal-muted tracking-widest">SESSIONS</div>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-2 text-terminal-muted hover:text-phosphor text-xs"
          title={isCollapsed ? 'Expand' : 'Collapse'}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* Current Session Indicator */}
      {!isCollapsed && (
        <div className="px-3 py-2 border-b border-terminal-border bg-slate/50" title={currentSessionName || 'New Session'}>
          <div className="flex items-center gap-2">
            <span className="led led-success"></span>
            <span className="text-[10px] text-phosphor tracking-wide truncate">
              {currentSessionName || 'New Session'}
            </span>
          </div>
          <div className="text-[9px] text-terminal-muted mt-1">
            {currentEntryCount} entries • auto-saving
          </div>
        </div>
      )}

      {/* Collapsed: Just show icons */}
      {isCollapsed && (
        <div className="flex-1 flex flex-col items-center py-2 gap-1">
          <span className="led led-success mb-2" title="Current session"></span>
          {sessionList.slice(0, 8).map(([name]) => (
            <button
              key={name}
              onClick={() => onLoadSession(name)}
              className="w-6 h-6 flex items-center justify-center text-terminal-muted hover:text-phosphor hover:bg-slate transition-colors text-[10px]"
              title={name}
            >
              ▪
            </button>
          ))}
          {sessionList.length > 8 && (
            <span className="text-[9px] text-terminal-muted">+{sessionList.length - 8}</span>
          )}
        </div>
      )}

      {/* Session List */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto">
          {sessionList.length === 0 ? (
            <div className="px-3 py-4 text-[9px] text-terminal-muted text-center">
              No saved sessions
              <div className="mt-1 text-[8px]">/saveas &lt;name&gt; or SAVE</div>
            </div>
          ) : (
            <div className="py-1">
              {sessionList.map(([name, info]) => (
                <div
                  key={name}
                  onMouseEnter={() => setHoveredSession(name)}
                  onMouseLeave={() => setHoveredSession(null)}
                  className={`w-full text-left px-3 py-2 transition-colors group ${hoveredSession === name ? 'bg-slate' : ''
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => onLoadSession(name)}
                      title={`Load "${name}" (replaces current)`}
                      className="text-[10px] text-terminal-muted group-hover:text-phosphor truncate flex-1 text-left"
                    >
                      {name}
                    </button>
                    {onDeleteSession && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onDeleteSession(name)
                        }}
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-terminal-muted hover:text-red-400 px-1 transition-opacity"
                        title={`Delete "${name}"`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => onLoadSession(name)}
                    className="w-full"
                  >
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[8px] text-terminal-muted/60">
                        {info.entryCount} entries
                      </span>
                      <span className="text-[8px] text-terminal-muted/60">
                        {formatDate(info.savedAt)}
                      </span>
                    </div>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      {!isCollapsed && (
        <div className="border-t border-terminal-border p-2 space-y-1">
          <button
            onClick={onSaveSession}
            title="Save current session to a named slot"
            className="w-full text-[9px] text-terminal-muted hover:text-phosphor py-1.5 border border-terminal-border hover:border-phosphor transition-colors flex items-center justify-center gap-2"
          >
            <span>▣</span> SAVE
          </button>
          <div className="flex gap-1">
            <button
              onClick={onNewSession}
              title="Start fresh (save first if you want to keep current)"
              className="flex-1 text-[9px] text-terminal-muted hover:text-phosphor py-1.5 border border-terminal-border hover:border-phosphor transition-colors flex items-center justify-center gap-2"
            >
              <span>+</span> NEW
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch('http://localhost:8000/api/sessions/open-folder', { method: 'POST' })
                  if (!res.ok) {
                    console.error('Failed to open folder')
                  }
                } catch (e) {
                  console.error('Failed to open folder:', e)
                }
              }}
              title="Open data folder in Finder"
              className="text-[9px] text-terminal-muted hover:text-phosphor py-1.5 px-2 border border-terminal-border hover:border-phosphor transition-colors flex items-center justify-center"
            >
              📁
            </button>
          </div>
        </div>
      )}

      {/* Collapsed buttons */}
      {isCollapsed && (
        <div className="border-t border-terminal-border p-1 space-y-1">
          <button
            onClick={onSaveSession}
            className="w-full text-terminal-muted hover:text-phosphor p-1.5 flex items-center justify-center"
            title="Save session"
          >
            ▣
          </button>
          <button
            onClick={onNewSession}
            className="w-full text-terminal-muted hover:text-phosphor p-1.5 flex items-center justify-center"
            title="New session"
          >
            +
          </button>
          <button
            onClick={async () => {
              try {
                await fetch('http://localhost:8000/api/sessions/open-folder', { method: 'POST' })
              } catch (e) {
                console.error('Failed to open folder:', e)
              }
            }}
            className="w-full text-terminal-muted hover:text-phosphor p-1.5 flex items-center justify-center"
            title="Open data folder in Finder"
          >
            📁
          </button>
        </div>
      )}
    </div>
  )
}

// Save session modal
interface SaveModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (name: string) => void
  defaultName?: string
}

export function SaveSessionModal({ isOpen, onClose, onSave, defaultName }: SaveModalProps) {
  const [name, setName] = useState(defaultName || '')

  useEffect(() => {
    if (isOpen) {
      setName(defaultName || `session-${Date.now()}`)
    }
  }, [isOpen, defaultName])

  if (!isOpen) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (name.trim()) {
      onSave(name.trim())
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 bg-void/80 flex items-center justify-center z-50">
      <div className="bg-slate border border-phosphor p-4 w-72 shadow-glow">
        <div className="text-[10px] text-phosphor tracking-widest mb-3">SAVE SESSION</div>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="session name"
            autoFocus
            className="w-full bg-void border border-terminal-border px-3 py-2 text-phosphor font-mono text-xs focus:outline-none focus:border-phosphor"
          />

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 text-[10px] text-terminal-muted py-1.5 border border-terminal-border hover:border-phosphor transition-colors"
            >
              CANCEL
            </button>
            <button
              type="submit"
              className="flex-1 text-[10px] text-void bg-phosphor py-1.5 hover:bg-phosphor-dim transition-colors"
            >
              SAVE
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
