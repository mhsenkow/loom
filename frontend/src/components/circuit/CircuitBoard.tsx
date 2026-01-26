import { useCallback, useState, useEffect } from 'react'
import ReactFlow, {
  Node,
  Edge,
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
import { TemplatesSidebar, NotebookTemplate } from './TemplatesSidebar'
import { LoopBackEdge } from './LoopBackEdge'
import type { ModuleType, ModuleStatus } from '../../types/module'
import { useSocket } from '../../hooks/useSocket'
import { useSystemStatus } from '../../hooks/useSystemStatus'
import { useSendToTerminal } from '../../hooks/useTerminalOutput'
import { saveCircuit, saveModelSlots, loadModelSlots, SavedCircuit } from '../../hooks/useCircuitRunner'
import { loadModulesFromBackend, saveModuleToBackend, deleteModuleFromBackend } from '../../hooks/useModules'

type ViewMode = 'linear' | 'canvas'

// Model slots - A, B, C for different cognitive tasks
export type ModelSlot = 'A' | 'B' | 'C'

export interface ModelSlotConfig {
  A: string  // Creative/Generative
  B: string  // Critical/Analytical  
  C: string  // Fast/Simple
}

const SLOT_LABELS: Record<ModelSlot, { label: string; desc: string; color: string }> = {
  A: { label: 'A', desc: 'Creative', color: '#33ff00' },
  B: { label: 'B', desc: 'Critical', color: '#00bfff' },
  C: { label: 'C', desc: 'Fast', color: '#ff9500' },
}

// Register custom node types
const nodeTypes = {
  module: ModuleNode,
}

// Register custom edge types
const edgeTypes = {
  loopback: LoopBackEdge,
}

// Custom edge options for orthogonal routing
const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: '#33ff00', strokeWidth: 2 },
}

// How a cell receives input from previous cells
export type InputMode = 'previous' | 'all' | 'none'

export interface CellData {
  id: string
  type: ModuleType
  label: string
  content: string
  status: ModuleStatus
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
}

// Initial demo cells
const initialCells: CellData[] = [
  {
    id: 'cell-1',
    type: 'data_input',
    label: 'INPUT',
    content: 'What is the capital of France?',
    status: 'idle',
  },
  {
    id: 'cell-2',
    type: 'ai_processor',
    label: 'AI',
    content: '',
    status: 'idle',
    modelSlot: 'A',
  },
  {
    id: 'cell-3',
    type: 'log_entry',
    label: 'OUTPUT',
    content: '',
    status: 'idle',
  },
]

// Canvas layout: zigzag down the canvas with more spacing; conditionals add a branch offset
const LAYOUT = { BASE_X: 180, BASE_Y: 60, STEP_X: 420, STEP_Y: 280, BRANCH_OFFSET: 100 }

function getNodePosition(index: number, cells: CellData[]): { x: number; y: number } {
  const prevIsConditional = index > 0 && cells[index - 1].type === 'conditional'
  const col = index % 2
  const x = LAYOUT.BASE_X + col * LAYOUT.STEP_X + (prevIsConditional ? LAYOUT.BRANCH_OFFSET : 0)
  const y = LAYOUT.BASE_Y + index * LAYOUT.STEP_Y
  return { x, y }
}

// Convert cells to React Flow nodes
function cellsToNodes(cells: CellData[]): Node[] {
  return cells.map((cell, index) => ({
    id: cell.id,
    type: 'module',
    position: getNodePosition(index, cells),
    data: {
      label: cell.label,
      moduleType: cell.type,
      status: cell.status,
      content: cell.content,
    },
  }))
}

