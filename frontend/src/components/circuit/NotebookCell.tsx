import { useState, useRef, useEffect } from 'react'
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
  isExpanded?: boolean
  onExpand?: () => void
  onCollapse?: () => void
}

const CELL_BODY_MAX_HEIGHT = 280

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
  isExpanded = false,
  onExpand,
  onCollapse,
}: NotebookCellProps) {
  void _models // Keep prop for future use
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(cell.content)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el || isExpanded) {
      setHasOverflow(false)
      return
    }
    const check = () => setHasOverflow(el.scrollHeight > el.clientHeight)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [cell.output, cell.content, cell.error, cell.status, isExpanded])

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
    conditional: {
      icon: '⚡',
      color: 'text-purple-400',
      bgColor: 'bg-purple-600',
      description: 'Passes input only if condition is met. Otherwise outputs onFail value.',
    },
    web_fetch: {
      icon: '🌐',
      color: 'text-blue-400',
      bgColor: 'bg-blue-600',
      description: 'Fetches content from a URL. Supports GET/POST with headers and body.',
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
      case 'conditional':
        return 'Condition description (e.g., "contains question mark")'
      case 'web_fetch':
        return 'URL (or use {{input}} to use previous cell output as URL)'
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

        {/* Scrollable content: max-height when collapsed, expand toggle when overflow */}
        <div
          ref={scrollRef}
          className={`relative ${isExpanded ? '' : 'overflow-y-auto'}`}
          style={isExpanded ? undefined : { maxHeight: CELL_BODY_MAX_HEIGHT }}
        >
          {hasOverflow && !isExpanded && onExpand && (
            <button
              type="button"
              onClick={onExpand}
              className="absolute top-2 right-2 z-10 p-1.5 border border-phosphor bg-void text-phosphor text-[10px] hover:bg-phosphor hover:text-void transition-colors"
              title="Expand to full height"
            >
              ⛶
            </button>
          )}

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

        {/* Content Area - Conditional cell */}
        {cell.type === 'conditional' && (
          <>
            <div className="mb-3">
              <div className="text-[10px] text-terminal-muted mb-2">Condition Type:</div>
              <div className="flex flex-wrap gap-1 mb-3">
                {(['regex', 'keyword', 'length', 'contains', 'ai_check'] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => onUpdate({ conditionType: type })}
                    className={`px-2 py-1 text-[10px] border ${
                      cell.conditionType === type 
                        ? 'border-purple-500 bg-purple-900/30 text-purple-400' 
                        : 'border-terminal-border text-terminal-muted hover:border-purple-500/50'
                    }`}
                  >
                    {type === 'regex' && 'Regex'}
                    {type === 'keyword' && 'Keyword'}
                    {type === 'length' && 'Length'}
                    {type === 'contains' && 'Contains'}
                    {type === 'ai_check' && 'AI Check'}
                  </button>
                ))}
              </div>
              
              {cell.conditionType && (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-terminal-muted block mb-1">
                      {cell.conditionType === 'regex' && 'Pattern (regex):'}
                      {cell.conditionType === 'keyword' && 'Keyword to match:'}
                      {cell.conditionType === 'length' && 'Max length (characters):'}
                      {cell.conditionType === 'contains' && 'Text to find:'}
                      {cell.conditionType === 'ai_check' && 'AI prompt (e.g., "Is this a question? Answer YES or NO"):'}
                    </label>
                    <input
                      type={cell.conditionType === 'length' ? 'number' : 'text'}
                      value={cell.conditionValue || ''}
                      onChange={(e) => onUpdate({ conditionValue: e.target.value })}
                      placeholder={
                        cell.conditionType === 'regex' ? 'e.g., \\?$' :
                        cell.conditionType === 'keyword' ? 'e.g., urgent' :
                        cell.conditionType === 'length' ? 'e.g., 1000' :
                        cell.conditionType === 'contains' ? 'e.g., @example.com' :
                        'e.g., Is this a question? Answer YES or NO'
                      }
                      className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-purple-500"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-terminal-muted block mb-1">On Pass (default: input):</label>
                      <input
                        type="text"
                        value={cell.onPass || ''}
                        onChange={(e) => onUpdate({ onPass: e.target.value })}
                        placeholder="Leave empty to pass input through"
                        className="w-full bg-void border border-terminal-border p-1.5 text-phosphor font-mono text-[10px] focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-terminal-muted block mb-1">On Fail (default: empty):</label>
                      <input
                        type="text"
                        value={cell.onFail || ''}
                        onChange={(e) => onUpdate({ onFail: e.target.value })}
                        placeholder="Output when condition fails"
                        className="w-full bg-void border border-terminal-border p-1.5 text-phosphor font-mono text-[10px] focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-terminal-border/50">
                    <div>
                      <label className="text-[10px] text-terminal-muted block mb-1">On fail: loop back to cell # (0 = no loop):</label>
                      <input
                        type="number"
                        min={0}
                        max={index}
                        value={cell.loopBackTo ?? 0}
                        onChange={(e) => onUpdate({ loopBackTo: Math.max(0, parseInt(e.target.value) || 0) })}
                        placeholder="0"
                        className="w-full bg-void border border-terminal-border p-1.5 text-phosphor font-mono text-[10px] focus:outline-none focus:border-purple-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-terminal-muted block mb-1">Max loop passes:</label>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={cell.loopBackMax ?? 3}
                        onChange={(e) => onUpdate({ loopBackMax: Math.max(1, Math.min(10, parseInt(e.target.value) || 3)) })}
                        className="w-full bg-void border border-terminal-border p-1.5 text-phosphor font-mono text-[10px] focus:outline-none focus:border-purple-500"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-3 pt-3 border-t border-terminal-border">
              <textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                placeholder={getPlaceholder()}
                className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-purple-500 min-h-[60px]"
              />
            </div>
          </>
        )}

        {/* Content Area - Web Fetch cell */}
        {cell.type === 'web_fetch' && (
          <>
            <div className="mb-3">
              <div className="text-[10px] text-terminal-muted mb-2">HTTP Method:</div>
              <div className="flex flex-wrap gap-1 mb-3">
                {(['GET', 'POST', 'PUT', 'DELETE'] as const).map((method) => (
                  <button
                    key={method}
                    onClick={() => onUpdate({ fetchMethod: method })}
                    className={`px-2 py-1 text-[10px] border ${
                      (cell.fetchMethod || 'GET') === method 
                        ? 'border-blue-500 bg-blue-900/30 text-blue-400' 
                        : 'border-terminal-border text-terminal-muted hover:border-blue-500/50'
                    }`}
                  >
                    {method}
                  </button>
                ))}
              </div>
              
              <div className="space-y-2">
                <div>
                  <label className="text-[10px] text-terminal-muted block mb-1">URL (or use {'{{input}}'}):</label>
                  <input
                    type="text"
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value)
                      onUpdate({ content: e.target.value })
                    }}
                    placeholder="https://api.example.com/data or {{input}}"
                    className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-blue-500"
                  />
                </div>
                
                {(cell.fetchMethod === 'POST' || cell.fetchMethod === 'PUT') && (
                  <div>
                    <label className="text-[10px] text-terminal-muted block mb-1">Body (can use {'{{input}}'}):</label>
                    <textarea
                      value={cell.fetchBody || ''}
                      onChange={(e) => onUpdate({ fetchBody: e.target.value })}
                      placeholder='{"key": "value"} or {{input}}'
                      className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-blue-500 min-h-[60px]"
                    />
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-terminal-muted block mb-1">Headers (JSON or key:value):</label>
                    <textarea
                      value={cell.fetchHeaders || ''}
                      onChange={(e) => onUpdate({ fetchHeaders: e.target.value })}
                      placeholder='{"Authorization": "Bearer token"}'
                      className="w-full bg-void border border-terminal-border p-1.5 text-phosphor font-mono text-[10px] focus:outline-none focus:border-blue-500 min-h-[40px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <div>
                      <label className="text-[10px] text-terminal-muted block mb-1">Timeout (seconds):</label>
                      <input
                        type="number"
                        value={cell.fetchTimeout || 30}
                        onChange={(e) => onUpdate({ fetchTimeout: parseInt(e.target.value) || 30 })}
                        className="w-full bg-void border border-terminal-border p-1.5 text-phosphor font-mono text-[10px] focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-terminal-muted block mb-1">Max Size (bytes, 8MB default):</label>
                      <input
                        type="number"
                        value={cell.fetchMaxSize ?? 8388608}
                        onChange={(e) => onUpdate({ fetchMaxSize: parseInt(e.target.value) || 8388608 })}
                        placeholder="8388608"
                        className="w-full bg-void border border-terminal-border p-1.5 text-phosphor font-mono text-[10px] focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Content Area - Regular cells */}
        {cell.type !== 'log_entry' && cell.type !== 'data_loader' && cell.type !== 'conditional' && cell.type !== 'web_fetch' && (
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

        </div>

        {isExpanded && onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="fixed right-6 top-1/2 -translate-y-1/2 z-[100] p-2 border border-phosphor bg-void text-phosphor text-xs hover:bg-phosphor hover:text-void transition-colors"
            title="Collapse to max height"
          >
            ◫
          </button>
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
