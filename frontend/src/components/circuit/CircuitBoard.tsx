import { useCallback, useState } from 'react'
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
import type { ModuleType, ModuleStatus } from '../../types/module'
import { useSocket } from '../../hooks/useSocket'
import { useSystemStatus } from '../../hooks/useSystemStatus'
import { useSendToTerminal } from '../../hooks/useTerminalOutput'

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

// Convert cells to React Flow nodes
function cellsToNodes(cells: CellData[]): Node[] {
  return cells.map((cell, index) => ({
    id: cell.id,
    type: 'module',
    position: { x: 100 + index * 300, y: 100 },
    data: {
      label: cell.label,
      moduleType: cell.type,
      status: cell.status,
      content: cell.content,
    },
  }))
}

// Generate edges between sequential nodes
function generateEdges(cells: CellData[]): Edge[] {
  const edges: Edge[] = []
  for (let i = 0; i < cells.length - 1; i++) {
    edges.push({
      id: `e-${cells[i].id}-${cells[i + 1].id}`,
      source: cells[i].id,
      target: cells[i + 1].id,
      ...defaultEdgeOptions,
    })
  }
  return edges
}


export function CircuitBoard() {
  const [viewMode, setViewMode] = useState<ViewMode>('linear')
  const [cells, setCells] = useState<CellData[]>(initialCells)
  const [isRunning, setIsRunning] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [showModelConfig, setShowModelConfig] = useState(false)
  
  const { sendChat } = useSocket()
  const { status, models } = useSystemStatus()
  const sendToTerminal = useSendToTerminal()
  
  // Model slot configuration - maps slots to actual model names
  const [modelSlots, setModelSlots] = useState<ModelSlotConfig>({
    A: '', // Will default to first available
    B: '',
    C: '',
  })
  
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
  
  // React Flow state (synced from cells in canvas mode)
  const [nodes, setNodes, onNodesChange] = useNodesState(cellsToNodes(initialCells))
  const [edges, setEdges, onEdgesChange] = useEdgesState(generateEdges(initialCells))

  // Load a template into the notebook
  const loadTemplate = useCallback((template: NotebookTemplate) => {
    const newCells: CellData[] = template.cells.map((cell, index) => ({
      ...cell,
      id: `cell-${Date.now()}-${index}`,
      status: 'idle' as ModuleStatus,
    }))
    setCells(newCells)
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
    }

    const newCell: CellData = {
      id: `cell-${Date.now()}`,
      type,
      label: labels[type],
      content: '',
      status: 'idle',
      modelSlot: type === 'ai_processor' ? 'A' : undefined,
    }
    
    setCells((prev) => [...prev, newCell])
    
    if (viewMode === 'canvas') {
      const lastNode = nodes[nodes.length - 1]
      const newNode: Node = {
        id: newCell.id,
        type: 'module',
        position: lastNode 
          ? { x: lastNode.position.x + 300, y: lastNode.position.y }
          : { x: 100, y: 100 },
        data: {
          label: newCell.label,
          moduleType: type,
          status: 'idle',
          content: '',
        },
      }
      setNodes((prev) => [...prev, newNode])
      
      if (lastNode) {
        setEdges((prev) => [
          ...prev,
          {
            id: `e-${lastNode.id}-${newCell.id}`,
            source: lastNode.id,
            target: newCell.id,
            ...defaultEdgeOptions,
          },
        ])
      }
    }
  }

  const updateCell = useCallback((id: string, updates: Partial<CellData>) => {
    setCells((prev) => 
      prev.map((cell) => cell.id === id ? { ...cell, ...updates } : cell)
    )
  }, [])

  const deleteCell = (id: string) => {
    setCells((prev) => prev.filter((cell) => cell.id !== id))
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

  // Execute a single cell with input from previous cell(s)
  const executeCell = useCallback(async (
    cell: CellData, 
    input: string,
    originalQuestion?: string
  ): Promise<string> => {
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
      
      default:
        return input
    }
  }, [resolveModel, sendChat, sendToTerminal, updateCell])

  // Run a single cell
  const runCell = useCallback(async (id: string) => {
    const cellIndex = cells.findIndex((c) => c.id === id)
    if (cellIndex === -1) return
    
    const cell = cells[cellIndex]
    const { input, originalQuestion } = gatherInput(cellIndex, cells)
    
    updateCell(id, { status: 'running', output: undefined, error: undefined })
    
    try {
      const output = await executeCell(cell, input, originalQuestion)
      updateCell(id, { status: 'success', output })
    } catch (e) {
      updateCell(id, { 
        status: 'error', 
        error: e instanceof Error ? e.message : 'Unknown error' 
      })
    }
  }, [cells, executeCell, updateCell, gatherInput])

  // Run all cells sequentially
  const runAllCells = useCallback(async () => {
    setIsRunning(true)
    
    // Create a working copy of cells to track outputs as we execute
    const workingCells = [...cells]
    
    for (let i = 0; i < workingCells.length; i++) {
      const cell = workingCells[i]
      updateCell(cell.id, { status: 'running', output: undefined, error: undefined })
      
      // Gather input based on inputMode
      const { input, originalQuestion } = gatherInput(i, workingCells)
      
      try {
        const output = await executeCell(cell, input, originalQuestion)
        updateCell(cell.id, { status: 'success', output })
        // Update working copy so subsequent cells can access this output
        workingCells[i] = { ...workingCells[i], output }
      } catch (e) {
        updateCell(cell.id, { 
          status: 'error', 
          error: e instanceof Error ? e.message : 'Unknown error' 
        })
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
              defaultEdgeOptions={defaultEdgeOptions}
              connectionMode={ConnectionMode.Loose}
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