// Generate edges between sequential nodes + loop-back edges
function generateEdges(cells: CellData[]): Edge[] {
  const edges: Edge[] = []
  
  // Forward edges (sequential flow)
  for (let i = 0; i < cells.length - 1; i++) {
    edges.push({
      id: `e-${cells[i].id}-${cells[i + 1].id}`,
      source: cells[i].id,
      target: cells[i + 1].id,
      ...defaultEdgeOptions,
    })
  }
  
  // Loop-back edges (from conditional cells with loopBackTo)
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (cell.type === 'conditional' && cell.loopBackTo && cell.loopBackTo > 0 && cell.loopBackTo <= i + 1) {
      // loopBackTo is 1-based, convert to 0-based index
      const targetIndex = cell.loopBackTo - 1
      const targetCell = cells[targetIndex]
      if (targetCell) {
        edges.push({
          id: `loopback-${cell.id}-${targetCell.id}`,
          source: cell.id,
          target: targetCell.id,
          type: 'loopback',
          animated: true,
          updatable: true, // Allow dragging to change target
          style: { stroke: '#a855f7', strokeWidth: 2, strokeDasharray: '8,4' },
          // Store metadata for updating
          data: { cellId: cell.id, loopBackTo: cell.loopBackTo },
        })
      }
    }
  }
  
  return edges
}


