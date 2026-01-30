/**
 * Floating retro/scifi loader shown when Orpheus TTS is generating.
 * Displays fake "streaming" technical text – like made-up loading language – to the left of the avatar.
 */

import { useState, useEffect } from 'react'

const SYNTH_STREAM = [
  'SYNTH_0x7F',
  'PHON_LOAD',
  'VOC_REF',
  'BUF_ALOC',
  'WAV_GEN',
  'ORPH_ENC',
  'STREAM_OK',
  'AUDIO_RDY',
  'CHK_SUM',
  'DSP_PIPE',
  'FRQ_NORM',
  'AMP_GAIN',
  '...',
  '▓▓▓',
  '░░░',
  '◐◑◒',
  '⟳',
  'φ',
  'λ',
  'Ω',
]

export interface TTSBackendLoaderProps {
  /** When true, show the floating stream */
  active: boolean
  /** Optional class for positioning */
  className?: string
}

export function TTSBackendLoader({ active, className = '' }: TTSBackendLoaderProps) {
  const [lines, setLines] = useState<string[]>([])
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!active) {
      setLines([])
      return
    }
    // Seed first line immediately
    const seed = SYNTH_STREAM[Math.floor(Math.random() * SYNTH_STREAM.length)]
    setLines([`${seed} ${Math.random().toString(16).slice(2, 6).toUpperCase()}`])
    const interval = setInterval(() => {
      setTick(t => t + 1)
      setLines(prev => {
        const next = SYNTH_STREAM[Math.floor(Math.random() * SYNTH_STREAM.length)]
        const nextLine = `${next} ${Math.random().toString(16).slice(2, 6).toUpperCase()}`
        return [...prev.slice(-4), nextLine]
      })
    }, 180 + Math.random() * 120)
    return () => clearInterval(interval)
  }, [active])

  if (!active) return null

  return (
    <div
      className={`absolute left-2 top-1/2 -translate-y-1/2 z-20 pointer-events-none ${className}`}
      style={{
        fontFamily: '"VT323", "Share Tech Mono", "Courier New", monospace',
        fontSize: '9px',
        lineHeight: 1.2,
        letterSpacing: '0.08em',
        color: 'rgba(51, 255, 0, 0.7)',
        textShadow: '0 0 6px rgba(51, 255, 0, 0.4)',
        opacity: 0.9,
      }}
      aria-hidden
    >
      <div className="flex flex-col gap-0.5 animate-pulse">
        <div className="text-[8px] uppercase tracking-widest opacity-80">TTS</div>
        {lines.map((line, i) => (
          <div
            key={`${tick}-${i}`}
            className="tabular-nums"
            style={{
              opacity: 0.5 + (i / lines.length) * 0.5,
              filter: 'blur(0.3px)',
            }}
          >
            {line}
          </div>
        ))}
      </div>
    </div>
  )
}
