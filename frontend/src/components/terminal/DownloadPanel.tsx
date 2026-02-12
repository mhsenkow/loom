import { useEffect, useState, useRef } from 'react'
import { API_BASE_URL } from '../../config/api'

interface DownloadProgress {
  model: string
  status: string
  completed: number
  total: number
  percent?: number
  message?: string
  error?: string
}

interface DownloadPanelProps {
  progress: DownloadProgress | null
  onClose?: () => void
}

// ASCII art animations for download progress
const ASCII_FRAMES = [
  ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▂'],
  ['◐', '◓', '◑', '◒'],
  ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
]

// Model information database
const MODEL_INFO: Record<string, { description: string; size: string; use: string }> = {
  'mistral': { description: 'Mistral 7B - Fast, efficient, great for general tasks', size: '~4.1GB', use: 'General purpose chat and reasoning' },
  'mistral:latest': { description: 'Mistral 7B - Fast, efficient, great for general tasks', size: '~4.1GB', use: 'General purpose chat and reasoning' },
  'llama3.1:8b': { description: 'Llama 3.1 8B - Excellent balance of quality and speed', size: '~4.7GB', use: 'Best overall performance' },
  'llama3.1:70b': { description: 'Llama 3.1 70B - Highest quality, requires significant RAM', size: '~40GB', use: 'Complex reasoning and analysis' },
  'phi3:mini': { description: 'Microsoft Phi-3 Mini - Ultra-efficient, great for coding', size: '~2.3GB', use: 'Fast inference, coding tasks' },
  'codellama': { description: 'CodeLlama - Specialized for code generation', size: '~3.8GB', use: 'Programming and code assistance' },
  'tinyllama': { description: 'TinyLlama - Ultra-lightweight, fastest inference', size: '~0.6GB', use: 'Quick responses, low resource' },
}