export function CircuitBoard() {
  const [viewMode, setViewMode] = useState<ViewMode>('linear')
  const [cells, setCells] = useState<CellData[]>(initialCells)
  const [isRunning, setIsRunning] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showModelConfig, setShowModelConfig] = useState(false)
  const [circuitName, setCircuitName] = useState<string>('')
  const [showSaveSuccess, setShowSaveSuccess] = useState(false)
  
  const { sendChat } = useSocket()
  const { status, models } = useSystemStatus()
  const sendToTerminal = useSendToTerminal()
  
  // Model slot configuration - maps slots to actual model names
  const [modelSlots, setModelSlots] = useState<ModelSlotConfig>(() => loadModelSlots())
  
  // Persist model slots when they change
  useEffect(() => {
    saveModelSlots(modelSlots)
  }, [modelSlots])

  // React Flow state (must be declared before useEffects that use setNodes/setEdges)
  const [nodes, setNodes, onNodesChange] = useNodesState(cellsToNodes(initialCells))
  const [edges, setEdges, onEdgesChange] = useEdgesState(generateEdges(initialCells))

  // Load modules from backend on mount
  useEffect(() => {
    let mounted = true
    loadModulesFromBackend().then((loadedModules) => {
      if (mounted && loadedModules.length > 0) {
        // Only load if we have modules from backend and current cells are just initial cells
        const isInitialState = cells.length === initialCells.length && 
          cells.every((cell, idx) => cell.id === initialCells[idx]?.id)
        if (isInitialState) {
          // Extract positions and clean up temporary _position field
          const cleanedModules = loadedModules.map((cell: any) => {
            const { _position, ...cleanCell } = cell
            return cleanCell
          })
          setCells(cleanedModules)
          if (viewMode === 'canvas') {
            // Use positions from backend modules
            const nodesWithPositions = loadedModules.map((cell: any, index: number) => {
              const pos = cell._position || getNodePosition(index, cleanedModules)
              return {
                id: cell.id,
                type: 'module' as const,
                position: pos,
                data: {
                  label: cell.label,
                  moduleType: cell.type,
                  status: cell.status,
                  content: cell.content,
                },
              }
            })
            setNodes(nodesWithPositions)
            setEdges(generateEdges(cleanedModules))
          }
        }
      }
    })
    return () => { mounted = false }
  }, []) // Only run on mount

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
    const name = circuitName.trim().toLowerCase().replace(/\s+/g, '-')
    if (!name) {
      alert('Please enter a circuit name')
      return
    }
    
    const circuit: SavedCircuit = {
      name,
      cells: cells.map(({ status, output, error, ...rest }) => rest),
      modelSlots,
      savedAt: Date.now(),
    }
    
    if (saveCircuit(circuit)) {
      setShowSaveSuccess(true)
      setTimeout(() => setShowSaveSuccess(false), 2000)
    }
  }, [circuitName, cells, modelSlots])
  
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
    setShowSaveSuccess(false)
    // Sync to canvas if in canvas mode
    if (viewMode === 'canvas') {
      setNodes(cellsToNodes(newCells))
      setEdges(generateEdges(newCells))
    }
  }, [viewMode, setNodes, setEdges])

  // Sync cells to nodes when switching to canvas
  const syncToCanvas = useCallback(() => {
    setNodes(cellsToNodes(cells))
    setEdges(generateEdges(cells))
  }, [cells, setNodes, setEdges])
  
  // Create a new empty circuit
  const newCircuit = useCallback(() => {
    const newCells: CellData[] = [
      {
        id: `cell-${Date.now()}-0`,
        type: 'data_input',
        label: 'INPUT',
        content: '',
        status: 'idle',
      },
      {
        id: `cell-${Date.now()}-1`,
        type: 'ai_processor',
        label: 'AI',
        content: '',
        status: 'idle',
        modelSlot: 'A',
      },
      {
        id: `cell-${Date.now()}-2`,
        type: 'log_entry',
        label: 'OUTPUT',
        content: '',
        status: 'idle',
      },
    ]
    setCells(newCells)
    setCircuitName('')
    setShowSaveSuccess(false)
    // Sync to canvas if in canvas mode
    if (viewMode === 'canvas') {
      setNodes(cellsToNodes(newCells))
      setEdges(generateEdges(newCells))
    }
  }, [viewMode, setNodes, setEdges])

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
    }

    const newCell: CellData = {
      id: `cell-${Date.now()}`,
      type,
      label: labels[type],
      content: '',
      status: 'idle',
      modelSlot: type === 'ai_processor' ? 'A' : undefined,
      conditionType: type === 'conditional' ? 'contains' : undefined,
      conditionValue: type === 'conditional' ? '' : undefined,
      fetchMethod: type === 'web_fetch' ? 'GET' : undefined,
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
    setCells((prev) => prev.filter((cell) => cell.id !== id))
    // Delete from backend
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
  }

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
        const imageModel = cell.model || 'sdxl'
        updateCell(cell.id, { output: 'Loading model & generating image...' })
        
        try {
          const response = await fetch('http://localhost:8000/api/images/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: input,
              model: imageModel,
              negative_prompt: cell.content || '',
              provider: 'local',
              width: 1024,
              height: 1024,
              steps: 30,
            }),
          })
          
          if (!response.ok) {
            const error = await response.json()
            throw new Error(error.detail || 'Image generation failed')
          }
          
          const result = await response.json()
          
          if (result.status === 'loading') {
            throw new Error(result.message)
          }
          
          return result.image
        } catch (e) {
          throw new Error(`Image generation error: ${e instanceof Error ? e.message : e}`)
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
          
          const response = await fetch('http://localhost:8000/api/files/read', {
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
        // Fetch from URL
        let url = cell.content.trim()
        if (url.includes('{{input}}')) {
          url = url.replace(/\{\{input\}\}/g, input)
        }
        if (!url) {
          throw new Error('No URL specified')
        }
        
        const method = cell.fetchMethod || 'GET'
        const timeout = (cell.fetchTimeout || 30) * 1000
        const maxSize = cell.fetchMaxSize ?? 8388608
        
        updateCell(cell.id, { output: `Fetching ${method} ${url}...` })
        
        try {
          // Parse headers
          let headers: Record<string, string> = {}
          if (cell.fetchHeaders) {
            try {
              headers = JSON.parse(cell.fetchHeaders)
            } catch {
              // Try key:value format
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
            
            // Try to parse as JSON, otherwise use as-is
            try {
              JSON.parse(bodyTemplate)
              body = bodyTemplate
            } catch {
              body = bodyTemplate
            }
          }
          
          // Create abort controller for timeout
          const controller = new AbortController()
          const timeoutId = setTimeout(() => controller.abort(), timeout)
          
          const response = await fetch(url, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: body,
            signal: controller.signal,
          })
          
          clearTimeout(timeoutId)
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
          }
          
          // Check content length
          const contentLength = response.headers.get('content-length')
          if (contentLength && parseInt(contentLength) > maxSize) {
            throw new Error(`Response too large: ${contentLength} bytes (max: ${maxSize})`)
          }
          
          const text = await response.text()
          if (text.length > maxSize) {
            throw new Error(`Response too large: ${text.length} bytes (max: ${maxSize})`)
          }
          
          return text
        } catch (e) {
          if (e instanceof Error && e.name === 'AbortError') {
            throw new Error(`Request timeout after ${timeout / 1000}s`)
          }
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
          const response = await fetch('http://localhost:8000/api/search/index/file', {
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
          const response = await fetch('http://localhost:8000/api/search/search', {
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
          const results = result.results || []
          
          if (results.length === 0) {
            return `🔍 No results found for: '${searchQuery}'\n\nMake sure you have indexed some documents first using the INDEX cell.`
          }
          
          // Format results nicely
          const outputLines = [`🔍 Found ${results.length} results for: '${searchQuery}'\n`]
          
          for (let i = 0; i < results.length; i++) {
            const r = results[i]
            const similarity = r.similarity || 0
            const contentPreview = (r.content || '').substring(0, 200)
            const metadata = r.metadata || {}
            const source = metadata.file_path || metadata.source || 'unknown'
            
            outputLines.push(`\n[${i + 1}] Similarity: ${(similarity * 100).toFixed(1)}%`)
            outputLines.push(`📄 Source: ${source}`)
            outputLines.push(`💬 Preview: ${contentPreview}...`)
          }
          
          // Also include full content for RAG context
          const fullContext = results.map((r: any, i: number) => 
            `[${i + 1}] ${r.content || ''}`
          ).join('\n\n---\n\n')
          
          return outputLines.join('\n') + '\n\n---\n\n' + fullContext
        } catch (e) {
          throw new Error(`Vector search failed: ${e instanceof Error ? e.message : e}`)
        }
      
      case 'terminal_history':
        // Query terminal conversation history
        const { queryTerminalHistory } = await import('../../hooks/useTerminalOutput')
        
        updateCell(cell.id, { output: 'Querying terminal history...' })
        
        try {
          let query: any = {}
          const content = (input || cell.content || '').trim()
          
          if (content) {
            // Try to parse as JSON query
            try {
              query = JSON.parse(content)
            } catch {
              // If not JSON, treat as simple text search
              query = { search: content }
            }
          }
          
          // Parse query parameters from cell properties if available
          const cellQuery: any = {
            search: query.search || (cell as any).terminalHistorySearch,
            types: query.types || (cell as any).terminalHistoryTypes,
            limit: query.limit || (cell as any).terminalHistoryLimit || 20,
            since: query.since || (cell as any).terminalHistorySince,
            before: query.before || (cell as any).terminalHistoryBefore,
            sessionName: query.sessionName || (cell as any).terminalHistorySession,
          }
          
          // Clean up undefined values
          Object.keys(cellQuery).forEach(key => {
            if (cellQuery[key] === undefined) delete cellQuery[key]
          })
          
          const entries = queryTerminalHistory(cellQuery)
          
          if (entries.length === 0) {
            return `📜 No terminal history entries found matching query.\n\nQuery: ${JSON.stringify(cellQuery, null, 2)}`
          }
          
          // Format entries nicely
          const outputLines = [`📜 Found ${entries.length} terminal history entries:\n`]
          
          for (let i = 0; i < entries.length; i++) {
            const entry = entries[i]
            const time = new Date(entry.timestamp).toLocaleString()
            const typeIcon = {
              user: '👤',
              ai: '🤖',
              system: '⚙️',
              error: '❌',
            }[entry.type] || '○'
            
            const contentPreview = entry.content.length > 200 
              ? entry.content.substring(0, 200) + '...'
              : entry.content
            
            outputLines.push(`\n[${i + 1}] ${typeIcon} [${entry.type.toUpperCase()}] ${time}`)
            outputLines.push(`${contentPreview}`)
          }
          
          // Also include full content for processing
          const fullContext = entries.map((e, i) => 
            `[${i + 1}] [${e.type}] ${new Date(e.timestamp).toISOString()}\n${e.content}`
          ).join('\n\n---\n\n')
          
          return outputLines.join('\n') + '\n\n---\n\nFull Context:\n\n' + fullContext
        } catch (e) {
          throw new Error(`Terminal history query failed: ${e instanceof Error ? e.message : e}`)
        }
      
      default:
        return input
    }
  }, [resolveModel, sendChat, sendToTerminal, updateCell])

  // Run a single cell (loop-back is ignored: { loopBackTo } is treated as onFail)
  const runCell = useCallback(async (id: string) => {
    const cellIndex = cells.findIndex((c) => c.id === id)
    if (cellIndex === -1) return
    
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
    }
  }, [cells, executeCell, updateCell, gatherInput])

  // Run all cells sequentially (with optional loop-back from conditionals)
  const runAllCells = useCallback(async () => {
    setIsRunning(true)
    const workingCells = [...cells]
    const loopCounts = new Map<string, number>()

    for (let i = 0; i < workingCells.length; i++) {
      const cell = workingCells[i]
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
        updateCell(cell.id, { status: 'error', error: e instanceof Error ? e.message : 'Unknown error' })
        break
      }
    }

    setIsRunning(false)
  }, [cells, executeCell, updateCell, gatherInput])

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'canvas') {
      syncToCanvas()
    }
    setViewMode(mode)
  }

  const clearOutputs = () => {
    setCells((prev) =>
      prev.map((cell) => ({ ...cell, output: undefined, error: undefined, status: 'idle' }))
    )
  }

  return (
    <div className="h-full w-full flex">
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
            <div className="flex items-center gap-6">
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
                    {models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              ))}
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
                className={`px-3 py-1 text-xs font-bold tracking-wider transition-none ${
                  viewMode === 'linear'
                    ? 'bg-phosphor text-void'
                    : 'text-terminal-muted hover:text-phosphor'
                }`}
              >
                LINEAR
              </button>
              <button
                onClick={() => handleViewModeChange('canvas')}
                className={`px-3 py-1 text-xs font-bold tracking-wider transition-none ${
                  viewMode === 'canvas'
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
              className={`text-xs px-2 py-1 border transition-none ${
                showModelConfig 
                  ? 'border-phosphor text-phosphor' 
                  : 'border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor'
              }`}
              title="Configure model slots"
            >
              <span className="font-bold" style={{ color: SLOT_LABELS.A.color }}>A</span>
              <span className="font-bold" style={{ color: SLOT_LABELS.B.color }}>B</span>
              <span className="font-bold" style={{ color: SLOT_LABELS.C.color }}>C</span>
            </button>

            <div className="w-px h-6 bg-terminal-border mx-2" />

            {/* Add Cell Buttons */}
            <button onClick={() => addCell('data_input')} className="btn-terminal text-xs">
              + INPUT
            </button>
            <button onClick={() => addCell('data_loader')} className="btn-terminal text-xs" style={{ borderColor: '#00bfff', color: '#00bfff' }}>
              + DATA
            </button>
            <button onClick={() => addCell('ai_processor')} className="btn-terminal text-xs">
              + AI
            </button>
            <button onClick={() => addCell('image_gen')} className="btn-terminal text-xs" style={{ borderColor: '#ff69b4', color: '#ff69b4' }}>
              + IMAGE
            </button>
            <button onClick={() => addCell('script_execution')} className="btn-terminal text-xs">
              + SCRIPT
            </button>
            <button onClick={() => addCell('conditional')} className="btn-terminal text-xs" style={{ borderColor: '#a855f7', color: '#a855f7' }}>
              + GATE
            </button>
            <button onClick={() => addCell('web_fetch')} className="btn-terminal text-xs" style={{ borderColor: '#60a5fa', color: '#60a5fa' }}>
              + FETCH
            </button>
            <button onClick={() => addCell('vector_index')} className="btn-terminal text-xs" style={{ borderColor: '#4ade80', color: '#4ade80' }}>
              + INDEX
            </button>
            <button onClick={() => addCell('vector_search')} className="btn-terminal text-xs" style={{ borderColor: '#facc15', color: '#facc15' }}>
              + SEARCH
            </button>
            <button onClick={() => addCell('terminal_history')} className="btn-terminal text-xs" style={{ borderColor: '#fb923c', color: '#fb923c' }}>
              + HISTORY
            </button>
            <button onClick={() => addCell('markdown')} className="btn-terminal text-xs" style={{ borderColor: '#888', color: '#888' }}>
              + NOTE
            </button>
            <button onClick={() => addCell('log_entry')} className="btn-terminal text-xs">
              + OUTPUT
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={clearOutputs} 
              className="text-xs text-terminal-muted hover:text-phosphor px-2 py-1 border border-terminal-border"
            >
              CLEAR
            </button>
            <button 
              onClick={runAllCells} 
              disabled={isRunning}
              className="btn-terminal text-sm px-6 disabled:opacity-50"
            >
              {isRunning ? '● RUNNING...' : '▶ RUN ALL'}
            </button>
          </div>
        </div>

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
    </div>
  )
}
