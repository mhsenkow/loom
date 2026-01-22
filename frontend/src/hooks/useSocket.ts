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
}

interface ModuleStatus {
  module_id: string
  status: 'idle' | 'running' | 'success' | 'error'
  output?: Record<string, unknown>
}

type AIChunkHandler = (chunk: AIChunk) => void
type AIStatusHandler = (status: AIStatus) => void
type ModuleStatusHandler = (status: ModuleStatus) => void

export function useSocket() {
  const [state, setState] = useState<SocketState>({
    connected: false,
    error: null,
  })
  
  const socketRef = useRef<Socket | null>(null)
  const aiChunkHandlerRef = useRef<AIChunkHandler | null>(null)
  const aiStatusHandlerRef = useRef<AIStatusHandler | null>(null)
  const moduleStatusHandlerRef = useRef<ModuleStatusHandler | null>(null)

  useEffect(() => {
    // Create socket connection
    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    // Connection handlers
    socket.on('connect', () => {
      console.log('[LOOM] Connected to backend')
      setState({ connected: true, error: null })
    })

    socket.on('disconnect', () => {
      console.log('[LOOM] Disconnected from backend')
      setState({ connected: false, error: null })
    })

    socket.on('connect_error', (error) => {
      console.error('[LOOM] Connection error:', error)
      setState({ connected: false, error: error.message })
    })

    // System messages
    socket.on('system', (data) => {
      console.log('[LOOM] System message:', data)
    })

    // AI response handlers
    socket.on('ai_chunk', (data: AIChunk) => {
      if (aiChunkHandlerRef.current) {
        aiChunkHandlerRef.current(data)
      }
    })

    socket.on('ai_status', (data: AIStatus) => {
      if (aiStatusHandlerRef.current) {
        aiStatusHandlerRef.current(data)
      }
    })

    // Module status handlers
    socket.on('module_status', (data: ModuleStatus) => {
      if (moduleStatusHandlerRef.current) {
        moduleStatusHandlerRef.current(data)
      }
    })

    // Cleanup on unmount
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [])

  // Send chat message to AI
  const sendChat = useCallback((
    prompt: string, 
    model: string = 'llama3.1:8b',
    onChunk?: AIChunkHandler,
    onStatus?: AIStatusHandler,
  ) => {
    if (!socketRef.current?.connected) {
      console.warn('[LOOM] Cannot send chat: not connected')
      return false
    }

    // Set handlers for this request
    aiChunkHandlerRef.current = onChunk || null
    aiStatusHandlerRef.current = onStatus || null

    socketRef.current.emit('chat', { prompt, model })
    return true
  }, [])

  // Execute a module
  const executeModule = useCallback((
    moduleId: string,
    type: string,
    inputs: Record<string, unknown> = {},
    onStatus?: ModuleStatusHandler,
  ) => {
    if (!socketRef.current?.connected) {
      console.warn('[LOOM] Cannot execute module: not connected')
      return false
    }

    moduleStatusHandlerRef.current = onStatus || null

    socketRef.current.emit('execute_module', {
      module_id: moduleId,
      type,
      inputs,
    })
    return true
  }, [])

  return {
    ...state,
    sendChat,
    executeModule,
  }
}
