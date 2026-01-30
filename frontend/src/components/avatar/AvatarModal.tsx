import { useCallback } from 'react'
import { AvatarContainer } from './AvatarContainer'
import { AvatarLibrary } from './AvatarLibrary'
import type { AvatarConfig } from '../../types/avatar'
import type { AudioAnalyzerState } from '../../hooks/useAudioAnalyzer'

export interface AvatarModalProps {
  isOpen: boolean
  onClose: () => void
  config: AvatarConfig
  onConfigChange: (config: AvatarConfig) => void
  audio: AudioAnalyzerState
  speaking: boolean
  listening: boolean
  /** Callback to speak text (TTS) */
  onSpeak?: (text: string) => void
  /** Callback to start/stop mic */
  onMicToggle?: () => void
  isMicActive?: boolean
  /** Last AI text for "Read aloud" */
  lastAiText?: string
  pixelate?: boolean
}

export function AvatarModal({
  isOpen,
  onClose,
  config,
  onConfigChange,
  audio,
  speaking,
  listening,
  onSpeak,
  onMicToggle,
  isMicActive = false,
  lastAiText = '',
  pixelate = true,
}: AvatarModalProps) {
  const handleReadAloud = useCallback(() => {
    if (lastAiText.trim() && onSpeak) onSpeak(lastAiText)
  }, [lastAiText, onSpeak])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/90 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Avatar"
    >
      <div className="bg-slate border-2 border-phosphor shadow-[0_0_24px_var(--theme-phosphor-glow)] p-4 flex flex-col gap-4 max-w-md w-full mx-4">
        <div className="flex items-center justify-between border-b border-terminal-border pb-2">
          <span className="text-phosphor font-mono text-sm font-bold uppercase tracking-wider">✦ Avatar</span>
          <button
            type="button"
            onClick={onClose}
            className="text-terminal-muted hover:text-phosphor text-sm px-2 py-1 border border-terminal-border"
          >
            [X]
          </button>
        </div>

        <div className="flex justify-center">
          <AvatarContainer
            config={config}
            audio={audio}
            speaking={speaking}
            listening={listening}
            pixelate={pixelate}
            width={240}
            height={240}
            className="border-2 border-phosphor/50"
          />
        </div>

        <div className="flex flex-wrap gap-2 justify-center">
          {onSpeak && lastAiText.trim() && (
            <button
              type="button"
              onClick={handleReadAloud}
              disabled={speaking}
              className="btn-terminal text-xs px-3 py-1.5"
              title="Read last AI reply aloud"
            >
              {speaking ? '🔊 …' : '🔊 Read aloud'}
            </button>
          )}
          {onMicToggle && (
            <button
              type="button"
              onClick={onMicToggle}
              className={`text-xs px-3 py-1.5 border ${
                isMicActive ? 'border-phosphor text-phosphor bg-void' : 'border-terminal-border text-terminal-muted hover:text-phosphor'
              }`}
              title={isMicActive ? 'Stop recording' : 'Hold to talk'}
            >
              {isMicActive ? '🎤 Stop' : '🎤 Hold to talk'}
            </button>
          )}
        </div>

        <div className="border-t border-terminal-border pt-2">
          <span className="text-terminal-muted text-[10px] block mb-1">Avatar</span>
          <AvatarLibrary selected={config} onSelect={onConfigChange} />
        </div>
      </div>
    </div>
  )
}
