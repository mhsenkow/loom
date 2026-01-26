import { useCircuitExecution } from '../../hooks/useCircuitRunner'

const CELL_TYPE_ICONS: Record<string, string> = {
  data_input: '▶',
  ai_processor: '◆',
  script_execution: '⚙',
  log_entry: '◀',
  image_gen: '◎',
  markdown: '¶',
  data_loader: '▤',
  conditional: '⚡',
  web_fetch: '🌐',
  vector_index: '📚',
  vector_search: '🔍',
  terminal_history: '📜',
}

export function CircuitTrace() {
  const execution = useCircuitExecution()
  
  if (!execution) return null
  
  const isRunning = execution.status === 'running'
  const isSuccess = execution.status === 'success'
  const isError = execution.status === 'error'
  
  return (
    <div className="w-56 h-full border-l border-terminal-border bg-void/50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-terminal-border bg-slate/30">
        <div className="flex items-center gap-2">
          <span className={`led ${isRunning ? 'led-running' : isSuccess ? 'led-success' : isError ? 'led-error' : 'led-idle'}`} />
          <span className="text-[9px] tracking-widest text-amber-500/80">
            CIRCUIT
          </span>
        </div>
        <div className="text-[11px] text-amber-400 font-mono mt-1 truncate">
          /{execution.circuitName}
        </div>
      </div>
      
      {/* Steps */}
      <div className="flex-1 overflow-y-auto">
        {execution.steps.map((step, index) => (
          <div 
            key={index}
            className={`px-3 py-2 border-b border-terminal-border/30 ${
              step.status === 'running' ? 'bg-amber-900/20' :
              step.status === 'success' ? 'bg-green-900/10' :
              step.status === 'error' ? 'bg-red-900/20' :
              ''
            }`}
          >
            {/* Step header */}
            <div className="flex items-center gap-2">
              <span className={`text-[10px] ${
                step.status === 'running' ? 'text-amber-500 animate-pulse' :
                step.status === 'success' ? 'text-green-600' :
                step.status === 'error' ? 'text-red-500' :
                'text-terminal-muted/50'
              }`}>
                {CELL_TYPE_ICONS[step.cellType] || '○'}
              </span>
              <span className={`text-[9px] font-mono tracking-wide ${
                step.status === 'running' ? 'text-amber-400' :
                step.status === 'success' ? 'text-green-500/70' :
                step.status === 'error' ? 'text-red-400' :
                'text-terminal-muted/40'
              }`}>
                {step.cellLabel}
              </span>
              {step.status === 'running' && (
                <span className="text-[8px] text-amber-500/60 ml-auto">●●●</span>
              )}
              {step.status === 'success' && (
                <span className="text-[8px] text-green-600/60 ml-auto">✓</span>
              )}
            </div>
            
            {/* Step output preview */}
            {step.output && step.status !== 'pending' && (
              <div className={`mt-1 text-[9px] font-mono leading-tight max-h-16 overflow-hidden ${
                step.status === 'running' ? 'text-amber-400/60' :
                step.status === 'success' ? 'text-green-500/40' :
                'text-red-400/60'
              }`}>
                {step.output.slice(0, 150)}{step.output.length > 150 ? '...' : ''}
              </div>
            )}
            
            {/* Error */}
            {step.error && (
              <div className="mt-1 text-[9px] font-mono text-red-400/80">
                {step.error}
              </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Footer */}
      {execution.finalOutput && execution.status === 'success' && (
        <div className="border-t border-terminal-border bg-green-900/10 px-3 py-2">
          <div className="text-[8px] text-green-500/60 tracking-widest mb-1">OUTPUT</div>
          <div className="text-[10px] text-green-400/80 font-mono line-clamp-3">
            {execution.finalOutput.slice(0, 200)}
          </div>
        </div>
      )}
      
      {/* Close hint */}
      <div className="px-3 py-1 border-t border-terminal-border/30 text-center">
        <span className="text-[8px] text-terminal-muted/30">
          {isRunning ? 'processing...' : 'closes in 5s'}
        </span>
      </div>
    </div>
  )
}
