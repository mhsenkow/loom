import { useState } from 'react'
import { CellData, ModelSlot, ModelSlotConfig, InputMode } from './CircuitBoard'
import { FilePicker, ReadMode } from './FilePicker'
import type { ModuleType } from '../../types/module'

const INPUT_MODE_INDICATORS: Record<InputMode, { icon: string; color: string }> = {
  previous: { icon: '●', color: '#33ff00' },
  all: { icon: '●●●', color: '#33ff00' },
  none: { icon: '○', color: '#666' },
}

const READ_MODE_LABELS: Record<ReadMode, string> = {
  raw: '📄 Raw',
  preview: '👁️ Preview',
  structure: '🏗️ Structure',
  summarize: '📝 Summarize',
  stats: '📊 Stats',
  extract: '🎯 Extract',
}

const SLOT_COLORS: Record<ModelSlot, string> = {
  A: '#33ff00',
  B: '#00bfff',
  C: '#ff9500',
}

const SLOT_LABELS: Record<ModelSlot, string> = {
  A: 'Creative',
  B: 'Critical',
  C: 'Fast',
}

interface NotebookCellProps {
  cell: CellData
  index: number
  totalCells: number
  models: string[]
  modelSlots: ModelSlotConfig
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
  models: _models,
  modelSlots,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onRun,
}: NotebookCellProps) {
  void _models // Keep prop for future use
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(cell.content)
  const [showFilePicker, setShowFilePicker] = useState(false)

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
    image_gen: {
      icon: '🎨',
      color: 'text-pink-400',
      bgColor: 'bg-pink-500',
      description: 'Generates image from input prompt',
    },
    markdown: {
      icon: '📝',
      color: 'text-gray-400',
      bgColor: 'bg-gray-600',
      description: 'Documentation / notes (not executed)',
    },
    data_loader: {
      icon: '📁',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-600',
      description: 'Loads file from data folder. Enter file path.',
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
      case 'image_gen':
        return 'Optional: Negative prompt (what to avoid)'
      case 'markdown':
        return 'Write notes or documentation here...'
      case 'data_loader':
        return 'File path (e.g., data.csv, reports/summary.pdf)'
      default:
        return 'Enter content...'
    }
  }

  // Get the resolved model name for display
  const getResolvedModel = (): string => {
    if (cell.model) return cell.model
    if (cell.modelSlot && modelSlots[cell.modelSlot]) {
      return modelSlots[cell.modelSlot]
    }
    return 'Default'
  }

  return (
    <div className="module-chip group">
      {/* Header */}
      <div className={`${config.bgColor} text-void px-4 py-2 flex items-center justify-between`}>
        <div className="flex items-center gap-3">
          {/* Input mode indicator */}
          {index > 0 && (
            <span 
              className="text-[8px] opacity-60"
              style={{ color: INPUT_MODE_INDICATORS[cell.inputMode || 'previous'].color }}
              title={`Input mode: ${cell.inputMode || 'previous'}`}
            >
              {INPUT_MODE_INDICATORS[cell.inputMode || 'previous'].icon}
            </span>
          )}
          <span className="text-sm">{config.icon}</span>
          <span className="font-mono text-xs font-bold tracking-wider">
            [{index + 1}] {cell.label}
          </span>
          <span className={`led ${statusIndicator[cell.status]}`} />
          
          {/* Show slot badge for AI cells */}
          {cell.type === 'ai_processor' && cell.modelSlot && (
            <span 
              className="text-[10px] font-bold px-1.5 py-0.5 bg-black/30"
              style={{ color: SLOT_COLORS[cell.modelSlot] }}
              title={`Using slot ${cell.modelSlot} (${SLOT_LABELS[cell.modelSlot]}): ${getResolvedModel()}`}
            >
              {cell.modelSlot}
            </span>
          )}
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
        {/* Type Description + Controls */}
        <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-3 flex items-center justify-between">
          <span>{config.description}</span>
          
          {/* Slot Selector for AI cells */}
          {cell.type === 'ai_processor' && (
            <div className="flex items-center gap-2">
              <span className="normal-case text-terminal-muted">Slot:</span>
              <div className="flex border border-terminal-border">
                {(['A', 'B', 'C'] as ModelSlot[]).map((slot) => (
                  <button
                    key={slot}
                    onClick={() => onUpdate({ modelSlot: slot, model: undefined })}
                    className={`px-2 py-0.5 text-[10px] font-bold transition-none ${
                      cell.modelSlot === slot 
                        ? 'bg-void' 
                        : 'hover:bg-void/50'
                    }`}
                    style={{ 
                      color: cell.modelSlot === slot ? SLOT_COLORS[slot] : '#666',
                      borderRight: slot !== 'C' ? '1px solid #2a2a2a' : 'none',
                    }}
                    title={`${SLOT_LABELS[slot]}: ${modelSlots[slot] || 'Default'}`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
              {cell.modelSlot && (
                <span 
                  className="text-[9px] normal-case"
                  style={{ color: SLOT_COLORS[cell.modelSlot] }}
                >
                  {modelSlots[cell.modelSlot] || 'Default'}
                </span>
              )}
            </div>
          )}
          
          {/* Model Selector for Image cells */}
          {cell.type === 'image_gen' && (
            <select
              value={cell.model || 'sdxl'}
              onChange={(e) => onUpdate({ model: e.target.value })}
              className="bg-void border border-terminal-border text-pink-400 text-[10px] px-2 py-1 focus:outline-none focus:border-pink-400"
            >
              <optgroup label="Local (MPS/CUDA)">
                <option value="sdxl">SDXL (8GB)</option>
                <option value="sdxl-turbo">SDXL Turbo - Fast (8GB)</option>
                <option value="sd-3">Stable Diffusion 3 (16GB)</option>
                <option value="flux-schnell">FLUX Schnell (32GB)</option>
                <option value="flux-dev">FLUX Dev (32GB)</option>
                <option value="sd-1.5">SD 1.5 - Classic (4GB)</option>
              </optgroup>
            </select>
          )}
          
          {/* Read mode indicator for Data cells */}
          {cell.type === 'data_loader' && cell.readMode && (
            <span className="text-[10px] text-cyan-400">
              {READ_MODE_LABELS[cell.readMode as ReadMode] || cell.readMode}
            </span>
          )}
        </div>

        {/* Content Area - Special handling for data_loader */}
        {cell.type === 'data_loader' && (
          <>
            {/* File selector UI */}
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setShowFilePicker(true)}
                className="btn-terminal text-xs flex items-center gap-2"
                style={{ borderColor: '#00bfff', color: '#00bfff' }}
              >
                📁 Browse Files
              </button>
              {cell.content && (
                <span className="text-xs text-phosphor font-mono truncate flex-1">
                  {cell.content}
                </span>
              )}
            </div>
            
            {/* Manual path input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value)
                  onUpdate({ content: e.target.value })
                }}
                placeholder="Or type path: data.csv, reports/summary.pdf"
                className="flex-1 bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-cyan-500"
              />
            </div>
            
            {/* Read mode selector */}
            <div className="mt-3 pt-3 border-t border-terminal-border">
              <div className="text-[10px] text-terminal-muted mb-2">Read Mode:</div>
              <div className="flex flex-wrap gap-1">
                {(['raw', 'preview', 'summarize', 'structure', 'stats', 'extract'] as ReadMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => onUpdate({ readMode: mode })}
                    className={`px-2 py-1 text-[10px] border ${
                      cell.readMode === mode 
                        ? 'border-cyan-500 bg-cyan-900/30 text-cyan-400' 
                        : 'border-terminal-border text-terminal-muted hover:border-cyan-500/50'
                    }`}
                  >
                    {READ_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
              <div className="text-[9px] text-terminal-muted mt-1">
                {cell.readMode === 'summarize' && 'AI will summarize the document'}
                {cell.readMode === 'structure' && 'AI will analyze the data structure'}
                {cell.readMode === 'stats' && 'AI will compute statistics (best for CSV)'}
                {cell.readMode === 'extract' && 'AI will extract key data points'}
                {cell.readMode === 'preview' && 'First 50 lines only'}
                {(!cell.readMode || cell.readMode === 'raw') && 'Full file content as-is'}
              </div>
            </div>
            
            {/* File Picker Modal */}
            <FilePicker
              isOpen={showFilePicker}
              onClose={() => setShowFilePicker(false)}
              onSelect={(path, mode) => {
                setEditContent(path)
                onUpdate({ content: path, readMode: mode })
              }}
            />
          </>
        )}

        {/* Content Area - Regular cells */}
        {cell.type !== 'log_entry' && cell.type !== 'data_loader' && (
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
        {(cell.output || cell.status === 'running' || cell.error) && (
          <div className={`mt-3 p-3 border ${cell.error ? 'bg-red-900/20 border-red-500' : 'bg-void/50 border-phosphor-dim'}`}>
            <div className={`text-[10px] uppercase tracking-widest mb-2 ${cell.error ? 'text-red-400' : 'text-phosphor-dim'}`}>
              {cell.error ? 'ERROR' : 'OUTPUT'}
            </div>
            
            {/* Image output */}
            {cell.type === 'image_gen' && cell.output?.startsWith('data:image') ? (
              <div className="flex justify-center">
                <img 
                  src={cell.output} 
                  alt="Generated" 
                  className="max-w-full max-h-[400px] border border-phosphor-dim"
                />
              </div>
            ) : (
              <div className={`font-mono text-sm whitespace-pre-wrap ${cell.error ? 'text-red-400' : 'text-phosphor'}`}>
                {cell.error || cell.output || (cell.status === 'running' ? '...' : '')}
              </div>
            )}
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
