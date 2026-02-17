import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import type { ModuleType, ModuleStatus } from '../../types/module'

interface ModuleNodeData {
  label: string
  moduleType: ModuleType
  status: ModuleStatus
  content: string
}

export const ModuleNode = memo(({ data, selected }: NodeProps<ModuleNodeData>) => {
  const { label, moduleType, status, content } = data

  const statusColors: Record<ModuleStatus, string> = {
    idle: 'led-idle',
    running: 'led-running',
    success: 'led-success',
    error: 'led-error',
  }

  const typeIcons: Record<ModuleType, string> = {
    data_input: '▶',
    ai_processor: '◆',
    script_execution: '⚙',
    log_entry: '◀',
    image_gen: '🎨',
    markdown: '📝',
    data_loader: '📁',
    conditional: '⚡',
    web_fetch: '🌐',
    vector_index: '📚',
    vector_search: '🔍',
    terminal_history: '📜',
    music_gen: '🎵',
    qdc_upload: '📡',
    qdc_run: '🚀',
    qdc_status: '🛰',
    qdc_results: '📥',
    notification: '🔔',
    telegram_send: '✈️',
    file_write: '💾',
    shell_exec: '💻',
    delay: '⏳',
    human_approval: '👍',
    cron_trigger: '⏰',
  }

  const headerColors: Record<ModuleType, string> = {
    data_input: 'bg-phosphor text-void',
    ai_processor: 'bg-amber-500 text-void',
    script_execution: 'bg-cyan-500 text-void',
    log_entry: 'bg-phosphor-dim text-void',
    image_gen: 'bg-pink-500 text-void',
    markdown: 'bg-gray-600 text-white',
    data_loader: 'bg-cyan-600 text-white',
    conditional: 'bg-purple-600 text-white',
    web_fetch: 'bg-blue-600 text-white',
    vector_index: 'bg-emerald-600 text-white',
    vector_search: 'bg-indigo-600 text-white',
    terminal_history: 'bg-orange-600 text-white',
    music_gen: 'bg-violet-600 text-white',
    qdc_upload: 'bg-teal-600 text-white',
    qdc_run: 'bg-emerald-600 text-white',
    qdc_status: 'bg-sky-700 text-white',
    qdc_results: 'bg-indigo-700 text-white',
    notification: 'bg-yellow-600 text-white',
    telegram_send: 'bg-sky-600 text-white',
    file_write: 'bg-stone-600 text-white',
    shell_exec: 'bg-red-900 text-white',
    delay: 'bg-stone-500 text-white',
    human_approval: 'bg-lime-600 text-white',
    cron_trigger: 'bg-slate-600 text-white',
  }

  return (
    <div
      className={`
        module-chip min-w-[180px]
        ${selected ? 'shadow-glow' : ''}
        ${status === 'running' ? 'animate-pulse-glow' : ''}
      `}
    >
      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!w-3 !h-3 !bg-void !border !border-phosphor !rounded-none"
      />

      {/* Header */}
      <div className={`${headerColors[moduleType]} px-3 py-1.5 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span className="text-sm">{typeIcons[moduleType]}</span>
          <span className="font-mono text-xs font-bold tracking-wider">
            {label}
          </span>
        </div>
        <div className={`led ${statusColors[status]}`} />
      </div>

      {/* Body */}
      <div className="p-3 bg-slate">
        {/* Module Type Indicator */}
        <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-2">
          TYPE: {moduleType.replace('_', ' ')}
        </div>

        {/* Content */}
        {content && (
          <div className="text-xs text-phosphor font-mono truncate">
            {content}
          </div>
        )}

        {/* Status Bar */}
        <div className="mt-3 pt-2 border-t border-terminal-border flex items-center justify-between">
          <div className="text-[10px] text-terminal-muted">
            STATUS: <span className={status === 'error' ? 'text-red-400' : 'text-phosphor'}>{status.toUpperCase()}</span>
          </div>
          {status === 'running' && (
            <div className="text-[10px] text-amber-500 animate-pulse">
              ●●●
            </div>
          )}
        </div>
      </div>

      {/* Output Handle */}
      <Handle
        type="source"
        position={Position.Right}
        className="!w-3 !h-3 !bg-void !border !border-phosphor !rounded-none"
      />
    </div>
  )
})

ModuleNode.displayName = 'ModuleNode'
