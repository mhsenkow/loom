import { useCallback, useEffect, useState } from 'react'
import { ModelSelector } from '../terminal/ModelSelector'
import type { CrtIntensityPreset } from './SettingsModal'
import { API_BASE_URL } from '../../config/api'
import { showInfoToast, showErrorToast, showSuccessToast } from '../../utils/uiNotifications'

interface TitleBarProps {
  viewMode: 'terminal' | 'circuit'
  onViewModeChange: (mode: 'terminal' | 'circuit') => void
  crtEnabled: boolean
  crtIntensity: CrtIntensityPreset
  onCrtToggle: () => void
  onShortcutsClick: () => void
  onSettingsClick: () => void
  hasUnsavedChanges: boolean
}

interface ShareStatusPayload {
  active?: boolean
  public_chat_url?: string | null
  local_chat_url?: string
  cloudflared_installed?: boolean
}

export function TitleBar({
  viewMode,
  onViewModeChange,
  crtEnabled,
  crtIntensity,
  onCrtToggle,
  onShortcutsClick,
  onSettingsClick,
  hasUnsavedChanges,
}: TitleBarProps) {
  const electronAPI = (window as unknown as {
    electronAPI?: {
      minimize?: () => void
      maximize?: () => void
      toggleMaximize?: () => void
      isMaximized?: () => Promise<boolean>
      onMaximizedChange?: (callback: (maximized: boolean) => void) => (() => void) | void
      close?: () => void
    }
  }).electronAPI

  const hasElectronWindowControls = Boolean(
    typeof electronAPI?.minimize === 'function' &&
    typeof electronAPI?.maximize === 'function' &&
    typeof electronAPI?.close === 'function'
  )
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    if (
      !hasElectronWindowControls ||
      typeof electronAPI?.isMaximized !== 'function' ||
      typeof electronAPI?.onMaximizedChange !== 'function'
    ) {
      return
    }

    let mounted = true
    electronAPI.isMaximized()
      .then((maximized) => {
        if (mounted) setIsMaximized(maximized)
      })
      .catch(() => { })

    const unsubscribe = electronAPI.onMaximizedChange((maximized) => {
      setIsMaximized(maximized)
    })

    return () => {
      mounted = false
      unsubscribe?.()
    }
  }, [electronAPI, hasElectronWindowControls])

  const handleMinimize = () => electronAPI?.minimize?.()
  const handleMaximize = () => {
    if (electronAPI?.toggleMaximize) {
      electronAPI.toggleMaximize()
      return
    }
    electronAPI?.maximize?.()
  }
  const handleClose = () => {
    if (hasUnsavedChanges) {
      const shouldClose = window.confirm('You have unsaved circuit changes. Close anyway?')
      if (!shouldClose) return
    }
    electronAPI?.close?.()
  }

  // Desktop notification permission state + handler
  const hasNotifApi = typeof Notification !== 'undefined'
  const [notifPerm, setNotifPerm] = useState(hasNotifApi ? Notification.permission : 'denied')
  const [shareStatus, setShareStatus] = useState<ShareStatusPayload | null>(null)
  const [shareBusy, setShareBusy] = useState(false)

  const copyToClipboard = useCallback(async (value: string): Promise<boolean> => {
    if (!value) return false
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      return false
    }
  }, [])

  const fetchShareStatus = useCallback(async (): Promise<ShareStatusPayload | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/share/status`)
      if (!res.ok) return null
      const payload = await res.json() as ShareStatusPayload
      setShareStatus(payload)
      return payload
    } catch {
      return null
    }
  }, [])

  useEffect(() => {
    void fetchShareStatus()
    const onShareStatusChanged = (event: Event) => {
      const custom = event as CustomEvent<ShareStatusPayload>
      if (custom.detail) {
        setShareStatus(custom.detail)
        return
      }
      void fetchShareStatus()
    }
    window.addEventListener('loom:share-status-changed', onShareStatusChanged as EventListener)
    return () => window.removeEventListener('loom:share-status-changed', onShareStatusChanged as EventListener)
  }, [fetchShareStatus])

  const handleNotificationClick = () => {
    if (!hasNotifApi) return
    if (Notification.permission === 'default') {
      Notification.requestPermission().then((result) => {
        setNotifPerm(result)
        if (result === 'granted') {
          try { new Notification('LOOM — Alerts Enabled', { body: 'You will receive notifications when AI responses complete.' }) } catch { /* noop */ }
        }
      })
    } else if (Notification.permission === 'granted') {
      try { new Notification('LOOM — Test Alert', { body: 'Desktop notifications are working!' }) } catch { /* noop */ }
    }
  }

  const copyLocalChatUrl = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/network-info`)
      const data = await res.json().catch(() => ({}))
      const url = data.chat_url || (data.local_ip && data.local_ip !== '127.0.0.1' ? `http://${data.local_ip}:8000/chat` : null)
      if (url) {
        await copyToClipboard(url)
        showInfoToast('Chat URL copied. Open it on your phone (same Wi‑Fi).', 'Chat from phone', 3500)
      } else {
        showInfoToast('Backend on this machine only. Run backend with host 0.0.0.0 for LAN access.', 'Chat from phone', 4000)
      }
    } catch {
      showErrorToast('Could not get chat URL. Is the backend running?', 'Chat from phone')
    }
  }

  const handleMobileChatClick = async () => {
    if (shareBusy) return
    setShareBusy(true)
    try {
      const latest = await fetchShareStatus()
      if (latest?.active && latest.public_chat_url) {
        const copied = await copyToClipboard(latest.public_chat_url)
        if (copied) {
          showSuccessToast('Public chat URL copied.', 'Share Chat', 3000)
        } else {
          showInfoToast(latest.public_chat_url, 'Share Chat', 4500)
        }
        return
      }

      const response = await fetch(`${API_BASE_URL}/api/share/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_url: API_BASE_URL }),
      })
      const payload = await response.json().catch(() => ({})) as ShareStatusPayload & { detail?: string }
      if (!response.ok) {
        const detail = typeof payload.detail === 'string' ? payload.detail : 'Could not start public sharing.'
        if (detail.toLowerCase().includes('cloudflared')) {
          showInfoToast('Public share needs cloudflared. Falling back to LAN chat URL.', 'Share Chat', 4200)
          await copyLocalChatUrl()
          return
        }
        throw new Error(detail)
      }

      setShareStatus(payload)
      window.dispatchEvent(new CustomEvent('loom:share-status-changed', { detail: payload }))

      if (payload.public_chat_url) {
        const copied = await copyToClipboard(payload.public_chat_url)
        if (copied) {
          showSuccessToast('Public chat is live. URL copied to clipboard.', 'Share Chat', 3500)
        } else {
          showInfoToast(payload.public_chat_url, 'Share Chat', 4500)
        }
      } else {
        showInfoToast('Sharing started, but no URL was returned yet.', 'Share Chat', 3500)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not start chat sharing.'
      showErrorToast(message, 'Share Chat')
    } finally {
      setShareBusy(false)
    }
  }

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

        {/* Chat from phone (same Wi‑Fi) */}
        <button
          type="button"
          onClick={handleMobileChatClick}
          disabled={shareBusy}
          className={`text-xs px-2 py-1 border transition-none disabled:opacity-60 ${
            shareStatus?.active
              ? 'border-phosphor text-phosphor'
              : 'border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor'
          }`}
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={shareStatus?.active ? 'Copy public chat URL' : 'Start public share link (or copy LAN URL fallback)'}
        >
          {shareBusy ? '…' : shareStatus?.active ? '🌐 LIVE CHAT' : '🌐 SHARE CHAT'}
        </button>

        {/* Desktop Notifications Toggle */}
        {hasNotifApi && (
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <button
              type="button"
              onClick={handleNotificationClick}
              className={`text-xs px-2 py-1 border transition-none ${notifPerm === 'granted'
                ? 'border-phosphor text-phosphor'
                : notifPerm === 'denied'
                  ? 'border-red-500/50 text-red-400 cursor-not-allowed'
                  : 'border-yellow-500/50 text-yellow-400 hover:text-yellow-300 hover:border-yellow-400'
                }`}
              title={
                notifPerm === 'granted'
                  ? 'Desktop notifications enabled (click to test)'
                  : notifPerm === 'denied'
                    ? 'Notifications blocked — enable in browser settings'
                    : 'Click to enable desktop notifications'
              }
            >
              {notifPerm === 'granted' ? '🔔' : notifPerm === 'denied' ? '🔕' : '🔔 ALERTS'}
            </button>
          </div>
        )}

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

      {/* Window Controls (Electron only) */}
      {hasElectronWindowControls && (
        <div
          className="flex items-center h-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <WindowButton onClick={handleMinimize} title="Minimize">
            <span className="w-3 h-[2px] bg-current" />
          </WindowButton>
          <WindowButton onClick={handleMaximize} title={isMaximized ? 'Restore' : 'Full Screen'}>
            {isMaximized ? (
              <span className="relative block w-3 h-3">
                <span className="absolute top-0 left-0 w-2.5 h-2.5 border border-current" />
                <span className="absolute top-1 left-1 w-2.5 h-2.5 border border-current bg-slate" />
              </span>
            ) : (
              <span className="w-3 h-3 border border-current" />
            )}
          </WindowButton>
          <WindowButton onClick={handleClose} title="Close" danger>
            <span className="text-sm leading-none">×</span>
          </WindowButton>
        </div>
      )}
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