export function DownloadPanel({ progress, onClose }: DownloadPanelProps) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [modelInfo, setModelInfo] = useState<{ description: string; size: string; use: string } | null>(null)
  const [downloadSpeed, setDownloadSpeed] = useState<number>(0)
  const lastUpdateRef = useRef<{ time: number; bytes: number } | null>(null)

  // Animate spinner
  useEffect(() => {
    if (!progress || progress.status === 'success' || progress.status === 'error') return

    const interval = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % ASCII_FRAMES[2].length)
    }, 150)

    return () => clearInterval(interval)
  }, [progress])

  // Calculate download speed
  useEffect(() => {
    if (!progress || progress.status === 'success' || progress.status === 'error') return
    if (progress.completed === 0) return

    const now = Date.now()
    const last = lastUpdateRef.current

    if (last) {
      const timeDelta = (now - last.time) / 1000 // seconds
      const bytesDelta = progress.completed - last.bytes
      
      if (timeDelta > 0) {
        const speed = bytesDelta / timeDelta // bytes per second
        setDownloadSpeed(speed)
      }
    }

    lastUpdateRef.current = { time: now, bytes: progress.completed }
  }, [progress?.completed, progress?.status])

  // Get model info from backend
  useEffect(() => {
    if (progress?.model) {
      // Try local first
      const localInfo = MODEL_INFO[progress.model] || MODEL_INFO[progress.model.split(':')[0]]
      if (localInfo) {
        setModelInfo(localInfo)
      } else {
        // Fetch from backend
        fetch(`${API_BASE_URL}/api/model-info/${encodeURIComponent(progress.model)}`)
          .then(res => res.json())
          .then(data => {
            if (data.error) return
            setModelInfo({
              description: data.description || 'Model information',
              size: data.size || 'Unknown',
              use: data.use || 'General purpose',
            })
          })
          .catch(err => {
            console.warn('[LOOM] Failed to fetch model info:', err)
          })
      }
    }
  }, [progress?.model])

  if (!progress) return null

  const isRunning = progress.status !== 'success' && progress.status !== 'error'
  const isSuccess = progress.status === 'success'
  const isError = progress.status === 'error'
  const spinner = ASCII_FRAMES[2][frameIndex]

  // Calculate progress bar
  const percent = progress.percent ?? (progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0)
  const mbCompleted = (progress.completed / (1024 * 1024)).toFixed(1)
  const mbTotal = progress.total > 0 ? (progress.total / (1024 * 1024)).toFixed(1) : '?'

  // ASCII progress bar
  const barWidth = 20
  const filled = Math.round((percent / 100) * barWidth)
  const progressBar = '█'.repeat(filled) + '░'.repeat(barWidth - filled)

  return (
    <div 
      className="w-full sm:w-64 h-full border-l border-terminal-border bg-void/50 flex flex-col overflow-hidden cursor-pointer hover:bg-void/60 transition-colors"
      onClick={onClose}
      title="Click to close"
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-terminal-border bg-slate/30">
        <div className="flex items-center gap-2">
          <span className={`led ${isRunning ? 'led-running' : isSuccess ? 'led-success' : isError ? 'led-error' : 'led-idle'}`} />
          <span className="text-[9px] tracking-widest text-cyan-500/80">
            DOWNLOAD
          </span>
        </div>
        <div className="text-[11px] text-cyan-400 font-mono mt-1 truncate">
          {progress.model}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* ASCII Art Animation */}
        <div className="text-center">
          <pre className="text-[10px] leading-tight text-cyan-400/60 font-mono whitespace-pre">
            {isRunning && (
              <>
{`    ${spinner} DOWNLOADING ${spinner}
     ╔═══════════════╗
     ║               ║
     ║   ${progressBar}   ║
     ║               ║
     ╚═══════════════╝
        ${String(percent).padStart(3, ' ')}%`}
              </>
            )}
            {isSuccess && (
              <>
{`       ✓ SUCCESS!
     ╔═══════════════╗
     ║               ║
     ║   ████████████   ║
     ║               ║
     ╚═══════════════╝
        100%`}
              </>
            )}
            {isError && (
              <>
{`        ✗ ERROR
     ╔═══════════════╗
     ║               ║
     ║   ░░░░░░░░░░░░   ║
     ║               ║
     ╚═══════════════╝
      Download failed`}
              </>
            )}
          </pre>
        </div>

        {/* Progress Info */}
        <div className="space-y-2 text-[9px] font-mono">
          <div className="flex justify-between text-cyan-400/80">
            <span>Status:</span>
            <span className={isRunning ? 'text-cyan-400' : isSuccess ? 'text-green-500' : 'text-red-400'}>
              {progress.status.toUpperCase()}
            </span>
          </div>
          {progress.total > 0 && (
            <>
              <div className="flex justify-between text-cyan-400/80">
                <span>Progress:</span>
                <span>{mbCompleted}MB / {mbTotal}MB</span>
              </div>
              {downloadSpeed > 0 && (
                <>
                  <div className="flex justify-between text-cyan-400/80">
                    <span>Speed:</span>
                    <span>{(downloadSpeed / (1024 * 1024)).toFixed(1)} MB/s</span>
                  </div>
                  {progress.total > 0 && (
                    <div className="flex justify-between text-cyan-400/80">
                      <span>ETA:</span>
                      <span>
                        {(() => {
                          const remaining = progress.total - progress.completed
                          const seconds = Math.ceil(remaining / downloadSpeed)
                          if (seconds < 60) return `${seconds}s`
                          const minutes = Math.floor(seconds / 60)
                          const secs = seconds % 60
                          return `${minutes}m ${secs}s`
                        })()}
                      </span>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Model Information */}
        {modelInfo && (
          <div className="border-t border-terminal-border/30 pt-3 space-y-2">
            <div className="text-[8px] text-cyan-500/60 tracking-widest mb-2">MODEL INFO</div>
            <div className="text-[9px] font-mono space-y-1.5 text-cyan-400/70">
              <div>
                <span className="text-cyan-500/50">Size:</span> {modelInfo.size}
              </div>
              <div className="leading-tight">
                <span className="text-cyan-500/50">Use:</span> {modelInfo.use}
              </div>
              <div className="text-[8px] leading-tight text-cyan-400/50 pt-1">
                {modelInfo.description}
              </div>
            </div>
          </div>
        )}

        {/* Status Message */}
        {progress.message && (
          <div className="border-t border-terminal-border/30 pt-3">
            <div className="text-[8px] text-cyan-500/60 tracking-widest mb-1">STATUS</div>
            <div className="text-[9px] font-mono text-cyan-400/70 leading-tight">
              {progress.message}
            </div>
          </div>
        )}

        {/* Error Message */}
        {progress.error && (
          <div className="border-t border-terminal-border/30 pt-3">
            <div className="text-[8px] text-red-500/60 tracking-widest mb-1">ERROR</div>
            <div className="text-[9px] font-mono text-red-400/80 leading-tight">
              {progress.error}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      {isSuccess && (
        <div className="border-t border-terminal-border bg-green-900/10 px-3 py-2">
          <div className="text-[8px] text-green-500/60 tracking-widest mb-1">READY</div>
          <div className="text-[10px] text-green-400/80 font-mono">
            Model downloaded successfully!
          </div>
        </div>
      )}

      {/* Close hint */}
      <div className="px-3 py-1 border-t border-terminal-border/30 text-center">
        <span className="text-[8px] text-terminal-muted/30">
          {isRunning ? 'downloading...' : isSuccess ? 'closes in 5s' : 'click to close'}
        </span>
      </div>
    </div>
  )
}
