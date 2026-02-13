import { useState, useCallback, useEffect } from 'react'
import { CellData, ModelSlotConfig, InputMode, ModelSlot } from '../components/circuit/CircuitBoard'
import { useSocket } from './useSocket'
import { useSystemStatus } from './useSystemStatus'
import { API_BASE_URL } from '../config/api'
import {
  buildTerminalHistoryQuery,
  formatNoTerminalHistoryResults,
  formatTerminalHistoryEntries,
  formatVectorSearchResults,
  type VectorSearchResult,
} from '../utils/circuitExecutionUtils'

export const CIRCUITS_KEY = 'loom-saved-circuits'
export const CIRCUITS_UPDATED_EVENT = 'loom:circuits-updated'
const SLOTS_KEY = 'loom-model-slots'
const API_BASE = API_BASE_URL

export interface SavedCircuit {
  name: string
  description?: string
  cells: Omit<CellData, 'status' | 'output' | 'error'>[]
  modelSlots: ModelSlotConfig
  savedAt: number
}

export interface CircuitExecutionStep {
  cellIndex: number
  cellLabel: string
  cellType: string
  status: 'pending' | 'running' | 'success' | 'error'
  output?: string
  error?: string
}

export interface CircuitExecution {
  circuitName: string
  status: 'collecting_inputs' | 'running' | 'success' | 'error'
  inputs: Record<string, string>  // label -> value
  requiredInputs: string[]        // labels of INPUT cells that need values
  steps: CircuitExecutionStep[]
  finalOutput?: string
  pendingApproval?: {
    cellId: string
    cellLabel: string
    message: string
    resolve: (value: string) => void
    reject: (reason: Error) => void
  }
}

// Event bus for circuit execution updates
type CircuitListener = (execution: CircuitExecution | null) => void
const listeners = new Set<CircuitListener>()
let currentExecution: CircuitExecution | null = null

export const circuitExecutionBus = {
  subscribe: (listener: CircuitListener) => {
    listeners.add(listener)
    // Send current state immediately
    listener(currentExecution)
    return () => { listeners.delete(listener) }
  },
  emit: (execution: CircuitExecution | null) => {
    currentExecution = execution
    listeners.forEach(l => l(execution))
  },
  getCurrent: () => currentExecution,
  approve: (response: string) => {
    if (currentExecution?.pendingApproval) {
      currentExecution.pendingApproval.resolve(response)
      // Clear pending state
      currentExecution = { ...currentExecution, pendingApproval: undefined }
      listeners.forEach(l => l(currentExecution))
    }
  },
  reject: () => {
    if (currentExecution?.pendingApproval) {
      currentExecution.pendingApproval.reject(new Error('User rejected approval'))
      currentExecution = { ...currentExecution, pendingApproval: undefined }
      listeners.forEach(l => l(currentExecution))
    }
  }
}

