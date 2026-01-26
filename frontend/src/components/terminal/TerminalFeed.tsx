import { useState, useRef, useEffect, useCallback } from 'react'
import { CommandInput } from './CommandInput'
import { SessionPanel, SaveSessionModal } from './SessionPanel'
import { CircuitTrace } from './CircuitTrace'
import { DownloadPanel } from './DownloadPanel'
import { useSocket } from '../../hooks/useSocket'
import { useSystemStatus } from '../../hooks/useSystemStatus'
import { terminalOutputBus, getCircuitContext } from '../../hooks/useTerminalOutput'
import { 
  useCircuitRunner, 
  useCircuitExecution,
  getCircuitNames, 
  loadSavedCircuits,
  saveCircuit,
  SavedCircuit,
} from '../../hooks/useCircuitRunner'
import { NOTEBOOK_TEMPLATES } from '../circuit/TemplatesSidebar'
import type { LogEntry } from '../../types/module'

const BACKEND_URL = 'http://localhost:8000'
const STORAGE_KEY = 'loom-terminal-history'
const SESSIONS_KEY = 'loom-terminal-sessions'
const BEFORE_CLEAR_KEY = 'loom-terminal-before-clear'
const MAX_STORED_ENTRIES = 500
const PANEL_COLLAPSED_KEY = 'loom-session-panel-collapsed'

// State for collecting circuit inputs
interface CircuitInputState {
  circuitName: string
  requiredInputs: string[]
  collectedInputs: Record<string, string>
  currentInputIndex: number
}

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

// Stash current entries for /restore (used before /clear)
function stashBeforeClear(entries: LogEntry[]): void {
  const isAlreadyCleared = entries.length === 1 &&
    entries[0].type === 'system' &&
    entries[0].content?.includes('Display cleared')
  if (entries.length === 0 || isAlreadyCleared) return
  try {
    localStorage.setItem(BEFORE_CLEAR_KEY, JSON.stringify(entries))
  } catch (e) {
    console.warn('[LOOM] Failed to stash before clear:', e)
  }
}

