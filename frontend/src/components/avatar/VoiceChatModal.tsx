import { useCallback } from 'react'
import { AvatarContainer } from './AvatarContainer'
import type { AvatarConfig, AvatarSoundVisualParams } from '../../types/avatar'
import type { AudioAnalyzerState } from '../../hooks/useAudioAnalyzer'

export interface VoiceChatModalProps {
  isOpen: boolean
  onClose: () => void
  config: AvatarConfig
  audio: AudioAnalyzerState
  speaking: boolean
  listening: boolean
  /** Start recording (hold to talk) */
  onStartRecording: () => void
  /** Stop recording and submit transcript for AI reply */
  onStopRecording: () => void
  isMicActive: boolean
  /** Last thing the user said (from voice) */
  lastUserSaid?: string
  /** Last thing the AI said (TTS) in this modal */
  lastAiSaid?: string
  /** Whether we're waiting for AI response after user spoke */
  waitingForAi?: boolean
  /** Avatar audio sensitivity override (0.5–2) */
  audioSensitivityOverride?: number
  /** Sound → visual mapping */
  soundVisualParams?: AvatarSoundVisualParams
  pixelate?: boolean
}

export function VoiceChatModal({
  isOpen,
  onClose,
  config,
  audio,
  speaking,
  listening,
  onStartRecording,
  onStopRecording,
  isMicActive,
  lastUserSaid = '',
  lastAiSaid = '',
  waitingForAi = false,
  audioSensitivityOverride,
  soundVisualParams,
  pixelate = true,
}: VoiceChatModalProps) {
  const handlePointerDown = useCallback(() => {
    onStartRecording()
  }, [onStartRecording])

  const handlePointerUp = useCallback(() => {
    onStopRecording()
  }, [onStopRecording])

  const handlePointerLeave = useCallback(() => {
    if (isMicActive) onStopRecording()
  }, [isMicActive, onStopRecording])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-void/95 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label="Voice chat"
    >
      <div className="bg-slate border-2 border-phosphor shadow-[0_0_32px_var(--theme-phosphor-glow)] p-6 flex flex-col gap-6 max-w-lg w-full mx-4">
        <div className="flex items-center justify-between border-b border-terminal-border pb-3">
          <span className="text-phosphor font-mono text-sm font-bold uppercase tracking-wider">
            🎤 Voice chat
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-terminal-muted hover:text-phosphor text-sm px-2 py-1 border border-terminal-border"
          >
            [X]
          </button>
        </div>

        <p className="text-terminal-muted text-[10px] -mt-2">
          Hold the button to talk. Release to send; AI reply is read aloud.
        </p>

        {/* Avatar */}
        <div className="flex justify-center">
          <AvatarContainer
            config={config}
            audio={audio}
            speaking={speaking}
            listening={listening}
            audioSensitivityOverride={audioSensitivityOverride}
            soundVisualParams={soundVisualParams}
            pixelate={pixelate}
            width={280}
            height={280}
            className="border-2 border-phosphor/50"
          />
        </div>

        {/* Last exchange */}
        <div className="space-y-2 min-h-[4rem] border border-terminal-border bg-void p-3 text-[10px] font-mono">
          {lastUserSaid && (
            <div>
              <span className="text-terminal-muted">You: </span>
              <span className="text-phosphor">{lastUserSaid.slice(0, 300)}{lastUserSaid.length > 300 ? '…' : ''}</span>
            </div>
          )}
          {waitingForAi && (
            <div className="text-amber-400">… thinking</div>
          )}
          {lastAiSaid && !waitingForAi && (
            <div>
              <span className="text-terminal-muted">AI: </span>
              <span className="text-phosphor">{lastAiSaid.slice(0, 300)}{lastAiSaid.length > 300 ? '…' : ''}</span>
            </div>
          )}
          {!lastUserSaid && !lastAiSaid && !waitingForAi && (
            <div className="text-terminal-muted">Hold to talk to start.</div>
          )}
        </div>

        {/* Hold to talk button */}
        <div className="flex justify-center">
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
            onPointerCancel={handlePointerUp}
            className={`
              w-24 h-24 flex items-center justify-center
              border-2 font-mono text-sm
              select-none touch-none
              ${isMicActive
                ? 'border-phosphor bg-phosphor/20 text-phosphor shadow-[0_0_20px_var(--theme-phosphor-glow)]'
                : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
              }
            `}
            title={isMicActive ? 'Release to send' : 'Hold to talk'}
          >
            {isMicActive ? '🎤 …' : '🎤'}
          </button>
        </div>
      </div>
    </div>
  )
}
