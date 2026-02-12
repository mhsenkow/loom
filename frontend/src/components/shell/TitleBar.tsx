import { ModelSelector } from '../terminal/ModelSelector'
import type { CrtIntensityPreset } from './SettingsModal'

interface TitleBarProps {
  viewMode: 'terminal' | 'circuit'
  onViewModeChange: (mode: 'terminal' | 'circuit') => void
  crtEnabled: boolean
  crtIntensity: CrtIntensityPreset
  onCrtToggle: () => void
  onShortcutsClick: () => void
  onSettingsClick: () => void
}

export function TitleBar({
  viewMode,
  onViewModeChange,
  crtEnabled,
  crtIntensity,
  onCrtToggle,
  onShortcutsClick,
  onSettingsClick,
}: TitleBarProps) {
  const handleMinimize = () => window.electronAPI?.minimize()
  const handleMaximize = () => window.electronAPI?.maximize()
  const handleClose = () => window.electronAPI?.close()

  return (
    <header className="h-10 bg-slate border-b border-terminal-border flex items-center justify-between select-none">
      {/* Draggable Region */}
      <div
        className="flex-1 h-full flex items-center px-4 gap-6"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {/* Logo / Title */}
        <div className="flex items-center gap-2">
          <span className="text-phosphor font-bold tracking-widest text-sm">
            [LOOM]
          </span>
          <span className="text-terminal-muted text-xs">
            // PERSONAL INTELLIGENCE OS
          </span>
        </div>

        {/* View Mode Tabs */}
        <nav
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <ViewTab
            active={viewMode === 'terminal'}
            onClick={() => onViewModeChange('terminal')}
          >
            TERMINAL
          </ViewTab>
          <ViewTab
            active={viewMode === 'circuit'}
            onClick={() => onViewModeChange('circuit')}
          >
            CIRCUIT
          </ViewTab>
        </nav>

        {/* Model Selector */}
        <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
          <ModelSelector />
        </div>

        {/* CRT Toggle */}
        <button
          onClick={onCrtToggle}
          className="text-xs px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor transition-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Toggle CRT Effect"
        >
          CRT: {crtEnabled ? `${crtIntensity.toUpperCase()}` : 'OFF'}
        </button>

        {/* Shortcuts */}
        <button
          onClick={onShortcutsClick}
          className="text-xs px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor transition-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Keyboard Shortcuts (Ctrl/Cmd+/)"
          aria-label="Open keyboard shortcuts"
        >
          ⌨ SHORTCUTS
        </button>

        {/* Settings */}
        <button
          onClick={onSettingsClick}
          className="text-xs px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor transition-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title="Settings"
        >
          ⚙ SETTINGS
        </button>
      </div>

      {/* Window Controls */}
      <div className="flex items-center h-full">
        <WindowButton onClick={handleMinimize} title="Minimize">
          <span className="w-3 h-[2px] bg-current" />
        </WindowButton>
        <WindowButton onClick={handleMaximize} title="Maximize">
          <span className="w-3 h-3 border border-current" />
        </WindowButton>
        <WindowButton onClick={handleClose} title="Close" danger>
          <span className="text-sm leading-none">×</span>
        </WindowButton>
      </div>
    </header>
  )
}

interface ViewTabProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

function ViewTab({ active, onClick, children }: ViewTabProps) {
  return (
    <button
      onClick={onClick}
      className={`
        px-3 py-1 text-xs font-bold tracking-wider border transition-none
        ${active
          ? 'bg-phosphor text-void border-phosphor'
          : 'bg-transparent text-terminal-muted border-terminal-border hover:text-phosphor hover:border-phosphor'
        }
      `}
    >
      {children}
    </button>
  )
}

interface WindowButtonProps {
  onClick: () => void
  title: string
  danger?: boolean
  children: React.ReactNode
}

function WindowButton({ onClick, title, danger, children }: WindowButtonProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        w-12 h-full flex items-center justify-center transition-none
        ${danger
          ? 'text-terminal-muted hover:bg-red-600 hover:text-white'
          : 'text-terminal-muted hover:bg-terminal-gray hover:text-phosphor'
        }
      `}
    >
      {children}
    </button>
  )
}
