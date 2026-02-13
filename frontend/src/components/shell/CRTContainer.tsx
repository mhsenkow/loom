import { useEffect, useRef, useState, ReactNode } from 'react'
import type { CrtIntensityPreset } from './SettingsModal'

interface CRTContainerProps {
  children: ReactNode
  enabled?: boolean
  intensity?: CrtIntensityPreset
  burstsEnabled?: boolean
  noiseEnabled?: boolean
  noiseLevel?: number
  bloomLevel?: number
  jitterLevel?: number
  scanDrift?: number
}

const INTENSITY_VARS: Record<CrtIntensityPreset, { scanline: string; vignette: string; flicker: string }> = {
  subtle: { scanline: '0.65', vignette: '0.7', flicker: '0.015' },
  medium: { scanline: '1', vignette: '1', flicker: '0.03' },
  full: { scanline: '1.35', vignette: '1.25', flicker: '0.05' },
  insane: { scanline: '1.9', vignette: '1.45', flicker: '0.085' },
}

export function CRTContainer({
  children,
  enabled = true,
  intensity = 'medium',
  burstsEnabled = true,
  noiseEnabled = true,
  noiseLevel = 22,
  bloomLevel = 28,
  jitterLevel = 8,
  scanDrift = 100,
}: CRTContainerProps) {
  const [flicker, setFlicker] = useState(true)
  const [bursting, setBursting] = useState(false)
  const [burstStrength, setBurstStrength] = useState(1)
  const burstTimerRef = useRef<number | null>(null)
  const intensityVars = INTENSITY_VARS[intensity] || INTENSITY_VARS.medium
  const normalizedNoise = Math.min(Math.max(noiseLevel, 0), 100) / 100
  const normalizedBloom = Math.min(Math.max(bloomLevel, 0), 100) / 100
  const normalizedJitter = Math.min(Math.max(jitterLevel, 0), 40) / 40
  const normalizedScanSpeed = Math.min(Math.max(scanDrift, 50), 180) / 100

  // Trigger flicker animation on mount
  useEffect(() => {
    if (enabled) {
      setFlicker(true)
      const timer = setTimeout(() => setFlicker(false), 150)
      return () => clearTimeout(timer)
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled || !burstsEnabled) {
      setBursting(false)
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current)
        burstTimerRef.current = null
      }
      return
    }

    const onBurst = (event: Event) => {
      const custom = event as CustomEvent<{ strength?: number; durationMs?: number }>
      const strength = typeof custom.detail?.strength === 'number'
        ? Math.min(Math.max(custom.detail.strength, 0.5), 2.5)
        : 1
      const durationMs = typeof custom.detail?.durationMs === 'number'
        ? Math.min(Math.max(custom.detail.durationMs, 80), 800)
        : 170

      setBurstStrength(strength)
      setBursting(true)
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current)
      }
      burstTimerRef.current = window.setTimeout(() => {
        setBursting(false)
        burstTimerRef.current = null
      }, durationMs)
    }

    window.addEventListener('loom:crt-burst', onBurst as EventListener)
    return () => {
      window.removeEventListener('loom:crt-burst', onBurst as EventListener)
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current)
        burstTimerRef.current = null
      }
    }
  }, [enabled, burstsEnabled])

  return (
    <div
      className={`relative ${flicker && enabled ? 'crt-flicker' : ''} ${bursting && burstsEnabled && enabled ? 'crt-burst' : ''} ${enabled && normalizedJitter > 0 ? 'crt-jitter' : ''}`}
      style={{
        ['--crt-intensity' as string]: intensityVars.scanline,
        ['--crt-vignette-intensity' as string]: intensityVars.vignette,
        ['--crt-flicker-strength' as string]: intensityVars.flicker,
        ['--crt-burst-strength' as string]: String(burstStrength),
        ['--crt-noise-opacity' as string]: String(noiseEnabled ? normalizedNoise : 0),
        ['--crt-bloom-opacity' as string]: String(normalizedBloom),
        ['--crt-jitter-amplitude' as string]: String(normalizedJitter),
        ['--crt-scan-speed' as string]: String(normalizedScanSpeed),
      }}
    >
      {children}
      
      {/* CRT: scanlines + vignette (tube feel) */}
      {enabled && (
        <>
          <div className="crt-bloom" aria-hidden="true" />
          <div className="crt-noise" aria-hidden="true" />
          <div className="crt-glitch" aria-hidden="true" />
          <div className="crt-overlay" aria-hidden="true" />
          <div className="crt-vignette" aria-hidden="true" />
        </>
      )}
    </div>
  )
}
