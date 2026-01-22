import { useState, useRef, useEffect, useCallback } from 'react'
import { CommandInput } from './CommandInput'
import { useSocket } from '../../hooks/useSocket'
import { useSystemStatus } from '../../hooks/useSystemStatus'
import { terminalOutputBus, getCircuitContext } from '../../hooks/useTerminalOutput'
import type { LogEntry } from '../../types/module'

const STORAGE_KEY = 'loom-terminal-history'
const SESSIONS_KEY = 'loom-terminal-sessions'
const MAX_STORED_ENTRIES = 500

// Load saved sessions index
function loadSessionsIndex(): Record<string, { savedAt: number; entryCount: number }> {
  try {
    const stored = localStorage.getItem(SESSIONS_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.warn('[LOOM] Failed to load sessions index:', e)
  }
  return {}
}

// Save a session
function saveSession(name: string, entries: LogEntry[]): boolean {
  try {
    // Save the session data
    localStorage.setItem(`${SESSIONS_KEY}:${name}`, JSON.stringify(entries))
    
    // Update the index
    const index = loadSessionsIndex()
    index[name] = { savedAt: Date.now(), entryCount: entries.length }
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(index))
    
    return true
  } catch (e) {
    console.warn('[LOOM] Failed to save session:', e)
    return false
  }
}

// Load a session
function loadSession(name: string): LogEntry[] | null {
  try {
    const stored = localStorage.getItem(`${SESSIONS_KEY}:${name}`)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch (e) {
    console.warn('[LOOM] Failed to load session:', e)
  }
  return null
}

// Delete a session
function deleteSession(name: string): boolean {
  try {
    localStorage.removeItem(`${SESSIONS_KEY}:${name}`)
    
    const index = loadSessionsIndex()
    delete index[name]
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(index))
    
    return true
  } catch (e) {
    console.warn('[LOOM] Failed to delete session:', e)
    return false
  }
}

// Load entries from localStorage
function loadEntries(): LogEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (e) {
    console.warn('[LOOM] Failed to load terminal history:', e)
  }
  
  // Default initial entries
  return [
    {
      id: '1',
      type: 'system',
      content: 'LOOM TERMINAL v0.1.0 INITIALIZED',
      timestamp: Date.now(),
    },
    {
      id: '2',
      type: 'system',
      content: 'Type /help for available commands. Press Enter to submit.',
      timestamp: Date.now(),
    },
  ]
}

