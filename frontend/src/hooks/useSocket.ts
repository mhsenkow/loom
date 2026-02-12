import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_BASE_URL } from '../config/api'
import { useSystemStore } from '../store/systemStore'

const BACKEND_URL = API_BASE_URL
const MODELS_UPDATED_EVENT = 'loom:models_updated'
const ORCHESTRATOR_EVENT = 'orchestrator_event'
const QDC_JOB_EVENT = 'qdc_job_event'

interface SocketState {
  connected: boolean
  error: string | null
}

interface AIChunk {
  content: string
}

interface AIStatus {
  status: 'running' | 'success' | 'error'
  message: string
  model?: string
}

interface ModuleStatus {
  module_id: string
  status: 'idle' | 'running' | 'success' | 'error'
  output?: Record<string, unknown>
}

export interface PullStatus {
  status: string
  model?: string
  message?: string
  completed?: number
  total?: number
  percent?: number
  error?: string
}

type AIChunkHandler = (chunk: AIChunk) => void
type AIStatusHandler = (status: AIStatus) => void
type ModuleStatusHandler = (status: ModuleStatus) => void
type PullStatusHandler = (status: PullStatus) => void

interface SendChatOptions {
  rawPrompt?: string
  contextMode?: 'input' | 'key' | 'full'
}

interface OrchestratorModelEvent {
  type?: string
  model?: string
  switched?: boolean
  previous_model?: string
  reason?: string
}

declare global {
  interface Window {
    loomSocket?: Socket
  }
}

// Singleton socket instance - shared across all components
let globalSocket: Socket | null = null
let socketState: SocketState = { connected: false, error: null }
const stateListeners = new Set<(state: SocketState) => void>()

// AI event handlers - multiple components can register handlers
// Use a Map to track active handlers per request to prevent duplicates
const activeChunkHandlers = new Map<symbol, AIChunkHandler>()
const activeStatusHandlers = new Map<symbol, AIStatusHandler>()
const moduleStatusHandlers = new Set<ModuleStatusHandler>()

function setSocketState(next: SocketState) {
  socketState = next
  stateListeners.forEach(listener => listener(socketState))
}

function updateLoadedModel(modelName?: string) {
  if (!modelName || modelName === 'unknown') return
  useSystemStore.setState((state) => ({
    ...state,
    status: {
      ...state.status,
      loadedModelName: modelName,
    },
  }))
}

function normalizePullModelName(modelName: string): string {
  const normalized = modelName.trim().toLowerCase()
  if (!normalized) return normalized
  return normalized.includes(':') ? normalized : `${normalized}:latest`
}

function getOrCreateSocket(): Socket {
  if (!globalSocket) {
    globalSocket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      autoConnect: true,
    })

    // Connection handlers
    globalSocket.on('connect', () => {
      setSocketState({ connected: true, error: null })
    })

    globalSocket.on('disconnect', () => {
      setSocketState({ connected: false, error: null })
    })

    globalSocket.on('connect_error', (error) => {
      setSocketState({ connected: false, error: error.message })
    })

    // AI response handlers - broadcast to all active handlers
    globalSocket.on('ai_chunk', (data: AIChunk) => {
      activeChunkHandlers.forEach(handler => handler(data))
    })

    globalSocket.on('ai_status', (data: AIStatus) => {
      if (data.model) {
        updateLoadedModel(data.model)
      }
      // Collect request IDs to remove after iteration (avoid modifying during iteration)
      const completedRequests: symbol[] = []

      activeStatusHandlers.forEach((handler, requestId) => {
        handler(data)
        // Mark for removal when request completes
        if (data.status === 'success' || data.status === 'error') {
          completedRequests.push(requestId)
        }
      })

      // Remove completed request handlers
      completedRequests.forEach(requestId => {
        activeStatusHandlers.delete(requestId)
        activeChunkHandlers.delete(requestId)
      })
    })

    // Module status handlers
    globalSocket.on('module_status', (data: ModuleStatus) => {
      moduleStatusHandlers.forEach(handler => handler(data))
    })

    // Models updated event
    globalSocket.on('models_updated', (data: unknown) => {
      window.dispatchEvent(new CustomEvent(MODELS_UPDATED_EVENT, { detail: data }))
    })

    globalSocket.on(ORCHESTRATOR_EVENT, (data: unknown) => {
      const eventData = data as OrchestratorModelEvent
      if ((eventData?.type === 'model_selected' || eventData?.type === 'model_switched') && eventData.model) {
        updateLoadedModel(eventData.model)
      }
      window.dispatchEvent(new CustomEvent(ORCHESTRATOR_EVENT, { detail: data }))
    })

    globalSocket.on(QDC_JOB_EVENT, (data: unknown) => {
      window.dispatchEvent(new CustomEvent(QDC_JOB_EVENT, { detail: data }))
    })

    // Backward-compatible global access for older command handlers.
    window.loomSocket = globalSocket
  }

  return globalSocket
}

export function getSocketInstance(): Socket {
  return getOrCreateSocket()
}

