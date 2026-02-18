import { useCallback, useState, useEffect, useRef } from 'react'
import ReactFlow, {
  Node,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ConnectionMode,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { ModuleNode } from './ModuleNode'
import { LinearView } from './LinearView'
import { FloatingToolbar } from './FloatingToolbar'
import { TemplatesSidebar, NotebookTemplate } from './TemplatesSidebar'
import { LoopBackEdge } from './LoopBackEdge'
import type { LogEntry, ModuleType, ModuleStatus } from '../../types/module'
import { useSocket } from '../../hooks/useSocket'
import { useSystemStatus } from '../../hooks/useSystemStatus'
import { useSendToTerminal } from '../../hooks/useTerminalOutput'
import { saveCircuit, saveModelSlots, loadModelSlots, loadSavedCircuits, SavedCircuit } from '../../hooks/useCircuitRunner'
import { saveModuleToBackend, deleteModuleFromBackend } from '../../hooks/useModules'
import { ProviderSetup } from '../terminal/ProviderSetup'
import { DialogModal } from '../shell/DialogModal'
import { API_BASE_URL } from '../../config/api'
import { cellsToNodes, defaultEdgeOptions, generateEdges, getNodePosition } from './circuitLayout'
import { fetchImageModels, IMAGE_MODELS_UPDATED_EVENT } from '../../utils/imageModelsApi'
import { showErrorToast, showInfoToast, showSuccessToast } from '../../utils/uiNotifications'
import {
  buildTerminalHistoryQuery,
  formatNoTerminalHistoryResults,
  formatTerminalHistoryEntries,
  formatVectorSearchResults,
  type VectorSearchResult,
} from '../../utils/circuitExecutionUtils'

type ViewMode = 'linear' | 'canvas'

// Model slots - A, B, C for different cognitive tasks
export type ModelSlot = 'A' | 'B' | 'C'

export interface ModelSlotConfig {
  A: string  // Creative/Generative
  B: string  // Critical/Analytical  
  C: string  // Fast/Simple
  IMAGE: string  // Image Generation
}

const SLOT_LABELS: Record<ModelSlot, { label: string; desc: string; color: string }> = {
  A: { label: 'A', desc: 'Creative', color: '#33ff00' },
  B: { label: 'B', desc: 'Critical', color: '#00bfff' },
  C: { label: 'C', desc: 'Fast', color: '#ff9500' },
}

const IMAGE_SLOT_DEFAULT = 'openai:dall-e-3'
const CIRCUIT_IMPORT_EVENT = 'loom:circuit-import'
const OPEN_CIRCUIT_EVENT = 'loom:open-circuit'
const SCHEDULER_RUNS_UPDATED_EVENT = 'loom:scheduler-runs-updated'

// Register custom node types
const nodeTypes = {
  module: ModuleNode,
}

// Register custom edge types
const edgeTypes = {
  loopback: LoopBackEdge,
}

// How a cell receives input from previous cells
export type InputMode = 'previous' | 'all' | 'none'

export interface CellData {
  id: string
  type: ModuleType
  label: string
  content: string
  status: ModuleStatus
  position?: { x: number; y: number }
  output?: string
  error?: string
  model?: string       // Direct model override (legacy)
  modelSlot?: ModelSlot // Which slot to use (A, B, or C)
  readMode?: string    // For data_loader: how to read/process the file
  inputMode?: InputMode // How to receive input: 'previous' = last cell, 'all' = entire notebook, 'none' = just own content
  // Conditional cell parameters
  conditionType?: 'regex' | 'keyword' | 'length' | 'contains' | 'ai_check' // For conditional cells
  conditionValue?: string  // Pattern/keyword/value for condition
  onPass?: string  // Output when condition passes (default: input)
  onFail?: string  // Output when condition fails (default: '')
  loopBackTo?: number  // 1-based cell index to re-run from when condition fails (0 = no loop)
  loopBackMax?: number  // Max loop iterations (default: 3)
  // Web fetch cell parameters
  fetchMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE'  // For web_fetch cells
  fetchHeaders?: string  // JSON string or key:value pairs
  fetchBody?: string  // Body template (can use {{input}})
  fetchTimeout?: number  // Timeout in seconds (default: 30)
  fetchMaxSize?: number  // Max response size in bytes (default: 8388608 = 8MB)
  // Music cell parameters
  musicStyle?: string
  musicLyrics?: string
  musicUseLyrics?: boolean
  musicDuration?: number
  musicGuidance?: number
  musicSteps?: number
  musicTask?: 'text2music' | 'audio2audio' | 'repaint' | 'edit' | 'extend'
  musicSourceAudio?: string
  musicRefStrength?: number
  musicRepaintStart?: number
  musicRepaintEnd?: number
  musicTargetPrompt?: string
  musicTargetLyrics?: string
  // Terminal history query overrides
  terminalHistorySearch?: string
  terminalHistoryTypes?: LogEntry['type'][]
  terminalHistoryLimit?: number
  terminalHistorySince?: number
  terminalHistoryBefore?: number
  terminalHistorySession?: string
  // Notification cell parameters
  notificationTitle?: string
  notificationBody?: string
  // File Write cell parameters
  fileWritePath?: string
  fileWriteMode?: 'overwrite' | 'append'
  // Shell Exec cell parameters
  shellExecCommand?: string
  shellExecCwd?: string
  // Delay cell parameters
  delaySeconds?: number
}

// Start with a blank board. Users can add cells or load a template/circuit.
const initialCells: CellData[] = []

const CHAT_MODEL_EXCLUDE = ['llava', 'bakllava', 'vision', 'moondream', 'flux', 'stable-diffusion', 'sdxl']
const FAST_MODEL_HINTS = ['tiny', 'mini', '1.5b', '2b', '3b', 'q4', 'q3']
const CRITICAL_MODEL_HINTS = ['70b', '32b', '27b', '14b', 'mixtral', 'qwen2.5']
const UNSAVED_CHANGES_EVENT = 'loom:unsaved-changes'

function normalizeCircuitName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

function createCircuitSnapshot(
  circuitName: string,
  cells: CellData[]
): string {
  const normalizedName = normalizeCircuitName(circuitName)
  const sanitizedCells = cells.map(({ status, output, error, ...rest }) => rest)
  return JSON.stringify({
    name: normalizedName,
    cells: sanitizedCells,
  })
}

function isLikelyChatModel(model: string): boolean {
  const lower = model.toLowerCase()
  return !CHAT_MODEL_EXCLUDE.some(keyword => lower.includes(keyword))
}

function pickModelByHints(models: string[], hints: string[]): string | null {
  const match = models.find(model => hints.some(hint => model.toLowerCase().includes(hint)))
  return match ?? null
}

function validateCell(cell: CellData, index: number): string | null {
  const content = (cell.content || '').trim()
  const inputMode = cell.inputMode || 'previous'
  const expectsInlineContent = index === 0 || inputMode === 'none'

  switch (cell.type) {
    case 'data_input':
      return content ? null : 'Input cell is empty. Add a prompt or data first.'
    case 'ai_processor':
      if (!expectsInlineContent) return null
      return content ? null : 'AI cell has no prompt. Add instructions or switch Input mode.'
    case 'script_execution':
      return content ? null : 'Script cell is empty. Add a transform template.'
    case 'data_loader':
      return content ? null : 'Data cell needs a file path. Use Browse Files or type one.'
    case 'web_fetch':
      return content ? null : 'Fetch cell needs a URL. Example: https://example.com'
    case 'vector_index':
      if (!expectsInlineContent) return null
      return content ? null : 'Index cell needs a file path to index.'
    case 'vector_search':
      if (!expectsInlineContent) return null
      return content ? null : 'Search cell needs a query.'
    case 'conditional':
      return (cell.conditionValue || '').trim()
        ? null
        : 'Conditional cell needs a condition value.'
    case 'music_gen':
      if (!expectsInlineContent) return null
      return (cell.musicStyle || content).trim()
        ? null
        : 'Music cell needs a style/prompt.'
    case 'qdc_upload':
      if (!expectsInlineContent) return null
      return content ? null : 'QDC Upload needs a file/folder path.'
    case 'qdc_run':
      if (!expectsInlineContent) return null
      return content ? null : 'QDC Run needs job instructions.'
    case 'qdc_status':
    case 'qdc_results':
      if (!expectsInlineContent) return null
      return content ? null : 'Provide a QDC job id.'
    case 'notification':
      return (cell.notificationTitle || '').trim() ? null : 'Notification needs a title.'
    case 'telegram_send':
      return null
    case 'file_write':
      return (cell.fileWritePath || '').trim() ? null : 'File Write needs a path.'
    case 'shell_exec':
      return (cell.shellExecCommand || cell.content || '').trim() ? null : 'Shell Exec needs a command.'
    case 'delay':
      return (cell.delaySeconds || 0) > 0 ? null : 'Delay needs a duration > 0.'
    case 'human_approval':
      return (cell.content || '').trim() ? null : 'Approval needs instructions.'
    default:
      return null
  }
}

export function CircuitBoard() {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('linear')
  const [cells, setCells] = useState<CellData[]>(initialCells)
  const [isRunning, setIsRunning] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showModelConfig, setShowModelConfig] = useState(false)
  const [circuitName, setCircuitName] = useState<string>('')
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [infoDialog, setInfoDialog] = useState<{ title: string; message: string } | null>(null)
  const [deleteCellDialog, setDeleteCellDialog] = useState<{ id: string; label: string } | null>(null)
  const [clearBoardDialogOpen, setClearBoardDialogOpen] = useState(false)

  const { sendChat } = useSocket()
  const { status, models, cloudModels } = useSystemStatus()
  const sendToTerminal = useSendToTerminal()
  const { stopGeneration } = useSocket()

  // Provider setup modal state
  const [showProviderSetup, setShowProviderSetup] = useState(false)

  // Model slot configuration - maps slots to actual model names
  const [modelSlots, setModelSlots] = useState<ModelSlotConfig>(() => loadModelSlots())
  const baselineSnapshotRef = useRef<string>(createCircuitSnapshot(circuitName, cells))

  // Fetch available image models
  const [imageModels, setImageModels] = useState<Array<{ name: string; vram?: string }>>([])
  const [currentImageModel, setCurrentImageModel] = useState<string | null>(null)

  useEffect(() => {
    const chatModels = models.filter(isLikelyChatModel)
    if (chatModels.length === 0) return

    setModelSlots(prev => {
      const next: ModelSlotConfig = { ...prev }
      const fast = pickModelByHints(chatModels, FAST_MODEL_HINTS) || chatModels[0]
      const critical = pickModelByHints(chatModels, CRITICAL_MODEL_HINTS) || chatModels[Math.min(1, chatModels.length - 1)] || chatModels[0]
      const creative = chatModels[0]
      const fallbackImage = currentImageModel || imageModels[0]?.name || IMAGE_SLOT_DEFAULT

      if (!next.A) next.A = creative
      if (!next.B) next.B = critical
      if (!next.C) next.C = fast
      if (!next.IMAGE) next.IMAGE = fallbackImage
      return next
    })
  }, [models, currentImageModel, imageModels])

  useEffect(() => {
    let cancelled = false

    const refreshImageModels = async (force = false) => {
      try {
        const data = await fetchImageModels(API_BASE_URL, { force })
        if (cancelled) return

        setImageModels(data.local.map(model => ({
          name: model.name,
          vram: model.vram || 'unknown',
          type: model.type || 'unknown',
        })))
        setCurrentImageModel(data.current_model || null)

        setModelSlots(prev => {
          if (prev.IMAGE || data.local.length === 0) return prev
          return {
            ...prev,
            IMAGE: data.current_model || data.local[0].name,
          }
        })
      } catch (error) {
        console.error('[LOOM] Failed to fetch image models:', error)
      }
    }
    void refreshImageModels()

    // Listen for model updates
    const handleModelUpdate = () => {
      void refreshImageModels()
    }
    window.addEventListener(IMAGE_MODELS_UPDATED_EVENT, handleModelUpdate)

    return () => {
      cancelled = true
      window.removeEventListener(IMAGE_MODELS_UPDATED_EVENT, handleModelUpdate)
    }
  }, [])

  // Persist model slots when they change
  useEffect(() => {
    saveModelSlots(modelSlots)
  }, [modelSlots])

  useEffect(() => {
    const currentSnapshot = createCircuitSnapshot(circuitName, cells)
    setHasUnsavedChanges(currentSnapshot !== baselineSnapshotRef.current)
  }, [circuitName, cells])

  useEffect(() => {
    window.dispatchEvent(new CustomEvent(UNSAVED_CHANGES_EVENT, {
      detail: { hasUnsavedChanges },
    }))
  }, [hasUnsavedChanges])

  useEffect(() => {
    return () => {
      window.dispatchEvent(new CustomEvent(UNSAVED_CHANGES_EVENT, {
        detail: { hasUnsavedChanges: false },
      }))
    }
  }, [])

  useEffect(() => {
    const onImportSnippet = (event: Event) => {
      const custom = event as CustomEvent<{ content?: string }>
      const content = (custom.detail?.content || '').trim()
      if (!content) return

      const newCell: CellData = {
        id: `cell-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        type: 'data_input',
        label: 'FROM CHAT',
        content,
        status: 'idle',
        inputMode: 'none',
      }

      setCells(prev => [...prev, newCell])
      setShowSaveSuccess(false)
      showInfoToast('Imported terminal snippet into circuit.', 'Circuit')
    }

    window.addEventListener(CIRCUIT_IMPORT_EVENT, onImportSnippet as EventListener)
    return () => window.removeEventListener(CIRCUIT_IMPORT_EVENT, onImportSnippet as EventListener)
  }, [])

  // React Flow state (must be declared before useEffects that use setNodes/setEdges)
  const [nodes, setNodes, onNodesChange] = useNodesState(cellsToNodes(initialCells))
  const [edges, setEdges, onEdgesChange] = useEdgesState(generateEdges(initialCells))

  // Helper to get position for a cell (must be after nodes is initialized)
  const getCellPosition = useCallback((cellId: string): { x: number; y: number } => {
    const index = cells.findIndex(c => c.id === cellId)
    if (index === -1) return { x: 0, y: 0 }
    if (viewMode === 'canvas') {
      const node = nodes.find(n => n.id === cellId)
      if (node) return node.position
    }
    return getNodePosition(index, cells)
  }, [cells, nodes, viewMode])

  // Save the current circuit
  const handleSaveCircuit = useCallback(() => {
    const name = normalizeCircuitName(circuitName)
    if (!name) {
      setInfoDialog({
        title: 'Circuit Name Required',
        message: 'Enter a circuit name before saving this board.',
      })
      showErrorToast('Please enter a circuit name before saving.', 'Save Circuit')
      return
    }

    const circuit: SavedCircuit = {
      name,
      cells: cells.map(({ status, output, error, ...rest }) => rest),
      modelSlots,
      savedAt: Date.now(),
    }

    if (saveCircuit(circuit)) {
      baselineSnapshotRef.current = createCircuitSnapshot(name, cells)
      setHasUnsavedChanges(false)
      setShowSaveSuccess(true)
      setTimeout(() => setShowSaveSuccess(false), 2000)
      showSuccessToast(`Saved circuit "${name}".`, 'Save Circuit')
    } else {
      showErrorToast('Failed to save circuit.', 'Save Circuit')
    }
  }, [circuitName, cells, modelSlots, setInfoDialog])

  // Resolve a slot to an actual model name
  const resolveModel = useCallback((slot?: ModelSlot, directModel?: string): string => {
    // Direct model override takes precedence
    if (directModel) return directModel

    // Then check slot
    if (slot && modelSlots[slot]) return modelSlots[slot]

    // Default to slot A, then first available, then fallback
    if (modelSlots.A) return modelSlots.A
    return status.activeModel || models[0] || 'llama3.1:8b'
  }, [modelSlots, status.activeModel, models])

  const applyModelSlotPreset = useCallback((preset: 'balanced' | 'creative' | 'speed') => {
    const chatModels = models.filter(isLikelyChatModel)
    if (chatModels.length === 0) {
      showInfoToast('No local chat models detected yet. Pull one first, then apply a preset.', 'Model Slots')
      return
    }

    const creative = chatModels[0]
    const critical = pickModelByHints(chatModels, CRITICAL_MODEL_HINTS) || chatModels[Math.min(1, chatModels.length - 1)] || creative
    const fast = pickModelByHints(chatModels, FAST_MODEL_HINTS) || chatModels[chatModels.length - 1] || creative
    const imageDefault = currentImageModel || imageModels[0]?.name || IMAGE_SLOT_DEFAULT

    if (preset === 'balanced') {
      setModelSlots(prev => ({
        ...prev,
        A: creative,
        B: critical,
        C: fast,
        IMAGE: prev.IMAGE || imageDefault,
      }))
      showSuccessToast('Applied balanced slot defaults (A creative, B critical, C fast).', 'Model Slots')
      return
    }

    if (preset === 'creative') {
      setModelSlots(prev => ({
        ...prev,
        A: creative,
        B: creative,
        C: fast,
        IMAGE: prev.IMAGE || imageDefault,
      }))
      showSuccessToast('Applied creative preset.', 'Model Slots')
      return
    }

    setModelSlots(prev => ({
      ...prev,
      A: fast,
      B: critical,
      C: fast,
      IMAGE: prev.IMAGE || imageDefault,
    }))
    showSuccessToast('Applied speed preset.', 'Model Slots')
  }, [models, currentImageModel, imageModels])

  const swapModelSlots = useCallback((left: ModelSlot, right: ModelSlot) => {
    setModelSlots(prev => ({
      ...prev,
      [left]: prev[right],
      [right]: prev[left],
    }))
    showInfoToast(`Swapped slot ${left} and ${right}.`, 'Model Slots')
  }, [])

  // Sync nodes and edges when cells change in canvas mode
  useEffect(() => {
    if (viewMode === 'canvas') {
      setNodes(cellsToNodes(cells))
      setEdges(generateEdges(cells))
    }
  }, [cells, viewMode, setNodes, setEdges])

  // Load a template into the notebook
  const loadTemplate = useCallback((template: NotebookTemplate, name: string) => {
    const newCells: CellData[] = template.cells.map((cell, index) => ({
      ...cell,
      id: `cell-${Date.now()}-${index}`,
      status: 'idle' as ModuleStatus,
    }))
    setCells(newCells)
    setCircuitName(name)
    baselineSnapshotRef.current = createCircuitSnapshot(name, newCells)
    setHasUnsavedChanges(false)
    setShowSaveSuccess(false)
    // Sync to canvas if in canvas mode
    if (viewMode === 'canvas') {
      setNodes(cellsToNodes(newCells))
      setEdges(generateEdges(newCells))
    }
  }, [viewMode, setNodes, setEdges])

  const openCircuitByName = useCallback(async (name: string) => {
    const normalizedName = normalizeCircuitName(name)
    try {
      let circuit: SavedCircuit | null = null

      const response = await fetch(`${API_BASE_URL}/api/circuits/${encodeURIComponent(normalizedName)}`)
      if (response.ok) {
        circuit = await response.json()
      }

      if (!circuit) {
        const local = loadSavedCircuits()
        circuit = local[normalizedName] || local[name] || null
      }

      if (!circuit) {
        showErrorToast(`Circuit "${normalizedName}" not found.`, 'Open Circuit')
        return
      }

      const loadedName = normalizeCircuitName(circuit.name || normalizedName)
      const loadedCells: CellData[] = (circuit.cells || []).map((cell, index) => ({
        ...(cell as CellData),
        id: (cell as CellData).id || `cell-${Date.now()}-${index}`,
        status: 'idle',
      }))

      setCells(loadedCells)
      setCircuitName(loadedName)
      setActiveCellId(null)
      if (circuit.modelSlots) {
        setModelSlots(prev => ({ ...prev, ...circuit.modelSlots }))
      }
      baselineSnapshotRef.current = createCircuitSnapshot(loadedName, loadedCells)
      setHasUnsavedChanges(false)
      setShowSaveSuccess(false)
      if (viewMode === 'canvas') {
        setNodes(cellsToNodes(loadedCells))
        setEdges(generateEdges(loadedCells))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      showErrorToast(`Failed to open circuit: ${message}`, 'Open Circuit')
    }
  }, [viewMode, setNodes, setEdges])

  // Sync cells to nodes when switching to canvas
  const syncToCanvas = useCallback(() => {
    setNodes(cellsToNodes(cells))
    setEdges(generateEdges(cells))
  }, [cells, setNodes, setEdges])

  // Create a new empty circuit
  const newCircuit = useCallback(() => {
    const newCells: CellData[] = []
    setCells(newCells)
    setCircuitName('')
    baselineSnapshotRef.current = createCircuitSnapshot('', newCells)
    setHasUnsavedChanges(false)
    setShowSaveSuccess(false)
    // Sync to canvas if in canvas mode
    if (viewMode === 'canvas') {
      setNodes(cellsToNodes(newCells))
      setEdges(generateEdges(newCells))
    }
  }, [viewMode, setNodes, setEdges])

  useEffect(() => {
    const onOpenCircuit = (event: Event) => {
      const custom = event as CustomEvent<{ name?: string }>
      const name = custom.detail?.name?.trim()
      if (!name) return
      void openCircuitByName(name)
    }

    window.addEventListener(OPEN_CIRCUIT_EVENT, onOpenCircuit as EventListener)
    return () => window.removeEventListener(OPEN_CIRCUIT_EVENT, onOpenCircuit as EventListener)
  }, [openCircuitByName])

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge({ ...connection, ...defaultEdgeOptions }, eds))
    },
    [setEdges]
  )

  const addCell = (type: ModuleType) => {
    const labels: Record<ModuleType, string> = {
      data_input: 'INPUT',
      ai_processor: 'AI',
      script_execution: 'SCRIPT',
      log_entry: 'OUTPUT',
      image_gen: 'IMAGE',
      markdown: 'NOTE',
      data_loader: 'DATA',
      conditional: 'GATE',
      web_fetch: 'FETCH',
      vector_index: 'INDEX',
      vector_search: 'SEARCH',
      terminal_history: 'HISTORY',
      music_gen: 'MUSIC',
      qdc_upload: 'QDC UPLOAD',
      qdc_run: 'QDC RUN',
      qdc_status: 'QDC STATUS',
      qdc_results: 'QDC RESULT',
      notification: 'NOTIFY',
      telegram_send: 'TELEGRAM',
      file_write: 'WRITE FILE',
      shell_exec: 'SHELL',
      delay: 'DELAY',
      human_approval: 'APPROVAL',
      cron_trigger: 'CRON',
    }

    // Default content based on cell type - using real public data sources
    const defaultContent: Record<ModuleType, string> = {
      data_input: 'What are the main themes in classic literature?',
      ai_processor: 'Analyze the following text and extract key insights:\n\n{{input}}',
      script_execution: 'Extract the first 200 characters:\n\n{{input}}',
      log_entry: '',
      image_gen: 'blurry, low quality, distorted',
      music_gen: 'An upbeat techno track with synth melodies',
      markdown: '# Notes\n\nDocument your workflow here...',
      data_loader: '',
      conditional: '',
      web_fetch: 'https://www.gutenberg.org/files/1342/1342-0.txt', // Pride and Prejudice
      vector_index: '',
      vector_search: 'What are the main themes?',
      terminal_history: '',
      qdc_upload: '/path/to/model-or-package',
      qdc_run: 'Run this workload on QDC and summarize key outputs.',
      qdc_status: 'qdc-job-xxxxxxxxxx',
      qdc_results: 'qdc-job-xxxxxxxxxx',
      notification: 'System Alert',
      telegram_send: '{{input}}',
      file_write: 'Log entry: {{input}}',
      shell_exec: 'echo "Hello from Loom"',
      delay: '',
      human_approval: 'Please review the input below and click Approve to continue.',
      cron_trigger: '0 8 * * *',
    }

    // Default configurations for specific cell types
    const getDefaultConfig = (): Partial<CellData> => {
      switch (type) {
        case 'web_fetch':
          return {
            content: 'https://www.gutenberg.org/files/1342/1342-0.txt', // Project Gutenberg example
            fetchMethod: 'GET',
            fetchTimeout: 30,
            fetchMaxSize: 8388608,
            inputMode: 'none',
          }
        case 'data_loader':
          return {
            content: '', // User should specify file path
            readMode: 'raw',
            inputMode: 'none',
          }
        case 'vector_index':
          return {
            content: '', // User should specify file path
            inputMode: 'none',
          }
        case 'vector_search':
          return {
            content: 'What are the main themes and concepts?',
            inputMode: 'previous', // Can use previous cell output as query
          }
        case 'conditional':
          return {
            content: '',
            conditionType: 'contains',
            conditionValue: 'error',
            onPass: '{{input}}',
            onFail: 'Condition not met',
            inputMode: 'previous',
            loopBackTo: 0,
            loopBackMax: 3,
          }
        case 'ai_processor':
          return {
            content: 'Analyze and summarize the following:\n\n{{input}}',
            modelSlot: 'A',
            inputMode: 'previous',
          }
        case 'script_execution':
          return {
            content: 'Format as JSON:\n\n{"text": "{{input}}"}',
            inputMode: 'previous',
          }
        case 'terminal_history':
          return {
            content: '{"search": "", "types": ["user", "ai"], "limit": 10}',
            inputMode: 'none',
          }
        case 'data_input':
          return {
            content: defaultContent[type],
            inputMode: 'none',
          }
        case 'image_gen':
          return {
            content: 'blurry, low quality, distorted, watermark',
            inputMode: 'previous',
          }
        case 'log_entry':
          return {
            content: '',
            inputMode: 'previous',
          }
        case 'music_gen':
          return {
            content: 'An upbeat techno track with synth melodies',
            musicDuration: 10,
            musicGuidance: 7.0,
            musicSteps: 20,
            inputMode: 'none',
          }
        case 'markdown':
          return {
            content: '# Documentation\n\nDescribe what this circuit does...',
            inputMode: 'none',
          }
        case 'notification':
          return {
            content: 'Task Completed',
            notificationTitle: 'Loom Alert',
            notificationBody: '{{input}}',
            inputMode: 'previous',
          }
        case 'telegram_send':
          return {
            content: '{{input}}',
            inputMode: 'previous',
          }
        case 'file_write':
          return {
            content: '{{input}}',
            fileWritePath: 'output.txt',
            fileWriteMode: 'append',
            inputMode: 'previous',
          }
        case 'shell_exec':
          return {
            content: 'echo "Processing: {{input}}"',
            shellExecCommand: 'echo "Processing: {{input}}"',
            inputMode: 'previous',
          }
        case 'delay':
          return {
            content: 'Wait for 5 seconds',
            delaySeconds: 5,
            inputMode: 'none',
          }
        case 'human_approval':
          return {
            content: 'Please approve this step to proceed.\n\nContext:\n{{input}}',
            inputMode: 'previous',
          }
        default:
          return {
            content: defaultContent[type] || '',
            inputMode: 'previous',
          }
      }
    }

    const newCell: CellData = {
      id: `cell-${Date.now()}`,
      type,
      label: labels[type],
      content: defaultContent[type] || '',
      status: 'idle',
      ...getDefaultConfig(),
    }

    setCells((prev) => {
      const updated = [...prev, newCell]
      // Persist to backend (async, don't wait)
      setTimeout(() => {
        const pos = viewMode === 'canvas'
          ? getNodePosition(updated.length - 1, updated)
          : { x: 0, y: 0 }
        saveModuleToBackend(newCell, pos).catch(() => {
          // Silently fail - backend might be offline
        })
      }, 0)
      return updated
    })

    if (viewMode === 'canvas') {
      setNodes((prev) => {
        const newCells = [...cells, newCell]
        const pos = getNodePosition(newCells.length - 1, newCells)
        const newNode: Node = {
          id: newCell.id,
          type: 'module',
          position: pos,
          data: {
            label: newCell.label,
            moduleType: type,
            status: 'idle',
            content: '',
          },
        }
        const updated = [...prev, newNode]
        const lastNode = prev.length > 0 ? prev[prev.length - 1] : null
        if (lastNode) {
          setEdges((prevEdges) => [
            ...prevEdges,
            {
              id: `e-${lastNode.id}-${newCell.id}`,
              source: lastNode.id,
              target: newCell.id,
              ...defaultEdgeOptions,
            },
          ])
        }
        return updated
      })
    }
  }

  const updateCell = useCallback((id: string, updates: Partial<CellData>) => {
    setCells((prev) => {
      const updated = prev.map((cell) => cell.id === id ? { ...cell, ...updates } : cell)
      // Regenerate edges if in canvas mode and loopBackTo changed
      if (viewMode === 'canvas' && updates.loopBackTo !== undefined) {
        setEdges(generateEdges(updated))
      }
      // Persist updated cell to backend
      const updatedCell = updated.find(c => c.id === id)
      if (updatedCell) {
        const pos = getCellPosition(id)
        saveModuleToBackend(updatedCell, pos)
          .then(success => {
            if (!success) {
              console.warn(`[LOOM] Failed to save cell ${id} to backend, but continuing...`)
            }
          })
          .catch(error => {
            console.error(`[LOOM] Error saving cell ${id} to backend:`, error)
          })
      }
      return updated
    })
  }, [viewMode, getCellPosition])

  const deleteCell = (id: string) => {
    const targetCell = cells.find(cell => cell.id === id)
    const targetLabel = targetCell?.label || 'cell'
    setDeleteCellDialog({ id, label: targetLabel })
  }

  const confirmDeleteCell = useCallback(() => {
    if (!deleteCellDialog) return
    const { id, label } = deleteCellDialog
    setDeleteCellDialog(null)

    setCells((prev) => prev.filter((cell) => cell.id !== id))
    showInfoToast(`Deleted ${label}.`, 'Circuit')
    deleteModuleFromBackend(id)
      .then(success => {
        if (success) {
          console.log(`[LOOM] ✓ Successfully deleted module ${id} from backend`)
        } else {
          console.warn(`[LOOM] ⚠ Failed to delete module ${id} from backend`)
        }
      })
      .catch(error => {
        console.error(`[LOOM] ✗ Error deleting module ${id} from backend:`, error)
      })
  }, [deleteCellDialog])

  const moveCell = (id: string, direction: 'up' | 'down') => {
    setCells((prev) => {
      const index = prev.findIndex((cell) => cell.id === id)
      if (index === -1) return prev
      if (direction === 'up' && index === 0) return prev
      if (direction === 'down' && index === prev.length - 1) return prev

      const newCells = [...prev]
      const swapIndex = direction === 'up' ? index - 1 : index + 1
        ;[newCells[index], newCells[swapIndex]] = [newCells[swapIndex], newCells[index]]
      return newCells
    })
  }

  // Gather input for a cell based on its inputMode
  const gatherInput = useCallback((cellIndex: number, cells: CellData[]): { input: string; originalQuestion: string } => {
    const cell = cells[cellIndex]
    const inputMode = cell.inputMode || 'previous'

    // First cell or 'none' mode: use own content
    if (cellIndex === 0 || inputMode === 'none') {
      return {
        input: cell.content || '',
        originalQuestion: cell.type === 'data_input' ? cell.content || '' : ''
      }
    }

    let originalQuestion = ''
    // Find original question by walking back to first INPUT cell
    for (let i = cellIndex - 1; i >= 0; i--) {
      if (cells[i].type === 'data_input') {
        originalQuestion = cells[i].content || cells[i].output || ''
        break
      }
    }

    // 'previous' mode: just the last cell's output
    if (inputMode === 'previous') {
      const prevCell = cells[cellIndex - 1]
      return {
        input: prevCell.output || prevCell.content || '',
        originalQuestion
      }
    }

    // 'all' mode: concatenate all previous cell outputs with labels
    const contextParts: string[] = []
    for (let i = 0; i < cellIndex; i++) {
      const prevCell = cells[i]
      const output = prevCell.output || prevCell.content
      if (output) {
        contextParts.push(`[${prevCell.label || `Cell ${i + 1}`}]\n${output}`)
      }
    }
    return {
      input: contextParts.join('\n\n---\n\n'),
      originalQuestion
    }
  }, [])

  // Execute a single cell with input from previous cell(s). Conditional can return { loopBackTo } to request a loop.
  const executeCell = useCallback(async (
    cell: CellData,
    input: string,
    originalQuestion?: string
  ): Promise<string | { loopBackTo: number }> => {
    const modelToUse = resolveModel(cell.modelSlot, cell.model)

    switch (cell.type) {
      case 'data_input':
        return cell.content || input

      case 'ai_processor':
        // Build prompt: if cell has content, use it as system instruction
        // Support {{input}} placeholder for explicit input insertion
        let prompt = cell.content || ''
        if (prompt.includes('{{input}}')) {
          prompt = prompt.replace(/\{\{input\}\}/g, input)
        } else if (prompt) {
          prompt = `${prompt}\n\n---\n\n${input}`
        } else {
          prompt = input
        }

        return new Promise((resolve, reject) => {
          let response = ''

          const sent = sendChat(
            prompt,
            modelToUse,
            (chunk) => {
              response += chunk.content
              updateCell(cell.id, { output: response })
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
        try {
          if (cell.content.includes('{{input}}')) {
            return cell.content.replace(/\{\{input\}\}/g, input)
          }
          return cell.content || input
        } catch (e) {
          throw new Error(`Script error: ${e}`)
        }

      case 'log_entry':
        sendToTerminal(input, 'Circuit Notebook', {
          question: originalQuestion || 'Circuit notebook output',
          model: modelToUse,
        })
        return input

      case 'image_gen':
        // Use IMAGE slot from modelSlots, or cell.model, or default
        const fullImageModel = cell.model || modelSlots.IMAGE || 'sdxl'
        // Auto-detect provider from model prefix (including ollama)
        const knownImageProviders = ['openai', 'gemini', 'google', 'ollama']
        const imagePrefix = fullImageModel.includes(':') ? fullImageModel.split(':')[0] : ''
        const imageProvider = knownImageProviders.includes(imagePrefix) ? imagePrefix : 'local'

        // Strip provider prefix for the API call if it's a known provider
        const imageModel = imageProvider !== 'local' && fullImageModel.includes(':')
          ? fullImageModel.substring(imagePrefix.length + 1)
          : fullImageModel

        updateCell(cell.id, {
          output: `Loading model "${imageModel}"...`,
          status: 'running'
        })

        try {
          // First ensure model is loaded
          updateCell(cell.id, { output: `Loading model "${imageModel}" & preparing...` })

          const response = await fetch(`${API_BASE_URL}/api/images/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: input || 'a beautiful image',
              model: imageModel,
              negative_prompt: cell.content || '',
              provider: imageProvider,
              width: 1024,
              height: 1024,
              steps: 30,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ detail: `HTTP ${response.status}: ${response.statusText}` }))
            const errorMsg = errorData.detail || errorData.error || errorData.message || 'Image generation failed'
            throw new Error(errorMsg)
          }

          const result = await response.json()

          if (result.status === 'success' && result.image) {
            updateCell(cell.id, {
              output: result.image,
              status: 'success'
            })
            return result.image
          } else if (result.status === 'loading') {
            throw new Error(result.message || 'Model is still loading, please wait...')
          } else {
            throw new Error(result.error || result.message || 'Image generation failed - no image returned')
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e)
          updateCell(cell.id, {
            error: errorMsg,
            status: 'error'
          })
          throw e
        }

      case 'music_gen':
        updateCell(cell.id, {
          output: `Generating music...`,
          status: 'running'
        })

        try {
          const response = await fetch(`${API_BASE_URL}/api/music/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: cell.musicStyle || input || 'Techno',
              lyrics: cell.musicLyrics || '',
              use_lyrics: cell.musicUseLyrics || false,
              duration: cell.musicDuration || 10,
              guidance_scale: cell.musicGuidance || 7.0,
              steps: cell.musicSteps || 20,
            }),
          })

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}))
            throw new Error(errorData.detail || 'Music generation failed')
          }

          const result = await response.json()
          if (result.status === 'success' && result.audio_url) {
            updateCell(cell.id, { output: result.audio_url, status: 'success' })
            return result.audio_url
          } else {
            throw new Error('No audio URL returned')
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e)
          updateCell(cell.id, {
            error: errorMsg,
            status: 'error'
          })
          throw e
        }

      case 'markdown':
        return input

      case 'data_loader':
        // DATA cells load files from the data folder
        const filePath = cell.content.trim()
        if (!filePath) {
          throw new Error('No file path specified. Click "Browse" to select a file.')
        }

        const fileReadMode = cell.readMode || 'raw'
        updateCell(cell.id, { output: `Loading ${filePath}...` })

        try {
          // Determine max chars based on read mode
          const maxChars = fileReadMode === 'preview' ? 5000 : 100000

          const response = await fetch(`${API_BASE_URL}/api/files/read`, {
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

          // For preview mode, just return first N lines
          if (fileReadMode === 'preview') {
            const lines = fileContent.split('\n').slice(0, 50)
            return `[Preview of ${filePath}]\n\n${lines.join('\n')}${lines.length >= 50 ? '\n...(truncated)' : ''}`
          }

          // For AI-based modes, process through the model
          if (['summarize', 'structure', 'stats', 'extract'].includes(fileReadMode)) {
            const aiModel = resolveModel(cell.modelSlot, cell.model)

            const prompts: Record<string, string> = {
              summarize: `Summarize this document concisely. Key points and main takeaways:\n\n${fileContent}`,
              structure: `Analyze the structure of this data. What are the fields/columns? Data types? Key patterns?\n\n${fileContent}`,
              stats: `Analyze this data and provide key statistics: counts, averages, min/max, distributions, notable patterns:\n\n${fileContent}`,
              extract: `Extract and list the key data points from this file in a structured format:\n\n${fileContent}`,
            }

            updateCell(cell.id, { output: `Processing with AI (${fileReadMode})...` })

            return new Promise((resolve, reject) => {
              let aiResponse = ''
              const sent = sendChat(
                prompts[fileReadMode],
                aiModel,
                (chunk) => {
                  aiResponse += chunk.content
                  updateCell(cell.id, { output: aiResponse })
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

          // Raw mode - just return the content
          return fileContent
        } catch (e) {
          throw new Error(`File load error: ${e instanceof Error ? e.message : e}`)
        }

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
            const aiModel = resolveModel(cell.modelSlot, cell.model)
            const checkPrompt = conditionValue || 'Does this text meet the condition? Answer only YES or NO.'
            const fullPrompt = `${checkPrompt}\n\nText: ${input}\n\nAnswer:`

            return new Promise((resolve, reject) => {
              let aiResponse = ''
              const sent = sendChat(
                fullPrompt,
                aiModel,
                (chunk) => {
                  aiResponse += chunk.content
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

        updateCell(cell.id, { output: `Fetching ${method} ${url}...` })

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
              JSON.parse(bodyTemplate)
              body = bodyTemplate
            } catch {
              body = bodyTemplate
            }
          }

          // Call backend proxy
          const response = await fetch(`${API_BASE_URL}/api/web/fetch`, {
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

        updateCell(cell.id, { output: `Indexing ${filePathToIndex}...` })

        try {
          const response = await fetch(`${API_BASE_URL}/api/search/index/file`, {
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

        updateCell(cell.id, { output: `Searching: ${searchQuery}...` })

        try {
          const response = await fetch(`${API_BASE_URL}/api/search/search`, {
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
        const { queryTerminalHistory } = await import('../../hooks/useTerminalOutput')

        updateCell(cell.id, { output: 'Querying terminal history...' })

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

      default:
        return input
    }
  }, [resolveModel, sendChat, sendToTerminal, updateCell])

  // Run a single cell (loop-back is ignored: { loopBackTo } is treated as onFail)
  const getValidationError = useCallback((cell: CellData, index: number) => {
    return validateCell(cell, index)
  }, [])

  const runCell = useCallback(async (id: string) => {
    // If already running, don't start another (unless we want to queue? simplify for now: block)
    if (isRunning) return

    const cellIndex = cells.findIndex((c) => c.id === id)
    if (cellIndex === -1) return

    const validationError = getValidationError(cells[cellIndex], cellIndex)
    if (validationError) {
      updateCell(id, {
        status: 'error',
        error: `Validation: ${validationError}`,
      })
      showErrorToast(validationError, 'Cannot Run Cell')
      return
    }

    setIsRunning(true)
    isRunningRef.current = true

    const cell = cells[cellIndex]
    const { input, originalQuestion } = gatherInput(cellIndex, cells)

    updateCell(id, { status: 'running', output: undefined, error: undefined })

    try {
      const result = await executeCell(cell, input, originalQuestion)
      const output = typeof result === 'object' && result !== null && 'loopBackTo' in result
        ? (cell.onFail ?? '')
        : (result as string)
      updateCell(id, { status: 'success', output })
    } catch (e) {
      updateCell(id, {
        status: 'error',
        error: e instanceof Error ? e.message : 'Unknown error'
      })
    } finally {
      setIsRunning(false)
      isRunningRef.current = false
    }
  }, [cells, isRunning, executeCell, updateCell, gatherInput, getValidationError])

  // Active cell state (lifted from LinearView)
  const [activeCellId, setActiveCellId] = useState<string | null>(null)
  const isRunningRef = useRef(false)

  // Stop execution
  const stopRunning = useCallback(() => {
    setIsRunning(false)
    isRunningRef.current = false
    stopGeneration()
  }, [stopGeneration])

  const logManualCircuitRun = useCallback(async (params: {
    runId: string
    status: 'running' | 'success' | 'failed'
    startedAt: number
    finishedAt?: number
    error?: string
  }) => {
    const name = normalizeCircuitName(circuitName)
    if (!name) return
    try {
      await fetch(`${API_BASE_URL}/api/scheduler/runs/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          run_id: params.runId,
          circuit_name: name,
          status: params.status,
          trigger: 'manual-ui',
          started_at: params.startedAt,
          finished_at: params.finishedAt,
          error: params.error,
        }),
      })
      window.dispatchEvent(new CustomEvent(SCHEDULER_RUNS_UPDATED_EVENT))
    } catch {
      // Non-blocking: local execution should continue even if history logging fails.
    }
  }, [circuitName])

  // Run all cells sequentially (with optional loop-back from conditionals)
  const runAllCells = useCallback(async () => {
    if (isRunning) return
    setIsRunning(true)
    isRunningRef.current = true
    const runId = `manual-ui-${Date.now()}-${Math.floor(Math.random() * 100000)}`
    const startedAt = Date.now()
    let runStatus: 'success' | 'failed' = 'success'
    let runError: string | undefined
    void logManualCircuitRun({ runId, status: 'running', startedAt })

    const workingCells = [...cells]
    const loopCounts = new Map<string, number>()

    try {
      for (let i = 0; i < workingCells.length; i++) {
        // Check for stop signal
        if (!isRunningRef.current) {
          runStatus = 'failed'
          runError = 'Stopped by user'
          break
        }

        const cell = workingCells[i]
        const validationError = getValidationError(cell, i)
        if (validationError) {
          updateCell(cell.id, { status: 'error', error: `Validation: ${validationError}` })
          showErrorToast(`Cell ${i + 1} (${cell.label}): ${validationError}`, 'Cannot Run Circuit')
          runStatus = 'failed'
          runError = validationError
          break
        }
        updateCell(cell.id, { status: 'running', output: undefined, error: undefined })

        const { input, originalQuestion } = gatherInput(i, workingCells)

        try {
          const result = await executeCell(cell, input, originalQuestion)
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

          updateCell(cell.id, { status: 'success', output })
          workingCells[i] = { ...workingCells[i], output }
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Unknown error'
          updateCell(cell.id, { status: 'error', error: message })
          runStatus = 'failed'
          runError = message
          break
        }
      }
    } finally {
      setIsRunning(false)
      isRunningRef.current = false
      void logManualCircuitRun({
        runId,
        status: runStatus,
        startedAt,
        finishedAt: Date.now(),
        error: runError,
      })
    }
  }, [cells, isRunning, executeCell, updateCell, gatherInput, getValidationError, logManualCircuitRun])

  // Run just the active cell
  const runActiveCell = useCallback(() => {
    if (activeCellId) {
      runCell(activeCellId)
    }
  }, [activeCellId, runCell])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const root = rootRef.current
      if (!root || root.offsetParent === null) return

      const target = event.target as HTMLElement | null
      const tag = target?.tagName || ''
      if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        return
      }

      const ctrlOrMeta = event.ctrlKey || event.metaKey
      if (ctrlOrMeta && event.key === 'Enter') {
        event.preventDefault()
        if (event.shiftKey) runAllCells()
        else runActiveCell()
        return
      }

      if (ctrlOrMeta && event.key.toLowerCase() === 's') {
        event.preventDefault()
        handleSaveCircuit()
        return
      }

      if (ctrlOrMeta && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        newCircuit()
        return
      }

      if (event.key === 'Escape' && isRunningRef.current) {
        event.preventDefault()
        stopRunning()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [runActiveCell, runAllCells, handleSaveCircuit, newCircuit, stopRunning])

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'canvas') {
      syncToCanvas()
    }
    setViewMode(mode)
  }

  // Clear ALL cells (delete everything)
  const clearAllCells = useCallback(() => {
    if (cells.length === 0) {
      showInfoToast('Board is already empty.', 'Circuit')
      return
    }
    setClearBoardDialogOpen(true)
  }, [cells.length, setClearBoardDialogOpen])

  const confirmClearAllCells = useCallback(() => {
    setClearBoardDialogOpen(false)
    setCells([])
    setCircuitName('')
    setShowSaveSuccess(false)
    showInfoToast('Board cleared.', 'Circuit')
    if (viewMode === 'canvas') {
      setNodes([])
      setEdges([])
    }
  }, [viewMode, setNodes, setEdges])

  return (
    <div ref={rootRef} className="h-full w-full flex">
      {/* Templates Sidebar */}
      <TemplatesSidebar
        onSelectTemplate={loadTemplate}
        onNewCircuit={newCircuit}
        currentCircuitName={circuitName}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {/* Model Slots Config Panel */}
        {showModelConfig && (
          <div className="bg-void border-b border-terminal-border px-4 py-3">
            <div className="flex items-center gap-6 flex-wrap">
              <span className="text-[10px] text-terminal-muted tracking-widest">MODEL SLOTS</span>
              {(['A', 'B', 'C'] as ModelSlot[]).map((slot) => (
                <div key={slot} className="flex items-center gap-2">
                  <span
                    className="text-xs font-bold w-5 h-5 flex items-center justify-center border"
                    style={{
                      color: SLOT_LABELS[slot].color,
                      borderColor: SLOT_LABELS[slot].color,
                    }}
                  >
                    {slot}
                  </span>
                  <span className="text-[10px] text-terminal-muted">{SLOT_LABELS[slot].desc}</span>
                  <select
                    value={modelSlots[slot]}
                    onChange={(e) => setModelSlots(prev => ({ ...prev, [slot]: e.target.value }))}
                    className="bg-slate border border-terminal-border text-phosphor text-xs px-2 py-1 focus:outline-none focus:border-phosphor min-w-[140px]"
                  >
                    <option value="">Default</option>
                    <optgroup label="── LOCAL ──">
                      {models.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </optgroup>
                    {cloudModels.filter(cm => cm.provider_type === 'cloud').length > 0 && (
                      <optgroup label="── CLOUD ──">
                        {cloudModels.filter(cm => cm.provider_type === 'cloud').map((cm) => (
                          <option key={cm.id} value={cm.id}>
                            {cm.display_name} ({cm.provider})
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              ))}
              {/* Image Model Slot */}
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold w-5 h-5 flex items-center justify-center border"
                  style={{
                    color: '#ff69b4',
                    borderColor: '#ff69b4',
                  }}
                >
                  🖼️
                </span>
                <span className="text-[10px] text-terminal-muted">Image</span>
                <select
                  value={modelSlots.IMAGE || ''}
                  onChange={(e) => setModelSlots(prev => ({ ...prev, IMAGE: e.target.value }))}
                  className="bg-slate border border-terminal-border text-pink-400 text-xs px-2 py-1 focus:outline-none focus:border-pink-400 min-w-[140px]"
                >
                  <option value="">Default</option>
                  <optgroup label="── LOCAL ──">
                    {imageModels.map((m, idx) => (
                      <option key={`${m.name}-${idx}`} value={m.name}>
                        {m.name} {m.vram ? `(${m.vram})` : ''}
                        {currentImageModel === m.name ? ' ✓' : ''}
                      </option>
                    ))}
                  </optgroup>
                  {cloudModels.filter(cm => cm.provider === 'openai').length > 0 && (
                    <optgroup label="── DALL·E (OpenAI) ──">
                      <option value="openai:dall-e-3">DALL·E 3 (1024×1024)</option>
                      <option value="openai:dall-e-2">DALL·E 2 (1024×1024)</option>
                    </optgroup>
                  )}
                  {cloudModels.filter(cm => cm.provider === 'gemini').length > 0 && (
                    <optgroup label="── Imagen (Gemini) ──">
                      <option value="gemini:imagen-3.0-generate-002">Imagen 3 (1024×1024)</option>
                    </optgroup>
                  )}
                </select>
              </div>
              {/* Provider setup button */}
              <button
                onClick={() => setShowProviderSetup(true)}
                className="text-[10px] text-terminal-muted border border-terminal-border px-3 py-1 hover:text-phosphor hover:border-phosphor transition-colors"
              >
                ☁ Providers
              </button>
            </div>
            <div className="mt-3 pt-3 border-t border-terminal-border/60 flex flex-wrap items-center gap-2">
              <span className="text-[10px] text-terminal-muted tracking-wider">Quick Actions</span>
              <button
                onClick={() => applyModelSlotPreset('balanced')}
                className="text-[10px] px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                title="A: creative, B: critical, C: fast"
              >
                Balanced
              </button>
              <button
                onClick={() => applyModelSlotPreset('creative')}
                className="text-[10px] px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                title="A and B favor high-quality generation"
              >
                Creative
              </button>
              <button
                onClick={() => applyModelSlotPreset('speed')}
                className="text-[10px] px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                title="A and C favor faster models"
              >
                Speed
              </button>
              <button
                onClick={() => swapModelSlots('A', 'B')}
                className="text-[10px] px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                title="Swap A and B"
              >
                Swap A/B
              </button>
              <button
                onClick={() => swapModelSlots('B', 'C')}
                className="text-[10px] px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                title="Swap B and C"
              >
                Swap B/C
              </button>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="h-12 bg-slate border-b border-terminal-border px-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex border border-terminal-border">
              <button
                onClick={() => handleViewModeChange('linear')}
                className={`px-3 py-1 text-xs font-bold tracking-wider transition-none ${viewMode === 'linear'
                  ? 'bg-phosphor text-void'
                  : 'text-terminal-muted hover:text-phosphor'
                  }`}
              >
                LINEAR
              </button>
              <button
                onClick={() => handleViewModeChange('canvas')}
                className={`px-3 py-1 text-xs font-bold tracking-wider transition-none ${viewMode === 'canvas'
                  ? 'bg-phosphor text-void'
                  : 'text-terminal-muted hover:text-phosphor'
                  }`}
              >
                CANVAS
              </button>
            </div>

            <div className="w-px h-6 bg-terminal-border mx-2" />

            {/* Model Slots Toggle */}
            <button
              onClick={() => setShowModelConfig(!showModelConfig)}
              className={`text-xs px-2 py-1 border transition-none ${showModelConfig
                ? 'border-phosphor text-phosphor'
                : 'border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor'
                }`}
              title="Configure model slots"
            >
              <span className="font-bold" style={{ color: SLOT_LABELS.A.color }}>A</span>
              <span className="font-bold" style={{ color: SLOT_LABELS.B.color }}>B</span>
              <span className="font-bold" style={{ color: SLOT_LABELS.C.color }}>C</span>
            </button>

          </div>

          {/* Right side controls removed - moved to floating toolbar */}
          <div />
        </div>

        {/* Content Area */}
        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          {viewMode === 'linear' ? (
            <LinearView
              cells={cells}
              models={models}
              modelSlots={modelSlots}
              circuitName={circuitName}
              onCircuitNameChange={setCircuitName}
              onSaveCircuit={handleSaveCircuit}
              isSaved={showSaveSuccess}
              onUpdateCell={updateCell}
              onDeleteCell={deleteCell}
              onMoveCell={moveCell}
              onRunCell={runCell}
              getValidationError={getValidationError}
              activeCellId={activeCellId}
              onActiveCellChange={setActiveCellId}
            />
          ) : (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={defaultEdgeOptions}
              connectionMode={ConnectionMode.Loose}
              connectionLineStyle={{ stroke: '#33ff00', strokeWidth: 2 }}
              onEdgeUpdate={(oldEdge, newConnection) => {
                // Handle loop-back edge updates
                if (oldEdge.type === 'loopback' && oldEdge.data) {
                  const targetIndex = cells.findIndex(c => c.id === newConnection.target)
                  if (targetIndex >= 0) {
                    const newLoopBackTo = targetIndex + 1 // Convert to 1-based
                    updateCell(oldEdge.data.cellId, { loopBackTo: newLoopBackTo })
                    // Edges will regenerate via updateCell's effect
                  }
                } else {
                  // Regular edge update - only update if source and target are valid
                  if (newConnection.source && newConnection.target) {
                    setEdges((eds) =>
                      eds.map((edge) =>
                        edge.id === oldEdge.id
                          ? {
                            ...edge,
                            source: newConnection.source!,
                            target: newConnection.target!,
                            sourceHandle: newConnection.sourceHandle ?? edge.sourceHandle,
                            targetHandle: newConnection.targetHandle ?? edge.targetHandle,
                          }
                          : edge
                      )
                    )
                  }
                }
              }}
              onEdgeUpdateEnd={(oldEdge, _newConnection) => {
                // After dragging ends, regenerate edges to ensure consistency
                if (oldEdge.type === 'loopback') {
                  setEdges(generateEdges(cells))
                }
              }}
              fitView
              className="bg-void"
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="#1a8000"
              />
              <Controls
                className="!bg-slate !border-terminal-border !shadow-none"
                showInteractive={false}
              />
            </ReactFlow>
          )}
        </div>
      </div>
      {/* Provider setup modal */}
      {/* Floating Bottom Toolbar */}
      <FloatingToolbar
        onAddCell={addCell}
        onRunAll={runAllCells}
        onRunActive={runActiveCell}
        onStop={stopRunning}
        onClearBoard={clearAllCells}
        isRunning={isRunning}
        activeCellId={activeCellId}
      />

      <ProviderSetup isOpen={showProviderSetup} onClose={() => setShowProviderSetup(false)} />

      <DialogModal
        isOpen={!!infoDialog}
        title={infoDialog?.title || 'Notice'}
        message={infoDialog?.message || ''}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setInfoDialog(null)}
        onCancel={() => setInfoDialog(null)}
      />

      <DialogModal
        isOpen={!!deleteCellDialog}
        title="Delete Cell"
        message={`Delete ${deleteCellDialog?.label || 'this cell'}? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDeleteCell}
        onCancel={() => setDeleteCellDialog(null)}
      />

      <DialogModal
        isOpen={clearBoardDialogOpen}
        title="Clear Board"
        message={`Delete all ${cells.length} cells and reset this board?`}
        confirmLabel="Clear Board"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmClearAllCells}
        onCancel={() => setClearBoardDialogOpen(false)}
      />
    </div>
  )
}