export function TerminalFeed() {
  const { connected, sendChat } = useSocket()
  const { status, models, fetchModels, setActiveModel } = useSystemStatus()
  
  const [entries, setEntries] = useState<LogEntry[]>(loadEntries)
  
  const feedRef = useRef<HTMLDivElement>(null)
  const currentAIEntryRef = useRef<string | null>(null)

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [entries])

  // Persist entries to localStorage (debounced)
  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        // Only store last N entries to avoid quota issues
        const toStore = entries.slice(-MAX_STORED_ENTRIES)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
      } catch (e) {
        console.warn('[LOOM] Failed to save terminal history:', e)
      }
    }, 500) // Debounce 500ms
    
    return () => clearTimeout(timeout)
  }, [entries])

  // Show connection status on change
  useEffect(() => {
    const timestamp = Date.now()
    if (connected) {
      setEntries(prev => [...prev, {
        id: `system-${timestamp}`,
        type: 'system',
        content: '[BACKEND CONNECTED] Ready for AI processing.',
        timestamp,
      }])
    }
  }, [connected])

  // Listen for output from Circuit notebook
  useEffect(() => {
    const unsubscribe = terminalOutputBus.subscribe((entry) => {
      setEntries(prev => [...prev, entry])
    })
    return unsubscribe
  }, [])

  const addSystemEntry = useCallback((content: string, timestamp: number) => {
    setEntries(prev => [...prev, {
      id: `system-${timestamp}-${Math.random()}`,
      type: 'system',
      content,
      timestamp,
    }])
  }, [])

  const addErrorEntry = useCallback((content: string, timestamp: number) => {
    setEntries(prev => [...prev, {
      id: `error-${timestamp}`,
      type: 'error',
      content,
      timestamp,
    }])
  }, [])

  const handleAIRequest = useCallback((prompt: string, timestamp: number) => {
    // Create AI entry
    const entryId = `ai-${timestamp}`
    currentAIEntryRef.current = entryId
    
    setEntries(prev => [...prev, {
      id: entryId,
      type: 'ai',
      content: '',
      timestamp,
      status: 'running',
    }])

    // Handle streaming chunks
    const handleChunk = (chunk: { content: string }) => {
      setEntries(prev => prev.map(entry => 
        entry.id === entryId
          ? { ...entry, content: entry.content + chunk.content }
          : entry
      ))
    }

    // Handle status updates
    const handleStatus = (statusData: { status: string; message: string }) => {
      if (statusData.status === 'success' || statusData.status === 'error') {
        setEntries(prev => prev.map(entry => 
          entry.id === entryId
            ? { 
                ...entry, 
                status: statusData.status as 'success' | 'error',
                content: entry.content || (statusData.status === 'error' ? `Error: ${statusData.message}` : 'No response received.'),
              }
            : entry
        ))
        currentAIEntryRef.current = null
      }
    }

    // Use active model or first available
    const modelToUse = status.activeModel || models[0] || 'llama3.1:8b'
    
    // Include Circuit context if available
    const circuitContext = getCircuitContext()
    const enhancedPrompt = circuitContext
      ? `${circuitContext}\n\n---\n\nUser question: ${prompt}`
      : prompt
    
    // Send to backend
    const sent = sendChat(enhancedPrompt, modelToUse, handleChunk, handleStatus)
    
    if (!sent) {
      // Fallback to simulated response if not connected
      setEntries(prev => prev.map(entry => 
        entry.id === entryId
          ? { 
              ...entry, 
              content: `[OFFLINE MODE]\n\nBackend not connected. Start the backend server:\n\ncd backend && uvicorn app.main:socket_app --reload --port 8000\n\nYour prompt was: "${prompt}"`,
              status: 'error',
            }
          : entry
      ))
    }
  }, [sendChat, status.activeModel, models])

  const handleSlashCommand = useCallback((command: string, timestamp: number) => {
    const [cmd, ...args] = command.slice(1).split(' ')
    
    switch (cmd.toLowerCase()) {
      case 'help':
        addSystemEntry([
          'AVAILABLE COMMANDS:',
          '',
          'CHAT:',
          '  /ai <prompt>   - Send prompt to AI processor',
          '  /model <name>  - Switch active model',
          '  /models        - List available Ollama models',
          '',
          'SESSION:',
          '  /clear              - Clear display (auto-save preserved)',
          '  /reset              - Wipe everything including auto-save',
          '  /saveas <name>      - Save session to named slot',
          '  /saveas <name> last:N - Save only last N entries',
          '  /sessions           - List saved sessions',
          '  /load <name>        - Load session (appends to current)',
          '  /delete <name>      - Delete a saved session',
          '',
          'SYSTEM:',
          '  /status        - Show system status',
          '  /help          - Show this message',
          '',
          'Conversation auto-saves and persists across refreshes.',
        ].join('\n'), timestamp)
        break
        
      case 'clear':
        setEntries([{
          id: `system-${timestamp}`,
          type: 'system',
          content: 'TERMINAL CLEARED (history preserved)',
          timestamp,
        }])
        break

      case 'reset':
        localStorage.removeItem(STORAGE_KEY)
        setEntries([{
          id: `system-${timestamp}`,
          type: 'system',
          content: 'TERMINAL RESET - All history deleted',
          timestamp,
        }])
        break

      case 'saveas': {
        const nameArg = args[0]
        if (!nameArg) {
          addErrorEntry('Usage: /saveas <name> [last:N]', timestamp)
          break
        }
        
        // Check for last:N modifier
        const lastArg = args.find(a => a.startsWith('last:'))
        let entriesToSave = entries
        
        if (lastArg) {
          const count = parseInt(lastArg.split(':')[1], 10)
          if (!isNaN(count) && count > 0) {
            entriesToSave = entries.slice(-count)
          }
        }
        
        // Filter out system initialization messages for cleaner saves
        const filtered = entriesToSave.filter(e => 
          !(e.type === 'system' && (e.content.includes('INITIALIZED') || e.content.includes('BACKEND CONNECTED')))
        )
        
        if (filtered.length === 0) {
          addErrorEntry('No entries to save', timestamp)
          break
        }
        
        if (saveSession(nameArg, filtered)) {
          addSystemEntry(`Session saved as "${nameArg}" (${filtered.length} entries)`, timestamp)
        } else {
          addErrorEntry('Failed to save session', timestamp)
        }
        break
      }

      case 'sessions': {
        const index = loadSessionsIndex()
        const names = Object.keys(index)
        
        if (names.length === 0) {
          addSystemEntry('No saved sessions.\n\nUse /saveas <name> to save the current session.', timestamp)
        } else {
          const sessionList = names.map(name => {
            const info = index[name]
            const date = new Date(info.savedAt).toLocaleString()
            return `  ${name} (${info.entryCount} entries) - ${date}`
          }).join('\n')
          
          addSystemEntry(`SAVED SESSIONS:\n\n${sessionList}\n\nUse /load <name> to restore.`, timestamp)
        }
        break
      }

      case 'load': {
        const sessionName = args.join(' ').trim()
        if (!sessionName) {
          addErrorEntry('Usage: /load <name>', timestamp)
          break
        }
        
        const sessionEntries = loadSession(sessionName)
        if (sessionEntries) {
          // Add a separator and append the session
          setEntries(prev => [
            ...prev,
            {
              id: `system-${timestamp}`,
              type: 'system',
              content: `─── LOADED SESSION: ${sessionName} (${sessionEntries.length} entries) ───`,
              timestamp,
            },
            ...sessionEntries,
          ])
        } else {
          addErrorEntry(`Session "${sessionName}" not found`, timestamp)
        }
        break
      }

      case 'delete': {
        const sessionToDelete = args.join(' ').trim()
        if (!sessionToDelete) {
          addErrorEntry('Usage: /delete <name>', timestamp)
          break
        }
        
        if (deleteSession(sessionToDelete)) {
          addSystemEntry(`Session "${sessionToDelete}" deleted`, timestamp)
        } else {
          addErrorEntry(`Failed to delete session "${sessionToDelete}"`, timestamp)
        }
        break
      }
        
      case 'ai':
        const prompt = args.join(' ')
        if (prompt) {
          handleAIRequest(prompt, timestamp)
        } else {
          addErrorEntry('Usage: /ai <your prompt>', timestamp)
        }
        break

      case 'model':
        const modelName = args.join(' ').trim()
        if (!modelName) {
          addSystemEntry(`Current model: ${status.activeModel || 'not set'}\n\nUsage: /model <name>\nExample: /model llama3.1:8b`, timestamp)
        } else {
          // Check if model exists
          if (models.includes(modelName)) {
            setActiveModel(modelName)
            addSystemEntry(`Model switched to: ${modelName}`, timestamp)
          } else {
            // Try partial match
            const match = models.find(m => m.toLowerCase().includes(modelName.toLowerCase()))
            if (match) {
              setActiveModel(match)
              addSystemEntry(`Model switched to: ${match}`, timestamp)
            } else {
              addErrorEntry(`Model "${modelName}" not found.\nAvailable: ${models.slice(0, 5).join(', ')}${models.length > 5 ? '...' : ''}`, timestamp)
            }
          }
        }
        break

      case 'models':
        addSystemEntry('Fetching models from Ollama...', timestamp)
        fetchModels().then((modelList) => {
          if (modelList.length > 0) {
            const activeModel = status.activeModel
            const currentMarker = (m: string): string => m === activeModel ? ' ← active' : ''
            addSystemEntry(`Available models:\n  ${modelList.map((m: string) => m + currentMarker(m)).join('\n  ')}`, Date.now())
          } else {
            addSystemEntry('No models found. Is Ollama running?', Date.now())
          }
        })
        break

      case 'status':
        addSystemEntry([
          'SYSTEM STATUS:',
          `  Backend: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`,
          `  Ollama:  ${status.connected ? 'ONLINE' : 'STANDBY'}`,
          `  Models:  ${models.length} available`,
        ].join('\n'), timestamp)
        break
        
      default:
        addErrorEntry(`Unknown command: /${cmd}`, timestamp)
    }
  }, [addSystemEntry, addErrorEntry, handleAIRequest, fetchModels, connected, status.connected, models.length])

  const handleCommand = useCallback((command: string) => {
    const timestamp = Date.now()
    
    // Add user entry
    const userEntry: LogEntry = {
      id: `user-${timestamp}`,
      type: 'user',
      content: command,
      timestamp,
    }
    
    setEntries(prev => [...prev, userEntry])

    // Parse command
    if (command.startsWith('/')) {
      handleSlashCommand(command, timestamp)
    } else {
      // Regular input - send to AI
      handleAIRequest(command, timestamp)
    }
  }, [handleSlashCommand, handleAIRequest])

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    return date.toISOString().slice(0, 19).replace('T', ' ')
  }

  return (
    <div className="h-full flex flex-col">
      {/* Terminal Feed */}
      <div 
        ref={feedRef}
        className="flex-1 overflow-y-auto p-4"
      >
        <div className="max-w-3xl mx-auto space-y-3">
          {entries.map((entry) => (
            <LogEntryBlock 
              key={entry.id} 
              entry={entry} 
              formatTimestamp={formatTimestamp}
            />
          ))}
        </div>
      </div>

      {/* Command Input */}
      <div className="border-t border-terminal-border p-4">
        <div className="max-w-3xl mx-auto">
          <CommandInput onSubmit={handleCommand} />
        </div>
      </div>
    </div>
  )
}

