import { CellData } from './CircuitBoard'
import { NotebookCell } from './NotebookCell'

interface LinearViewProps {
  cells: CellData[]
  models: string[]
  onUpdateCell: (id: string, updates: Partial<CellData>) => void
  onDeleteCell: (id: string) => void
  onMoveCell: (id: string, direction: 'up' | 'down') => void
  onRunCell: (id: string) => void
}

export function LinearView({
  cells,
  models,
  onUpdateCell,
  onDeleteCell,
  onMoveCell,
  onRunCell,
}: LinearViewProps) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        {/* Header */}
        <div className="border-b border-terminal-border pb-4 mb-6">
          <h1 className="text-phosphor font-bold text-lg tracking-wider">
            CIRCUIT NOTEBOOK
          </h1>
          <p className="text-terminal-muted text-xs mt-1">
            {cells.length} cells • Run sequentially or individually
          </p>
        </div>

        {/* Cells */}
        {cells.map((cell, index) => (
          <div key={cell.id} className="relative">
            {/* Connection Line */}
            {index > 0 && (
              <div className="absolute left-1/2 -top-4 w-px h-4 bg-phosphor-dim" />
            )}
            
            <NotebookCell
              cell={cell}
              index={index}
              totalCells={cells.length}
              models={models}
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
      </div>
    </div>
  )
}
