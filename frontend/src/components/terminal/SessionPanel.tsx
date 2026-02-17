import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../../config/api'
import { SESSIONS_KEY, loadSessionsIndexFromLocalStorage, type SessionIndexInfo } from '../../utils/sessionPersistence'

const API_BASE = API_BASE_URL

type SessionInfo = SessionIndexInfo

interface SessionPanelProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
  onLoadSession: (name: string) => void
  onLoadTelegramConversation?: () => void
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
  onLoadTelegramConversation,
  onSaveSession,
  onNewSession,
  onDeleteSession,
  currentEntryCount,
  currentSessionName,
}: SessionPanelProps) {
  const [sessions, setSessions] = useState<Record<string, SessionInfo>>({})
  const [hoveredSession, setHoveredSession] = useState<string | null>(null)
  const [telegramLabel, setTelegramLabel] = useState<string | null>(null)
  const lastRefreshMsRef = useRef(0)

  useEffect(() => {
    if (!onLoadTelegramConversation) return
    let mounted = true
    fetch(`${API_BASE}/api/connectors/status`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!mounted || !data?.telegram?.connected) {
          setTelegramLabel(null)
          return
        }
        const username = data.telegram?.username ?? 'bot'
        setTelegramLabel(`Chat with @${username}`)
      })
      .catch(() => { if (mounted) setTelegramLabel(null) })
    return () => { mounted = false }
  }, [onLoadTelegramConversation])

  // Load sessions index (from backend with localStorage fallback)
  const refreshSessions = useCallback(async () => {
    const now = Date.now()
    if (now - lastRefreshMsRef.current < 1500) {
      return
    }
    lastRefreshMsRef.current = now

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
      setSessions(loadSessionsIndexFromLocalStorage())
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
    window.addEventListener('focus', handleSessionChange)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshSessions()
      }
    }
    window.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('storage', handleStorage)
      window.removeEventListener('loom:session-saved', handleSessionChange)
      window.removeEventListener('loom:session-deleted', handleSessionChange)
      window.removeEventListener('focus', handleSessionChange)
      window.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [refreshSessions])

  const sessionList = Object.entries(sessions)
    .sort(([, a], [, b]) => b.savedAt - a.savedAt) // Most recent first
  const activeSessionName = currentSessionName || null
  const activeSessionInfo = activeSessionName ? sessions[activeSessionName] : undefined
  const recentSessionList = sessionList.filter(([name]) => name !== activeSessionName)

  const closeDrawerOnMobile = useCallback(() => {
    if (isCollapsed) return
    if (window.matchMedia('(max-width: 767px)').matches) {
      onToggleCollapse()
    }
  }, [isCollapsed, onToggleCollapse])

  const handleLoadSessionClick = useCallback((name: string) => {
    onLoadSession(name)
    closeDrawerOnMobile()
  }, [onLoadSession, closeDrawerOnMobile])

  const handleSaveClick = useCallback(() => {
    onSaveSession()
    closeDrawerOnMobile()
  }, [onSaveSession, closeDrawerOnMobile])

  const handleNewClick = useCallback(() => {
    onNewSession()
    closeDrawerOnMobile()
  }, [onNewSession, closeDrawerOnMobile])

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
    <>
      {!isCollapsed && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-void/70 md:hidden"
          aria-label="Close sessions panel"
          onClick={onToggleCollapse}
        />
      )}
      <div className="h-full min-h-0 flex-1 flex flex-col bg-void transition-all duration-200 w-full overflow-hidden absolute md:relative left-0 top-0 z-40 md:z-auto shadow-2xl md:shadow-none">
      {/* Header */}
      <div className="border-b border-terminal-border flex items-center">
        {!isCollapsed && (
          <div className="flex-1 px-3 py-2">
            <div className="text-[9px] text-terminal-muted tracking-widest">SESSIONS</div>
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-2 min-h-11 min-w-11 text-terminal-muted hover:text-phosphor text-xs"
          title={isCollapsed ? 'Expand' : 'Collapse'}
          aria-label={isCollapsed ? 'Expand sessions panel' : 'Collapse sessions panel'}
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
              onClick={() => handleLoadSessionClick(name)}
              className={`w-8 h-8 flex items-center justify-center hover:bg-slate transition-colors text-[10px] ${
                name === activeSessionName ? 'text-phosphor bg-slate' : 'text-terminal-muted hover:text-phosphor'
              }`}
              title={name}
            >
              {name === activeSessionName ? '◆' : '▪'}
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
            <div className="px-3 py-4 text-[9px] text-terminal-muted text-center space-y-2">
              <div className="text-phosphor text-[10px] tracking-wide">No sessions yet</div>
              <div>Start with <span className="text-phosphor">New</span>, then click <span className="text-phosphor">Save</span>.</div>
              <div className="text-[8px] text-terminal-muted/70">Tip: /saveas &lt;name&gt; creates named snapshots.</div>
            </div>
          ) : (
            <div className="py-1">
              {activeSessionName && activeSessionInfo && (
                <div className="px-3 py-2 border-b border-terminal-border/60">
                  <div className="text-[8px] text-terminal-muted tracking-widest mb-1">ACTIVE SESSION</div>
                  <button
                    onClick={() => handleLoadSessionClick(activeSessionName)}
                    className="w-full text-left p-2 border border-phosphor/40 bg-phosphor/10 hover:bg-phosphor/15 transition-colors"
                    title={`Reload "${activeSessionName}"`}
                  >
                    <div className="text-[10px] text-phosphor truncate">{activeSessionName}</div>
                    <div className="text-[8px] text-terminal-muted mt-1">
                      {activeSessionInfo.entryCount} entries • {formatDate(activeSessionInfo.savedAt)}
                    </div>
                  </button>
                </div>
              )}

              {(recentSessionList.length > 0 || telegramLabel) && (
                <div className="px-3 pt-2 pb-1 text-[8px] text-terminal-muted tracking-widest">RECENT</div>
              )}
              {telegramLabel && onLoadTelegramConversation && (
                <div className="px-3 py-2 border-b border-terminal-border/40">
                  <button
                    onClick={() => {
                      onLoadTelegramConversation()
                      closeDrawerOnMobile()
                    }}
                    title="Load Telegram conversation in main view"
                    className="w-full text-left group flex items-start gap-2"
                  >
                    <span className="shrink-0 w-6 h-6 rounded flex items-center justify-center bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-[11px] font-bold" aria-hidden>TG</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[10px] text-terminal-muted group-hover:text-phosphor truncate">{telegramLabel}</div>
                      <div className="text-[8px] text-terminal-muted/60 mt-0.5">View in main</div>
                    </div>
                  </button>
                </div>
              )}
              {recentSessionList.map(([name, info]) => (
                <div
                  key={name}
                  onMouseEnter={() => setHoveredSession(name)}
                  onMouseLeave={() => setHoveredSession(null)}
                  className={`w-full text-left px-3 py-2 transition-colors group ${hoveredSession === name ? 'bg-slate' : ''
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => handleLoadSessionClick(name)}
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
                        aria-label={`Delete session ${name}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleLoadSessionClick(name)}
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
            onClick={handleSaveClick}
            title="Save current session to a named slot"
            className="w-full min-h-11 text-[9px] text-terminal-muted hover:text-phosphor py-1.5 border border-terminal-border hover:border-phosphor transition-colors flex items-center justify-center gap-2"
          >
            <span>▣</span> Save
          </button>
          <div className="flex gap-1">
            <button
              onClick={handleNewClick}
              title="Start fresh (save first if you want to keep current)"
              className="flex-1 min-h-11 text-[9px] text-terminal-muted hover:text-phosphor py-1.5 border border-terminal-border hover:border-phosphor transition-colors flex items-center justify-center gap-2"
            >
              <span>+</span> New
            </button>
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${API_BASE}/api/sessions/open-folder`, { method: 'POST' })
                  if (!res.ok) {
                    console.error('Failed to open folder')
                  }
                } catch (e) {
                  console.error('Failed to open folder:', e)
                }
              }}
              title="Open data folder in Finder"
              className="min-h-11 min-w-11 text-[9px] text-terminal-muted hover:text-phosphor py-1.5 px-2 border border-terminal-border hover:border-phosphor transition-colors flex items-center justify-center"
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
            onClick={handleSaveClick}
            className="w-full min-h-11 text-terminal-muted hover:text-phosphor p-1.5 flex items-center justify-center"
            title="Save session"
          >
            ▣
          </button>
          <button
            onClick={handleNewClick}
            className="w-full min-h-11 text-terminal-muted hover:text-phosphor p-1.5 flex items-center justify-center"
            title="New session"
          >
            +
          </button>
          <button
            onClick={async () => {
              try {
                await fetch(`${API_BASE}/api/sessions/open-folder`, { method: 'POST' })
              } catch (e) {
                console.error('Failed to open folder:', e)
              }
            }}
            className="w-full min-h-11 text-terminal-muted hover:text-phosphor p-1.5 flex items-center justify-center"
            title="Open data folder in Finder"
          >
            📁
          </button>
        </div>
      )}
      </div>
    </>
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

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

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
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 text-[10px] text-void bg-phosphor py-1.5 hover:bg-phosphor-dim transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
