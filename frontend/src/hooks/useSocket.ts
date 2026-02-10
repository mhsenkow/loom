import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

const BACKEND_URL = 'http://localhost:8000'

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

type AIChunkHandler = (chunk: AIChunk) => void
type AIStatusHandler = (status: AIStatus) => void
type ModuleStatusHandler = (status: ModuleStatus) => void

// Singleton socket instance - shared across all components
let globalSocket: Socket | null = null
let socketState: SocketState = { connected: false, error: null }
const stateListeners = new Set<(state: SocketState) => void>()

// AI event handlers - multiple components can register handlers
// Use a Map to track active handlers per request to prevent duplicates
const activeChunkHandlers = new Map<symbol, AIChunkHandler>()
const activeStatusHandlers = new Map<symbol, AIStatusHandler>()
const moduleStatusHandlers = new Set<ModuleStatusHandler>()

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
      console.log('[LOOM] Connected to backend')
      socketState = { connected: true, error: null }
      stateListeners.forEach(listener => listener(socketState))
    })

    globalSocket.on('disconnect', (reason) => {
      console.log('[LOOM] Disconnected from backend:', reason)
      socketState = { connected: false, error: null }
      stateListeners.forEach(listener => listener(socketState))
    })

    globalSocket.on('connect_error', (error) => {
      console.error('[LOOM] Connection error:', error)
      socketState = { connected: false, error: error.message }
      stateListeners.forEach(listener => listener(socketState))
    })

    // System messages
    globalSocket.on('system', (data) => {
      console.log('[LOOM] System message:', data)
    })

    // AI response handlers - broadcast to all active handlers
    globalSocket.on('ai_chunk', (data: AIChunk) => {
      activeChunkHandlers.forEach(handler => handler(data))
    })

    globalSocket.on('ai_status', (data: AIStatus) => {
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

    // Model pull status handlers
    globalSocket.on('pull_status', (data: any) => {
      // This will be handled by components that register pull handlers
      console.log('[LOOM] Pull status:', data)
    })

    // Models updated event
    globalSocket.on('models_updated', (data: any) => {
      console.log('[LOOM] Models updated:', data)
      // Trigger a custom event that components can listen to
      window.dispatchEvent(new CustomEvent('loom:models_updated', { detail: data }))
    })
  }

  return globalSocket
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

    moduleStatusHandlerRef.current = onStatus || null

    if (onStatus) {
      moduleStatusHandlers.add(onStatus)
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
    onStatus?: (status: any) => void,
  ) => {
    const socket = getOrCreateSocket()

    if (!socket.connected) {
      console.warn('[LOOM] Cannot pull model: not connected')
      return false
    }

    // Register handler for pull status updates
    if (onStatus) {
      const handler = (data: any) => onStatus(data)
      socket.on('pull_status', handler)

      // Clean up handler when pull completes
      const cleanup = (data: any) => {
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
