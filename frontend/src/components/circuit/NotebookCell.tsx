import { useState } from 'react'
import { CellData } from './CircuitBoard'
import type { ModuleType } from '../../types/module'

interface NotebookCellProps {
  cell: CellData
  index: number
  totalCells: number
  models: string[]
  onUpdate: (updates: Partial<CellData>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRun: () => void
}

export function NotebookCell({
  cell,
  index,
  totalCells,
  models,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onRun,
}: NotebookCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(cell.content)

  const typeConfig: Record<ModuleType, { 
    icon: string
    color: string
    bgColor: string
    description: string
  }> = {
    data_input: { 
      icon: '▶', 
      color: 'text-phosphor', 
      bgColor: 'bg-phosphor',
      description: 'Provides input text to the next cell',
    },
    ai_processor: { 
      icon: '◆', 
      color: 'text-amber-500', 
      bgColor: 'bg-amber-500',
      description: 'Sends input to AI model, outputs response',
    },
    script_execution: { 
      icon: '⚙', 
      color: 'text-cyan-500', 
      bgColor: 'bg-cyan-500',
      description: 'Transforms input. Use {{input}} for interpolation',
    },
    log_entry: { 
      icon: '◀', 
      color: 'text-phosphor-dim', 
      bgColor: 'bg-phosphor-dim',
      description: 'Displays output and sends to Terminal',
    },
  }

  const config = typeConfig[cell.type]

  const statusIndicator = {
    idle: 'led-idle',
    running: 'led-running',
    success: 'led-success',
    error: 'led-error',
  }

  const handleSave = () => {
    onUpdate({ content: editContent })
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && e.metaKey) {
      handleSave()
      onRun()
    } else if (e.key === 'Escape') {
      setEditContent(cell.content)
      setIsEditing(false)
    }
  }

  // Different placeholder based on cell type
  const getPlaceholder = () => {
    switch (cell.type) {
      case 'data_input':
        return 'Enter your prompt or data...'
      case 'ai_processor':
        return 'Optional: System prompt (leave empty for default)'
      case 'script_execution':
        return 'Transform template. Use {{input}} to reference previous output.'
      case 'log_entry':
        return 'Optional: Label for output'
      default:
        return 'Enter content...'
    }
  }

  return (
    <div className="module-chip group">
      {/* Header */}
      <div className={`${config.bgColor} text-void px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          <span className="text-sm">{config.icon}</span>
          <span className="font-mono text-xs font-bold tracking-wider">
            [{index + 1}] {cell.label}
          </span>
          <span className={`led ${statusIndicator[cell.status]}`} />
        </div>

        {/* Cell Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-1 hover:bg-black/20 disabled:opacity-30"
            title="Move Up"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === totalCells - 1}
            className="p-1 hover:bg-black/20 disabled:opacity-30"
            title="Move Down"
          >
            ↓
          </button>
          <button
            onClick={onDelete}
            className="p-1 hover:bg-red-500/50 text-red-900"
            title="Delete"
          >
            ×
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 bg-slate">
        {/* Type Description */}
        <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-3 flex items-center justify-between">
          <span>{config.description}</span>
          
          {/* Model Selector for AI cells */}
          {cell.type === 'ai_processor' && models.length > 0 && (
            <select
              value={cell.model || ''}
              onChange={(e) => onUpdate({ model: e.target.value || undefined })}
              className="bg-void border border-terminal-border text-phosphor text-[10px] px-2 py-1 focus:outline-none focus:border-phosphor"
            >
              <option value="">Default Model</option>
              {models.filter(m => !m.includes('embed')).map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Content Area - only show for types that need input */}
        {cell.type !== 'log_entry' && (
          <>
            {isEditing ? (
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleSave}
                autoFocus
                className="w-full h-24 bg-void border border-phosphor p-3 text-phosphor font-mono text-sm resize-none focus:outline-none focus:shadow-glow"
                placeholder={getPlaceholder()}
              />
            ) : (
              <div
                onClick={() => setIsEditing(true)}
                className="min-h-[60px] p-3 bg-void border border-terminal-border text-phosphor font-mono text-sm cursor-text hover:border-phosphor transition-colors whitespace-pre-wrap"
              >
                {cell.content || (
                  <span className="text-terminal-muted italic">
                    {getPlaceholder()}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {/* Output Section */}
        {(cell.output || cell.status === 'running') && (
          <div className={`mt-3 p-3 border ${cell.error ? 'bg-red-900/20 border-red-500' : 'bg-void/50 border-phosphor-dim'}`}>
            <div className={`text-[10px] uppercase tracking-widest mb-2 ${cell.error ? 'text-red-400' : 'text-phosphor-dim'}`}>
              {cell.error ? 'ERROR' : 'OUTPUT'}
            </div>
            <div className={`font-mono text-sm whitespace-pre-wrap ${cell.error ? 'text-red-400' : 'text-phosphor'}`}>
              {cell.error || cell.output || (cell.status === 'running' ? '...' : '')}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-terminal-border flex items-center justify-between">
          <div className="text-[10px] text-terminal-muted">
            STATUS:{' '}
            <span className={
              cell.status === 'error' ? 'text-red-400' : 
              cell.status === 'running' ? 'text-amber-500' :
              cell.status === 'success' ? 'text-phosphor' :
              'text-terminal-muted'
            }>
              {cell.status.toUpperCase()}
            </span>
            {cell.status === 'running' && (
              <span className="ml-2 text-amber-500 animate-pulse">●●●</span>
            )}
          </div>

          <button
            onClick={onRun}
            disabled={cell.status === 'running'}
            className="btn-terminal text-xs disabled:opacity-50"
          >
            {cell.status === 'running' ? 'RUNNING...' : '▶ RUN'}
          </button>
        </div>
      </div>
    </div>
  )
}
