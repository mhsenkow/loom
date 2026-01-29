import { useState, useRef, useEffect, useCallback } from 'react'
import { CommandInput } from './CommandInput'
import { SessionPanel, SaveSessionModal } from './SessionPanel'
import { CircuitTrace } from './CircuitTrace'
import { DownloadPanel } from './DownloadPanel'
import { ImageAnalysisPanel } from './ImageAnalysisPanel'
import { ImageGenerationPanel } from './ImageGenerationPanel'
import { ImageModal } from './ImageModal'
import { FloatingToolbar } from './FloatingToolbar'
import { CodeContextPanel } from './CodeContextPanel'
import { MusicSetupPanel } from './MusicSetupPanel'
import { MusicGenerationPanel } from './MusicGenerationPanel'
import { MusicPlayerCard } from './MusicPlayerCard'
import { useSocket } from '../../hooks/useSocket'

// Recommended image generation models (matching ImageGenerationPanel)
const RECOMMENDED_IMAGE_GEN_MODELS = [
  { name: 'x/flux2-klein', description: 'FLUX.2 Klein - Fast, great text rendering, macOS only', size: '~5.7GB (4B) or ~12GB (9B)' },
  { name: 'x/flux2-klein:4b', description: 'FLUX.2 Klein 4B - Smaller, faster version', size: '~5.7GB' },
  { name: 'x/flux2-klein:9b', description: 'FLUX.2 Klein 9B - Higher quality version', size: '~12GB' },
]
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
const API_BASE = 'http://localhost:8000'

// State for collecting circuit inputs
interface CircuitInputState {
  circuitName: string
  requiredInputs: string[]
  collectedInputs: Record<string, string>
  currentInputIndex: number
}

// Extract media file URLs from entries (for shared datapool tracking)
function extractMediaFiles(entries: LogEntry[]): string[] {
  const mediaFiles: string[] = []
  for (const entry of entries) {
    // Check for image URLs (directly on entry or in content)
    if (entry.imageUrl?.includes('/api/images/files/')) {
      mediaFiles.push(entry.imageUrl)
    }
    // Check for audio/music URLs
    if (entry.audioUrl?.includes('/api/music/files/')) {
      mediaFiles.push(entry.audioUrl)
    }
    // Also scan content for any embedded URLs
    if (entry.content?.includes('/api/images/files/')) {
      const matches = entry.content.match(/\/api\/images\/files\/[^\s"')]+/g)
      if (matches) mediaFiles.push(...matches)
    }
    if (entry.content?.includes('/api/music/files/')) {
      const matches = entry.content.match(/\/api\/music\/files\/[^\s"')]+/g)
      if (matches) mediaFiles.push(...matches)
    }
  }
  return [...new Set(mediaFiles)] // Deduplicate
}

// Load saved sessions index (from backend with localStorage fallback)
async function loadSessionsIndexAsync(): Promise<Record<string, { savedAt: number; entryCount: number; mediaFiles?: string[] }>> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`)
    if (res.ok) {
      const data = await res.json()
      return data.sessions || {}
    }
  } catch (e) {
    console.warn('[LOOM] Backend unavailable, using localStorage:', e)
  }
  // Fallback to localStorage
  try {
    const stored = localStorage.getItem(SESSIONS_KEY)
    if (stored) return JSON.parse(stored)
  } catch (e) {
    console.warn('[LOOM] Failed to load sessions index:', e)
  }
  return {}
}

// Sync version for compatibility
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

// Save a session (to backend - no localStorage backup needed)
async function saveSessionAsync(name: string, entries: LogEntry[]): Promise<boolean> {
  const mediaFiles = extractMediaFiles(entries)

  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, entries, mediaFiles }),
    })
    if (res.ok) {
      // Backend saved successfully - just trigger UI refresh
      window.dispatchEvent(new CustomEvent('loom:session-saved', { detail: { name } }))
      return true
    }
  } catch (e) {
    console.warn('[LOOM] Backend save failed, trying localStorage:', e)
  }

  // Fallback to localStorage only (when backend unavailable)
  return saveSession(name, entries)
}

// Sync version - localStorage only (with quota handling)
function saveSession(name: string, entries: LogEntry[]): boolean {
  try {
    localStorage.setItem(`${SESSIONS_KEY}:${name}`, JSON.stringify(entries))
    const index = loadSessionsIndex()
    index[name] = { savedAt: Date.now(), entryCount: entries.length }
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(index))
    window.dispatchEvent(new CustomEvent('loom:session-saved', { detail: { name } }))
    return true
  } catch (e) {
    console.warn('[LOOM] Failed to save session:', e)
    return false
  }
}

// Load a session (from backend with localStorage fallback)
async function loadSessionAsync(name: string): Promise<LogEntry[] | null> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(name)}`)
    if (res.ok) {
      const data = await res.json()
      return data.entries || null
    }
  } catch (e) {
    console.warn('[LOOM] Backend load failed, using localStorage:', e)
  }
  // Fallback to localStorage
  return loadSession(name)
}

// Sync version for compatibility
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

// Delete a session (from backend with localStorage cleanup)
async function deleteSessionAsync(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (res.ok) {
      // Also remove from localStorage
      localStorage.removeItem(`${SESSIONS_KEY}:${name}`)
      const index = loadSessionsIndex()
      delete index[name]
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(index))
      window.dispatchEvent(new CustomEvent('loom:session-deleted', { detail: { name } }))
      return true
    }
  } catch (e) {
    console.warn('[LOOM] Backend delete failed, using localStorage:', e)
  }
  // Fallback to localStorage only
  return deleteSession(name)
}