interface LogEntryBlockProps {
  entry: LogEntry
  formatTimestamp: (ts: number) => string
}

function LogEntryBlock({ entry, formatTimestamp }: LogEntryBlockProps) {
  const typeStyles = {
    user: 'border-phosphor',
    system: 'border-terminal-gray',
    ai: 'border-phosphor shadow-glow-sm',
    error: 'border-red-500',
  }

  const typeLabels = {
    user: 'INPUT',
    system: 'SYS',
    ai: 'AI',
    error: 'ERR',
  }

  const textColors = {
    user: 'text-phosphor',
    system: 'text-terminal-muted',
    ai: 'text-phosphor',
    error: 'text-red-400',
  }

  return (
    <div className={`border-l-2 ${typeStyles[entry.type]} pl-4 py-2`}>
      {/* Header */}
      <div className="flex items-center gap-3 text-xs text-terminal-muted mb-1">
        <span className="text-terminal-gray">[{formatTimestamp(entry.timestamp)}]</span>
        <span className={`font-bold ${textColors[entry.type]}`}>
          {typeLabels[entry.type]}
        </span>
        {entry.status === 'running' && (
          <span className="flex items-center gap-1">
            <span className="led led-running"></span>
            <span className="text-amber-500 animate-pulse">PROCESSING</span>
          </span>
        )}
        {entry.status === 'success' && (
          <span className="led led-success"></span>
        )}
        {entry.status === 'error' && (
          <span className="led led-error"></span>
        )}
      </div>
      
      {/* Content */}
      <div className={`${textColors[entry.type]} whitespace-pre-wrap font-mono text-sm`}>
        {entry.content || (entry.status === 'running' ? '...' : '')}
      </div>
    </div>
  )
}
