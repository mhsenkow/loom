export type ModuleType =
  | 'log_entry'
  | 'ai_processor'
  | 'script_execution'
  | 'data_input'
  | 'image_gen'
  | 'markdown'
  | 'data_loader'
  | 'conditional'
  | 'web_fetch'
  | 'vector_index'
  | 'vector_search'
  | 'terminal_history'
  | 'music_gen'
  | 'qdc_upload'
  | 'qdc_run'
  | 'qdc_status'
  | 'qdc_results'
  | 'notification'
  | 'telegram_send'
  | 'file_write'
  | 'shell_exec'
  | 'delay'
  | 'human_approval'
  | 'cron_trigger'

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
  type: 'user' | 'system' | 'ai' | 'error' | 'image' | 'audio'
  content: string
  timestamp: number
  status?: 'running' | 'success' | 'error'
  audioUrl?: string
  audioDuration?: number
  audioPrompt?: string
  imageUrl?: string
  imageAnalysis?: string
  metadata?: {
    model?: string
    [key: string]: unknown
  }
}

export interface SystemStatus {
  connected: boolean
  memoryUsage?: number
  tokenSpeed?: number
  activeModel?: string  // Chat model (preferred/selected)
  visionModel?: string  // Vision/image analysis model (preferred/selected)
  imageGenModel?: string  // Image generation model (preferred/selected)
  ollamaModelsAvailable?: number
  ramTotalGb?: number
  ramAvailableGb?: number
  ramSystemUsedGb?: number
  ramModelUsedGb?: number
  ramModelUsedSource?: string
  ramAvailableForModelsGb?: number
  ramUsedPercent?: number
  ollamaProcessRssGb?: number
  loadedModelName?: string  // Currently loaded model in memory
  defaultModelName?: string
  modelStatus?: string
}