// Sync version for compatibility
function deleteSession(name: string): boolean {
  try {
    localStorage.removeItem(`${SESSIONS_KEY}:${name}`)
    const index = loadSessionsIndex()
    delete index[name]
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(index))
    window.dispatchEvent(new CustomEvent('loom:session-deleted', { detail: { name } }))
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

// Generate auto session name from first user prompt (ChatGPT style)
function generateSessionName(entries: LogEntry[]): string {
  // Find first user entry
  const firstUserEntry = entries.find(e => e.type === 'user')
  if (firstUserEntry?.content) {
    // Clean and truncate to ~30 chars
    const clean = firstUserEntry.content
      .replace(/^\/\w+\s*/, '') // Remove slash commands
      .replace(/[^\w\s]/g, ' ') // Remove special chars
      .trim()
      .split(/\s+/)
      .slice(0, 5) // First 5 words
      .join(' ')
    if (clean.length > 0) {
      return clean.slice(0, 30).trim()
    }
  }
  // Fallback to timestamp
  return `session-${Date.now()}`
}

// Save session to backend silently (returns promise)
async function saveSessionSilent(name: string, entries: LogEntry[]): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        entries: entries.slice(-MAX_STORED_ENTRIES),
        mediaFiles: extractMediaFiles(entries),
      }),
    })
    return res.ok
  } catch {
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
  const { connected, sendChat, pullModel } = useSocket()
  const { status, models, fetchModels, setActiveModel, setVisionModel, setImageGenModel } = useSystemStatus()
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
  const [imageAnalysis, setImageAnalysis] = useState<{
    imageUrl: string
    analysis: string
    model: string
    status: 'analyzing' | 'success' | 'error' | 'no-model'
    error?: string
    availableVisionModels?: string[]
    recommendedModels?: Array<{ name: string; description: string; size: string }>
  } | null>(null)
  const [imageGeneration, setImageGeneration] = useState<{
    prompt: string
    imageUrl?: string
    model: string
    status: 'generating' | 'success' | 'error' | 'no-model' | 'empty'
    error?: string
    progress?: number
    message?: string
    availableModels?: string[]
    recommendedModels?: Array<{ name: string; description: string; size: string }>
  } | null>(null)
  const [selectedImageModal, setSelectedImageModal] = useState<{
    imageUrl: string
    metadata: {
      prompt?: string
      model?: string
      timestamp?: number
      provider?: string
      analysis?: string
    }
    canEdit?: boolean
  } | null>(null)
  const [codeContextPanelOpen, setCodeContextPanelOpen] = useState(false)
  const [codeContextActive, setCodeContextActive] = useState(false)
  const [codeContextFolder, setCodeContextFolder] = useState<string | null>(null)
  const [codeContextFilesIndexed, setCodeContextFilesIndexed] = useState(0)
  const [codeContextIndexing, setCodeContextIndexing] = useState(false)
  const [musicSetupPanelOpen, setMusicSetupPanelOpen] = useState(false)
  const [musicGeneration, setMusicGeneration] = useState<{
    prompt: string
    lyrics?: string
    audioUrl?: string
    duration: number
    status: 'empty' | 'generating' | 'success' | 'error'
    error?: string
    progress?: number
    message?: string
    seed?: number
  } | null>(null)

  // Current session tracking - ChatGPT style
  const [currentSessionName, setCurrentSessionName] = useState<string | null>(() => {
    // Try to restore from localStorage
    try {
      return localStorage.getItem('loom-current-session') || null
    } catch {
      return null
    }
  })
  const lastSavedEntriesCountRef = useRef(0)

  const feedRef = useRef<HTMLDivElement>(null)
  const currentAIEntryRef = useRef<string | null>(null)
  const pendingImageUrlRef = useRef<string | null>(null)
  const commandInputEditorRef = useRef<any>(null)

  // Persist panel state
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, String(panelCollapsed))
    } catch { }
  }, [panelCollapsed])

  // Auto-scroll to bottom on new entries
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [entries])

  // Persist entries to localStorage (debounced) - this is fast local backup
  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        // Only store last N entries to avoid quota issues
        const toStore = entries.slice(-MAX_STORED_ENTRIES)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
      } catch (e) {
        // Quota errors are fine - backend is primary storage now
      }
    }, 500) // Debounce 500ms

    return () => clearTimeout(timeout)
  }, [entries])

  // ChatGPT-style seamless save to backend
  useEffect(() => {
    // Don't save empty/system-only sessions
    const hasUserContent = entries.some(e => e.type === 'user' || e.type === 'ai')
    if (!hasUserContent) return

    // Debounce save - triggers after 1.5s of inactivity
    const timeout = setTimeout(() => {
      // Auto-generate session name if we don't have one yet
      let sessionName = currentSessionName
      if (!sessionName) {
        sessionName = generateSessionName(entries)
        setCurrentSessionName(sessionName)
        // Persist current session name
        try {
          localStorage.setItem('loom-current-session', sessionName)
        } catch { }
      }

      // Save to backend silently
      saveSessionSilent(sessionName, entries).then(success => {
        if (success) {
          lastSavedEntriesCountRef.current = entries.length
          // Trigger sidebar refresh
          window.dispatchEvent(new CustomEvent('loom:session-saved', { detail: { name: sessionName } }))
        }
      })
    }, 1500) // 1.5s debounce

    return () => clearTimeout(timeout)
  }, [entries, currentSessionName])

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

  // Check code context status on mount and periodically
  useEffect(() => {
    const checkCodeContextStatus = async () => {
      try {
        const response = await fetch('http://localhost:8000/api/code-context/status')
        if (!response.ok) {
          // Endpoint might not exist yet or backend error
          return
        }
        const data = await response.json()
        setCodeContextActive(data.active || false)
        setCodeContextFolder(data.folder_path || null)
        setCodeContextFilesIndexed(data.files_indexed || 0)
      } catch (e) {
        // Backend not available or endpoint doesn't exist, ignore silently
        console.debug('[LOOM] Code context status check failed (this is normal if backend is starting):', e)
      }
    }

    // Only check if backend is connected
    if (connected) {
      checkCodeContextStatus()
      const interval = setInterval(checkCodeContextStatus, 5000) // Check every 5 seconds
      return () => clearInterval(interval)
    }
  }, [connected])

  // Handle folder indexing
  const handleIndexFolder = useCallback(async (folderPath: string, options?: any) => {
    setCodeContextIndexing(true)
    try {
      // Check if backend is connected first
      if (!connected) {
        throw new Error('Backend not connected. Please wait for connection or restart the backend server.')
      }

      // Backend will handle path normalization (expanduser, resolve)
      // Use AbortController for timeout (indexing can take a while for large folders)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 300000) // 5 minute timeout

      try {
        const response = await fetch('http://localhost:8000/api/code-context/index-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            folder_path: folderPath,
            ...options,
          }),
          signal: controller.signal,
        })

        clearTimeout(timeoutId)

        if (!response.ok) {
          let errorMessage = 'Failed to index folder'
          try {
            const error = await response.json()
            errorMessage = error.detail || error.message || errorMessage
          } catch (e) {
            // If response isn't JSON, use status text
            errorMessage = `${errorMessage}: ${response.status} ${response.statusText}`
          }
          throw new Error(errorMessage)
        }

        const data = await response.json()
        setCodeContextActive(true)
        setCodeContextFolder(data.folder_path)
        setCodeContextFilesIndexed(data.files_indexed || 0)

        // Show success message
        addSystemEntry(`✓ Folder indexed: ${data.files_indexed} files, ${data.chunks_created || 0} chunks created\n\nFolder context is now active. Code will be included in chat automatically.`, Date.now())
      } finally {
        clearTimeout(timeoutId)
      }
    } catch (error) {
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        errorMessage = error.message
        // Provide helpful context for common errors
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('fetch') || errorMessage.includes('aborted')) {
          if (errorMessage.includes('aborted')) {
            errorMessage = `Request timed out (indexing took too long).\n\nTry indexing a smaller folder or check backend logs.\n\nOriginal error: ${errorMessage}`
          } else {
            errorMessage = `Backend connection failed.\n\nPossible causes:\n- Backend not running (start with: cd backend && uvicorn app.main:socket_app --reload --port 8000)\n- CORS issue (check backend logs)\n- Network error\n\nOriginal error: ${errorMessage}`
          }
        } else if (errorMessage.includes('404')) {
          errorMessage = `API endpoint not found (404).\n\nThe code-context router may not be loaded.\nCheck backend logs for import errors.\n\nError: ${errorMessage}`
        } else if (errorMessage.includes('CORS')) {
          errorMessage = `CORS error.\n\nCheck backend CORS configuration in app/main.py\n\nError: ${errorMessage}`
        } else if (errorMessage.includes('Folder not found') || errorMessage.includes('Not a directory')) {
          errorMessage = `Path error: ${errorMessage}\n\nCheck that the folder path is correct and exists.`
        }
      }
      addErrorEntry(`Failed to index folder: ${errorMessage}`, Date.now())
    } finally {
      setCodeContextIndexing(false)
    }
  }, [addSystemEntry, addErrorEntry, connected])

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

    // Ensure we use a chat model, not image generation or vision models
    const getChatModel = () => {
      const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion', 'sdxl']
      const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']

      // Check if current activeModel is actually a chat model
      if (status.activeModel) {
        const lower = status.activeModel.toLowerCase()
        const isImageGen = imageGenKeywords.some(k => lower.includes(k))
        const isVision = visionKeywords.some(k => lower.includes(k))

        // If activeModel is a chat model, use it
        if (!isImageGen && !isVision) {
          return status.activeModel
        }
        // Otherwise, it's incorrectly set to an image gen or vision model, so we need to find a chat model
      }

      // Filter out image generation and vision models from fallback
      const chatModels = models.filter(m => {
        const lower = m.toLowerCase()
        return !imageGenKeywords.some(k => lower.includes(k)) &&
          !visionKeywords.some(k => lower.includes(k))
      })

      // If we found a chat model, use it and optionally update activeModel
      const chatModel = chatModels[0] || models[0] || 'llama3.1:8b'

      // If activeModel was incorrectly set to a non-chat model, update it
      if (status.activeModel && chatModel !== status.activeModel) {
        const lowerActive = status.activeModel.toLowerCase()
        if (imageGenKeywords.some(k => lowerActive.includes(k)) ||
          visionKeywords.some(k => lowerActive.includes(k))) {
          // Silently switch to a proper chat model
          setActiveModel(chatModel)
        }
      }

      return chatModel
    }

    const modelToUse = getChatModel()
    const circuitContext = getCircuitContext()

    // Build prompt based on context mode
    let enhancedPrompt: string

    if (contextMode === 'input') {
      enhancedPrompt = circuitContext
        ? `${circuitContext}\n\n---\n\nUser question: ${prompt}`
        : prompt
    } else {
      // Full or Key: include conversation history (entries not yet including this user message)
      // Also include image entries with their analysis
      const relevant = entries.filter(e =>
        e.type === 'user' || e.type === 'ai' || e.type === 'image' || e.type === 'system'
      ).slice(-16)

      const historyBlock = relevant.map(e => {
        if (e.type === 'user') {
          return `User: ${e.content}`
        } else if (e.type === 'image') {
          // Include image analysis in context
          const analysis = e.imageAnalysis || 'Image added to conversation'
          return `[Image Context]\n${analysis}`
        } else if (e.type === 'system') {
          return `[System Event]: ${e.content}`
        } else {
          const text = e.content || ''
          if (contextMode === 'key') {
            return `Assistant: ${text.slice(0, 120)}${text.length > 120 ? '...' : ''}`
          }
          return `Assistant: ${text}`
        }
      }).join('\n\n')

      const withHistory = historyBlock
        ? `Previous conversation:\n\n${historyBlock}\n\nUser: ${prompt}`
        : `User: ${prompt}`

      enhancedPrompt = circuitContext
        ? `${circuitContext}\n\n---\n\n${withHistory}`
        : withHistory
    }

    // Include code context if active
    const useCodeContext = codeContextActive

    const sent = sendChat(enhancedPrompt, modelToUse, handleChunk, handleStatus, useCodeContext)

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
          '  /model <name>  - Switch chat model',
          '  /vision <name> - Switch vision/image analysis model',
          '  /gen <name>    - Switch image generation model',
          '  /models        - List available Ollama models',
          '  /pull <name>   - Download a new Ollama model',
          '',
          'IMAGES:',
          '  /image-models  - List available image generation models',
          '  /pull-image <name> - Download image model (Flux, SDXL, etc.)',
          '  /set-hf-token <token> - Set HuggingFace token (needed for Flux)',
          '',
          'IMAGES:',
          '  /image          - Upload and analyze an image (or use 📷 button)',
          '  /imagine <prompt> - Generate an image using Ollama (flux2-klein)',
          '  /dream <prompt>   - Alias for /imagine',
          '  Click 📷 button - Upload image for vision analysis',
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
          '  /status        - Show system status',
          '  /suggest       - Get model suggestions for your system',
          '  /image         - Upload and analyze an image (or click 📷 button)',
          '  /imagine <prompt> - Generate an image (uses Ollama flux2-klein)',
          '  /dream <prompt>   - Alias for /imagine',
          '  /song <style>     - Generate a quick music track',
          '  /compose          - Info on advanced composition',
          '  /music-setup      - Setup/download music generation model',
          '  /help          - Show this message',
          '',
          'Current session auto-saves. Use SAVE in the Sessions panel or /saveas to name it.',
        ].join('\n'), timestamp)
        break

      case 'image':
        addSystemEntry('Click the 📷 button next to the input field to upload and analyze an image.', timestamp)
        // Trigger file input click via a small delay to ensure UI is ready
        setTimeout(() => {
          const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
          if (fileInput) {
            fileInput.click()
          }
        }, 100)
        break

      case 'imagine':
      case 'dream':
        const imagePrompt = args.join(' ')
        if (!imagePrompt) {
          // Open empty state panel
          setImageGeneration({
            prompt: '',
            model: status.imageGenModel || 'auto-detecting',
            status: 'empty',
            availableModels: [],
          })
        } else {
          console.log('[LOOM] Starting image generation for:', imagePrompt)
          addSystemEntry('⏳ Generating image... Opening panel. This may take 1–2 minutes.', timestamp)
          // Show generation panel
          setImageGeneration({
            prompt: imagePrompt,
            model: status.imageGenModel || 'auto-detecting',
            status: 'generating',
            progress: 0,
            message: 'Starting...',
          })
          console.log('[LOOM] Image generation panel state set')

          // First check if we have image generation models
          fetch(`${BACKEND_URL}/api/images/check-image-gen-models`)
            .then(res => res.json())
            .then(async (checkData) => {
              console.log('[LOOM] Image gen models check:', checkData)
              const available = checkData.available || []

              if (available.length === 0 && !status.imageGenModel) {
                // No models available - show recommendations in panel
                const recommendations = checkData.recommendations || []
                console.log('[LOOM] No models found, showing recommendations')
                setImageGeneration({
                  prompt: imagePrompt,
                  model: 'none',
                  status: 'no-model',
                  availableModels: available,
                  recommendedModels: recommendations,
                })
                return
              }

              console.log('[LOOM] Models available, proceeding with generation')
              setImageGeneration(prev => prev ? { ...prev, message: 'Rendering…' } : null)
              // Try Ollama first (flux2-klein), fallback to local
              fetch(`${BACKEND_URL}/api/images/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: imagePrompt,
                  provider: 'ollama',
                  model: status.imageGenModel || undefined, // Use selected or auto-detect
                }),
              })
                .then(async res => {
                  const data = await res.json()
                  console.log('[LOOM] Image generation response:', { status: res.status, data: { ...data, image: data.image ? `${data.image.substring(0, 50)}...` : 'none' } })

                  if (res.ok && data.status === 'success' && data.image) {
                    // Update image gen model in status if it was auto-detected
                    if (data.model && data.model !== status.imageGenModel) {
                      setImageGenModel(data.model)
                    }

                    // Show in panel
                    setImageGeneration({
                      prompt: imagePrompt,
                      imageUrl: data.image,
                      model: data.model || 'Ollama',
                      status: 'success',
                    })
                  } else {
                    // Try fallback to local generation
                    const errorMsg = data.error || data.message || data.detail || 'Ollama generation failed, trying local...'
                    console.log('[LOOM] Ollama generation failed:', errorMsg)
                    throw new Error(errorMsg)
                  }
                })
                .catch(async (err) => {
                  console.log('[LOOM] Ollama generation failed, trying local:', err)
                  // Fallback to local generation
                  try {
                    const res = await fetch(`${BACKEND_URL}/api/images/generate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        prompt: imagePrompt,
                        provider: 'local',
                        model: 'sdxl',
                      }),
                    })
                    const data = await res.json()
                    if (res.ok && data.status === 'success' && data.image) {
                      setImageGeneration({
                        prompt: imagePrompt,
                        imageUrl: data.image,
                        model: 'local SDXL',
                        status: 'success',
                      })
                    } else {
                      throw new Error(data.error || data.message || 'Image generation failed')
                    }
                  } catch (fallbackErr) {
                    const errorMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr)
                    setImageGeneration({
                      prompt: imagePrompt,
                      model: status.imageGenModel || 'unknown',
                      status: 'error',
                      error: errorMsg,
                    })
                  }
                })
            })
            .catch((err) => {
              console.error('[LOOM] Error checking image gen models:', err)
              // If check fails, try anyway
              setImageGeneration({
                prompt: imagePrompt,
                model: 'checking...',
                status: 'generating',
                progress: 0,
              })

              // Try generation anyway
              fetch(`${BACKEND_URL}/api/images/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  prompt: imagePrompt,
                  provider: 'ollama',
                  model: status.imageGenModel || undefined,
                }),
              })
                .then(async res => {
                  const data = await res.json()
                  if (res.ok && data.status === 'success' && data.image) {
                    setImageGeneration({
                      prompt: imagePrompt,
                      imageUrl: data.image,
                      model: data.model || 'Ollama',
                      status: 'success',
                    })
                  } else {
                    // Try local fallback
                    throw new Error(data.error || data.message || 'Generation failed')
                  }
                })
                .catch(async (fallbackErr) => {
                  // Try local
                  try {
                    const res = await fetch(`${BACKEND_URL}/api/images/generate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        prompt: imagePrompt,
                        provider: 'local',
                        model: 'sdxl',
                      }),
                    })
                    const data = await res.json()
                    if (res.ok && data.status === 'success' && data.image) {
                      setImageGeneration({
                        prompt: imagePrompt,
                        imageUrl: data.image,
                        model: 'local SDXL',
                        status: 'success',
                      })
                    } else {
                      throw new Error(data.error || data.message || 'Generation failed')
                    }
                  } catch (localErr) {
                    setImageGeneration({
                      prompt: imagePrompt,
                      model: 'unknown',
                      status: 'error',
                      error: localErr instanceof Error ? localErr.message : String(localErr),
                    })
                  }
                })
            })
        }
        break

      case 'song':
        // Open music generation panel
        setMusicGeneration({
          prompt: args.join(' ') || '',
          lyrics: '',
          duration: 30,
          status: 'empty',
        })
        break

      case 'compose':
        addSystemEntry('🎹 To compose music with advanced controls (lyrics, duration, etc.), please switch to the Circuit Board view and add a Music Gen module.', timestamp)
        break

      case 'music-setup':
        setMusicSetupPanelOpen(true)
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
        } catch { }
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

        // Use async API with callback
        saveSessionAsync(nameArg, filtered).then(success => {
          if (success) {
            addSystemEntry(`Session saved as "${nameArg}" (${filtered.length} entries)`, Date.now())
          } else {
            addErrorEntry('Failed to save session', Date.now())
          }
        })
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

        // Use async API with callback
        loadSessionAsync(sessionName).then(sessionEntries => {
          const nowTs = Date.now()
          if (sessionEntries) {
            setEntries([
              {
                id: `system-${nowTs}`,
                type: 'system',
                content: `Loaded: ${sessionName} (${sessionEntries.length} entries)`,
                timestamp: nowTs,
              },
              ...sessionEntries,
            ])
          } else {
            addErrorEntry(`Session "${sessionName}" not found. Use /sessions to list.`, nowTs)
          }
        })
        break
      }

      case 'delete': {
        const sessionToDelete = args.join(' ').trim()
        if (!sessionToDelete) {
          addErrorEntry('Usage: /delete <name>', timestamp)
          break
        }

        // Use async API with callback
        deleteSessionAsync(sessionToDelete).then(success => {
          const nowTs = Date.now()
          if (success) {
            addSystemEntry(`Session "${sessionToDelete}" deleted`, nowTs)
          } else {
            addErrorEntry(`Failed to delete session "${sessionToDelete}"`, nowTs)
          }
        })
        break
      }

      case 'visit': {
        const url_arg = args.join(' ').trim()
        if (!url_arg) {
          addErrorEntry('Usage: /visit <url>', timestamp)
          break
        }

        let targetUrl = url_arg
        if (!targetUrl.startsWith('http')) {
          targetUrl = `https://${targetUrl}`
        }

        addSystemEntry(`Visiting ${targetUrl} (headless)...`, Date.now())

        fetch(`${API_BASE}/api/web/visit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl }),
        })
          .then(res => res.json())
          .then(data => {
            const nowTs = Date.now()
            if (data.status === 'success') {
              // Build content with optional vision analysis
              let displayContent = `WEB BROWSE: ${data.title}\n\n${data.text_content}`
              if (data.vision_analysis) {
                displayContent += `\n\n---\n🖼️ VISUAL ANALYSIS:\n${data.vision_analysis}`
              }

              // Show title, text, and vision analysis
              setEntries(prev => [...prev, {
                id: `web-${nowTs}`,
                type: 'system',
                content: displayContent,
                imageUrl: data.screenshot_url,
                timestamp: nowTs,
              }])

              // Auto-TL;DR (include vision analysis in context if available)
              let aiContext = `Here is the content of the web page "${data.title}" (${targetUrl}):\n\n${data.text_content}`
              if (data.vision_analysis) {
                aiContext += `\n\nVisual observations from the page:\n${data.vision_analysis}`
              }
              aiContext += `\n\nPlease provide a concise TL;DR summary of this content.`

              handleAIRequest(aiContext, nowTs + 1)
            } else {
              addErrorEntry(`Web visit failed: ${data.error}`, nowTs)
            }
          })
          .catch(e => {
            addErrorEntry(`Web visit request failed: ${e.message}`, Date.now())
          })
        break
      }

      case 'research': {
        const query = args.join(' ').trim()
        if (!query) {
          addErrorEntry('Usage: /research <query>', timestamp)
          break
        }

        addSystemEntry(`🔍 Deep searching: "${query}"...`, timestamp)

        fetch(`${API_BASE}/api/web/research`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, max_results: 3 }),
        })
          .then(res => res.json())
          .then(data => {
            const nowTs = Date.now()
            if (data.status === 'success' && data.sources) {
              // Build combined research content
              let researchContent = `📚 RESEARCH RESULTS: "${query}"\n\n`
              researchContent += `Found ${data.source_count} sources:\n\n`

              const sourceContents: string[] = []
              data.sources.forEach((source: { title: string; url: string; content: string; screenshot_url?: string }, idx: number) => {
                researchContent += `---\n**Source ${idx + 1}: ${source.title}**\n${source.url}\n\n`
                researchContent += source.content.slice(0, 1000) + (source.content.length > 1000 ? '...' : '') + '\n\n'
                sourceContents.push(`Source ${idx + 1}: ${source.title}\nURL: ${source.url}\nContent:\n${source.content}`)
              })

              // Display research results
              setEntries(prev => [...prev, {
                id: `research-${nowTs}`,
                type: 'system',
                content: researchContent,
                timestamp: nowTs,
              }])

              // Trigger AI synthesis
              const synthesisPrompt = `You have been given research from ${data.source_count} sources about "${query}". Please synthesize a comprehensive answer based on these sources:\n\n${sourceContents.join('\n\n---\n\n')}\n\nProvide a well-structured synthesis that answers the query, citing sources where appropriate.`

              handleAIRequest(synthesisPrompt, nowTs + 1)
            } else {
              addErrorEntry(`Research failed: ${data.error || 'Unknown error'}`, nowTs)
            }
          })
          .catch(e => {
            addErrorEntry(`Research request failed: ${e.message}`, Date.now())
          })
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
          const modelInfo = [
            `Current chat model: ${status.activeModel || 'not set'}`,
            `Current vision model: ${status.visionModel || 'not set'}`,
            `Current image gen model: ${status.imageGenModel || 'not set'}`,
            '',
            'Usage: /model <name> - Set chat model',
            '       /vision <name> - Set vision model',
            '       /gen <name> - Set image generation model',
            'Example: /model llama3.1:8b',
            'Example: /vision llava:7b',
            'Example: /gen x/flux2-klein',
          ].join('\n')
          addSystemEntry(modelInfo, timestamp)
        } else {
          // Check if model exists
          if (models.includes(modelName)) {
            setActiveModel(modelName)
            addSystemEntry(`Chat model switched to: ${modelName}`, timestamp)
          } else {
            // Try partial match
            const match = models.find(m => m.toLowerCase().includes(modelName.toLowerCase()))
            if (match) {
              setActiveModel(match)
              addSystemEntry(`Chat model switched to: ${match}`, timestamp)
            } else {
              // If no models loaded, try fetching them first
              if (models.length === 0) {
                addSystemEntry('No models loaded. Fetching from backend...', timestamp)
                fetchModels().then((fetchedModels) => {
                  if (fetchedModels.length > 0) {
                    const match = fetchedModels.find((m: string) => m.toLowerCase().includes(modelName.toLowerCase()))
                    if (match) {
                      setActiveModel(match)
                      addSystemEntry(`Chat model switched to: ${match}`, Date.now())
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

      case 'vision':
        const visionModelName = args.join(' ').trim()
        if (!visionModelName) {
          addSystemEntry(`Current vision model: ${status.visionModel || 'not set'}\n\nUsage: /vision <name>\nExample: /vision llava:7b`, timestamp)
        } else {
          // Check if model exists
          if (models.includes(visionModelName)) {
            setVisionModel(visionModelName)
            addSystemEntry(`Vision model switched to: ${visionModelName}`, timestamp)
          } else {
            // Try partial match
            const match = models.find(m => m.toLowerCase().includes(visionModelName.toLowerCase()))
            if (match) {
              setVisionModel(match)
              addSystemEntry(`Vision model switched to: ${match}`, timestamp)
            } else {
              // If no models loaded, try fetching them first
              if (models.length === 0) {
                addSystemEntry('No models loaded. Fetching from backend...', timestamp)
                fetchModels().then((fetchedModels) => {
                  if (fetchedModels.length > 0) {
                    const match = fetchedModels.find((m: string) => m.toLowerCase().includes(visionModelName.toLowerCase()))
                    if (match) {
                      setVisionModel(match)
                      addSystemEntry(`Vision model switched to: ${match}`, Date.now())
                    } else {
                      addErrorEntry(`Vision model "${visionModelName}" not found.\nAvailable: ${fetchedModels.slice(0, 10).join(', ')}${fetchedModels.length > 10 ? '...' : ''}`, Date.now())
                    }
                  } else {
                    addErrorEntry('No models available. Is Ollama running?', Date.now())
                  }
                })
              } else {
                addErrorEntry(`Vision model "${visionModelName}" not found.\nAvailable: ${models.slice(0, 10).join(', ')}${models.length > 10 ? '...' : ''}`, timestamp)
              }
            }
          }
        }
        break

      case 'gen':
      case 'image-gen':
        const imageGenModelName = args.join(' ').trim()
        if (!imageGenModelName) {
          addSystemEntry(`Current image generation model: ${status.imageGenModel || 'not set'}\n\nUsage: /gen <name> or /image-gen <name>\nExample: /gen x/flux2-klein`, timestamp)
        } else {
          // Check if model exists
          if (models.includes(imageGenModelName)) {
            setImageGenModel(imageGenModelName)
            addSystemEntry(`Image generation model switched to: ${imageGenModelName}`, timestamp)
          } else {
            // Try partial match
            const match = models.find(m => m.toLowerCase().includes(imageGenModelName.toLowerCase()))
            if (match) {
              setImageGenModel(match)
              addSystemEntry(`Image generation model switched to: ${match}`, timestamp)
            } else {
              // If no models loaded, try fetching them first
              if (models.length === 0) {
                addSystemEntry('No models loaded. Fetching from backend...', timestamp)
                fetchModels().then((fetchedModels) => {
                  if (fetchedModels.length > 0) {
                    const match = fetchedModels.find((m: string) => m.toLowerCase().includes(imageGenModelName.toLowerCase()))
                    if (match) {
                      setImageGenModel(match)
                      addSystemEntry(`Image generation model switched to: ${match}`, Date.now())
                    } else {
                      addErrorEntry(`Image generation model "${imageGenModelName}" not found.\nAvailable: ${fetchedModels.slice(0, 10).join(', ')}${fetchedModels.length > 10 ? '...' : ''}\n\nInstall with: /pull ${imageGenModelName}`, Date.now())
                    }
                  } else {
                    addErrorEntry('No models available. Is Ollama running?', Date.now())
                  }
                })
              } else {
                addErrorEntry(`Image generation model "${imageGenModelName}" not found.\nAvailable: ${models.slice(0, 10).join(', ')}${models.length > 10 ? '...' : ''}\n\nInstall with: /pull ${imageGenModelName}`, timestamp)
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
            const visionModel = status.visionModel
            const imageGenModel = status.imageGenModel

            // Categorize models
            const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']
            const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']

            const currentMarker = (m: string): string => {
              if (m === activeModel) return ' ← chat'
              if (m === visionModel) return ' ← vision'
              if (m === imageGenModel) return ' ← image-gen'
              return ''
            }

            const typeMarker = (m: string): string => {
              const lower = m.toLowerCase()
              if (visionKeywords.some(k => lower.includes(k))) return ' [vision]'
              if (imageGenKeywords.some(k => lower.includes(k))) return ' [image-gen]'
              return ' [chat]'
            }

            addSystemEntry(`Available models (${modelList.length}):\n  ${modelList.map((m: string) => m + typeMarker(m) + currentMarker(m)).join('\n  ')}`, Date.now())
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
              fetchModels().then(() => {
                // Check if this is a vision model and set it
                const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']
                const isVisionModel = visionKeywords.some(keyword =>
                  modelToPull.toLowerCase().includes(keyword)
                )
                if (isVisionModel && !status.visionModel) {
                  setVisionModel(modelToPull)
                }

                // Check if this is an image generation model and set it
                const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']
                const isImageGenModel = imageGenKeywords.some(keyword =>
                  modelToPull.toLowerCase().includes(keyword)
                )
                if (isImageGenModel && !status.imageGenModel) {
                  setImageGenModel(modelToPull)
                }
              })
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

      case 'image-models':
        addSystemEntry('Fetching image generation models...', timestamp)
        fetch(`${BACKEND_URL}/api/images/models`)
          .then(res => res.json())
          .then(data => {
            const localModels = data.local || []
            const hfModels = data.hf_models || data.huggingface || []
            const device = data.device || 'unknown'
            const current = data.current_model || 'none'

            let message = `IMAGE GENERATION MODELS:\n\n`
            message += `Device: ${device.toUpperCase()}\n`
            message += `Current: ${current}\n\n`

            if (localModels.length > 0) {
              message += 'LOCAL MODELS:\n'
              localModels.forEach((m: any) => {
                const name = m.name || 'unknown'
                const vram = m.vram || '?'
                const repo = m.repo || ''
                message += `  ${name} (${vram} VRAM)`
                if (repo) message += `\n    → ${repo}`
                message += '\n'
              })
              message += '\n'
            }

            if (hfModels.length > 0) {
              message += 'HUGGINGFACE API MODELS:\n'
              hfModels.forEach((name: string) => {
                message += `  ${name}\n`
              })
              message += '\n'
            }

            message += 'To download a model:\n'
            message += '  /pull-image <name>\n'
            message += 'Examples:\n'
            message += '  /pull-image flux-schnell  (fast, requires HF token)\n'
            message += '  /pull-image sdxl          (good quality, no token needed)\n'
            message += '  /pull-image sd-1.5        (small, fast, no token needed)\n\n'
            message += 'Note: Flux models require HuggingFace token.\n'
            message += 'Get token: https://huggingface.co/settings/tokens\n'
            message += 'Set it: /set-hf-token <your-token>'

            addSystemEntry(message, Date.now())
          })
          .catch(err => {
            console.error('[LOOM] Error fetching image models:', err)
            addErrorEntry(`Failed to fetch image models: ${err.message}`, Date.now())
          })
        break

      case 'pull-image':
        const imageModelToPull = args.join(' ').trim()
        if (!imageModelToPull) {
          addSystemEntry('Usage: /pull-image <model-name>\n\nAvailable models:\n  flux-schnell (fast, needs HF token)\n  flux-dev (best quality, needs HF token)\n  sdxl (good quality, no token)\n  sdxl-turbo (very fast, no token)\n  sd-1.5 (small, fast, no token)\n\nGet HF token: https://huggingface.co/settings/tokens', timestamp)
        } else {
          addSystemEntry(`Preparing image model "${imageModelToPull}"...\nThis will download the model on first use.`, timestamp)

          // Use socket to pull image model
          if (connected) {
            const socket = (window as any).loomSocket
            if (socket) {
              socket.emit('pull_image_model', { model: imageModelToPull })

              // Listen for status updates
              const handler = (data: any) => {
                if (data.model === imageModelToPull) {
                  const status = data.status || 'unknown'
                  const message = data.message || status

                  if (status === 'success') {
                    addSystemEntry(`✓ Image model "${imageModelToPull}" is ready!`, Date.now())
                    socket.off('pull_image_status', handler)
                  } else if (status === 'error') {
                    const errorMsg = data.error || data.message || 'Unknown error'
                    let errorText = `✗ Failed to prepare model "${imageModelToPull}"\n\nError: ${errorMsg}`

                    if (errorMsg.includes('token') || errorMsg.includes('authentication')) {
                      errorText += '\n\nThis model requires a HuggingFace token.\n'
                      errorText += 'Get one at: https://huggingface.co/settings/tokens\n'
                      errorText += 'Then set it with: /set-hf-token <your-token>'
                    }

                    addErrorEntry(errorText, Date.now())
                    socket.off('pull_image_status', handler)
                  } else {
                    // Update status
                    addSystemEntry(`[${status}] ${message}`, Date.now())
                  }
                }
              }

              socket.on('pull_image_status', handler)

              // Cleanup after 5 minutes
              setTimeout(() => {
                socket.off('pull_image_status', handler)
              }, 300000)
            } else {
              addErrorEntry('Not connected to backend. Please wait for connection.', timestamp)
            }
          } else {
            addErrorEntry('Not connected to backend. Please wait for connection.', timestamp)
          }
        }
        break

      case 'set-hf-token':
        const token = args.join(' ').trim()
        if (!token) {
          addSystemEntry('Usage: /set-hf-token <your-huggingface-token>\n\nGet a token from: https://huggingface.co/settings/tokens\n\nThis token is needed for Flux models and other gated models.', timestamp)
        } else {
          fetch(`${BACKEND_URL}/api/images/config/huggingface`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token }),
          })
            .then(res => res.json())
            .then(data => {
              if (data.status === 'ok') {
                addSystemEntry('✓ HuggingFace token set! You can now use Flux models.\n\nTry: /pull-image flux-schnell', Date.now())
              } else {
                addErrorEntry(`Failed to set token: ${data.message || 'Unknown error'}`, Date.now())
              }
            })
            .catch(err => {
              addErrorEntry(`Failed to set token: ${err.message}`, Date.now())
            })
        }
        break

      case 'status':
        const statusLines = [
          'SYSTEM STATUS:',
          `  Backend: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`,
          `  Ollama:  ${status.connected ? 'ONLINE' : 'STANDBY'}`,
          `  Models:  ${models.length} available`,
          `  Circuits: ${getCircuitNames().length} saved`,
        ]
        if (status.activeModel) {
          statusLines.push(`  Chat Model: ${status.activeModel}`)
        }
        if (status.visionModel) {
          statusLines.push(`  Vision Model: ${status.visionModel}`)
        }
        if (status.imageGenModel) {
          statusLines.push(`  Image Gen Model: ${status.imageGenModel}`)
        }
        addSystemEntry(statusLines.join('\n'), timestamp)
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
            modelSlots: { A: '', B: '', C: '', IMAGE: '' },
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
              modelSlots: { A: '', B: '', C: '', IMAGE: '' },
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
    // Use async API that checks backend first
    loadSessionAsync(name).then(sessionEntries => {
      if (sessionEntries) {
        // Set current session to the loaded one
        setCurrentSessionName(name)
        try {
          localStorage.setItem('loom-current-session', name)
        } catch { }

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
      } else {
        const timestamp = Date.now()
        setEntries(prev => [...prev, {
          id: `error-${timestamp}`,
          type: 'error',
          content: `Session "${name}" not found`,
          timestamp,
        }])
      }
    })
  }, [])

  const handleSaveSession = useCallback((name: string) => {
    // Filter out system initialization messages
    const filtered = entries.filter(e =>
      !(e.type === 'system' && (e.content.includes('INITIALIZED') || e.content.includes('BACKEND CONNECTED')))
    )

    // Use async API that saves to backend
    saveSessionAsync(name, filtered).then(success => {
      const timestamp = Date.now()
      if (success) {
        // Update current session name to the manually saved name
        setCurrentSessionName(name)
        try {
          localStorage.setItem('loom-current-session', name)
        } catch { }

        setEntries(prev => [...prev, {
          id: `system-${timestamp}`,
          type: 'system',
          content: `Session saved as "${name}" (${filtered.length} entries)`,
          timestamp,
        }])
      } else {
        setEntries(prev => [...prev, {
          id: `error-${timestamp}`,
          type: 'error',
          content: `Failed to save session "${name}"`,
          timestamp,
        }])
      }
    })
  }, [entries])

  const handleNewSession = useCallback(() => {
    // Clear current session - next autosave will create new auto-named session
    setCurrentSessionName(null)
    try {
      localStorage.removeItem('loom-current-session')
    } catch { }

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

  const handleDeleteSession = useCallback((name: string) => {
    deleteSessionAsync(name).then(success => {
      const timestamp = Date.now()
      if (success) {
        setEntries(prev => [...prev, {
          id: `system-${timestamp}`,
          type: 'system',
          content: `Session "${name}" deleted`,
          timestamp,
        }])
      }
    })
  }, [])

  // Handle image upload and analysis
  const handleImageUpload = useCallback(async (imageBase64: string) => {
    const imageUrl = imageBase64 // Store for display
    pendingImageUrlRef.current = imageUrl // Store for retry after model install

    // Set analyzing state
    setImageAnalysis({
      imageUrl,
      analysis: '',
      model: 'auto-detecting',
      status: 'analyzing',
    })

    try {
      const response = await fetch(`${BACKEND_URL}/api/images/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: imageBase64,
          prompt: "Describe this image in detail. What do you see? List the key elements, objects, text, colors, composition, and any notable features. Be specific and thorough.",
          model: status.visionModel || undefined, // Use vision model if set, otherwise auto-detect
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }))
        throw new Error(errorData.detail || errorData.error || `Analysis failed: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        const usedModel = data.model || 'auto-detected'
        setImageAnalysis({
          imageUrl,
          analysis: data.analysis,
          model: usedModel,
          status: 'success',
          availableVisionModels: data.available_vision_models || [],
        })

        // Update vision model in status if it was auto-detected or explicitly set
        if (usedModel !== 'auto-detected' && !status.visionModel) {
          setVisionModel(usedModel)
        } else if (usedModel !== 'auto-detected') {
          setVisionModel(usedModel)
        }

        // Also add to terminal as a log entry
        const timestamp = Date.now()
        setEntries(prev => [...prev, {
          id: `image-analysis-${timestamp}`,
          type: 'system',
          content: `Image analyzed: ${data.analysis.substring(0, 100)}...`,
          timestamp,
        }])
      } else if (data.status === 'no-model') {
        // No vision model available - show recommendations
        setImageAnalysis({
          imageUrl,
          analysis: '',
          model: '',
          status: 'no-model',
          error: data.error,
          availableVisionModels: data.available_vision_models || [],
          recommendedModels: data.recommended_models || [],
        })
      } else {
        throw new Error(data.detail || data.error || 'Analysis failed')
      }
    } catch (error) {
      let errorMessage = 'Failed to analyze image'
      if (error instanceof Error) {
        errorMessage = error.message
        // Check if it's a response error with detail
        if (error.message.includes('detail')) {
          try {
            const match = error.message.match(/detail[:\s]+(.+)/i)
            if (match) errorMessage = match[1]
          } catch { }
        }
      }

      setImageAnalysis({
        imageUrl,
        analysis: '',
        model: '',
        status: 'error',
        error: errorMessage,
      })
    }
  }, [])

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    return date.toISOString().slice(0, 19).replace('T', ' ')
  }

  return (
    <div className="h-full flex relative">
      {/* Floating Toolbar */}
      <FloatingToolbar
        onImageGenClick={() => {
          // Populate /dream in chat input and focus it
          if (commandInputEditorRef.current) {
            const editor = commandInputEditorRef.current
            editor.commands.setContent('/dream ')
            // Focus the editor
            setTimeout(() => {
              editor.commands.focus('end')
            }, 50)
          }

          // Open image generation panel with empty state
          if (!imageGeneration) {
            setImageGeneration({
              prompt: '',
              model: status.imageGenModel || 'auto-detecting',
              status: 'empty',
              availableModels: [],
            })
          }
        }}
        onFolderContextClick={() => setCodeContextPanelOpen(!codeContextPanelOpen)}
        imageGenActive={!!imageGeneration}
        folderContextActive={codeContextActive}
      />

      {/* Session Panel */}
      <SessionPanel
        isCollapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed(prev => !prev)}
        onLoadSession={handleLoadSession}
        onSaveSession={() => setShowSaveModal(true)}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        currentEntryCount={entries.length}
        currentSessionName={currentSessionName}
      />

      {/* Main Terminal Area */}
      <div className={`flex-1 flex flex-col transition-all duration-200 ${imageGeneration || musicGeneration ? 'mr-96' : ''}`}>
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
                onImageClick={(imageUrl, metadata, canEdit) => {
                  setSelectedImageModal({ imageUrl, metadata, canEdit })
                }}
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
              onImageUpload={handleImageUpload}
              onEditorReady={(editor) => {
                commandInputEditorRef.current = editor
              }}
              codeContextActive={codeContextActive}
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

      {/* Image Analysis Panel */}
      {imageAnalysis && (
        <ImageAnalysisPanel
          analysis={imageAnalysis}
          onClose={() => setImageAnalysis(null)}
          allModels={models}
          onRetryAnalysis={(imageUrl, modelName) => {
            // Retry analysis with different model
            setImageAnalysis({
              imageUrl,
              analysis: '',
              model: modelName,
              status: 'analyzing',
            })

            // Re-analyze with the selected model
            fetch(`${BACKEND_URL}/api/images/analyze`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                image_base64: imageUrl,
                prompt: "Describe this image in detail. What do you see? List the key elements, objects, text, colors, composition, and any notable features. Be specific and thorough.",
                model: modelName,
              }),
            })
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  const usedModel = data.model || modelName
                  setImageAnalysis({
                    imageUrl,
                    analysis: data.analysis,
                    model: usedModel,
                    status: 'success',
                    availableVisionModels: data.available_vision_models || [],
                  })
                  // Update vision model in status
                  setVisionModel(usedModel)
                } else {
                  throw new Error(data.detail || data.error || 'Analysis failed')
                }
              })
              .catch(error => {
                setImageAnalysis({
                  imageUrl,
                  analysis: '',
                  model: modelName,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Failed to analyze image',
                })
              })
          }}
          onApproveToChat={(imageUrl, analysis) => {
            // Add image entry to chat
            const timestamp = Date.now()
            setEntries(prev => [...prev, {
              id: `image-${timestamp}`,
              type: 'image',
              content: 'Image added to chat context',
              timestamp,
              imageUrl,
              imageAnalysis: analysis,
            }])
          }}
          onPullModel={(modelName) => {
            // Start download
            pullModel(modelName, (progress: any) => {
              const status = progress.status || 'unknown'
              const completed = progress.completed || 0
              const total = progress.total || 0

              setDownloadProgress({
                model: modelName,
                status: status,
                completed: completed,
                total: total,
                percent: progress.percent,
                message: progress.message,
                error: progress.error,
              })

              // On success, refresh models and retry analysis
              if (status === 'success') {
                fetchModels().then(() => {
                  // Set as vision model if it's a vision model
                  const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']
                  const isVisionModel = visionKeywords.some(keyword =>
                    modelName.toLowerCase().includes(keyword)
                  )
                  if (isVisionModel) {
                    setVisionModel(modelName)
                  }
                })
                // Retry image analysis after a short delay
                setTimeout(() => {
                  const pendingImage = pendingImageUrlRef.current
                  if (pendingImage) {
                    // Create a new analysis request
                    handleImageUpload(pendingImage)
                  }
                }, 2000)
              }
            })
          }}
          downloadProgress={downloadProgress}
        />
      )}

      {/* Image Generation Panel */}
      {imageGeneration && (
        <ImageGenerationPanel
          generation={imageGeneration}
          onClose={() => setImageGeneration(null)}
          onEditImage={(imageUrl, editPrompt) => {
            // Perform image-to-image editing
            if (!imageGeneration) return

            setImageGeneration({
              prompt: editPrompt,
              model: imageGeneration.model || status.imageGenModel || 'auto-detecting',
              status: 'generating',
              progress: 0,
            })

            // Call backend with input_image for img2img
            fetch(`${BACKEND_URL}/api/images/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: editPrompt,
                provider: 'ollama',
                model: imageGeneration.model || status.imageGenModel || undefined,
                input_image: imageUrl, // Pass the original image for editing
              }),
            })
              .then(async res => {
                const data = await res.json()
                if (res.ok && data.status === 'success' && data.image) {
                  setImageGeneration({
                    prompt: editPrompt,
                    imageUrl: data.image,
                    model: data.model || imageGeneration.model || 'Ollama',
                    status: 'success',
                  })
                } else {
                  throw new Error(data.error || data.message || 'Image editing failed')
                }
              })
              .catch((err) => {
                setImageGeneration({
                  prompt: editPrompt,
                  model: imageGeneration.model || 'unknown',
                  status: 'error',
                  error: err instanceof Error ? err.message : String(err),
                })
              })
          }}
          onApproveToChat={(imageUrl, prompt) => {
            const timestamp = Date.now()
            // Store prompt in content for easy retrieval, and model info in imageAnalysis
            setEntries(prev => [...prev, {
              id: `image-gen-${timestamp}`,
              type: 'image',
              content: prompt, // Store the actual prompt, not "Generated: {prompt}"
              timestamp,
              imageUrl,
              imageAnalysis: `Generated using ${imageGeneration.model}`, // Model info here
            }])
            setImageGeneration(null)
          }}
          onRetryGeneration={(prompt, modelName) => {
            // Retry generation with specific model
            setImageGeneration({
              prompt,
              model: modelName,
              status: 'generating',
              progress: 0,
            })

            fetch(`${BACKEND_URL}/api/images/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt,
                provider: 'ollama',
                model: modelName,
              }),
            })
              .then(async res => {
                const data = await res.json()
                if (res.ok && data.status === 'success' && data.image) {
                  setImageGeneration({
                    prompt,
                    imageUrl: data.image,
                    model: data.model || modelName,
                    status: 'success',
                  })
                  // Update image gen model in status
                  if (data.model) {
                    setImageGenModel(data.model)
                  }
                } else {
                  // Try fallback to local
                  throw new Error(data.error || data.message || 'Generation failed')
                }
              })
              .catch(async (err) => {
                // Try local fallback
                try {
                  const res = await fetch(`${BACKEND_URL}/api/images/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      prompt,
                      provider: 'local',
                      model: 'sdxl',
                    }),
                  })
                  const data = await res.json()
                  if (res.ok && data.status === 'success' && data.image) {
                    setImageGeneration({
                      prompt,
                      imageUrl: data.image,
                      model: 'local SDXL',
                      status: 'success',
                    })
                  } else {
                    throw new Error(data.error || data.message || 'Generation failed')
                  }
                } catch (fallbackErr) {
                  setImageGeneration({
                    prompt,
                    model: modelName,
                    status: 'error',
                    error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
                  })
                }
              })
          }}
          onPullModel={(modelName) => {
            // Start download
            pullModel(modelName, (progress: any) => {
              const status = progress.status || 'unknown'
              const completed = progress.completed || 0
              const total = progress.total || 0

              setDownloadProgress({
                model: modelName,
                status: status,
                completed: completed,
                total: total,
                percent: progress.percent,
                message: progress.message,
                error: progress.error,
              })

              // On success, refresh models and retry generation
              if (status === 'success') {
                fetchModels().then(() => {
                  // Set as image gen model if it's an image gen model
                  const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']
                  const isImageGenModel = imageGenKeywords.some(keyword =>
                    modelName.toLowerCase().includes(keyword)
                  )
                  if (isImageGenModel) {
                    setImageGenModel(modelName)
                  }
                })
                // Retry generation after a short delay
                if (imageGeneration) {
                  setTimeout(() => {
                    const prompt = imageGeneration.prompt
                    fetch(`${BACKEND_URL}/api/images/generate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        prompt,
                        provider: 'ollama',
                        model: modelName,
                      }),
                    })
                      .then(async res => {
                        const data = await res.json()
                        if (res.ok && data.status === 'success' && data.image) {
                          setImageGeneration({
                            prompt,
                            imageUrl: data.image,
                            model: data.model || modelName,
                            status: 'success',
                          })
                        }
                      })
                      .catch(() => {
                        // Ignore errors on retry
                      })
                  }, 2000)
                }
              }
            })
          }}
          downloadProgress={downloadProgress}
          allModels={models}
        />
      )}

      {/* Save Session Modal */}
      <SaveSessionModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveSession}
      />

      {/* Code Context Panel */}
      <CodeContextPanel
        isOpen={codeContextPanelOpen}
        onClose={() => setCodeContextPanelOpen(false)}
        onIndexFolder={handleIndexFolder}
        activeFolder={codeContextFolder}
        filesIndexed={codeContextFilesIndexed}
        isIndexing={codeContextIndexing}
      />

      {/* Music Setup Panel */}
      {musicSetupPanelOpen && (
        <MusicSetupPanel
          onClose={() => setMusicSetupPanelOpen(false)}
          onModelReady={() => {
            addSystemEntry('🎵 Music model is now ready! Try /song <style> to generate music.', Date.now())
          }}
        />
      )}

      {/* Music Generation Panel */}
      {musicGeneration && (
        <MusicGenerationPanel
          generation={musicGeneration}
          onClose={() => setMusicGeneration(null)}
          onGenerate={(prompt, lyrics, duration, guidanceScale, steps, seed) => {
            // Update state to generating
            setMusicGeneration({
              prompt,
              lyrics,
              duration,
              status: 'generating',
              progress: 0,
              message: 'Initializing model...',
              seed,
            })

            // Call backend to generate
            fetch(`${BACKEND_URL}/api/music/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt,
                lyrics: lyrics || undefined,
                use_lyrics: !!lyrics, // Important: backend requires this flag to use lyrics
                duration,
                guidance_scale: guidanceScale,
                steps: steps,
                seed,
              }),
            })
              .then(async res => {
                if (!res.ok) {
                  const errData = await res.json().catch(() => ({}))
                  throw new Error(errData.detail || 'Generation failed')
                }
                const data = await res.json()
                if (data.status === 'success' && data.audio_url) {
                  setMusicGeneration({
                    prompt,
                    lyrics,
                    duration,
                    audioUrl: `${BACKEND_URL}${data.audio_url}`,
                    status: 'success',
                    seed: data.seed,
                  })
                } else {
                  throw new Error(data.message || 'Unknown error')
                }
              })
              .catch(err => {
                setMusicGeneration({
                  prompt,
                  lyrics,
                  duration,
                  status: 'error',
                  error: err.message,
                })
              })
          }}
          onApproveToChat={(audioUrl, prompt, duration) => {
            // Add audio message to chat
            const timestamp = Date.now()
            setEntries(prev => [...prev, {
              id: `entry-${timestamp}`,
              type: 'audio', // Use specific audio type
              content: `Generated song: "${prompt}"`,
              timestamp,
              audioUrl,
              audioPrompt: prompt,
              audioDuration: duration,
            }])
            setMusicGeneration(null)
          }}
        />
      )}

      {/* Image Modal for viewing/editing images in feed */}
      {selectedImageModal && (
        <ImageModal
          isOpen={!!selectedImageModal}
          onClose={() => setSelectedImageModal(null)}
          imageUrl={selectedImageModal.imageUrl}
          metadata={selectedImageModal.metadata}
          canEdit={selectedImageModal.canEdit}
          onEdit={(imageUrl, editPrompt) => {
            // Close modal and open image generation panel with edit
            setSelectedImageModal(null)
            setImageGeneration({
              prompt: editPrompt,
              model: selectedImageModal.metadata.model || status.imageGenModel || 'auto-detecting',
              status: 'generating',
              progress: 0,
              message: 'Editing image...',
            })

            // Call backend with input_image for img2img
            fetch(`${BACKEND_URL}/api/images/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: editPrompt,
                provider: 'ollama',
                model: selectedImageModal.metadata.model || status.imageGenModel || undefined,
                input_image: imageUrl, // Pass the original image for editing
              }),
            })
              .then(async res => {
                const data = await res.json()
                if (res.ok && data.status === 'success' && data.image) {
                  setImageGeneration({
                    prompt: editPrompt,
                    imageUrl: data.image,
                    model: data.model || selectedImageModal.metadata.model || 'Ollama',
                    status: 'success',
                  })
                } else {
                  throw new Error(data.error || data.message || 'Image editing failed')
                }
              })
              .catch((err) => {
                setImageGeneration({
                  prompt: editPrompt,
                  model: selectedImageModal.metadata.model || 'unknown',
                  status: 'error',
                  error: err instanceof Error ? err.message : String(err),
                })
              })
          }}
        />
      )}
    </div>
  )
}

interface LogEntryBlockProps {
  entry: LogEntry
  formatTimestamp: (ts: number) => string
  onImageClick?: (imageUrl: string, metadata: { prompt?: string; model?: string; timestamp?: number; provider?: string; analysis?: string }, canEdit: boolean) => void
}

function LogEntryBlock({ entry, formatTimestamp, onImageClick }: LogEntryBlockProps) {
  const typeStyles = {
    user: 'border-phosphor',
    system: 'border-terminal-muted',
    ai: 'border-phosphor',
    error: 'border-red-500',
    image: 'border-cyan-500',
    audio: 'border-purple-500',
  }

  const typeLabels = {
    user: 'USER',
    system: 'SYSTEM',
    ai: 'ASSISTANT',
    error: 'ERROR',
    image: 'IMAGE',
    audio: 'MUSIC',
  }

  const textColors = {
    user: 'text-phosphor',
    system: 'text-terminal-muted',
    ai: 'text-phosphor',
    error: 'text-red-400',
    image: 'text-cyan-400',
    audio: 'text-purple-400',
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
        {entry.type === 'audio' && entry.audioUrl ? (
          <MusicPlayerCard
            audioUrl={entry.audioUrl}
            prompt={entry.audioPrompt || 'Generated Track'}
            duration={entry.audioDuration}
            timestamp={entry.timestamp}
          />
        ) : entry.type === 'image' && entry.imageUrl ? (
          <div className="space-y-3">
            <div className="border border-terminal-border bg-void p-3">
              <img
                src={entry.imageUrl}
                alt="Chat image"
                className="max-w-full h-auto max-h-64 border border-terminal-border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  if (!onImageClick || !entry.imageUrl) return

                  // Extract prompt and model from entry
                  const prompt = entry.content || 'Generated image'
                  const modelMatch = entry.imageAnalysis?.match(/Generated using (.+)/)
                  const model = modelMatch ? modelMatch[1] : undefined

                  // Check if this was generated (has model info) - enable editing for generated images
                  // Enable editing if it has a model and is from a supported provider (flux, ollama, or local SDXL)
                  const canEdit = !!model && (model.toLowerCase().includes('flux') || model.toLowerCase().includes('ollama') || model.toLowerCase().includes('sdxl'))

                  // Open modal with metadata
                  onImageClick(entry.imageUrl, {
                    prompt,
                    model,
                    timestamp: entry.timestamp,
                    provider: model?.toLowerCase().includes('sdxl') ? 'local' : 'ollama',
                    analysis: entry.imageAnalysis,
                  }, canEdit)
                }}
                title="Click to view full screen and edit"
              />
            </div>
            {entry.imageAnalysis && (
              <div className="text-terminal-muted text-sm border-l-2 border-cyan-500/50 pl-3">
                <div className="text-[10px] text-terminal-muted tracking-widest mb-1">ANALYSIS</div>
                {entry.imageAnalysis}
              </div>
            )}
            {entry.content && (
              <div className="mt-2">{entry.content}</div>
            )}
          </div>
        ) : (
          entry.content || (entry.status === 'running' ? '...' : '')
        )}
      </div>
    </div>
  )
}
