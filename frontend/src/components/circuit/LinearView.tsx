import { useState, useRef, useEffect } from 'react'
import { CellData, ModelSlotConfig, InputMode } from './CircuitBoard'
import { NotebookCell } from './NotebookCell'

interface LinearViewProps {
  cells: CellData[]
  models: string[]
  modelSlots: ModelSlotConfig
  circuitName: string
  onCircuitNameChange: (name: string) => void
  onSaveCircuit: () => void
  isSaved: boolean
  onUpdateCell: (id: string, updates: Partial<CellData>) => void
  onDeleteCell: (id: string) => void
  onMoveCell: (id: string, direction: 'up' | 'down') => void
  onRunCell: (id: string) => void
  getValidationError?: (cell: CellData, index: number) => string | null
  activeCellId: string | null
  onActiveCellChange: (id: string | null) => void
}

const INPUT_MODE_CONFIG: Record<InputMode, {
  icon: string
  label: string
  description: string
  dots: number
}> = {
  previous: {
    icon: '●',
    label: 'Previous',
    description: 'Input from previous cell only',
    dots: 1,
  },
  all: {
    icon: '●●●',
    label: 'All',
    description: 'Input from ALL previous cells',
    dots: 3,
  },
  none: {
    icon: '○',
    label: 'None',
    description: 'Uses only own content',
    dots: 0,
  },
}

interface CellConnectorProps {
  inputMode: InputMode
  onToggle: () => void
  prevCellLabel: string
  allCellCount: number
}

function CellConnector({ inputMode, onToggle, prevCellLabel, allCellCount }: CellConnectorProps) {
  const config = INPUT_MODE_CONFIG[inputMode]

  return (
    <div className="relative h-10 flex items-center justify-center group">
      {/* Vertical line */}
      <div
        className={`absolute left-1/2 top-0 bottom-0 w-px transition-colors ${inputMode === 'none' ? 'bg-terminal-border opacity-30' : 'bg-phosphor'
          }`}
        style={{
          backgroundImage: inputMode === 'all'
            ? 'linear-gradient(to bottom, #33ff00 50%, transparent 50%)'
            : undefined,
          backgroundSize: inputMode === 'all' ? '1px 6px' : undefined,
        }}
      />

      {/* Clickable connector node */}
      <button
        onClick={onToggle}
        className={`
          relative z-10 flex items-center justify-center gap-1.5
          px-3 py-1 rounded-full border transition-all
          ${inputMode === 'none'
            ? 'bg-void border-terminal-border text-terminal-muted hover:border-phosphor'
            : inputMode === 'all'
              ? 'bg-void border-phosphor text-phosphor shadow-glow-sm'
              : 'bg-void border-phosphor text-phosphor'
          }
          hover:scale-105 cursor-pointer
          group-hover:opacity-100 ${inputMode === 'previous' ? 'opacity-60' : 'opacity-80'}
        `}
        title={`${config.label}: ${config.description}\nClick to cycle input mode`}
      >
        {/* Dots visualization */}
        <span className="flex items-center gap-0.5">
          {inputMode === 'none' && (
            <span className="w-2 h-2 rounded-full border border-terminal-muted" />
          )}
          {inputMode === 'previous' && (
            <span className="w-2 h-2 rounded-full bg-phosphor" />
          )}
          {inputMode === 'all' && (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor" />
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor" />
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor" />
            </>
          )}
        </span>

        {/* Label on hover */}
        <span className="text-[9px] tracking-wide opacity-0 group-hover:opacity-100 transition-opacity max-w-0 group-hover:max-w-[100px] overflow-hidden">
          {inputMode === 'all'
            ? `all ${allCellCount}`
            : inputMode === 'previous'
              ? prevCellLabel
              : 'none'}
        </span>
      </button>

      {/* Side indicator showing what's being passed */}
      {inputMode !== 'none' && (
        <div className="absolute left-1/2 ml-8 text-[9px] text-terminal-muted opacity-0 group-hover:opacity-70 whitespace-nowrap transition-opacity">
          {inputMode === 'all'
            ? `← receives ${allCellCount} cell outputs`
            : `← from [${prevCellLabel}]`}
        </div>
      )}
    </div>
  )
}