// Load stashed entries (from before /clear)
function loadBeforeClear(): LogEntry[] | null {
  try {
    const stored = localStorage.getItem(BEFORE_CLEAR_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.warn('[LOOM] Failed to load before-clear stash:', e)
  }
  return null
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
  const { connected, sendChat, pullModel } = useSocket()
  const { status, models, fetchModels, setActiveModel } = useSystemStatus()
  const { runCircuit, getRequiredInputs } = useCircuitRunner()
  const circuitExecution = useCircuitExecution()
  
  const [entries, setEntries] = useState<LogEntry[]>(loadEntries)
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    try {
      return localStorage.getItem(PANEL_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [circuitInputState, setCircuitInputState] = useState<CircuitInputState | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{
    model: string
    status: string
    completed: number
    total: number
    percent?: number
    message?: string
    error?: string
  } | null>(null)
  
  const feedRef = useRef<HTMLDivElement>(null)
  const currentAIEntryRef = useRef<string | null>(null)
  
  // Persist panel state
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, String(panelCollapsed))
    } catch {}
  }, [panelCollapsed])

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

  // Show connection status on change and fetch models when connected
  useEffect(() => {
    const timestamp = Date.now()
    if (connected) {
      setEntries(prev => [...prev, {
        id: `system-${timestamp}`,
        type: 'system',
        content: '[BACKEND CONNECTED] Ready for AI processing.',
        timestamp,
      }])
      // Fetch models when backend connects (with retry)
      const fetchWithRetry = async (attempts = 3) => {
        for (let i = 0; i < attempts; i++) {
          const modelList = await fetchModels()
          if (modelList.length > 0) {
            console.log(`[LOOM] Loaded ${modelList.length} models on connect`)
            return
          }
          if (i < attempts - 1) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 2000))
          }
        }
        // This is normal - models will load when available
        console.debug('[LOOM] Models will load automatically when available')
      }
      fetchWithRetry()
    }
  }, [connected, fetchModels])

  // Listen for models_updated event
  useEffect(() => {
    const handleModelsUpdated = () => {
      console.log('[LOOM] Models updated, refreshing list...')
      fetchModels()
    }
    
    window.addEventListener('loom:models_updated', handleModelsUpdated)
    return () => {
      window.removeEventListener('loom:models_updated', handleModelsUpdated)
    }
  }, [fetchModels])

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

  const handleAIRequest = useCallback((
    prompt: string, 
    timestamp: number, 
    contextMode: 'input' | 'key' | 'full' = 'input'
  ) => {
    const entryId = `ai-${timestamp}`
    currentAIEntryRef.current = entryId
    
    setEntries(prev => [...prev, {
      id: entryId,
      type: 'ai',
      content: '',
      timestamp,
      status: 'running',
    }])

    const handleChunk = (chunk: { content: string }) => {
      setEntries(prev => prev.map(entry => 
        entry.id === entryId
          ? { ...entry, content: entry.content + chunk.content }
          : entry
      ))
    }

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

    const modelToUse = status.activeModel || models[0] || 'llama3.1:8b'
    const circuitContext = getCircuitContext()
    
    // Build prompt based on context mode
    let enhancedPrompt: string
    
    if (contextMode === 'input') {
      enhancedPrompt = circuitContext
        ? `${circuitContext}\n\n---\n\nUser question: ${prompt}`
        : prompt
    } else {
      // Full or Key: include conversation history (entries not yet including this user message)
      const relevant = entries.filter(e => e.type === 'user' || e.type === 'ai').slice(-16)
      const historyBlock = relevant.map(e => {
        if (e.type === 'user') return `User: ${e.content}`
        const text = e.content || ''
        if (contextMode === 'key') {
          return `Assistant: ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`
        }
        return `Assistant: ${text}`
      }).join('\n\n')
      
      const withHistory = historyBlock
        ? `Previous conversation:\n\n${historyBlock}\n\nUser: ${prompt}`
        : `User: ${prompt}`
      
      enhancedPrompt = circuitContext
        ? `${circuitContext}\n\n---\n\n${withHistory}`
        : withHistory
    }
    
    const sent = sendChat(enhancedPrompt, modelToUse, handleChunk, handleStatus)
    
    if (!sent) {
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
  }, [sendChat, status.activeModel, models, entries])

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
          '  /pull <name>   - Download a new Ollama model',
          '',
          'CIRCUITS:',
          '  /circuits           - List saved circuits',
          '  /run <name>         - Run a saved circuit',
          '  /<circuit-name>     - Shorthand to run a circuit',
          '',
          'SESSION:',
          '  /clear              - Clear display; /restore to bring back',
          '  /restore            - Restore content from before /clear',
          '  /reset              - Wipe everything (no restore)',
          '  /saveas <name>      - Save current session to a named slot',
          '  /saveas <name> last:N - Save only last N entries',
          '  /sessions           - List saved sessions',
          '  /load <name>        - Load a saved session (replaces current)',
          '  /delete <name>      - Delete a saved session',
          '',
          'SYSTEM:',
          '  /status        - Show system status',
          '  /suggest       - Get model suggestions for your system',
          '  /help          - Show this message',
          '',
          'Current session auto-saves. Use SAVE in the Sessions panel or /saveas to name it.',
        ].join('\n'), timestamp)
        break
        
      case 'clear': {
        stashBeforeClear(entries)
        setCircuitInputState(null)
        setEntries([{
          id: `system-${timestamp}`,
          type: 'system',
          content: 'Display cleared. Use /restore to bring back.',
          timestamp,
        }])
        break
      }

      case 'restore': {
        const stashed = loadBeforeClear()
        if (stashed && stashed.length > 0) {
          setEntries(() => [{
            id: `system-${timestamp}`,
            type: 'system',
            content: 'Restored.',
            timestamp,
          }, ...stashed])
        } else {
          addErrorEntry('Nothing to restore. Use /clear first to stash the display.', timestamp)
        }
        break
      }

      case 'reset':
        try {
          localStorage.removeItem(STORAGE_KEY)
          localStorage.removeItem(BEFORE_CLEAR_KEY)
        } catch {}
        setCircuitInputState(null)
        setEntries([{
          id: `system-${timestamp}`,
          type: 'system',
          content: 'TERMINAL RESET — All history and /restore stash deleted.',
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
          
          addSystemEntry(`SAVED SESSIONS:\n\n${sessionList}\n\n/load <name> opens (replaces current).`, timestamp)
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
          setEntries([
            {
              id: `system-${timestamp}`,
              type: 'system',
              content: `Loaded: ${sessionName} (${sessionEntries.length} entries)`,
              timestamp,
            },
            ...sessionEntries,
          ])
        } else {
          addErrorEntry(`Session "${sessionName}" not found. Use /sessions to list.`, timestamp)
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
              // If no models loaded, try fetching them first
              if (models.length === 0) {
                addSystemEntry('No models loaded. Fetching from backend...', timestamp)
                fetchModels().then((fetchedModels) => {
                  if (fetchedModels.length > 0) {
                    const match = fetchedModels.find((m: string) => m.toLowerCase().includes(modelName.toLowerCase()))
                    if (match) {
                      setActiveModel(match)
                      addSystemEntry(`Model switched to: ${match}`, Date.now())
                    } else {
                      addErrorEntry(`Model "${modelName}" not found.\nAvailable: ${fetchedModels.slice(0, 10).join(', ')}${fetchedModels.length > 10 ? '...' : ''}`, Date.now())
                    }
                  } else {
                    addErrorEntry(`Model "${modelName}" not found.\nNo models available. Is Ollama running?`, Date.now())
                  }
                })
              } else {
                addErrorEntry(`Model "${modelName}" not found.\nAvailable: ${models.slice(0, 10).join(', ')}${models.length > 10 ? '...' : ''}`, timestamp)
              }
            }
          }
        }
        break

      case 'models':
        addSystemEntry('Fetching models from Ollama...', timestamp)
        fetchModels().then((modelList) => {
          console.log('[LOOM] Fetched models list:', modelList)
          if (modelList.length > 0) {
            const activeModel = status.activeModel
            const currentMarker = (m: string): string => m === activeModel ? ' ← active' : ''
            addSystemEntry(`Available models (${modelList.length}):\n  ${modelList.map((m: string) => m + currentMarker(m)).join('\n  ')}`, Date.now())
          } else {
            addSystemEntry('No models found. Is Ollama running? Try: ollama list', Date.now())
          }
        }).catch((error) => {
          console.error('[LOOM] Error fetching models:', error)
          addErrorEntry(`Failed to fetch models: ${error.message}`, Date.now())
        })
        break

      case 'pull':
        const modelToPull = args.join(' ').trim()
        if (!modelToPull) {
          // Fetch and show suggestions based on system specs
          addSystemEntry('Analyzing your system and fetching model suggestions...', timestamp)
          fetch(`${BACKEND_URL}/api/suggest-models`)
            .then(res => res.json())
            .then(data => {
              if (data.error) {
                addErrorEntry(`Failed to get suggestions: ${data.error}`, Date.now())
                addSystemEntry('Usage: /pull <model-name>\nExample: /pull llama3.1:8b', Date.now())
                return
              }
              
              const system = data.system || {}
              const suggestions = data.suggestions || []
              
              let message = 'MODEL SUGGESTIONS FOR YOUR SYSTEM:\n\n'
              message += `System: ${system.platform || 'Unknown'} | ${system.ram_gb || '?'}GB RAM`
              if (system.gpu_available) {
                message += ` | ${system.gpu_type || 'GPU'}`
              }
              message += '\n\n'
              
              if (suggestions.length > 0) {
                message += 'Recommended models:\n'
                suggestions.slice(0, 8).forEach((sug: any, idx: number) => {
                  message += `  ${idx + 1}. ${sug.model}\n`
                  message += `     ${sug.description}\n`
                  message += `     → ${sug.reason}\n\n`
                })
                message += 'Usage: /pull <model-name>\nExample: /pull llama3.1:8b'
              } else {
                message += 'No suitable models found for your system specs.\n'
                message += 'Popular models to try:\n'
                message += '  llama3.1:8b\n  mistral\n  phi3:mini\n  tinyllama'
              }
              
              addSystemEntry(message, Date.now())
            })
            .catch(err => {
              console.error('[LOOM] Error fetching suggestions:', err)
              addSystemEntry('Usage: /pull <model-name>\nExample: /pull llama3.1:8b\n\nPopular models:\n  llama3.1:8b\n  llama3.1:70b\n  mistral\n  codellama\n  phi3', Date.now())
            })
        } else {
          addSystemEntry(`Pulling model "${modelToPull}"...\nThis may take a while depending on model size.`, timestamp)
          
          // Initialize download progress
          setDownloadProgress({
            model: modelToPull,
            status: 'starting',
            completed: 0,
            total: 0,
            message: 'Initializing download...',
          })
          
          // Track progress entry ID to update it
          let progressEntryId: string | null = null
          
          pullModel(modelToPull, (progress: any) => {
            const progressTimestamp = Date.now()
            const status = progress.status || 'unknown'
            const message = progress.message || status
            const percent = progress.percent
            const completed = progress.completed || 0
            const total = progress.total || 0
            
            // Update download panel
            setDownloadProgress({
              model: modelToPull,
              status: status,
              completed: completed,
              total: total,
              percent: percent,
              message: message,
              error: progress.error,
            })
            
            if (status === 'success') {
              addSystemEntry(`✓ Model "${modelToPull}" downloaded successfully!`, progressTimestamp)
              // Refresh models list
              fetchModels()
              // Auto-close panel after 5 seconds
              setTimeout(() => {
                setDownloadProgress(null)
              }, 5000)
            } else if (status === 'error') {
              const errorMsg = progress.error || progress.message || 'Unknown error occurred'
              let errorText = `✗ Failed to download model "${modelToPull}"\n\nError: ${errorMsg}`
              
              // Add helpful suggestions based on common errors
              if (errorMsg.includes('connection') || errorMsg.includes('refused')) {
                errorText += '\n\nTip: Make sure Ollama is running. Try: ollama list'
              } else if (errorMsg.includes('not found') || errorMsg.includes('404')) {
                errorText += '\n\nTip: Check the model name. Try: /suggest to see available models'
              } else if (errorMsg.includes('permission') || errorMsg.includes('denied')) {
                errorText += '\n\nTip: Check file permissions for Ollama model storage'
              }
              
              addErrorEntry(errorText, progressTimestamp)
              // Keep error visible, user can close manually
            } else {
              // Update progress in terminal (minimal, main info in panel)
              let progressText = `${status}...`
              if (percent !== null && percent !== undefined) {
                progressText += ` ${percent}%`
              } else if (total > 0) {
                const mbCompleted = (completed / 1024 / 1024).toFixed(1)
                const mbTotal = (total / 1024 / 1024).toFixed(1)
                progressText += ` ${mbCompleted}MB / ${mbTotal}MB`
              }
              
              // Update or create progress entry
              if (progressEntryId) {
                setEntries(prev => prev.map(entry => 
                  entry.id === progressEntryId 
                    ? { ...entry, content: `Downloading "${modelToPull}": ${progressText}` }
                    : entry
                ))
              } else {
                const newEntry: LogEntry = {
                  id: `pull-${progressTimestamp}`,
                  type: 'system',
                  content: `Downloading "${modelToPull}": ${progressText}`,
                  timestamp: progressTimestamp,
                }
                progressEntryId = newEntry.id
                setEntries(prev => [...prev, newEntry])
              }
            }
          })
        }
        break

      case 'suggest':
        addSystemEntry('Analyzing your system and fetching model suggestions...', timestamp)
        fetch(`${BACKEND_URL}/api/suggest-models`)
          .then(res => res.json())
          .then(data => {
            if (data.error) {
              addErrorEntry(`Failed to get suggestions: ${data.error}`, Date.now())
              return
            }
            
            const system = data.system || {}
            const suggestions = data.suggestions || []
            
            let message = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            message += '  MODEL SUGGESTIONS FOR YOUR SYSTEM\n'
            message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n'
            
            message += 'SYSTEM SPECS:\n'
            message += `  Platform: ${system.platform || 'Unknown'} ${system.architecture || ''}\n`
            message += `  RAM: ${system.ram_gb || '?'}GB total, ${system.ram_available_gb || '?'}GB available\n`
            message += `  CPU: ${system.cpu_cores || '?'} cores (${system.cpu_count || '?'} threads)\n`
            if (system.gpu_available) {
              message += `  GPU: ${system.gpu_type || 'Available'}\n`
              if (system.gpu_memory_gb) {
                message += `  GPU Memory: ${system.gpu_memory_gb}GB\n`
              }
            } else {
              message += `  GPU: Not available (CPU-only mode)\n`
            }
            message += '\n'
            
            if (suggestions.length > 0) {
              message += 'RECOMMENDED MODELS:\n\n'
              suggestions.forEach((sug: any, idx: number) => {
                message += `  ${idx + 1}. ${sug.model}\n`
                message += `     ${sug.description}\n`
                message += `     → ${sug.reason}\n\n`
              })
              message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
              message += 'To download a model, use: /pull <model-name>\n'
              message += 'Example: /pull llama3.1:8b'
            } else {
              message += 'No suitable models found for your system specs.\n\n'
              message += 'You may want to try lightweight models:\n'
              message += '  /pull tinyllama\n'
              message += '  /pull phi3:mini\n'
              message += '  /pull gemma:2b'
            }
            
            addSystemEntry(message, Date.now())
          })
          .catch(err => {
            console.error('[LOOM] Error fetching suggestions:', err)
            addErrorEntry(`Failed to fetch suggestions: ${err.message}`, Date.now())
          })
        break

      case 'status':
        addSystemEntry([
          'SYSTEM STATUS:',
          `  Backend: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`,
          `  Ollama:  ${status.connected ? 'ONLINE' : 'STANDBY'}`,
          `  Models:  ${models.length} available`,
          `  Circuits: ${getCircuitNames().length} saved`,
        ].join('\n'), timestamp)
        break

      case 'circuits': {
        const circuitNames = getCircuitNames()
        const circuits = loadSavedCircuits()
        
        // Build saved circuits list
        const savedList = circuitNames.length > 0 
          ? circuitNames.map(name => {
              const circuit = circuits[name]
              const inputCount = circuit.cells.filter(c => c.type === 'data_input').length
              const cellCount = circuit.cells.length
              return `  /${name} (${cellCount} cells${inputCount > 0 ? `, ${inputCount} inputs` : ''})`
            }).join('\n')
          : '  (none yet)'
        
        // Group templates by category
        const categories = ['thinking', 'writing', 'music', 'data', 'code', 'scripts'] as const
        const categoryLabels: Record<string, string> = {
          thinking: 'THINK',
          writing: 'WRITE', 
          music: 'MUSIC',
          data: 'DATA',
          code: 'CODE',
          scripts: 'SCRIPTS',
        }
        
        const templatesByCategory = categories.map(cat => {
          const templates = NOTEBOOK_TEMPLATES.filter(t => t.category === cat)
          if (templates.length === 0) return ''
          
          const list = templates.map(t => {
            const inputCount = t.cells.filter(c => c.type === 'data_input').length
            return `    /${t.id} - ${t.name}${inputCount > 0 ? ` (${inputCount} inputs)` : ''}`
          }).join('\n')
          
          return `  ${categoryLabels[cat]}:\n${list}`
        }).filter(Boolean).join('\n\n')
        
        addSystemEntry(
          `CIRCUITS:\n\n` +
          `YOUR SAVED:\n${savedList}\n\n` +
          `TEMPLATES:\n${templatesByCategory}\n\n` +
          `Run with: /<name>`,
          timestamp
        )
        break
      }

      case 'run': {
        const circuitName = args.join('-').trim()
        if (!circuitName) {
          addErrorEntry('Usage: /run <circuit-name>', timestamp)
          break
        }
        
        // Check saved circuits first, then templates
        const circuitNames = getCircuitNames()
        const template = NOTEBOOK_TEMPLATES.find(t => t.id === circuitName)
        
        if (!circuitNames.includes(circuitName) && !template) {
          addErrorEntry(`Circuit "${circuitName}" not found.\nUse /circuits to see available circuits.`, timestamp)
          break
        }
        
        // If it's a template, save it as a circuit first
        if (template && !circuitNames.includes(circuitName)) {
          const savedCircuit: SavedCircuit = {
            name: template.id,
            cells: template.cells.map((cell, idx) => ({
              ...cell,
              id: `cell-${Date.now()}-${idx}`,
            })),
            modelSlots: { A: '', B: '', C: '' },
            savedAt: Date.now(),
          }
          saveCircuit(savedCircuit)
        }
        
        // Check if circuit needs inputs
        const requiredInputs = getRequiredInputs(circuitName)
        
        if (requiredInputs.length > 0) {
          // Start input collection
          setCircuitInputState({
            circuitName,
            requiredInputs,
            collectedInputs: {},
            currentInputIndex: 0,
          })
          
          addSystemEntry(
            `Running circuit: ${circuitName}\n\nPlease provide inputs:\n\n[${requiredInputs[0]}]:`,
            timestamp
          )
        } else {
          // Run immediately
          addSystemEntry(`Running circuit: ${circuitName}...`, timestamp)
          
          runCircuit(circuitName, {}).then(output => {
            setEntries(prev => [...prev, {
              id: `circuit-output-${Date.now()}`,
              type: 'ai',
              content: output,
              timestamp: Date.now(),
              status: 'success',
            }])
          }).catch(err => {
            addErrorEntry(`Circuit failed: ${err.message}`, Date.now())
          })
        }
        break
      }
        
      default: {
        // Check if command matches a saved circuit or template
        const circuitNames = getCircuitNames()
        const template = NOTEBOOK_TEMPLATES.find(t => t.id === cmd)
        
        if (circuitNames.includes(cmd) || template) {
          // If it's a template, save it as a circuit first
          if (template && !circuitNames.includes(cmd)) {
            const savedCircuit: SavedCircuit = {
              name: template.id,
              cells: template.cells.map((cell, idx) => ({
                ...cell,
                id: `cell-${Date.now()}-${idx}`,
              })),
              modelSlots: { A: '', B: '', C: '' },
              savedAt: Date.now(),
            }
            saveCircuit(savedCircuit)
          }
          
          // Now run it
          const requiredInputs = getRequiredInputs(cmd)
          
          if (requiredInputs.length > 0) {
            setCircuitInputState({
              circuitName: cmd,
              requiredInputs,
              collectedInputs: {},
              currentInputIndex: 0,
            })
            
            addSystemEntry(
              `Running circuit: ${cmd}\n\nProvide inputs:\n\n[${requiredInputs[0]}]:`,
              timestamp
            )
          } else {
            addSystemEntry(`Running circuit: ${cmd}...`, timestamp)
            
            runCircuit(cmd, {}).then(output => {
              setEntries(prev => [...prev, {
                id: `circuit-output-${Date.now()}`,
                type: 'ai',
                content: output,
                timestamp: Date.now(),
                status: 'success',
              }])
            }).catch(err => {
              addErrorEntry(`Circuit failed: ${err.message}`, Date.now())
            })
          }
        } else {
          addErrorEntry(`Unknown command: /${cmd}`, timestamp)
        }
      }
    }
  }, [addSystemEntry, addErrorEntry, handleAIRequest, fetchModels, connected, status, models.length, getRequiredInputs, runCircuit])

  const handleCommand = useCallback((command: string, contextMode: 'input' | 'key' | 'full' = 'input') => {
    const timestamp = Date.now()
    
    const userEntry: LogEntry = {
      id: `user-${timestamp}`,
      type: 'user',
      content: command,
      timestamp,
    }
    
    setEntries(prev => [...prev, userEntry])

    if (circuitInputState) {
      const { circuitName, requiredInputs, collectedInputs, currentInputIndex } = circuitInputState
      const currentLabel = requiredInputs[currentInputIndex]
      
      // Store this input
      const newCollectedInputs = { ...collectedInputs, [currentLabel]: command }
      
      if (currentInputIndex < requiredInputs.length - 1) {
        // More inputs needed
        const nextLabel = requiredInputs[currentInputIndex + 1]
        setCircuitInputState({
          ...circuitInputState,
          collectedInputs: newCollectedInputs,
          currentInputIndex: currentInputIndex + 1,
        })
        addSystemEntry(`[${nextLabel}]:`, timestamp)
      } else {
        // All inputs collected, run the circuit
        setCircuitInputState(null)
        addSystemEntry(`All inputs collected. Running ${circuitName}...`, timestamp)
        
        runCircuit(circuitName, newCollectedInputs).then(output => {
          setEntries(prev => [...prev, {
            id: `circuit-output-${Date.now()}`,
            type: 'ai',
            content: output,
            timestamp: Date.now(),
            status: 'success',
          }])
        }).catch(err => {
          addErrorEntry(`Circuit failed: ${err.message}`, Date.now())
        })
      }
      return
    }

    if (command.startsWith('/')) {
      handleSlashCommand(command, timestamp)
    } else {
      handleAIRequest(command, timestamp, contextMode)
    }
  }, [handleSlashCommand, handleAIRequest, circuitInputState, addSystemEntry, addErrorEntry, runCircuit])

  // Session panel handlers
  const handleLoadSession = useCallback((name: string) => {
    const sessionEntries = loadSession(name)
    if (sessionEntries) {
      const timestamp = Date.now()
      setEntries([
        {
          id: `system-${timestamp}`,
          type: 'system',
          content: `Loaded: ${name} (${sessionEntries.length} entries)`,
          timestamp,
        },
        ...sessionEntries,
      ])
    }
  }, [])

  const handleSaveSession = useCallback((name: string) => {
    // Filter out system initialization messages
    const filtered = entries.filter(e => 
      !(e.type === 'system' && (e.content.includes('INITIALIZED') || e.content.includes('BACKEND CONNECTED')))
    )
    
    if (saveSession(name, filtered)) {
      const timestamp = Date.now()
      setEntries(prev => [...prev, {
        id: `system-${timestamp}`,
        type: 'system',
        content: `Session saved as "${name}" (${filtered.length} entries)`,
        timestamp,
      }])
    }
  }, [entries])

  const handleNewSession = useCallback(() => {
    const timestamp = Date.now()
    setEntries([{
      id: `system-${timestamp}`,
      type: 'system',
      content: 'NEW SESSION STARTED',
      timestamp,
    }, {
      id: `system-${timestamp + 1}`,
      type: 'system',
      content: 'Type /help for available commands.',
      timestamp: timestamp + 1,
    }])
  }, [])

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    return date.toISOString().slice(0, 19).replace('T', ' ')
  }

  return (
    <div className="h-full flex">
      {/* Session Panel */}
      <SessionPanel
        isCollapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed(prev => !prev)}
        onLoadSession={handleLoadSession}
        onSaveSession={() => setShowSaveModal(true)}
        onNewSession={handleNewSession}
        currentEntryCount={entries.length}
      />
      
      {/* Main Terminal Area */}
      <div className="flex-1 flex flex-col">
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
            <CommandInput 
              onSubmit={handleCommand} 
              placeholder={circuitInputState 
                ? `Enter value for [${circuitInputState.requiredInputs[circuitInputState.currentInputIndex]}]...`
                : undefined
              }
            />
          </div>
        </div>
      </div>
      
      {/* Circuit Execution Trace */}
      {circuitExecution && <CircuitTrace />}
      
      {/* Download Panel */}
      {downloadProgress && (
        <DownloadPanel 
          progress={downloadProgress} 
          onClose={() => setDownloadProgress(null)}
        />
      )}
      
      {/* Save Session Modal */}
      <SaveSessionModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveSession}
      />
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
