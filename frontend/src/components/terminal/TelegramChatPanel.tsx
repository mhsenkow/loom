import { useState, useEffect, useCallback, useRef } from 'react'
import { API_BASE_URL } from '../../config/api'

const API_BASE = API_BASE_URL

interface TelegramMessage {
  role: 'user' | 'assistant'
  content: string
  message_id?: number
  ts?: string | null
}

interface TelegramChatPanelProps {
  isCollapsed: boolean
  onToggleCollapse: () => void
}

export function TelegramChatPanel({ isCollapsed, onToggleCollapse }: TelegramChatPanelProps) {
  const [connected, setConnected] = useState(false)
  const [botUsername, setBotUsername] = useState<string | null>(null)
  const [messages, setMessages] = useState<TelegramMessage[]>([])
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/connectors/status`)
      if (res.ok) {
        const data = await res.json()
        const tg = data?.telegram
        setConnected(Boolean(tg?.connected))
        setBotUsername(tg?.username ?? null)
        return Boolean(tg?.connected)
      }
    } catch {
      setConnected(false)
      setBotUsername(null)
    }
    return false
  }, [])

  const fetchConversation = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/connectors/telegram/conversation`)
      if (res.ok) {
        const data = await res.json()
        setMessages(Array.isArray(data?.messages) ? data.messages : [])
      }
    } catch {
      setMessages([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let mounted = true
    fetchStatus().then(isConnected => {
      if (mounted && isConnected) fetchConversation()
      else if (mounted) setLoading(false)
    })
    return () => { mounted = false }
  }, [fetchStatus, fetchConversation])

  useEffect(() => {
    if (!connected) return
    const interval = window.setInterval(fetchConversation, 8000)
    const onFocus = () => fetchConversation()
    window.addEventListener('focus', onFocus)
    const onTelegramUpdate = () => fetchConversation()
    window.addEventListener('loom:telegram-conversation-update', onTelegramUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('loom:telegram-conversation-update', onTelegramUpdate)
    }
  }, [connected, fetchConversation])

  useEffect(() => {
    if (scrollRef.current && messages.length) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages.length])

  if (!connected && !loading) return null

  const label = botUsername ? `Chat with ${botUsername}` : 'Telegram'

  return (
    <>
      <div
        className={`h-full border-t border-terminal-border flex flex-col bg-void transition-all duration-200 flex-1 min-h-0 ${
          isCollapsed ? 'flex-none' : ''
        }`}
      >
        <div className="border-b border-terminal-border flex items-center shrink-0">
          {!isCollapsed && (
            <div className="flex-1 px-3 py-2 min-w-0">
              <div className="text-[9px] text-terminal-muted tracking-widest truncate" title={label}>
                {label}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-2 min-h-9 min-w-9 text-terminal-muted hover:text-phosphor text-xs shrink-0"
            title={isCollapsed ? 'Expand' : 'Collapse'}
            aria-label={isCollapsed ? 'Expand Telegram panel' : 'Collapse Telegram panel'}
          >
            {isCollapsed ? '▶' : '◀'}
          </button>
        </div>

        {!isCollapsed && (
          <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
            {loading ? (
              <div className="text-[9px] text-terminal-muted py-2">Loading…</div>
            ) : messages.length === 0 ? (
              <div className="text-[9px] text-terminal-muted py-2 text-center">
                No messages yet. Send a DM to your bot to start.
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={`text-[10px] break-words ${
                    msg.role === 'user'
                      ? 'text-phosphor/90 pl-2 border-l-2 border-cyan-500/50'
                      : 'text-terminal-muted border-l-2 border-transparent'
                  }`}
                >
                  <span className="text-[8px] text-terminal-muted mr-1.5">
                    {msg.role === 'user' ? 'You' : 'Bot'}:
                  </span>
                  <span className="text-phosphor/80">{msg.content}</span>
                </div>
              ))
            )}
          </div>
        )}

        {isCollapsed && (
          <div className="flex flex-col items-center py-2" title={label}>
            <span className="text-[10px] text-terminal-muted">TG</span>
          </div>
        )}
      </div>
    </>
  )
}