const DEFAULT_CIRCUITS: Record<string, SavedCircuit> = {
  'DebugAssistant': {
    name: 'DebugAssistant',
    description: 'Analyzes input logs/errors and suggests fixes.',
    savedAt: 1700000000000,
    cells: [
      {
        id: 'default-debug-1',
        type: 'data_input',
        label: 'Input',
        content: '',
        position: { x: 50, y: 50 },
        inputMode: 'none',
      },
      {
        id: 'default-debug-2',
        type: 'ai_processor',
        label: 'Analysis',
        content: 'You are a senior debugger. Analyze the following input (which may be a log entry, error message, or code snippet). 1. Identify the core issue. 2. Explain it likely root cause. 3. Suggest a concrete fix.\n\nBe concise and technical.',
        position: { x: 50, y: 200 },
        inputMode: 'previous',
        modelSlot: 'B',
      }
    ],
    modelSlots: { A: '', B: '', C: '', IMAGE: '' },
  },
  'DailyBriefing': {
    name: 'DailyBriefing',
    description: 'Generates a system status and objective summary.',
    savedAt: 1700000000000,
    cells: [
      {
        id: 'default-daily-1',
        type: 'data_input',
        label: 'Context',
        content: 'System startup',
        position: { x: 50, y: 50 },
        inputMode: 'none',
      },
      {
        id: 'default-daily-2',
        type: 'ai_processor',
        label: 'Briefing',
        content: 'Generate a creative, sci-fi style "Daily Morning Report" for the user. Include a motivational quote, a cryptic observation about the digital ether, and a reminder to stay focused on the mission. Keep it under 100 words.',
        position: { x: 50, y: 200 },
        inputMode: 'previous',
        modelSlot: 'A',
      }
    ],
    modelSlots: { A: '', B: '', C: '', IMAGE: '' },
  },
  'CreativeStorm': {
    name: 'CreativeStorm',
    description: 'Rapid-fire brainstorming on a topic.',
    savedAt: 1700000000000,
    cells: [
      {
        id: 'default-storm-1',
        type: 'data_input',
        label: 'Topic',
        content: 'Future Interfaces',
        position: { x: 50, y: 50 },
        inputMode: 'none',
      },
      {
        id: 'default-storm-2',
        type: 'ai_processor',
        label: 'Brainstorm',
        content: 'Generate 5 radical, out-of-the-box ideas related to the input topic. Focus on "blue sky" thinking, sci-fi concepts, and novel user experiences. Format as a bulleted list.',
        position: { x: 50, y: 200 },
        inputMode: 'previous',
        modelSlot: 'A',
      }
    ],
    modelSlots: { A: '', B: '', C: '', IMAGE: '' },
  }
}

// Load saved circuits (from localStorage; call refreshCircuitsFromBackend to sync from API)
export function loadSavedCircuits(): Record<string, SavedCircuit> {
  try {
    const stored = localStorage.getItem(CIRCUITS_KEY)
    let circuits: Record<string, SavedCircuit> = {}
    if (stored) {
      circuits = JSON.parse(stored)
    }
    // Merge defaults if they don't exist
    return { ...DEFAULT_CIRCUITS, ...circuits }
  } catch (e) {
    console.warn('[LOOM] Failed to load circuits:', e)
  }
  return DEFAULT_CIRCUITS
}

// Fetch circuits from backend and merge into localStorage. Call on app/sidebar mount.
export async function refreshCircuitsFromBackend(): Promise<void> {
  try {
    const r = await fetch(`${API_BASE}/api/circuits/`)
    if (!r.ok) return
    const fromApi = await r.json()
    const local = loadSavedCircuits()
    const merged = { ...local, ...fromApi }
    localStorage.setItem(CIRCUITS_KEY, JSON.stringify(merged))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CIRCUITS_UPDATED_EVENT))
    }
  } catch {
    // Backend unreachable; keep using localStorage
  }
}

