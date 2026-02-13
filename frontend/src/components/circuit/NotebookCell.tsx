import { useState, useRef, useEffect } from 'react'
import { CellData, ModelSlot, ModelSlotConfig, InputMode } from './CircuitBoard'
import { FilePicker, ReadMode } from './FilePicker'
import { MusicPlayerCard } from '../terminal/MusicPlayerCard'
import { CronCell } from './cell/CronCell'
import type { ModuleType } from '../../types/module'
import { API_BASE_URL } from '../../config/api'
import { fetchImageModels, IMAGE_MODELS_UPDATED_EVENT } from '../../utils/imageModelsApi'

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
  validationError?: string | null
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
  validationError = null,
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
  const onUpdateRef = useRef(onUpdate)
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(cell.content)
  const [showFilePicker, setShowFilePicker] = useState(false)
  const [hasOverflow, setHasOverflow] = useState(false)
  const [availableImageModels, setAvailableImageModels] = useState<Array<{ name: string; vram?: string; type?: string }>>([])

  useEffect(() => {
    onUpdateRef.current = onUpdate
  }, [onUpdate])

  // Fetch available image models when this is an image_gen cell
  useEffect(() => {
    if (cell.type === 'image_gen') {
      let cancelled = false

      const refreshImageModels = async (force = false) => {
        try {
          const data = await fetchImageModels(API_BASE_URL, { force })
          if (cancelled) return

          setAvailableImageModels(data.local.map(model => ({
            name: model.name,
            vram: model.vram || 'unknown',
            type: model.type || 'unknown',
          })))

          // If cell doesn't have a model set, use the current loaded model or first available.
          if (!cell.model && data.local.length > 0) {
            const modelToUse = data.current_model || data.local[0].name
            onUpdateRef.current({ model: modelToUse })
          }
        } catch (error) {
          console.error('[LOOM] Failed to fetch image models:', error)
          // Don't set fallback - let user see empty state or keep existing selection
        }
      }
      void refreshImageModels()

      // Also listen for model updates
      const handleModelUpdate = () => {
        void refreshImageModels()
      }
      window.addEventListener(IMAGE_MODELS_UPDATED_EVENT, handleModelUpdate)

      return () => {
        cancelled = true
        window.removeEventListener(IMAGE_MODELS_UPDATED_EVENT, handleModelUpdate)
      }
    }
  }, [cell.type, cell.model])
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
    bodyTintClass: string
    description: string
  }> = {
    data_input: {
      icon: '▶',
      color: 'text-phosphor',
      bgColor: 'bg-phosphor',
      bodyTintClass: 'bg-[#07110a]',
      description: 'Provides input text to the next cell',
    },
    ai_processor: {
      icon: '◆',
      color: 'text-amber-500',
      bgColor: 'bg-amber-500',
      bodyTintClass: 'bg-[#120f08]',
      description: 'Sends input to AI model, outputs response',
    },
    script_execution: {
      icon: '⚙',
      color: 'text-cyan-500',
      bgColor: 'bg-cyan-500',
      bodyTintClass: 'bg-[#071015]',
      description: 'Transforms input. Use {{input}} for interpolation',
    },
    log_entry: {
      icon: '◀',
      color: 'text-phosphor-dim',
      bgColor: 'bg-phosphor-dim',
      bodyTintClass: 'bg-[#0b0f0a]',
      description: 'Displays output and sends to Terminal',
    },
    image_gen: {
      icon: '🎨',
      color: 'text-pink-400',
      bgColor: 'bg-pink-500',
      bodyTintClass: 'bg-[#150a12]',
      description: 'Generates image from input prompt',
    },
    markdown: {
      icon: '📝',
      color: 'text-gray-400',
      bgColor: 'bg-gray-600',
      bodyTintClass: 'bg-[#0f0f10]',
      description: 'Documentation / notes (not executed)',
    },
    data_loader: {
      icon: '📁',
      color: 'text-cyan-400',
      bgColor: 'bg-cyan-600',
      bodyTintClass: 'bg-[#071015]',
      description: 'Loads file from data folder. Enter file path.',
    },
    conditional: {
      icon: '⚡',
      color: 'text-purple-400',
      bgColor: 'bg-purple-600',
      bodyTintClass: 'bg-[#110a15]',
      description: 'Passes input only if condition is met. Otherwise outputs onFail value.',
    },
    web_fetch: {
      icon: '🌐',
      color: 'text-blue-400',
      bgColor: 'bg-blue-600',
      bodyTintClass: 'bg-[#081018]',
      description: 'Fetches content from a URL. Supports GET/POST with headers and body.',
    },
    vector_index: {
      icon: '📚',
      color: 'text-green-400',
      bgColor: 'bg-green-600',
      bodyTintClass: 'bg-[#081008]',
      description: 'Index a file into the vector store for semantic search. Enter file path.',
    },
    vector_search: {
      icon: '🔍',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-600',
      bodyTintClass: 'bg-[#151206]',
      description: 'Search your indexed documents semantically. Enter search query.',
    },
    terminal_history: {
      icon: '📜',
      color: 'text-orange-400',
      bgColor: 'bg-orange-600',
      bodyTintClass: 'bg-[#151008]',
      description: 'Query terminal conversation history. Enter search text or JSON query.',
    },
    music_gen: {
      icon: '🎵',
      color: 'text-violet-400',
      bgColor: 'bg-violet-600',
      bodyTintClass: 'bg-[#100a16]',
      description: 'Generates music tracks using ACE-Step. Supports lyrics and style control.',
    },
    qdc_upload: {
      icon: '📡',
      color: 'text-teal-300',
      bgColor: 'bg-teal-600',
      bodyTintClass: 'bg-[#071312]',
      description: 'Uploads an artifact path to the QDC remote lane.',
    },
    qdc_run: {
      icon: '🚀',
      color: 'text-emerald-300',
      bgColor: 'bg-emerald-600',
      bodyTintClass: 'bg-[#071208]',
      description: 'Starts an asynchronous QDC remote job.',
    },
    qdc_status: {
      icon: '🛰️',
      color: 'text-sky-300',
      bgColor: 'bg-sky-700',
      bodyTintClass: 'bg-[#08111a]',
      description: 'Looks up status for a QDC job id.',
    },
    qdc_results: {
      icon: '📥',
      color: 'text-indigo-300',
      bgColor: 'bg-indigo-700',
      bodyTintClass: 'bg-[#0a0d1a]',
      description: 'Fetches final result for a QDC job id.',
    },
    notification: {
      icon: '🔔',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-700',
      bodyTintClass: 'bg-[#1a150a]',
      description: 'Sends a desktop notification.',
    },
    file_write: {
      icon: '💾',
      color: 'text-blue-300',
      bgColor: 'bg-blue-800',
      bodyTintClass: 'bg-[#0a0e1a]',
      description: 'Writes content to a file in the data folder.',
    },
    shell_exec: {
      icon: '💻',
      color: 'text-red-300',
      bgColor: 'bg-red-900',
      bodyTintClass: 'bg-[#1a0a0a]',
      description: 'Executes a shell command (local system).',
    },
    delay: {
      icon: '⏳',
      color: 'text-gray-300',
      bgColor: 'bg-gray-700',
      bodyTintClass: 'bg-[#1a1a1a]',
      description: 'Pauses execution for a set duration.',
    },
    human_approval: {
      icon: '🛑',
      color: 'text-red-400',
      bgColor: 'bg-red-900',
      bodyTintClass: 'bg-[#1a0a0a]',
      description: 'Pauses execution until user approves. Define context for review.',
    },
    cron_trigger: {
      icon: '⏰',
      color: 'text-yellow-400',
      bgColor: 'bg-yellow-900',
      bodyTintClass: 'bg-[#1a150a]',
      description: 'Trigger circuit on schedule (e.g. daily, hourly).',
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
        return 'Enter your prompt or data... (e.g., "What are the main themes in classic literature?")'
      case 'ai_processor':
        return 'System prompt or analysis instructions. Use {{input}} to reference previous output.'
      case 'script_execution':
        return 'Transform template. Use {{input}} to reference previous output. (e.g., "Extract first 200 chars: {{input}}")'
      case 'log_entry':
        return 'Optional: Label for output (e.g., "Final Result")'
      case 'image_gen':
        return 'Negative prompt - what to avoid (e.g., "blurry, low quality, distorted")'
      case 'markdown':
        return 'Write notes or documentation here...'
      case 'data_loader':
        return 'File path in data folder (e.g., data.csv, reports/summary.pdf)\n\nOr use public data:\n- Project Gutenberg books\n- Your local files'
      case 'conditional':
        return 'Condition value (e.g., "error" to check if input contains "error")'
      case 'web_fetch':
        return 'URL to fetch (e.g., https://www.gutenberg.org/files/1342/1342-0.txt)\n\nOr use {{input}} to use previous cell output as URL\n\nExamples:\n- Project Gutenberg: https://www.gutenberg.org/files/1342/1342-0.txt\n- data.gov API: https://api.data.gov/regulations/v3/documents.json'
      case 'vector_index':
        return 'File path to index (e.g., documents/guide.pdf)\n\nFiles will be chunked and added to vector store for semantic search.'
      case 'vector_search':
        return 'Search query (e.g., "What are the main themes?")\n\nOr use {{input}} to search using previous cell output'
      case 'terminal_history':
        return 'JSON query: {"search": "keyword", "types": ["user", "ai"], "limit": 10}\n\nOr just text to search all terminal history'
      case 'music_gen':
        return 'Describe the music style (e.g., "Upbeat techno with synth leads", "Acoustic guitar ballad")...'
      case 'qdc_upload':
        return 'Artifact path to upload (e.g., /Users/me/model.onnx or ./artifacts/package.zip)'
      case 'qdc_run':
        return 'Remote job instructions (e.g., "Benchmark this model and summarize latency/accuracy")'
      case 'qdc_status':
      case 'qdc_results':
        return 'QDC job id (e.g., qdc-job-1234abcd)'
      case 'human_approval':
        return 'Context for approval (e.g., "Please review the generated email:\n\n{{input}}")'
      case 'human_approval':
        return 'Context for approval (e.g., "Please review the generated email:\n\n{{input}}")'
      case 'cron_trigger':
        return '* * * * *'
      case 'notification':
        return 'Title and body (use {{input}} for previous output)'
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
    <div
      className={`module-chip group ${isExpanded ? 'ring-1 ring-phosphor shadow-glow-sm' : ''}`}
      onClick={(e) => {
        // Don't trigger if clicking buttons/inputs to avoid conflicts
        if ((e.target as HTMLElement).tagName.match(/BUTTON|INPUT|TEXTAREA|SELECT|A/)) return
        onExpand?.()
      }}
    >
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
      <div className={`p-4 border-l-2 ${config.bodyTintClass}`} style={{ borderLeftColor: 'rgba(51,255,0,0.2)' }}>
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
                    className={`px-2 py-0.5 text-[10px] font-bold transition-none ${cell.modelSlot === slot
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
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-terminal-muted">Model:</span>
              <select
                value={cell.model || modelSlots.IMAGE || 'sdxl'}
                onChange={(e) => onUpdate({ model: e.target.value })}
                className="bg-black/30 border border-terminal-border text-[10px] font-bold px-1.5 py-0.5 rounded focus:outline-none focus:border-[#ff69b4]"
                style={{ color: '#ff69b4' }}
                title="Select image generation model"
              >
                <optgroup label="Cloud Models">
                  <option value="openai:dall-e-3">openai:dall-e-3</option>
                  <option value="gemini:imagen-3.0-generate-002">gemini:imagen-3.0</option>
                </optgroup>
                <optgroup label="Local Models">
                  {availableImageModels.map((m) => (
                    <option key={m.name} value={m.type === 'ollama' ? `ollama:${m.name}` : m.name}>
                      {m.name} {m.vram !== 'unknown' ? `(${m.vram})` : ''}
                    </option>
                  ))}
                  {availableImageModels.length === 0 && (
                    <option value="sdxl" disabled>Loading local models...</option>
                  )}
                </optgroup>
              </select>
            </div>
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
          {validationError && (
            <div className="mb-3 border border-amber-500/60 bg-amber-900/15 p-2">
              <div className="text-[9px] uppercase tracking-widest text-amber-400">Validation</div>
              <div className="text-[10px] text-amber-300 mt-1">{validationError}</div>
            </div>
          )}

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


          {cell.content && (
            <span className="text-xs text-phosphor font-mono truncate flex-1">
              {cell.content}
            </span>
          )}
        </div>

        {/* Content Area - Data Loader */}
        {cell.type === 'data_loader' && (
          <>
            {/* Manual path input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={editContent}
                onChange={(e) => {
                  setEditContent(e.target.value)
                  onUpdate({ content: e.target.value })
                }}
                onFocus={onExpand}
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
                    className={`px-2 py-1 text-[10px] border ${cell.readMode === mode
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
        )
        }

        {/* Content Area - Conditional cell */}
        {
          cell.type === 'conditional' && (
            <>
              <div className="mb-3">
                <div className="text-[10px] text-terminal-muted mb-2">Condition Type:</div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(['regex', 'keyword', 'length', 'contains', 'ai_check'] as const).map((type) => (
                    <button
                      key={type}
                      onClick={() => onUpdate({ conditionType: type })}
                      className={`px-2 py-1 text-[10px] border ${cell.conditionType === type
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
                        onFocus={onExpand}
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
                          onFocus={onExpand}
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
                          onFocus={onExpand}
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
                          onFocus={onExpand}
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
                          onFocus={onExpand}
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
                  onFocus={onExpand}
                  placeholder={getPlaceholder()}
                  className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-purple-500 min-h-[60px]"
                />
              </div>
            </>
          )
        }

        {/* Content Area - Web Fetch cell */}
        {
          cell.type === 'web_fetch' && (
            <>
              <div className="mb-3">
                <div className="text-[10px] text-terminal-muted mb-2">HTTP Method:</div>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(['GET', 'POST', 'PUT', 'DELETE'] as const).map((method) => (
                    <button
                      key={method}
                      onClick={() => onUpdate({ fetchMethod: method })}
                      className={`px-2 py-1 text-[10px] border ${(cell.fetchMethod || 'GET') === method
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
                      onFocus={onExpand}
                      placeholder="https://www.gutenberg.org/files/1342/1342-0.txt"
                      className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-blue-500"
                    />
                    <div className="text-[9px] text-terminal-muted mt-1 space-y-0.5">
                      <div>Quick examples:</div>
                      <div className="flex flex-wrap gap-1">
                        <button
                          onClick={() => {
                            setEditContent('https://www.gutenberg.org/files/1342/1342-0.txt')
                            onUpdate({ content: 'https://www.gutenberg.org/files/1342/1342-0.txt' })
                          }}
                          className="px-1.5 py-0.5 border border-terminal-border hover:border-blue-500 text-[9px]"
                          title="Pride and Prejudice from Project Gutenberg"
                        >
                          📚 Pride & Prejudice
                        </button>
                        <button
                          onClick={() => {
                            setEditContent('https://www.gutenberg.org/files/84/84-0.txt')
                            onUpdate({ content: 'https://www.gutenberg.org/files/84/84-0.txt' })
                          }}
                          className="px-1.5 py-0.5 border border-terminal-border hover:border-blue-500 text-[9px]"
                          title="Frankenstein from Project Gutenberg"
                        >
                          📚 Frankenstein
                        </button>
                        <button
                          onClick={() => {
                            setEditContent('https://api.github.com/repos/ollama/ollama')
                            onUpdate({ content: 'https://api.github.com/repos/ollama/ollama' })
                          }}
                          className="px-1.5 py-0.5 border border-terminal-border hover:border-blue-500 text-[9px]"
                          title="GitHub API example"
                        >
                          🔗 GitHub API
                        </button>
                        <button
                          onClick={() => {
                            setEditContent('https://api.data.gov/regulations/v3/documents.json?rpp=5')
                            onUpdate({ content: 'https://api.data.gov/regulations/v3/documents.json?rpp=5' })
                          }}
                          className="px-1.5 py-0.5 border border-terminal-border hover:border-blue-500 text-[9px]"
                          title="data.gov API example"
                        >
                          📊 data.gov
                        </button>
                      </div>
                    </div>
                  </div>

                  {(cell.fetchMethod === 'POST' || cell.fetchMethod === 'PUT') && (
                    <div>
                      <label className="text-[10px] text-terminal-muted block mb-1">Body (can use {'{{input}}'}):</label>
                      <textarea
                        value={cell.fetchBody || ''}
                        onChange={(e) => onUpdate({ fetchBody: e.target.value })}
                        placeholder='{"key": "value"} or {{{{input}}}}'
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
          )
        }

        {/* Content Area - Human Approval cell */}
        {
          cell.type === 'human_approval' && (
            <div className="space-y-4">
              {cell.status === 'running' ? (
                // Active Approval State
                <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-4 animate-pulse">
                  <div className="flex items-center gap-2 text-red-400 font-bold mb-2 uppercase tracking-wider text-xs">
                    <span className="text-lg">✋</span> Approval Required
                  </div>
                  <div className="text-sm text-terminal-text mb-4 whitespace-pre-wrap font-mono bg-black/50 p-3 rounded border border-red-500/20">
                    {/* We need to get the context message from the execution state via bus, but NotebookCell doesn't sub to bus directly. 
                          Ideally we'd read from cell.output or a prop, but for now we'll show a generic message or rely on parent component if we can.
                          Actually, let's just show instruction since the context is usually in {{input}}.
                          Better yet, the LinearView approach was to use the bus. 
                          Since we are in NotebookCell, we can maybe just show controls.
                      */}
                    Review the input/context above or in separate view.
                  </div>
                  <div className="flex justify-end gap-3">
                    {/* 
                         NOTE: NotebookCell doesn't have direct access to 'approve/reject' functions unless passed down 
                         or imported from hooks. We can import circuitExecutionBus here.
                       */}
                    <button
                      onClick={() => import('../../hooks/useCircuitRunner').then(m => m.circuitExecutionBus.reject())}
                      className="px-4 py-2 bg-red-950 border border-red-600 text-red-400 rounded hover:bg-red-900 transition-colors uppercase text-xs font-bold"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => import('../../hooks/useCircuitRunner').then(m => m.circuitExecutionBus.approve('Approved from UI'))}
                      className="px-4 py-2 bg-green-900/30 border border-green-500 text-green-400 rounded hover:bg-green-900/50 transition-colors uppercase text-xs font-bold shadow-glow"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              ) : (
                // Config State
                <div>
                  <label className="text-[10px] text-terminal-muted block mb-1">Approval Context/Message (use {'{{input}}'}):</label>
                  <textarea
                    value={editContent}
                    onChange={(e) => {
                      setEditContent(e.target.value)
                    }}
                    onBlur={() => {
                      onUpdate({ content: editContent })
                      setIsEditing(false)
                    }}
                    onKeyDown={handleKeyDown}
                    onFocus={onExpand}
                    placeholder={getPlaceholder()}
                    className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-red-500 min-h-[80px]"
                  />
                </div>
              )}
            </div>
          )
        }

        {/* Content Area - Music Gen cell */}
        {
          cell.type === 'music_gen' && (
            <div className="mb-4 space-y-4">
              {/* Mode Toggle & Knobs */}
              <div className="grid grid-cols-2 gap-4 p-3 bg-black/20 rounded border border-terminal-border">
                <div>
                  <label className="text-[10px] text-terminal-muted block mb-2 uppercase tracking-wider">Mode</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => onUpdate({ musicUseLyrics: false })}
                      className={`px-3 py-1.5 text-xs font-bold border rounded ${!cell.musicUseLyrics ? 'bg-violet-600 border-violet-500 text-white' : 'bg-transparent border-terminal-border text-terminal-muted hover:border-violet-500/50'}`}
                    >
                      Instrumental
                    </button>
                    <button
                      onClick={() => onUpdate({ musicUseLyrics: true })}
                      className={`px-3 py-1.5 text-xs font-bold border rounded ${cell.musicUseLyrics ? 'bg-violet-600 border-violet-500 text-white' : 'bg-transparent border-terminal-border text-terminal-muted hover:border-violet-500/50'}`}
                    >
                      Lyrical
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Advanced Task Control */}
                  <div className="p-2 border border-violet-500/30 rounded bg-violet-900/10">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] text-terminal-muted uppercase tracking-wider">Generation Task</label>
                      <select
                        value={cell.musicTask || 'text2music'}
                        onChange={(e) => onUpdate({ musicTask: e.target.value as NonNullable<CellData['musicTask']> })}
                        className="bg-black/40 border border-violet-500/50 text-violet-300 text-[10px] rounded px-2 py-0.5 focus:outline-none"
                      >
                        <option value="text2music">Text to Music</option>
                        <option value="audio2audio">Remix (Audio2Audio)</option>
                        <option value="repaint">Inpaint (Repaint)</option>
                        <option value="edit">Edit (Instruction)</option>
                        <option value="extend">Extend (Outpaint)</option>
                      </select>
                    </div>

                    {/* Task Specific Inputs */}
                    {cell.musicTask && cell.musicTask !== 'text2music' && (
                      <div className="space-y-2 mt-2 pt-2 border-t border-violet-500/20">
                        {/* Source Audio Input */}
                        <div>
                          <label className="text-[10px] text-terminal-muted block mb-1">Source Audio (path/URL or {'{{input}}'})</label>
                          <input
                            type="text"
                            value={cell.musicSourceAudio || ''}
                            onChange={(e) => onUpdate({ musicSourceAudio: e.target.value })}
                            placeholder="{{input}}"
                            className="w-full bg-black/40 border border-violet-500/30 text-violet-200 text-[10px] rounded p-1.5 focus:border-violet-500"
                          />
                        </div>

                        {/* Audio2Audio Strength */}
                        {cell.musicTask === 'audio2audio' && (
                          <div>
                            <div className="flex justify-between text-[10px] text-terminal-muted mb-1">
                              <span>Remix Strength</span>
                              <span className="text-violet-400">{cell.musicRefStrength || 0.5}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.05"
                              value={cell.musicRefStrength || 0.5}
                              onChange={(e) => onUpdate({ musicRefStrength: parseFloat(e.target.value) })}
                              className="w-full accent-violet-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        )}

                        {/* Repaint/Extend Ranges */}
                        {(cell.musicTask === 'repaint' || cell.musicTask === 'extend') && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-[10px] text-terminal-muted block mb-1">Start Time (s)</label>
                              <input
                                type="number"
                                value={cell.musicRepaintStart || 0}
                                onChange={(e) => onUpdate({ musicRepaintStart: parseFloat(e.target.value) })}
                                className="w-full bg-black/40 border border-violet-500/30 text-violet-200 text-[10px] rounded p-1.5"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-terminal-muted block mb-1">End Time (s)</label>
                              <input
                                type="number"
                                value={cell.musicRepaintEnd || 0}
                                onChange={(e) => onUpdate({ musicRepaintEnd: parseFloat(e.target.value) })}
                                className="w-full bg-black/40 border border-violet-500/30 text-violet-200 text-[10px] rounded p-1.5"
                              />
                            </div>
                          </div>
                        )}

                        {/* Edit Target Prompt */}
                        {cell.musicTask === 'edit' && (
                          <div>
                            <label className="text-[10px] text-terminal-muted block mb-1">Target Prompt</label>
                            <input
                              type="text"
                              value={cell.musicTargetPrompt || ''}
                              onChange={(e) => onUpdate({ musicTargetPrompt: e.target.value })}
                              placeholder="e.g. Add drums"
                              className="w-full bg-black/40 border border-violet-500/30 text-violet-200 text-[10px] rounded p-1.5"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex justify-between text-[10px] text-terminal-muted mb-1">
                      <span>Duration</span>
                      <span className="text-violet-400">{cell.musicDuration || 10}s</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="300"
                      step="5"
                      value={cell.musicDuration || 10}
                      onChange={(e) => onUpdate({ musicDuration: parseInt(e.target.value) })}
                      className="w-full accent-violet-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[10px] text-terminal-muted mb-1">
                        <span>Guidance</span>
                        <span className="text-violet-400">{cell.musicGuidance || 7.0}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="20"
                        step="0.5"
                        value={cell.musicGuidance || 7.0}
                        onChange={(e) => onUpdate({ musicGuidance: parseFloat(e.target.value) })}
                        className="w-full accent-violet-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-terminal-muted mb-1">
                        <span>Steps</span>
                        <span className="text-violet-400">{cell.musicSteps || 20}</span>
                      </div>
                      <input
                        type="range"
                        min="10"
                        max="50"
                        step="1"
                        value={cell.musicSteps || 20}
                        onChange={(e) => onUpdate({ musicSteps: parseInt(e.target.value) })}
                        className="w-full accent-violet-500 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Lyrics Input */}
              {cell.musicUseLyrics && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                  <label className="text-[10px] text-terminal-muted block mb-1">Lyrics</label>
                  <textarea
                    value={cell.musicLyrics || ''}
                    onChange={(e) => onUpdate({ musicLyrics: e.target.value })}
                    placeholder="Enter lyrics here..."
                    className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-violet-500 min-h-[80px]"
                  />
                </div>
              )}

              <div className="text-[10px] text-terminal-muted">Music Style / Prompt:</div>
            </div>
          )
        }

        {/* Content Area - Vector Search cell */}
        {
          cell.type === 'vector_search' && (
            <>
              <div className="mb-3">
                <label className="text-[10px] text-terminal-muted block mb-1">Search Query (or use {'{{input}}'}):</label>
                <textarea
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value)
                    onUpdate({ content: e.target.value })
                  }}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSave}
                  placeholder='What are the main themes?'
                  className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-yellow-500 min-h-[60px] resize-none"
                />
                <div className="text-[9px] text-terminal-muted mt-1 space-y-0.5">
                  <div>Example queries:</div>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => {
                        setEditContent('What are the main themes?')
                        onUpdate({ content: 'What are the main themes?' })
                      }}
                      className="px-1.5 py-0.5 border border-terminal-border hover:border-yellow-500 text-[9px]"
                    >
                      Main themes
                    </button>
                    <button
                      onClick={() => {
                        setEditContent('Summarize key concepts')
                        onUpdate({ content: 'Summarize key concepts' })
                      }}
                      className="px-1.5 py-0.5 border border-terminal-border hover:border-yellow-500 text-[9px]"
                    >
                      Key concepts
                    </button>
                    <button
                      onClick={() => {
                        setEditContent('Find relevant examples')
                        onUpdate({ content: 'Find relevant examples' })
                      }}
                      className="px-1.5 py-0.5 border border-terminal-border hover:border-yellow-500 text-[9px]"
                    >
                      Examples
                    </button>
                  </div>
                  <div className="text-[8px] mt-1">Tip: Use {'{{input}}'} to search using previous cell output</div>
                </div>
              </div>
            </>
          )
        }

        {/* Content Area - Vector Index cell */}
        {
          cell.type === 'vector_index' && (
            <>
              <div className="mb-3">
                <div className="text-[10px] text-terminal-muted mb-2">File to Index:</div>
                <div className="flex items-center gap-2 mb-2">
                  <button
                    onClick={() => setShowFilePicker(true)}
                    className="btn-terminal text-xs flex items-center gap-2"
                    style={{ borderColor: '#00ff00', color: '#00ff00' }}
                  >
                    📁 Browse Files
                  </button>
                  {cell.content && (
                    <span className="text-xs text-phosphor font-mono truncate flex-1">
                      {cell.content}
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value)
                    onUpdate({ content: e.target.value })
                  }}
                  placeholder="Enter file path (e.g., documents/guide.pdf)"
                  className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-green-500"
                />
                <div className="text-[9px] text-terminal-muted mt-1">
                  Files will be chunked and indexed for semantic search. Use INDEX before SEARCH.
                </div>
                <FilePicker
                  isOpen={showFilePicker}
                  onClose={() => setShowFilePicker(false)}
                  onSelect={(path) => {
                    setEditContent(path)
                    onUpdate({ content: path })
                  }}
                />
              </div>
            </>
          )
        }

        {/* Content Area - Cron Cell */}
        {
          cell.type === 'cron_trigger' && (
            <CronCell
              module={cell}
              updateModule={(_: string, updates: Partial<CellData>) => onUpdate(updates)}
              isReadOnly={false}
            />
          )
        }

        {/* Content Area - Notification Cell */}
        {
          cell.type === 'notification' && (() => {
            const perm = typeof Notification !== 'undefined' ? Notification.permission : null
            const handleTestNotification = async () => {
              if (typeof Notification === 'undefined') return
              if (Notification.permission === 'denied') return
              if (Notification.permission !== 'granted') {
                const p = await Notification.requestPermission()
                if (p !== 'granted') return
              }
              const title = (cell.notificationTitle || 'Loom Alert').trim() || 'Loom Alert'
              new Notification(title, { body: 'If you see this, desktop notifications are working.' })
            }
            return (
              <div className="flex flex-col gap-3 p-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[10px] text-terminal-muted uppercase tracking-widest">
                    Permission: {perm === 'granted' ? <span className="text-green-400">Granted</span> : perm === 'denied' ? <span className="text-red-400">Denied</span> : perm === 'default' ? <span className="text-amber-400">Not set</span> : 'N/A'}
                  </span>
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    disabled={perm === 'denied'}
                    className="text-[10px] uppercase tracking-wider px-2 py-1 bg-void border border-terminal-border text-phosphor hover:border-phosphor disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {perm === 'denied' ? 'Blocked' : 'Test notification'}
                  </button>
                </div>
                {perm === 'denied' && (
                  <p className="text-[10px] text-red-400">Allow notifications for this site in Chrome (lock icon in address bar) or System Settings → Notifications → Chrome.</p>
                )}
                {perm === 'granted' && (
                  <p className="text-[10px] text-terminal-muted">To get pop-up banners over other apps: System Settings → Notifications → Google Chrome → set to &quot;Alert&quot;. Otherwise alerts may only appear in Notification Center (top-right).</p>
                )}
                <div>
                  <label className="text-[10px] text-terminal-muted uppercase tracking-widest block mb-1">Title</label>
                <input
                  type="text"
                  value={cell.notificationTitle ?? 'Loom Alert'}
                  onChange={(e) => onUpdate({ notificationTitle: e.target.value })}
                  placeholder="Loom Alert"
                  className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm focus:outline-none focus:border-phosphor"
                />
              </div>
              <div>
                <label className="text-[10px] text-terminal-muted uppercase tracking-widest block mb-1">Message body</label>
                <textarea
                  value={cell.notificationBody ?? '{{input}}'}
                  onChange={(e) => onUpdate({ notificationBody: e.target.value })}
                  placeholder="Use {{input}} for previous cell output"
                  rows={3}
                  className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm resize-none focus:outline-none focus:border-phosphor"
                />
                <div className="text-[10px] text-terminal-muted mt-1">Use <code className="bg-void px-1">{'{{input}}'}</code> to insert the previous cell&apos;s output.</div>
              </div>
            </div>
            )
          })()
        }

        {/* Fallback for standard text inputs */}
        {
          cell.type !== 'data_loader' &&
          cell.type !== 'conditional' &&
          cell.type !== 'web_fetch' &&
          cell.type !== 'cron_trigger' &&
          cell.type !== 'human_approval' &&
          cell.type !== 'music_gen' &&
          cell.type !== 'vector_search' &&
          cell.type !== 'vector_index' &&
          cell.type !== 'notification' && (
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
          )
        }

        {/* Output Section */}
        {
          (cell.output || cell.status === 'running' || cell.error) && (
            <div className={`mt-3 p-3 border ${cell.error ? 'bg-red-900/20 border-red-500' : 'bg-void/50 border-phosphor-dim'}`}>
              <div className={`text-[10px] uppercase tracking-widest mb-2 ${cell.error ? 'text-red-400' : 'text-phosphor-dim'}`}>
                {cell.error ? 'ERROR' : 'OUTPUT'}
              </div>

              {/* Music output */}
              {cell.type === 'music_gen' && cell.output?.startsWith('http') ? (
                <div className="mt-2">
                  <MusicPlayerCard
                    audioUrl={cell.output}
                    prompt={cell.musicStyle || 'Generated Music'}
                    duration={cell.musicDuration || 10}
                    onDownload={() => {
                      const link = document.createElement('a')
                      link.href = cell.output!
                      link.download = `music-${Date.now()}.wav`
                      document.body.appendChild(link)
                      link.click()
                      document.body.removeChild(link)
                    }}
                  />
                </div>
              ) : cell.type === 'image_gen' && cell.output?.startsWith('data:image') ? (
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
          )
        }
      </div>

      {
        isExpanded && onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="fixed right-6 top-1/2 -translate-y-1/2 z-[100] p-2 border border-phosphor bg-void text-phosphor text-xs hover:bg-phosphor hover:text-void transition-colors"
            title="Collapse to max height"
          >
            ◫
          </button>
        )
      }

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
          disabled={cell.status === 'running' || !!validationError}
          className="btn-terminal text-xs disabled:opacity-50"
          title={validationError || 'Run this cell'}
        >
          {cell.status === 'running' ? 'Running...' : validationError ? 'Fix to Run' : 'Run'}
        </button>
      </div>
    </div>
  )
}