// Loop-back indicator component - shows dotted line going backwards
interface LoopBackIndicatorProps {
  fromIndex: number
  toIndex: number
  cells: CellData[]
  onUpdate: (newLoopBackTo: number) => void
}

function LoopBackIndicator({ fromIndex, toIndex, cells, onUpdate }: LoopBackIndicatorProps) {
  const [isHovered, setIsHovered] = useState(false)

  // Only show if going backwards
  if (toIndex >= fromIndex) return null

  const targetCell = cells[toIndex]
  const distance = fromIndex - toIndex

  return (
    <div
      className="relative w-full mb-2 flex items-center justify-center"
      style={{ height: `${Math.max(40, distance * 20)}px` }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Dotted vertical line going backwards */}
      <div
        className="absolute left-1/2 -translate-x-1/2 w-0.5"
        style={{
          height: '100%',
          background: 'repeating-linear-gradient(to top, #a855f7 0px, #a855f7 8px, transparent 8px, transparent 12px)',
          top: 0,
        }}
      />

      {/* Arrow indicator at top pointing up */}
      <div
        className="absolute left-1/2 -translate-x-1/2 top-0 -translate-y-1/2 text-purple-400 text-lg"
        style={{ transform: 'translateX(-50%) translateY(-50%) rotate(180deg)' }}
      >
        ↶
      </div>

      {/* Clickable label in the middle */}
      <div className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 pointer-events-auto z-10">
        <button
          onClick={() => {
            // Cycle through valid loop-back targets (only prior cells)
            const current = toIndex + 1 // 1-based
            const max = fromIndex + 1
            const next = current === 1 ? max : current - 1
            onUpdate(next)
          }}
          className={`
            px-2 py-1 text-[9px] border transition-all whitespace-nowrap
            ${isHovered
              ? 'border-purple-400 bg-purple-900/30 text-purple-300 shadow-glow-sm'
              : 'border-purple-600/50 bg-void/80 text-purple-400/70'
            }
            hover:border-purple-400 hover:text-purple-300
          `}
          title={`Loops back to cell ${toIndex + 1} (${targetCell?.label || 'unknown'}). Click to change target.`}
        >
          ↶ [{toIndex + 1}] {targetCell?.label || ''}
        </button>
      </div>
    </div>
  )
}

