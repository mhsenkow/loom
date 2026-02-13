import { useState, useEffect, useRef } from 'react'
import { CRTContainer } from './components/shell/CRTContainer'
import { TitleBar } from './components/shell/TitleBar'
import { TerminalFeed } from './components/terminal/TerminalFeed'
import { CircuitBoard } from './components/circuit/CircuitBoard'
import {
  SettingsModal,
  loadSettings,
  saveSettings,
  applyTheme,
  type Settings,
  type CrtIntensityPreset,
} from './components/shell/SettingsModal'
import { ShortcutCheatSheet } from './components/shell/ShortcutCheatSheet'
import { ToastHost } from './components/shell/ToastHost'
import { requestDesktopNotificationPermission } from './utils/uiNotifications'
import { useSocket } from './hooks/useSocket'
import { useSystemStatus } from './hooks/useSystemStatus'

type ViewMode = 'terminal' | 'circuit'

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable
}

function App() {
  const [viewMode, setViewMode] = useState<ViewMode>('terminal')
  const [crtEnabled, setCrtEnabled] = useState<boolean>(() => loadSettings().crtEnabled)
  const [crtIntensity, setCrtIntensity] = useState<CrtIntensityPreset>(() => loadSettings().crtIntensity)
  const [crtBurstsEnabled, setCrtBurstsEnabled] = useState<boolean>(() => loadSettings().crtBurstsEnabled)
  const [crtNoiseEnabled, setCrtNoiseEnabled] = useState<boolean>(() => loadSettings().crtNoiseEnabled)
  const [crtNoiseLevel, setCrtNoiseLevel] = useState<number>(() => loadSettings().crtNoiseLevel)
  const [crtBloomLevel, setCrtBloomLevel] = useState<number>(() => loadSettings().crtBloomLevel)
  const [crtJitterLevel, setCrtJitterLevel] = useState<number>(() => loadSettings().crtJitterLevel)
  const [crtScanDrift, setCrtScanDrift] = useState<number>(() => loadSettings().crtScanDrift)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const seenLoadedModelRef = useRef<string | null>(null)
  const seenActiveModelRef = useRef<string | null>(null)
  const initializedLoadedModelRef = useRef(false)
  const initializedActiveModelRef = useRef(false)

  // Apply saved theme on load
  useEffect(() => {
    const s = loadSettings()
    applyTheme(s.theme)
    setCrtEnabled(s.crtEnabled)
    setCrtIntensity(s.crtIntensity)
    setCrtBurstsEnabled(s.crtBurstsEnabled)
    setCrtNoiseEnabled(s.crtNoiseEnabled)
    setCrtNoiseLevel(s.crtNoiseLevel)
    setCrtBloomLevel(s.crtBloomLevel)
    setCrtJitterLevel(s.crtJitterLevel)
    setCrtScanDrift(s.crtScanDrift)
    // Prompt user for desktop notification permission on first visit
    requestDesktopNotificationPermission()
  }, [])

  useEffect(() => {
    const onUnsavedChanges = (event: Event) => {
      const custom = event as CustomEvent<{ hasUnsavedChanges?: boolean }>
      setHasUnsavedChanges(Boolean(custom.detail?.hasUnsavedChanges))
    }

    window.addEventListener('loom:unsaved-changes', onUnsavedChanges as EventListener)
    return () => window.removeEventListener('loom:unsaved-changes', onUnsavedChanges as EventListener)
  }, [])

  useEffect(() => {
    const onSettingsUpdated = (event: Event) => {
      const custom = event as CustomEvent<Partial<Settings>>
      if (!custom.detail) return
      if (typeof custom.detail.crtEnabled === 'boolean') {
        setCrtEnabled(custom.detail.crtEnabled)
      }
      if (custom.detail.crtIntensity) {
        setCrtIntensity(custom.detail.crtIntensity)
      }
      if (typeof custom.detail.crtBurstsEnabled === 'boolean') {
        setCrtBurstsEnabled(custom.detail.crtBurstsEnabled)
      }
      if (typeof custom.detail.crtNoiseEnabled === 'boolean') {
        setCrtNoiseEnabled(custom.detail.crtNoiseEnabled)
      }
      if (typeof custom.detail.crtNoiseLevel === 'number') {
        setCrtNoiseLevel(custom.detail.crtNoiseLevel)
      }
      if (typeof custom.detail.crtBloomLevel === 'number') {
        setCrtBloomLevel(custom.detail.crtBloomLevel)
      }
      if (typeof custom.detail.crtJitterLevel === 'number') {
        setCrtJitterLevel(custom.detail.crtJitterLevel)
      }
      if (typeof custom.detail.crtScanDrift === 'number') {
        setCrtScanDrift(custom.detail.crtScanDrift)
      }
      if (custom.detail.theme) {
        applyTheme(custom.detail.theme)
      }
    }
    window.addEventListener('loom:settings-updated', onSettingsUpdated as EventListener)
    return () => window.removeEventListener('loom:settings-updated', onSettingsUpdated as EventListener)
  }, [])

  const { connected: socketConnected } = useSocket()
  const { status } = useSystemStatus()
  const loadedModelLabel = status.loadedModelName && status.loadedModelName !== 'unknown'
    ? status.loadedModelName
    : null

  useEffect(() => {
    const loaded = status.loadedModelName && status.loadedModelName !== 'unknown'
      ? status.loadedModelName
      : null
    if (!initializedLoadedModelRef.current) {
      initializedLoadedModelRef.current = true
      seenLoadedModelRef.current = loaded
      return
    }
    if (loaded && loaded !== seenLoadedModelRef.current) {
      window.dispatchEvent(new CustomEvent('loom:crt-burst', {
        detail: { kind: 'model-loaded', strength: 1.2, durationMs: 180 },
      }))
    }
    seenLoadedModelRef.current = loaded
  }, [status.loadedModelName])

  useEffect(() => {
    const active = status.activeModel || null
    if (!initializedActiveModelRef.current) {
      initializedActiveModelRef.current = true
      seenActiveModelRef.current = active
      return
    }
    if (active && active !== seenActiveModelRef.current) {
      window.dispatchEvent(new CustomEvent('loom:crt-burst', {
        detail: { kind: 'model-switch', strength: 1.1, durationMs: 160 },
      }))
    }
    seenActiveModelRef.current = active
  }, [status.activeModel])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const ctrlOrMeta = event.ctrlKey || event.metaKey

      if (ctrlOrMeta && key === '1') {
        event.preventDefault()
        setViewMode('terminal')
        return
      }
      if (ctrlOrMeta && key === '2') {
        event.preventDefault()
        setViewMode('circuit')
        return
      }
      if (ctrlOrMeta && key === ',') {
        event.preventDefault()
        setSettingsOpen(true)
        return
      }
      if (ctrlOrMeta && key === '/') {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (event.key === '?' && !isTypingTarget(event.target)) {
        event.preventDefault()
        setShortcutsOpen(true)
        return
      }
      if (event.key === 'Escape' && shortcutsOpen) {
        event.preventDefault()
        setShortcutsOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [shortcutsOpen])

  useEffect(() => {
    const onCircuitImport = (event: Event) => {
      const custom = event as CustomEvent<{ open?: boolean }>
      if (custom.detail?.open === false) return
      setViewMode('circuit')
    }

    window.addEventListener('loom:circuit-import', onCircuitImport as EventListener)
    return () => window.removeEventListener('loom:circuit-import', onCircuitImport as EventListener)
  }, [])

  // Format RAM display using backend health metrics.
  const formatRamDisplay = () => {
    if (status.ramTotalGb !== undefined) {
      const total = status.ramTotalGb
      const systemUsed = status.ramSystemUsedGb
        ?? (status.ramAvailableGb !== undefined ? Math.max(0, total - status.ramAvailableGb) : undefined)
      const free = status.ramAvailableGb
      const usedPercent = status.ramUsedPercent
      const modelUsed = status.ramModelUsedGb
      const processRss = status.ollamaProcessRssGb

      const base = systemUsed !== undefined
        ? `${systemUsed.toFixed(1)}GB/${total.toFixed(1)}GB`
        : `${total.toFixed(1)}GB total`
      const pct = usedPercent !== undefined ? ` (${Math.round(usedPercent)}%)` : ''
      const freeLabel = free !== undefined ? ` | free ${free.toFixed(1)}GB` : ''
      const modelLabel = modelUsed && modelUsed > 0 ? ` | mdl~${modelUsed.toFixed(1)}GB` : ''
      const rssLabel = processRss && processRss > 0 ? ` | ollama~${processRss.toFixed(1)}GB` : ''

      return `${base}${pct}${freeLabel}${modelLabel}${rssLabel}`
    }
    return null
  }

  return (
    <CRTContainer
      enabled={crtEnabled}
      intensity={crtIntensity}
      burstsEnabled={crtBurstsEnabled}
      noiseEnabled={crtNoiseEnabled}
      noiseLevel={crtNoiseLevel}
      bloomLevel={crtBloomLevel}
      jitterLevel={crtJitterLevel}
      scanDrift={crtScanDrift}
    >
      <div className="loom-app h-screen w-screen flex flex-col bg-void text-phosphor font-mono overflow-hidden">
        {/* Custom Title Bar */}
        <TitleBar
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          crtEnabled={crtEnabled}
          crtIntensity={crtIntensity}
          hasUnsavedChanges={hasUnsavedChanges}
          onCrtToggle={() => {
            const nextEnabled = !crtEnabled
            setCrtEnabled(nextEnabled)
            const current = loadSettings()
            saveSettings({
              ...current,
              crtEnabled: nextEnabled,
              crtIntensity,
              crtBurstsEnabled,
            })
          }}
          onShortcutsClick={() => setShortcutsOpen(true)}
          onSettingsClick={() => setSettingsOpen(true)}
        />

        {/* Settings Modal */}
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
        />

        <ShortcutCheatSheet
          isOpen={shortcutsOpen}
          onClose={() => setShortcutsOpen(false)}
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
            {(status.activeModel || loadedModelLabel) && (
              <span className="flex items-center gap-1.5 text-phosphor/80" title="Chat model">
                <span className="text-terminal-muted">CHAT:</span>
                {(status.activeModel || 'auto') === 'auto' ? (
                  loadedModelLabel ? (
                    <span className="font-mono text-[10px] text-cyan-400 flex items-center gap-1">
                      <span className="text-[8px]">⚡</span>
                      AUTO → {loadedModelLabel.length > 14 ? `${loadedModelLabel.substring(0, 14)}...` : loadedModelLabel}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-cyan-400 flex items-center gap-1">
                      <span className="text-[8px]">⚡</span> AUTO (Orchestrator)
                    </span>
                  )
                ) : (
                  <span className="font-mono text-[10px]">
                    {(() => {
                      const modelName = status.activeModel || loadedModelLabel || 'unknown'
                      return modelName.length > 15 ? `${modelName.substring(0, 15)}...` : modelName
                    })()}
                  </span>
                )}
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
              <span
                className="flex items-center gap-1.5 text-amber-400/80"
                title="System RAM used/total; mdl and ollama are approximate runtime footprints."
              >
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
        <ToastHost />
      </div>
    </CRTContainer>
  )
}

export default App
