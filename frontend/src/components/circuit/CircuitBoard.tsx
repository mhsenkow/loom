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
import type { ModuleType, ModuleStatus } from '../../types/module'
import { useSocket } from '../../hooks/useSocket'
import { useSystemStatus } from '../../hooks/useSystemStatus'
import { useSendToTerminal } from '../../hooks/useTerminalOutput'

type ViewMode = 'linear' | 'canvas'

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

export interface CellData {
  id: string
  type: ModuleType
  label: string
  content: string
  status: ModuleStatus
  output?: string
  error?: string
  model?: string  // For AI cells - which model to use
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
  
  const { sendChat } = useSocket()
  const { status, models } = useSystemStatus()
  const sendToTerminal = useSendToTerminal()
  
  // React Flow state (synced from cells in canvas mode)
  const [nodes, setNodes, onNodesChange] = useNodesState(cellsToNodes(initialCells))
  const [edges, setEdges, onEdgesChange] = useEdgesState(generateEdges(initialCells))

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
    }

    const newCell: CellData = {
      id: `cell-${Date.now()}`,
      type,
      label: labels[type],
      content: '',
      status: 'idle',
    }
    
    setCells((prev) => [...prev, newCell])
    
    if (viewMode === 'canvas') {
      const newNode: Node = {
        id: newCell.id,
        type: 'module',
        position: { x: 250 + Math.random() * 200, y: 200 + Math.random() * 100 },
        data: {
          label: newCell.label,
          moduleType: newCell.type,
          status: newCell.status,
          content: newCell.content,
        },
      }
      setNodes((nds) => [...nds, newNode])
    }
  }

  const updateCell = useCallback((id: string, updates: Partial<CellData>) => {
    setCells((prev) =>
      prev.map((cell) => (cell.id === id ? { ...cell, ...updates } : cell))
    )
  }, [])

  const deleteCell = (id: string) => {
    setCells((prev) => prev.filter((cell) => cell.id !== id))
    setNodes((nds) => nds.filter((node) => node.id !== id))
    setEdges((eds) => eds.filter((edge) => edge.source !== id && edge.target !== id))
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

  // Execute a single cell with input from previous cell
  // originalQuestion tracks the initial input for context
  const executeCell = useCallback(async (
    cell: CellData, 
    input: string,
    originalQuestion?: string
  ): Promise<string> => {
    const defaultModel = status.activeModel || models[0] || 'llama3.1:8b'
    
    switch (cell.type) {
      case 'data_input':
        // INPUT cells just pass their content as output
        return cell.content || input
      
      case 'ai_processor':
        // AI cells send to Ollama - use cell's model or default
        const modelToUse = cell.model || defaultModel
        return new Promise((resolve, reject) => {
          let response = ''
          
          const sent = sendChat(
            input, // Use input from previous cell
            modelToUse,
            (chunk) => {
              response += chunk.content
              // Update cell with streaming content
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
        // SCRIPT cells - for now just echo, TODO: actual code execution
        try {
          // If content looks like a template, do string interpolation
          if (cell.content.includes('{{input}}')) {
            return cell.content.replace(/\{\{input\}\}/g, input)
          }
          // Otherwise just pass through
          return cell.content || input
        } catch (e) {
          throw new Error(`Script error: ${e}`)
        }
      
      case 'log_entry':
        // OUTPUT cells display the input and send to Terminal with full context
        sendToTerminal(input, 'Circuit Notebook', {
          question: originalQuestion || 'Circuit notebook output',
          model: defaultModel,
        })
        return input
      
      default:
        return input
    }
  }, [sendChat, status.activeModel, models, updateCell])

  // Run a single cell (standalone)
  const runCell = useCallback(async (id: string) => {
    const cellIndex = cells.findIndex((c) => c.id === id)
    if (cellIndex === -1) return
    
    const cell = cells[cellIndex]
    updateCell(id, { status: 'running', output: undefined, error: undefined })
    
    try {
      // Get input from previous cell's output, or empty string
      const prevCell = cellIndex > 0 ? cells[cellIndex - 1] : null
      const input = prevCell?.output || prevCell?.content || ''
      
      // Find the original question from the first INPUT cell
      const inputCell = cells.find((c) => c.type === 'data_input')
      const originalQuestion = inputCell?.content || input
      
      const output = await executeCell(cell, input, originalQuestion)
      updateCell(id, { status: 'success', output })
    } catch (e) {
      updateCell(id, { 
        status: 'error', 
        error: e instanceof Error ? e.message : 'Unknown error' 
      })
    }
  }, [cells, executeCell, updateCell])

  // Run all cells sequentially
  const runAllCells = useCallback(async () => {
    setIsRunning(true)
    let currentInput = ''
    let originalQuestion = ''
    
    for (const cell of cells) {
      updateCell(cell.id, { status: 'running', output: undefined, error: undefined })
      
      try {
        const output = await executeCell(cell, currentInput, originalQuestion)
        updateCell(cell.id, { status: 'success', output })
        currentInput = output // Pass output to next cell
        
        // Capture the original question from the first INPUT cell
        if (cell.type === 'data_input' && !originalQuestion) {
          originalQuestion = output
        }
      } catch (e) {
        updateCell(cell.id, { 
          status: 'error', 
          error: e instanceof Error ? e.message : 'Unknown error' 
        })
        break // Stop on error
      }
    }
    
    setIsRunning(false)
  }, [cells, executeCell, updateCell])

  const handleViewModeChange = (mode: ViewMode) => {
    if (mode === 'canvas') {
      syncToCanvas()
    }
    setViewMode(mode)
  }

  // Clear all outputs
  const clearOutputs = () => {
    setCells((prev) =>
      prev.map((cell) => ({ ...cell, output: undefined, error: undefined, status: 'idle' }))
    )
  }

  return (
    <div className="h-full w-full flex flex-col">
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

          {/* Add Cell Buttons */}
          <button onClick={() => addCell('data_input')} className="btn-terminal text-xs">
            + INPUT
          </button>
          <button onClick={() => addCell('ai_processor')} className="btn-terminal text-xs">
            + AI
          </button>
          <button onClick={() => addCell('script_execution')} className="btn-terminal text-xs">
            + SCRIPT
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
  )
}
