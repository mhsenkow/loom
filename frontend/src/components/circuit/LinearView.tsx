import { CellData, ModelSlotConfig, InputMode } from './CircuitBoard'
import { NotebookCell } from './NotebookCell'

interface LinearViewProps {
  cells: CellData[]
  models: string[]
  modelSlots: ModelSlotConfig
  onUpdateCell: (id: string, updates: Partial<CellData>) => void
  onDeleteCell: (id: string) => void
  onMoveCell: (id: string, direction: 'up' | 'down') => void
  onRunCell: (id: string) => void
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
        className={`absolute left-1/2 top-0 bottom-0 w-px transition-colors ${
          inputMode === 'none' ? 'bg-terminal-border opacity-30' : 'bg-phosphor'
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

export function LinearView({
  cells,
  models,
  modelSlots,
  onUpdateCell,
  onDeleteCell,
  onMoveCell,
  onRunCell,
}: LinearViewProps) {
  
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
          <h1 className="text-phosphor font-bold text-lg tracking-wider">
            CIRCUIT NOTEBOOK
          </h1>
          <p className="text-terminal-muted text-xs mt-1">
            {cells.length} cells • Click connectors to change data flow
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
            
            <NotebookCell
              cell={cell}
              index={index}
              totalCells={cells.length}
              models={models}
              modelSlots={modelSlots}
              onUpdate={(updates) => onUpdateCell(cell.id, updates)}
              onDelete={() => onDeleteCell(cell.id)}
              onMoveUp={() => onMoveCell(cell.id, 'up')}
              onMoveDown={() => onMoveCell(cell.id, 'down')}
              onRun={() => onRunCell(cell.id)}
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
        
        {/* Bottom spacer */}
        <div className="h-12" />
      </div>
    </div>
  )
}