// Save a circuit (localStorage + backend when available)
export function saveCircuit(circuit: SavedCircuit): boolean {
  try {
    const circuits = loadSavedCircuits()
    circuits[circuit.name] = circuit
    localStorage.setItem(CIRCUITS_KEY, JSON.stringify(circuits))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CIRCUITS_UPDATED_EVENT, { detail: { name: circuit.name } }))
    }
    fetch(`${API_BASE}/api/circuits/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: circuit.name,
        description: circuit.description,
        cells: circuit.cells,
        modelSlots: circuit.modelSlots,
      }),
    }).catch(() => { })
    return true
  } catch (e) {
    console.warn('[LOOM] Failed to save circuit:', e)
    return false
  }
}

// Delete a circuit (localStorage + backend when available)
export function deleteCircuit(name: string): boolean {
  try {
    const circuits = loadSavedCircuits()
    delete circuits[name]
    localStorage.setItem(CIRCUITS_KEY, JSON.stringify(circuits))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(CIRCUITS_UPDATED_EVENT, { detail: { name } }))
    }
    fetch(`${API_BASE}/api/circuits/${encodeURIComponent(name)}`, { method: 'DELETE' }).catch(() => { })
    return true
  } catch (e) {
    console.warn('[LOOM] Failed to delete circuit:', e)
    return false
  }
}

// Get circuit names
export function getCircuitNames(): string[] {
  const circuits = loadSavedCircuits()
  return Object.keys(circuits).sort()
}

// Load model slots
export function loadModelSlots(): ModelSlotConfig {
  try {
    const stored = localStorage.getItem(SLOTS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      // Ensure IMAGE field exists for backward compatibility
      if (!parsed.IMAGE) {
        parsed.IMAGE = ''
      }
      return parsed
    }
  } catch (e) {
    console.warn('[LOOM] Failed to load model slots:', e)
  }
  return { A: '', B: '', C: '', IMAGE: '' }
}

// Save model slots
export function saveModelSlots(slots: ModelSlotConfig): void {
  try {
    localStorage.setItem(SLOTS_KEY, JSON.stringify(slots))
  } catch (e) {
    console.warn('[LOOM] Failed to save model slots:', e)
  }
}

// Hook to run circuits
export function useCircuitRunner() {
  const { sendChat, connected } = useSocket()
  const { status, models } = useSystemStatus()

  const resolveModel = useCallback((
    slots: ModelSlotConfig,
    slot?: ModelSlot,
    directModel?: string
  ): string => {
    if (directModel) return directModel
    if (slot && slots[slot]) return slots[slot]
    if (slots.A) return slots.A
    return status.activeModel || models[0] || 'llama3.1:8b'
  }, [status.activeModel, models])

  // Gather input for a cell based on its inputMode
  const gatherInput = useCallback((
    cellIndex: number,
    cells: CellData[],
    outputs: Map<string, string>
  ): string => {
    const cell = cells[cellIndex]
    const inputMode: InputMode = cell.inputMode || 'previous'

    if (cellIndex === 0 || inputMode === 'none') {
      return cell.content || ''
    }

    if (inputMode === 'previous') {
      const prevCell = cells[cellIndex - 1]
      return outputs.get(prevCell.id) || prevCell.content || ''
    }

    // 'all' mode
    const contextParts: string[] = []
    for (let i = 0; i < cellIndex; i++) {
      const prevCell = cells[i]
      const output = outputs.get(prevCell.id) || prevCell.content
      if (output) {
        contextParts.push(`[${prevCell.label || `Cell ${i + 1}`}]\n${output}`)
      }
    }
    return contextParts.join('\n\n---\n\n')
  }, [])

  // Execute a single cell. Conditional can return { loopBackTo } to request a loop.
  const executeCell = useCallback(async (
    cell: CellData,
    input: string,
    slots: ModelSlotConfig,
    onProgress?: (output: string) => void
  ): Promise<string | { loopBackTo: number }> => {
    const modelToUse = resolveModel(slots, cell.modelSlot, cell.model)

    switch (cell.type) {
      case 'data_input':
        return cell.content || input

      case 'ai_processor':
        const prompt = cell.content
          ? `${cell.content}\n\n---\n\n${input}`
          : input

        return new Promise((resolve, reject) => {
          let response = ''

          const sent = sendChat(
            prompt,
            modelToUse,
            (chunk) => {
              response += chunk.content
              onProgress?.(response)
            },
            (statusData) => {
              if (statusData.status === 'success') {
                resolve(response)
              } else if (statusData.status === 'error') {
                reject(new Error(statusData.message))
              }
            }
          )

          if (!sent) {
            reject(new Error('Backend not connected'))
          }
        })

      case 'script_execution':
        if (cell.content.includes('{{input}}')) {
          return cell.content.replace(/\{\{input\}\}/g, input)
        }
        return cell.content || input

      case 'log_entry':
        return input

      case 'markdown':
        return input

      case 'data_loader':
        const filePath = cell.content.trim()
        if (!filePath) {
          throw new Error('No file path specified')
        }

        const fileReadMode = cell.readMode || 'raw'
        const maxChars = fileReadMode === 'preview' ? 5000 : 100000

        const response = await fetch(`${API_BASE}/api/files/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path: filePath,
            mode: 'auto',
            max_chars: maxChars,
          }),
        })

        if (!response.ok) {
          const errData = await response.json()
          throw new Error(errData.detail || 'Failed to load file')
        }

        const result = await response.json()
        let fileContent = result.content

        if (fileReadMode === 'preview') {
          const lines = fileContent.split('\n').slice(0, 50)
          return `[Preview of ${filePath}]\n\n${lines.join('\n')}`
        }

        // For AI-based modes, process through the model
        if (['summarize', 'structure', 'stats', 'extract'].includes(fileReadMode)) {
          const aiModel = resolveModel(slots, cell.modelSlot, cell.model)

          const prompts: Record<string, string> = {
            summarize: `Summarize this document concisely:\n\n${fileContent}`,
            structure: `Analyze the structure of this data:\n\n${fileContent}`,
            stats: `Analyze this data and provide key statistics:\n\n${fileContent}`,
            extract: `Extract key data points:\n\n${fileContent}`,
          }

          return new Promise((resolve, reject) => {
            let aiResponse = ''
            const sent = sendChat(
              prompts[fileReadMode],
              aiModel,
              (chunk) => {
                aiResponse += chunk.content
                onProgress?.(aiResponse)
              },
              (statusData) => {
                if (statusData.status === 'success') {
                  resolve(aiResponse)
                } else if (statusData.status === 'error') {
                  reject(new Error(statusData.message))
                }
              }
            )
            if (!sent) reject(new Error('Backend not connected'))
          })
        }

        return fileContent

      case 'conditional':
        // Evaluate condition and return appropriate output
        const conditionType = cell.conditionType || 'contains'
        const conditionValue = cell.conditionValue || ''
        let conditionPassed = false

        try {
          if (conditionType === 'regex') {
            const regex = new RegExp(conditionValue)
            conditionPassed = regex.test(input)
          } else if (conditionType === 'keyword') {
            conditionPassed = input.toLowerCase().includes(conditionValue.toLowerCase())
          } else if (conditionType === 'length') {
            const maxLength = parseInt(conditionValue) || 0
            conditionPassed = input.length <= maxLength
          } else if (conditionType === 'contains') {
            conditionPassed = input.includes(conditionValue)
          } else if (conditionType === 'ai_check') {
            // Use AI to check condition
            const aiModel = resolveModel(slots, cell.modelSlot, cell.model)
            const checkPrompt = conditionValue || 'Does this text meet the condition? Answer only YES or NO.'
            const fullPrompt = `${checkPrompt}\n\nText: ${input}\n\nAnswer:`

            return new Promise((resolve, reject) => {
              let aiResponse = ''
              const sent = sendChat(
                fullPrompt,
                aiModel,
                (chunk) => {
                  aiResponse += chunk.content
                  onProgress?.(aiResponse)
                },
                (statusData) => {
                  if (statusData.status === 'success') {
                    const passed = aiResponse.trim().toUpperCase().includes('YES')
                    if (passed) {
                      resolve(cell.onPass || input)
                    } else if ((cell.loopBackTo ?? 0) >= 1) {
                      resolve({ loopBackTo: cell.loopBackTo! })
                    } else {
                      resolve(cell.onFail || '')
                    }
                  } else if (statusData.status === 'error') {
                    reject(new Error(statusData.message))
                  }
                }
              )
              if (!sent) reject(new Error('Backend not connected'))
            })
          }

          // For non-AI conditions
          if (conditionPassed) return cell.onPass || input
          if ((cell.loopBackTo ?? 0) >= 1) return { loopBackTo: cell.loopBackTo! }
          return cell.onFail || ''
        } catch (e) {
          throw new Error(`Condition evaluation error: ${e instanceof Error ? e.message : e}`)
        }

      case 'web_fetch':
        // Fetch from URL via backend proxy to avoid CORS
        let url = cell.content.trim()
        if (url.includes('{{input}}')) {
          url = url.replace(/\{\{input\}\}/g, input)
        }
        if (!url) {
          throw new Error('No URL specified')
        }

        const method = cell.fetchMethod || 'GET'
        const timeout = (cell.fetchTimeout || 30)
        const maxSize = cell.fetchMaxSize ?? 8388608

        try {
          // Parse headers
          let headers: Record<string, string> = {}
          if (cell.fetchHeaders) {
            try {
              headers = JSON.parse(cell.fetchHeaders)
            } catch {
              const lines = cell.fetchHeaders.split('\n')
              for (const line of lines) {
                const [key, ...valueParts] = line.split(':')
                if (key && valueParts.length) {
                  headers[key.trim()] = valueParts.join(':').trim()
                }
              }
            }
          }

          // Prepare body for POST/PUT
          let body: string | undefined = undefined
          if ((method === 'POST' || method === 'PUT') && cell.fetchBody) {
            const bodyTemplate = cell.fetchBody.includes('{{input}}')
              ? cell.fetchBody.replace(/\{\{input\}\}/g, input)
              : cell.fetchBody

            try {
              // Validate JSON if possible, but send as string
              JSON.parse(bodyTemplate)
              body = bodyTemplate
            } catch {
              body = bodyTemplate
            }
          }

          // Call backend proxy
          const response = await fetch(`${API_BASE}/api/web/fetch`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url,
              method,
              headers,
              body,
              timeout,
            }),
          })

          if (!response.ok) {
            const err = await response.json().catch(() => ({}))
            throw new Error(err.detail || `Proxy Error: ${response.status}`)
          }

          const result = await response.json()

          if (result.status >= 400) {
            throw new Error(`HTTP ${result.status}: ${result.text?.slice(0, 200)}`)
          }

          const text = result.text || ''
          if (text.length > maxSize) {
            throw new Error(`Response too large: ${text.length} bytes (max: ${maxSize})`)
          }

          return text
        } catch (e) {
          throw new Error(`Fetch error: ${e instanceof Error ? e.message : e}`)
        }

      case 'vector_index':
        // Index a file into the vector store
        const filePathToIndex = (input || cell.content || '').trim()
        if (!filePathToIndex) {
          throw new Error('No file path specified. Enter a file path in the cell content or connect from previous cell.')
        }

        console.log(`[LOOM] Indexing file: ${filePathToIndex}`)

        try {
          const response = await fetch(`${API_BASE}/api/search/index/file`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              file_path: filePathToIndex,
              chunk_strategy: 'sentence',
            }),
          })

          if (!response.ok) {
            const errData = await response.json()
            throw new Error(errData.detail || 'Failed to index file')
          }

          const result = await response.json()
          if (result.success) {
            const chunkCount = result.chunk_count || 0
            const fileId = result.file_id || ''
            return `✅ Indexed '${filePathToIndex}'\n📄 ${chunkCount} chunks created\n🆔 ID: ${fileId}`
          } else {
            throw new Error(result.error || 'Indexing failed')
          }
        } catch (e) {
          throw new Error(`Vector indexing failed: ${e instanceof Error ? e.message : e}`)
        }

      case 'vector_search':
        // Search the vector store
        const searchQuery = (input || cell.content || '').trim()
        if (!searchQuery) {
          throw new Error('No search query specified. Enter a query in the cell content or connect from previous cell.')
        }

        console.log(`[LOOM] Searching vector store: ${searchQuery}`)

        try {
          const response = await fetch(`${API_BASE}/api/search/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: searchQuery,
              n_results: 5,
              collection: 'loom_files', // Default to files collection
            }),
          })

          if (!response.ok) {
            const errData = await response.json()
            throw new Error(errData.detail || 'Search failed')
          }

          const result = await response.json()
          const results = Array.isArray(result.results)
            ? result.results as VectorSearchResult[]
            : []

          if (results.length === 0) {
            return `🔍 No results found for: '${searchQuery}'\n\nMake sure you have indexed some documents first using the INDEX cell.`
          }

          return formatVectorSearchResults(searchQuery, results)
        } catch (e) {
          throw new Error(`Vector search failed: ${e instanceof Error ? e.message : e}`)
        }

      case 'terminal_history':
        // Query terminal conversation history
        // Cell content can be JSON query or simple text search
        // Format: JSON query like {"search": "keyword", "types": ["user", "ai"], "limit": 10}
        // Or simple text: "keyword" (searches all entries)
        const { queryTerminalHistory } = await import('./useTerminalOutput')

        try {
          const content = (input || cell.content || '').trim()
          const cellQuery = buildTerminalHistoryQuery(content, cell)

          const entries = queryTerminalHistory(cellQuery)

          if (entries.length === 0) {
            return formatNoTerminalHistoryResults(cellQuery)
          }

          return formatTerminalHistoryEntries(entries)
        } catch (e) {
          throw new Error(`Terminal history query failed: ${e instanceof Error ? e.message : e}`)
        }

      case 'music_gen':
        // Generate music
        const musicPrompt = (input || cell.content || '').trim()
        if (!musicPrompt) {
          throw new Error('No prompt specified. Enter a prompt in the cell content or connect from previous cell.')
        }

        const musicDuration = cell.musicDuration || 10
        const musicGuidance = cell.musicGuidance || 7.0
        const musicSteps = cell.musicSteps || 20
        const musicLyrics = cell.musicUseLyrics ? cell.musicLyrics : undefined
        // Note: cell data doesn't explicitly store seed in the model I saw in CircuitBoard.tsx yet, 
        // but we can add it if needed later or rely on random. 
        // Wait, I should double check if I need to support seed here. 
        // The previous turn added seed to MusicGenerationPanel, but CellData definition I saw in CircuitBoard.tsx 
        // did NOT have seed. I should fix that too if I want full parity.
        // For now let's implement basic generation.

        try {
          const response = await fetch(`${API_BASE}/api/music/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: musicPrompt,
              lyrics: musicLyrics,
              use_lyrics: !!musicLyrics,
              duration: musicDuration,
              guidance_scale: musicGuidance,
              steps: musicSteps,
              task: cell.musicTask || 'text2music',
              source_audio_path: cell.musicSourceAudio?.includes('{{input}}')
                ? cell.musicSourceAudio.replace(/\{\{input\}\}/g, input)
                : cell.musicSourceAudio || undefined,
              ref_audio_strength: cell.musicRefStrength,
              repaint_start: cell.musicRepaintStart,
              repaint_end: cell.musicRepaintEnd,
              target_prompt: cell.musicTargetPrompt,
              target_lyrics: cell.musicTargetLyrics,
            }),
          })

          if (!response.ok) {
            const errData = await response.json()
            throw new Error(errData.detail || 'Music generation failed')
          }

          const data = await response.json()
          if (data.status === 'success' && data.audio_url) {
            return `${API_BASE}${data.audio_url}`
          } else {
            throw new Error(data.message || 'Unknown music generation error')
          }
        } catch (e) {
          throw new Error(`Music generation failed: ${e instanceof Error ? e.message : e}`)
        }

      case 'qdc_upload': {
        const artifactPath = (input || cell.content || '').trim()
        if (!artifactPath) {
          throw new Error('No artifact path specified for QDC upload.')
        }

        const response = await fetch(`${API_BASE}/api/qdc/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: artifactPath }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.detail || 'QDC upload failed')
        }
        const artifactId = String(data?.artifact?.id || '')
        return artifactId
          ? `QDC artifact uploaded: ${artifactId}`
          : 'QDC artifact uploaded'
      }

      case 'qdc_run': {
        const qdcPrompt = (input || cell.content || '').trim()
        if (!qdcPrompt) {
          throw new Error('No prompt specified for QDC run.')
        }
        // Accept artifact id from input when previous cell output contains one.
        const artifactIdMatch = (input || '').match(/qdc-artifact-[a-z0-9]+/i)
        const artifactId = artifactIdMatch?.[0]

        const response = await fetch(`${API_BASE}/api/qdc/jobs`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: qdcPrompt,
            artifact_id: artifactId,
            target: 'auto',
            priority: 'normal',
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.detail || 'QDC run failed')
        }
        const jobId = String(data?.job?.id || '')
        return jobId ? `QDC job started: ${jobId}` : 'QDC job started'
      }

      case 'qdc_status': {
        const jobId = ((input || cell.content || '').match(/qdc-job-[a-z0-9]+/i)?.[0] || '').trim()
        if (!jobId) {
          throw new Error('No QDC job id specified.')
        }
        const response = await fetch(`${API_BASE}/api/qdc/jobs/${encodeURIComponent(jobId)}`)
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.detail || 'QDC status lookup failed')
        }
        const statusValue = String(data?.job?.status || 'unknown')
        return `QDC ${jobId} status: ${statusValue}`
      }

      case 'qdc_results': {
        const jobId = ((input || cell.content || '').match(/qdc-job-[a-z0-9]+/i)?.[0] || '').trim()
        if (!jobId) {
          throw new Error('No QDC job id specified.')
        }
        const response = await fetch(`${API_BASE}/api/qdc/jobs/${encodeURIComponent(jobId)}/results`)
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data.detail || 'QDC results lookup failed')
        }
        const summary = String(data?.result?.summary || '')
        return summary ? `QDC ${jobId}: ${summary}` : `QDC ${jobId}: result pending`
      }

      case 'notification': {
        const title = cell.notificationTitle || 'Loom Alert'
        const bodyTemplate = cell.notificationBody || '{{input}}'
        const body = bodyTemplate.replace(/\{\{input\}\}/g, input)

        if (typeof Notification === 'undefined') {
          return `Notification skipped (not available in this context). Result: ${body.slice(0, 100)}${body.length > 100 ? '…' : ''}`
        }
        if (Notification.permission === 'granted') {
          new Notification(title, { body })
          return `Notification sent: ${title}`
        }
        if (Notification.permission === 'denied') {
          return `Notification blocked (permission denied). Result: ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`
        }
        const permission = await Notification.requestPermission()
        if (permission === 'granted') {
          new Notification(title, { body })
          return `Notification sent: ${title}`
        }
        return `Notification skipped (permission ${permission}). Result: ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`
      }

      case 'file_write': {
        const path = (cell.fileWritePath || '').trim()
        if (!path) throw new Error('No file path specified')

        const template = cell.content || '{{input}}'
        const content = template.replace(/\{\{input\}\}/g, input)
        const mode = cell.fileWriteMode || 'overwrite'

        const response = await fetch(`${API_BASE}/api/files/write`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path, content, mode }),
        })

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.detail || 'File write failed')
        }

        return `Written to ${path} (${mode})`
      }

      case 'shell_exec': {
        const cmdTemplate = cell.shellExecCommand || cell.content || ''
        const command = cmdTemplate.replace(/\{\{input\}\}/g, input)

        if (!command.trim()) throw new Error('No command specified')

        const response = await fetch(`${API_BASE}/api/system/exec`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ command }),
        })

        if (!response.ok) {
          const err = await response.json()
          throw new Error(err.detail || 'Shell execution failed')
        }

        const result = await response.json()
        if (result.exit_code !== 0) {
          throw new Error(`Command failed (code ${result.exit_code}):\n${result.stderr}`)
        }

        return result.stdout || result.stderr || '(No output)'
      }

      case 'delay': {
        const seconds = cell.delaySeconds || 1
        await new Promise(resolve => setTimeout(resolve, seconds * 1000))
        return `Waited ${seconds} seconds`
      }

      case 'human_approval': {
        const message = cell.content || 'Approval required'
        const context = message.includes('{{input}}')
          ? message.replace(/\{\{input\}\}/g, input)
          : `${message}\n\nContext:\n${input}`

        return new Promise((resolve, reject) => {
          // Update global state with pending approval
          if (currentExecution) {
            currentExecution = {
              ...currentExecution,
              pendingApproval: {
                cellId: cell.id,
                cellLabel: cell.label,
                message: context,
                resolve: (val) => resolve(val), // Bus will call this
                reject: (err) => reject(err),   // Bus will call this
              }
            }
            // Emit update so UI shows approval buttons
            circuitExecutionBus.emit(currentExecution)
          } else {
            // Fallback if somehow running without execution context (shouldn't happen)
            reject(new Error('No execution context for approval'))
          }
        })
      }

      default:
        return input
    }
  }, [sendChat, resolveModel])

  // Run a full circuit with inputs
  const runCircuit = useCallback(async (
    circuitName: string,
    inputs: Record<string, string>
  ): Promise<string> => {
    const circuits = loadSavedCircuits()
    const circuit = circuits[circuitName]

    if (!circuit) {
      throw new Error(`Circuit "${circuitName}" not found`)
    }

    // Build cells with provided inputs
    const cells: CellData[] = circuit.cells.map((cell, index) => {
      const fullCell: CellData = {
        ...cell,
        id: `run-${index}`,
        status: 'idle',
        content: cell.type === 'data_input' && inputs[cell.label]
          ? inputs[cell.label]
          : cell.content,
      }
      return fullCell
    })

    // Initialize execution state
    const execution: CircuitExecution = {
      circuitName,
      status: 'running',
      inputs,
      requiredInputs: [],
      steps: cells.map((cell, index) => ({
        cellIndex: index,
        cellLabel: cell.label,
        cellType: cell.type,
        status: 'pending',
      })),
    }

    circuitExecutionBus.emit(execution)

    const outputs = new Map<string, string>()
    const loopCounts = new Map<string, number>()
    let finalOutput = ''

    try {
      for (let i = 0; i < cells.length; i++) {
        const cell = cells[i]

        // Update step status
        execution.steps[i].status = 'running'
        circuitExecutionBus.emit({ ...execution })

        const input = gatherInput(i, cells, outputs)

        const result = await executeCell(
          cell,
          input,
          circuit.modelSlots,
          (progress) => {
            execution.steps[i].output = progress
            circuitExecutionBus.emit({ ...execution })
          }
        )

        let output: string

        if (typeof result === 'object' && result !== null && 'loopBackTo' in result) {
          const r = result as { loopBackTo: number }
          const count = loopCounts.get(cell.id) ?? 0
          const max = cell.loopBackMax ?? 3
          if (count >= max) {
            output = cell.onFail || ''
            loopCounts.delete(cell.id)
          } else {
            loopCounts.set(cell.id, count + 1)
            i = r.loopBackTo - 2 // 1-based → 0-based; for-loop i++ runs next, so -2 to land on loopBackTo cell
            continue
          }
        } else {
          output = result as string
        }

        outputs.set(cell.id, output)
        execution.steps[i].status = 'success'
        execution.steps[i].output = output
        finalOutput = output

        circuitExecutionBus.emit({ ...execution })
      }

      execution.status = 'success'
      execution.finalOutput = finalOutput
      circuitExecutionBus.emit({ ...execution })

      // Clear after a delay
      setTimeout(() => {
        circuitExecutionBus.emit(null)
      }, 5000)

      return finalOutput
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : 'Unknown error'

      // Mark current step as error
      const runningStep = execution.steps.find(s => s.status === 'running')
      if (runningStep) {
        runningStep.status = 'error'
        runningStep.error = errorMsg
      }

      execution.status = 'error'
      circuitExecutionBus.emit({ ...execution })

      throw e
    }
  }, [executeCell, gatherInput])

  // Get required inputs for a circuit
  const getRequiredInputs = useCallback((circuitName: string): string[] => {
    const circuits = loadSavedCircuits()
    const circuit = circuits[circuitName]

    if (!circuit) return []

    return circuit.cells
      .filter(cell => cell.type === 'data_input')
      .map(cell => cell.label)
  }, [])

  return {
    runCircuit,
    getRequiredInputs,
    connected,
  }
}

// Hook to subscribe to circuit execution updates
export function useCircuitExecution() {
  const [execution, setExecution] = useState<CircuitExecution | null>(null)

  useEffect(() => {
    const unsubscribe = circuitExecutionBus.subscribe(setExecution)
    return () => { unsubscribe() }
  }, [])

  return execution
}