export function useSocket() {
  const [state, setState] = useState<SocketState>(socketState)
  const currentRequestIdRef = useRef<symbol | null>(null)
  const moduleStatusHandlerRef = useRef<ModuleStatusHandler | null>(null)

  useEffect(() => {
    // Get or create the singleton socket (ensures it's initialized)
    getOrCreateSocket()

    // Register state listener
    const stateListener = (newState: SocketState) => {
      setState(newState)
    }
    stateListeners.add(stateListener)

    // Set initial state
    setState(socketState)

    // Register module status handler
    if (moduleStatusHandlerRef.current) {
      moduleStatusHandlers.add(moduleStatusHandlerRef.current)
    }

    // Cleanup on unmount
    return () => {
      stateListeners.delete(stateListener)

      // Remove active request handlers
      if (currentRequestIdRef.current) {
        activeChunkHandlers.delete(currentRequestIdRef.current)
        activeStatusHandlers.delete(currentRequestIdRef.current)
        currentRequestIdRef.current = null
      }

      // Remove module status handler
      if (moduleStatusHandlerRef.current) {
        moduleStatusHandlers.delete(moduleStatusHandlerRef.current)
      }
    }
  }, [])

  // Send chat message to AI
  const sendChat = useCallback((
    prompt: string,
    model: string = 'llama3.1:8b',
    onChunk?: AIChunkHandler,
    onStatus?: AIStatusHandler,
    useCodeContext: boolean = false,
    options?: SendChatOptions,
  ) => {
    const socket = getOrCreateSocket()

    if (!socket.connected) {
      console.warn('[LOOM] Cannot send chat: not connected')
      return false
    }

    // Remove any existing handlers for this component
    if (currentRequestIdRef.current) {
      activeChunkHandlers.delete(currentRequestIdRef.current)
      activeStatusHandlers.delete(currentRequestIdRef.current)
    }

    // Create a unique request ID for this chat request
    const requestId = Symbol('chat-request')
    currentRequestIdRef.current = requestId

    // Register handlers with the request ID
    if (onChunk) {
      activeChunkHandlers.set(requestId, onChunk)
    }
    if (onStatus) {
      activeStatusHandlers.set(requestId, onStatus)
    }

    socket.emit('chat', {
      prompt,
      raw_prompt: options?.rawPrompt || prompt,
      context_mode: options?.contextMode,
      model,
      use_code_context: useCodeContext,
      code_context_collection: 'loom_code_context',
    })
    return true
  }, [])

  // Execute a module
  const executeModule = useCallback((
    moduleId: string,
    type: string,
    inputs: Record<string, unknown> = {},
    onStatus?: ModuleStatusHandler,
  ) => {
    const socket = getOrCreateSocket()

    if (!socket.connected) {
      console.warn('[LOOM] Cannot execute module: not connected')
      return false
    }

    if (moduleStatusHandlerRef.current && moduleStatusHandlerRef.current !== onStatus) {
      moduleStatusHandlers.delete(moduleStatusHandlerRef.current)
    }
    moduleStatusHandlerRef.current = onStatus ?? null

    if (moduleStatusHandlerRef.current) {
      moduleStatusHandlers.add(moduleStatusHandlerRef.current)
    }

    socket.emit('execute_module', {
      module_id: moduleId,
      type,
      inputs,
    })
    return true
  }, [])

  // Pull/download an Ollama model
  const pullModel = useCallback((
    modelName: string,
    onStatus?: PullStatusHandler,
  ) => {
    const socket = getOrCreateSocket()

    if (!socket.connected) {
      console.warn('[LOOM] Cannot pull model: not connected')
      return false
    }

    // Register handler for pull status updates
    if (onStatus) {
      const requested = normalizePullModelName(modelName)
      const handler = (data: PullStatus) => {
        if (data.model) {
          const incoming = normalizePullModelName(data.model)
          if (incoming !== requested) return
        }
        onStatus(data)
      }
      socket.on('pull_status', handler)

      // Clean up handler when pull completes
      const cleanup = (data: PullStatus) => {
        if (data.model) {
          const incoming = normalizePullModelName(data.model)
          if (incoming !== requested) return
        }
        if (data.status === 'success' || data.status === 'error') {
          socket.off('pull_status', handler)
          socket.off('pull_status', cleanup)
        }
      }
      socket.on('pull_status', cleanup)
    }

    socket.emit('pull_model', { model: modelName })
    return true
  }, [])

  // Stop current AI generation
  const stopGeneration = useCallback(() => {
    const socket = getOrCreateSocket()

    // If there's an active request, manually trigger error to unblock promise
    if (currentRequestIdRef.current) {
      const statusHandler = activeStatusHandlers.get(currentRequestIdRef.current)
      if (statusHandler) {
        statusHandler({ status: 'error', message: 'Stopped by user' })
      }

      // Cleanup handlers
      activeChunkHandlers.delete(currentRequestIdRef.current)
      activeStatusHandlers.delete(currentRequestIdRef.current)
      currentRequestIdRef.current = null
    }

    if (socket.connected) {
      socket.emit('stop_generation')
    }
  }, [])

  return {
    ...state,
    sendChat,
    stopGeneration,
    executeModule,
    pullModel,
  }
}
