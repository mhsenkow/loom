import { useState, useEffect } from 'react'
import { CRTContainer } from './components/shell/CRTContainer'
import { TitleBar } from './components/shell/TitleBar'
import { TerminalFeed } from './components/terminal/TerminalFeed'
import { CircuitBoard } from './components/circuit/CircuitBoard'
import { SettingsModal, loadSettings, applyTheme } from './components/shell/SettingsModal'
import { useSocket } from './hooks/useSocket'
import { useSystemStatus } from './hooks/useSystemStatus'

type ViewMode = 'terminal' | 'circuit'

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('terminal')
  const [crtEnabled, setCrtEnabled] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Apply saved theme on load
  useEffect(() => {
    const s = loadSettings()
    applyTheme(s.theme)
  }, [])
  
  const { connected: socketConnected } = useSocket()
  const { status, models, setImageGenModel } = useSystemStatus()

  // Format RAM display - show RAM usage only, not model name
  const formatRamDisplay = () => {
    if (status.ramTotalGb && status.ramAvailableForModelsGb !== undefined) {
      const total = status.ramTotalGb
      const modelUsed = status.ramModelUsedGb || 0
      const availableForModels = status.ramAvailableForModelsGb || 0
      
      // Show: "X.XGB used | X.XGB free" or just "X.XGB free" if no model loaded
      if (modelUsed > 0) {
        return `${modelUsed.toFixed(1)}GB used | ${availableForModels.toFixed(1)}GB free`
      } else {
        return `${availableForModels.toFixed(1)}GB free / ${total.toFixed(1)}GB`
      }
    }
    return null
  }

  return (
    <CRTContainer enabled={crtEnabled}>
      <div className="loom-app h-screen w-screen flex flex-col bg-void text-phosphor font-mono overflow-hidden">
        {/* Custom Title Bar */}
        <TitleBar 
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          crtEnabled={crtEnabled}
          onCrtToggle={() => setCrtEnabled(!crtEnabled)}
          onSettingsClick={() => setSettingsOpen(true)}
        />

        {/* Settings Modal */}
        <SettingsModal 
          isOpen={settingsOpen} 
          onClose={() => setSettingsOpen(false)} 
        />
        
        {/* Main Content Area - Both views always mounted for state persistence */}
        <main className="flex-1 overflow-hidden relative">
          {/* Terminal - Long-term memory, persistent conversation */}
          <div className={`absolute inset-0 ${viewMode === 'terminal' ? 'block' : 'hidden'}`}>
            <TerminalFeed />
          </div>
          
          {/* Circuit - Deep dive notebooks, session-based */}
          <div className={`absolute inset-0 ${viewMode === 'circuit' ? 'block' : 'hidden'}`}>
            <CircuitBoard />
          </div>
        </main>

        {/* Status Bar */}
        <footer className="h-6 bg-slate border-t border-terminal-border px-4 flex items-center justify-between text-xs text-terminal-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2">
              <span className={`led ${socketConnected ? 'led-success' : 'led-idle'}`}></span>
              {socketConnected ? 'BACKEND ONLINE' : 'BACKEND OFFLINE'}
            </span>
            <span className="flex items-center gap-2">
              <span className={`led ${status.connected ? 'led-success' : 'led-idle'}`}></span>
              {status.connected ? 'OLLAMA READY' : 'OLLAMA STANDBY'}
            </span>
            {status.activeModel && (
              <span className="flex items-center gap-1.5 text-phosphor/80" title="Chat model">
                <span className="text-terminal-muted">CHAT:</span>
                <span className="font-mono text-[10px]">{status.activeModel.length > 15 ? status.activeModel.substring(0, 15) + '...' : status.activeModel}</span>
              </span>
            )}
            {status.visionModel && (
              <span className="flex items-center gap-1.5 text-cyan-400/80" title="Vision/image analysis model">
                <span className="text-terminal-muted">VISION:</span>
                <span className="font-mono text-[10px]">{status.visionModel.length > 15 ? status.visionModel.substring(0, 15) + '...' : status.visionModel}</span>
              </span>
            )}
            {status.imageGenModel && (
              <span className="flex items-center gap-1.5 text-pink-400/80" title="Image generation model">
                <span className="text-terminal-muted">GEN:</span>
                <span className="font-mono text-[10px]">{status.imageGenModel.length > 15 ? status.imageGenModel.substring(0, 15) + '...' : status.imageGenModel}</span>
              </span>
            )}
            {formatRamDisplay() && (
              <span className="flex items-center gap-1.5 text-amber-400/80" title="System RAM usage (used / total)">
                <span className="text-terminal-muted">RAM:</span>
                <span className="font-mono text-[10px]">{formatRamDisplay()}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span>LOOM v0.1.0</span>
            <span>LOCAL MODE</span>
          </div>
        </footer>
      </div>
    </CRTContainer>
  )
}

export default App
