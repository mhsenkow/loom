export type ModuleType = 'log_entry' | 'ai_processor' | 'script_execution' | 'data_input'

export type ModuleStatus = 'idle' | 'running' | 'success' | 'error'

export interface Connection {
  moduleId: string
  portId: string
}

export interface Module {
  id: string
  type: ModuleType
  content: string
  position: { x: number; y: number }
  inputs: Connection[]
  outputs: Record<string, unknown>
  status: ModuleStatus
  timestamp?: number
  metadata?: Record<string, unknown>
}

export interface LogEntry {
  id: string
  type: 'user' | 'system' | 'ai' | 'error'
  content: string
  timestamp: number
  status?: ModuleStatus
}

export interface SystemStatus {
  connected: boolean
  memoryUsage?: number
  tokenSpeed?: number
  activeModel?: string
}
