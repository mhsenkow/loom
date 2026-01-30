import { useRef } from 'react'
import { AvatarCanvas } from './AvatarCanvas'
import type { AvatarConfig, AvatarSoundVisualParams } from '../../types/avatar'
import type { AudioAnalyzerState } from '../../hooks/useAudioAnalyzer'

export interface AvatarContainerProps {
  config: AvatarConfig
  audio: AudioAnalyzerState
  speaking: boolean
  listening: boolean
  /** Override avatar audio sensitivity (0.5–2, multiplies config.audioSensitivity) */
  audioSensitivityOverride?: number
  /** Sound → visual mapping (energy, core, warmth, sparkle, settle) */
  soundVisualParams?: AvatarSoundVisualParams
  /** Apply 8-bit pixelation filter */
  pixelate?: boolean
  /** Transparent background (for layering behind content) */
  transparent?: boolean
  width?: number
  height?: number
  className?: string
}

export function AvatarContainer({
  config,
  audio,
  speaking,
  listening,
  audioSensitivityOverride,
  soundVisualParams,
  pixelate = true,
  transparent = false,
  width = 256,
  height = 256,
  className = '',
}: AvatarContainerProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)

  return (
    <div
      ref={wrapperRef}
      className={`avatar-container overflow-hidden ${className}`}
      style={{
        width,
        height,
        imageRendering: pixelate ? 'pixelated' : 'auto',
        background: transparent ? 'transparent' : undefined,
      }}
    >
      <div
        className="avatar-8bit-wrapper w-full h-full"
        style={{
          imageRendering: pixelate ? 'pixelated' : 'auto',
          filter: pixelate ? 'contrast(1.15) saturate(1.1)' : 'none',
        }}
      >
        <div
          className="w-full h-full flex items-center justify-center"
          style={{
            transform: pixelate ? 'scale(2)' : 'scale(1)',
            transformOrigin: 'center center',
          }}
        >
          <AvatarCanvas
            config={config}
            amplitude={audio.amplitude}
            bass={audio.bass}
            mids={audio.mids}
            highs={audio.highs}
            speaking={speaking}
            listening={listening}
            audioSensitivityOverride={audioSensitivityOverride}
            soundVisualParams={soundVisualParams}
            transparent={transparent}
            width={pixelate ? Math.max(64, Math.round(width / 2)) : width}
            height={pixelate ? Math.max(64, Math.round(height / 2)) : height}
            className="block shrink-0"
          />
        </div>
      </div>
    </div>
  )
}
