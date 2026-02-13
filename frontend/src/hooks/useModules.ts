import { CellData } from '../components/circuit/CircuitBoard'
import type { ModuleType, ModuleStatus } from '../types/module'
import { API_BASE_URL } from '../config/api'
import { ApiClientError, requestJson } from '../utils/apiClient'

const API_BASE = API_BASE_URL
const MODULE_TIMEOUT_MS = 10000

type Position = { x: number; y: number }

type CellWithPosition = CellData & { _position?: Position }

// Backend Module interface (matches API response)
interface BackendModule {
  id: string
  type: string
  content: string
  position: Position
  status: string
  metadata: Record<string, unknown>
}

interface CreateModuleRequest {
  id: string
  type: string
  content: string
  position: Position
}

interface UpdateModuleRequest {
  content?: string
  position?: Position
  status?: ModuleStatus
  metadata?: Record<string, unknown>
}

// Convert CellData to backend Module format
function cellToBackendModule(cell: CellData, position: Position): {
  type: string
  content: string
  position: Position
  metadata: Record<string, unknown>
} {
  const metadata: Record<string, unknown> = {
    label: cell.label,
    model: cell.model,
    modelSlot: cell.modelSlot,
    readMode: cell.readMode,
    inputMode: cell.inputMode,
    conditionType: cell.conditionType,
    conditionValue: cell.conditionValue,
    onPass: cell.onPass,
    onFail: cell.onFail,
    loopBackTo: cell.loopBackTo,
    loopBackMax: cell.loopBackMax,
    fetchMethod: cell.fetchMethod,
    fetchHeaders: cell.fetchHeaders,
    fetchBody: cell.fetchBody,
    fetchTimeout: cell.fetchTimeout,
    fetchMaxSize: cell.fetchMaxSize,
    terminalHistorySearch: cell.terminalHistorySearch,
    terminalHistoryTypes: cell.terminalHistoryTypes,
    terminalHistoryLimit: cell.terminalHistoryLimit,
    terminalHistorySince: cell.terminalHistorySince,
    terminalHistoryBefore: cell.terminalHistoryBefore,
    terminalHistorySession: cell.terminalHistorySession,
  }

  Object.keys(metadata).forEach(key => {
    if (metadata[key] === undefined) {
      delete metadata[key]
    }
  })

  return {
    type: cell.type,
    content: cell.content,
    position,
    metadata,
  }
}

// Convert backend Module to CellData (with position stored temporarily)
function backendModuleToCell(module: BackendModule): CellWithPosition {
  const metadata = module.metadata || {}

  return {
    id: module.id,
    type: module.type as ModuleType,
    label: (metadata.label as string) || getDefaultLabel(module.type),
    content: module.content || '',
    status: (module.status as ModuleStatus) || 'idle',
    model: metadata.model as string | undefined,
    modelSlot: metadata.modelSlot as 'A' | 'B' | 'C' | undefined,
    readMode: metadata.readMode as string | undefined,
    inputMode: metadata.inputMode as 'previous' | 'all' | 'none' | undefined,
    conditionType: metadata.conditionType as 'regex' | 'keyword' | 'length' | 'contains' | 'ai_check' | undefined,
    conditionValue: metadata.conditionValue as string | undefined,
    onPass: metadata.onPass as string | undefined,
    onFail: metadata.onFail as string | undefined,
    loopBackTo: metadata.loopBackTo as number | undefined,
    loopBackMax: metadata.loopBackMax as number | undefined,
    fetchMethod: metadata.fetchMethod as 'GET' | 'POST' | 'PUT' | 'DELETE' | undefined,
    fetchHeaders: metadata.fetchHeaders as string | undefined,
    fetchBody: metadata.fetchBody as string | undefined,
    fetchTimeout: metadata.fetchTimeout as number | undefined,
    fetchMaxSize: metadata.fetchMaxSize as number | undefined,
    terminalHistorySearch: metadata.terminalHistorySearch as string | undefined,
    terminalHistoryTypes: metadata.terminalHistoryTypes as CellData['terminalHistoryTypes'],
    terminalHistoryLimit: metadata.terminalHistoryLimit as number | undefined,
    terminalHistorySince: metadata.terminalHistorySince as number | undefined,
    terminalHistoryBefore: metadata.terminalHistoryBefore as number | undefined,
    terminalHistorySession: metadata.terminalHistorySession as string | undefined,
    _position: module.position,
  }
}