export function LinearView({
  cells,
  models,
  modelSlots,
  circuitName,
  onCircuitNameChange,
  onSaveCircuit,
  isSaved,
  onUpdateCell,
  onDeleteCell,
  onMoveCell,
  onRunCell,
  getValidationError,
  activeCellId,
  onActiveCellChange,
}: LinearViewProps) {
  const [isEditingName, setIsEditingName] = useState(false)
  const [editName, setEditName] = useState(circuitName)
  const inputRef = useRef<HTMLInputElement>(null)

  // Sync editName when circuitName changes from outside
  useEffect(() => {
    setEditName(circuitName)
  }, [circuitName])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditingName])

  const handleNameSubmit = () => {
    const cleanName = editName.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/\s+/g, '-')
    onCircuitNameChange(cleanName)
    setEditName(cleanName)
    setIsEditingName(false)
  }

  const handleNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSubmit()
    } else if (e.key === 'Escape') {
      setEditName(circuitName)
      setIsEditingName(false)
    }
  }

  const cycleInputMode = (cellId: string, currentMode: InputMode | undefined) => {
    const modes: InputMode[] = ['previous', 'all', 'none']
    const currentIndex = modes.indexOf(currentMode || 'previous')
    const nextMode = modes[(currentIndex + 1) % modes.length]
    onUpdateCell(cellId, { inputMode: nextMode })
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="border-b border-terminal-border pb-4 mb-6">
          {/* Title with editable name */}
          <div className="flex items-baseline gap-3">
            <span className="text-phosphor font-bold text-lg tracking-wider">CIRCUIT</span>

            {isEditingName ? (
              <div className="flex items-center border border-phosphor bg-void">
                <span className="text-phosphor text-lg px-1">/</span>
                <input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  onBlur={handleNameSubmit}
                  onKeyDown={handleNameKeyDown}
                  className="bg-transparent text-phosphor font-bold text-lg tracking-wider w-48 focus:outline-none"
                  placeholder="circuit-name"
                />
              </div>
            ) : (
              <button
                onClick={() => setIsEditingName(true)}
                className="group flex items-center border border-terminal-border hover:border-phosphor transition-colors bg-void px-2"
                title="Click to rename circuit"
              >
                <span className="text-terminal-muted text-lg">/</span>
                <span className={`font-bold text-lg tracking-wider ${circuitName ? 'text-phosphor' : 'text-terminal-muted'
                  }`}>
                  {circuitName || 'untitled'}
                </span>
                <span className="text-terminal-muted text-xs ml-2 opacity-0 group-hover:opacity-100">✎</span>
              </button>
            )}

            {/* Save button */}
            {circuitName && (
              <button
                onClick={onSaveCircuit}
                className={`text-xs px-2 py-1 border transition-colors ${isSaved
                  ? 'border-green-500 text-green-400 bg-green-900/20'
                  : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                  }`}
                title="Save circuit for terminal use"
              >
                {isSaved ? 'Saved' : 'Save'}
              </button>
            )}
          </div>

          <p className="text-terminal-muted text-xs mt-2">
            {cells.length} cells • Click connectors to change data flow
            {circuitName && <span className="ml-2 text-phosphor/50">• run with /{circuitName}</span>}
          </p>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-3 text-[10px] text-terminal-muted">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-phosphor" />
              <span>previous</span>
            </div>
            <div className="flex items-center gap-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor" />
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor" />
              <span className="w-1.5 h-1.5 rounded-full bg-phosphor" />
              <span className="ml-1">all cells</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full border border-terminal-muted" />
              <span>none</span>
            </div>
          </div>
        </div>

        {/* Cells with connectors */}
        {cells.map((cell, index) => (
          <div key={cell.id}>
            {/* Connector between cells */}
            {index > 0 && (
              <CellConnector
                inputMode={cell.inputMode || 'previous'}
                onToggle={() => cycleInputMode(cell.id, cell.inputMode)}
                prevCellLabel={cells[index - 1]?.label || `Cell ${index}`}
                allCellCount={index}
              />
            )}

            {/* Loop-back indicator (if this cell has a loop-back) */}
            {cell.type === 'conditional' && cell.loopBackTo && cell.loopBackTo > 0 && cell.loopBackTo <= index + 1 && (
              <LoopBackIndicator
                fromIndex={index}
                toIndex={cell.loopBackTo - 1}
                cells={cells}
                onUpdate={(newLoopBackTo) => {
                  const cellId = cell.id
                  const updates: Partial<CellData> = { loopBackTo: newLoopBackTo }
                  onUpdateCell(cellId, updates)
                }}
              />
            )}

            <NotebookCell
              cell={cell}
              index={index}
              totalCells={cells.length}
              models={models}
              modelSlots={modelSlots}
              validationError={getValidationError?.(cell, index) ?? null}
              onUpdate={(updates) => onUpdateCell(cell.id, updates)}
              onDelete={() => onDeleteCell(cell.id)}
              onMoveUp={() => onMoveCell(cell.id, 'up')}
              onMoveDown={() => onMoveCell(cell.id, 'down')}
              onRun={() => onRunCell(cell.id)}
              isExpanded={activeCellId === cell.id}
              onExpand={() => onActiveCellChange(cell.id)}
              onCollapse={() => onActiveCellChange(null)}
            />
          </div>
        ))}

        {/* Empty State */}
        {cells.length === 0 && (
          <div className="text-center py-12 border border-dashed border-terminal-border">
            <p className="text-terminal-muted text-sm">
              No cells yet. Add cells using the toolbar above.
            </p>
          </div>
        )}

        {/* Bottom spacer for floating toolbar */}
        <div className="h-32" />

        {/* Bottom spacer */}
        <div className="h-12" />
      </div>
    </div>
  )
}