function getDefaultLabel(type: string): string {
  const labels: Record<string, string> = {
    data_input: 'INPUT',
    ai_processor: 'AI',
    script_execution: 'SCRIPT',
    log_entry: 'OUTPUT',
    image_gen: 'IMAGE',
    markdown: 'NOTE',
    data_loader: 'DATA',
    conditional: 'GATE',
    web_fetch: 'FETCH',
  }
  return labels[type] || 'MODULE'
}


// Load all modules from backend
export async function loadModulesFromBackend(): Promise<CellWithPosition[]> {
  try {
    const modules = await requestJson<BackendModule[]>(`${API_BASE}/api/modules/`, {
      method: 'GET',
      timeoutMs: MODULE_TIMEOUT_MS,
    })
    return modules.map(backendModuleToCell)
  } catch {
    return []
  }
}

// Save a module to backend (upsert: try create, fall back to update)
export async function saveModuleToBackend(
  cell: CellData,
  position: Position,
): Promise<boolean> {
  const moduleId = cell.id

  try {
    const moduleData = cellToBackendModule(cell, position)

    // Try to create first — backend POST handles create-or-update
    try {
      const createPayload: CreateModuleRequest = {
        id: moduleId,
        type: moduleData.type,
        content: moduleData.content,
        position: moduleData.position,
      }
      await requestJson(`${API_BASE}/api/modules/`, {
        method: 'POST',
        timeoutMs: MODULE_TIMEOUT_MS,
        body: createPayload,
      })
    } catch (error) {
      // If create fails (e.g. 409 conflict), fall through to PATCH
      if (!(error instanceof ApiClientError && (error.status === 409 || error.status === 500))) {
        throw error
      }
    }

    // Always PATCH metadata + content + position (covers both create and update)
    const updatePayload: UpdateModuleRequest = {
      content: moduleData.content,
      position: moduleData.position,
      status: cell.status,
      metadata: moduleData.metadata,
    }

    await requestJson(`${API_BASE}/api/modules/${moduleId}?${Date.now()}`, {
      method: 'PATCH',
      timeoutMs: MODULE_TIMEOUT_MS,
      body: updatePayload,
    })

    return true
  } catch (error) {
    console.warn(`[LOOM] Failed to persist module ${moduleId}`, error)
    return false
  }
}

// Delete a module from backend
export async function deleteModuleFromBackend(moduleId: string): Promise<boolean> {
  try {
    await requestJson(`${API_BASE}/api/modules/${moduleId}`, {
      method: 'DELETE',
      timeoutMs: MODULE_TIMEOUT_MS,
    })
    return true
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return true
    }
    return false
  }
}

// Diagnostic function to check backend connection and module status
export async function diagnoseBackendConnection(): Promise<void> {
  try {
    await requestJson(`${API_BASE}/health`, {
      method: 'GET',
      timeoutMs: 5000,
    })
    await requestJson<BackendModule[]>(`${API_BASE}/api/modules/`, {
      method: 'GET',
      timeoutMs: MODULE_TIMEOUT_MS,
    })
  } catch (error) {
    console.warn('[LOOM] Backend diagnostics failed', error)
  }
}

// Batch save modules (for efficiency)
export async function saveModulesToBackend(
  cells: CellData[],
  getPosition: (cellId: string) => Position,
): Promise<void> {
  const savePromises = cells.map(cell =>
    saveModuleToBackend(cell, getPosition(cell.id)),
  )
  await Promise.allSettled(savePromises)
}
