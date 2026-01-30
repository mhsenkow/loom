import { useRef, useEffect, useState, useCallback } from 'react'

export interface AudioAnalyzerState {
  /** 0–1 overall amplitude (smoothed) */
  amplitude: number
  /** 0–1 bass (low freq) */
  bass: number
  /** 0–1 mids */
  mids: number
  /** 0–1 highs */
  highs: number
  /** Raw FFT data length (frequency bins) */
  fftSize: number
}

const SMOOTHING = 0.85
const FFT_SIZE = 256
const BASS_END = 20
const MIDS_START = 20
const MIDS_END = 80
const HIGHS_START = 80

/** Hook to analyze an audio stream (mic or element) and expose amplitude + frequency bands for avatar reactivity */
export function useAudioAnalyzer(
  stream: MediaStream | null,
  enabled: boolean = true
): AudioAnalyzerState & { setSourceElement: (el: HTMLAudioElement | null) => void } {
  const [state, setState] = useState<AudioAnalyzerState>({
    amplitude: 0,
    bass: 0,
    mids: 0,
    highs: 0,
    fftSize: FFT_SIZE,
  })
  const analyserRef = useRef<AnalyserNode | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | MediaElementAudioSourceNode | null>(null)
  const animationRef = useRef<number>(0)
  const smoothAmplitude = useRef(0)
  const smoothBass = useRef(0)
  const smoothMids = useRef(0)
  const smoothHighs = useRef(0)
  const elementRef = useRef<HTMLAudioElement | null>(null)

  const setSourceElement = useCallback((el: HTMLAudioElement | null) => {
    elementRef.current = el
  }, [])

  useEffect(() => {
    if (!enabled) return

    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    audioContextRef.current = ctx
    const analyser = ctx.createAnalyser()
    analyser.fftSize = FFT_SIZE
    analyser.smoothingTimeConstant = 0.7
    analyserRef.current = analyser

    if (stream) {
      const source = ctx.createMediaStreamSource(stream)
      source.connect(analyser)
      sourceRef.current = source
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount)

    const tick = () => {
      if (!analyserRef.current || !enabled) return
      analyserRef.current.getByteFrequencyData(dataArray)
      const len = dataArray.length

      let sum = 0
      for (let i = 0; i < len; i++) sum += dataArray[i]
      const rawAmp = len > 0 ? (sum / len) / 255 : 0

      let bassSum = 0
      const bassCount = Math.min(BASS_END, len)
      for (let i = 0; i < bassCount; i++) bassSum += dataArray[i]
      const rawBass = bassCount > 0 ? (bassSum / bassCount) / 255 : 0

      let midsSum = 0
      const midsCount = Math.min(MIDS_END - MIDS_START, len - MIDS_START)
      for (let i = MIDS_START; i < MIDS_START + midsCount; i++) midsSum += dataArray[i]
      const rawMids = midsCount > 0 ? (midsSum / midsCount) / 255 : 0

      let highsSum = 0
      const highsCount = len - HIGHS_START
      for (let i = HIGHS_START; i < len; i++) highsSum += dataArray[i]
      const rawHighs = highsCount > 0 ? (highsSum / highsCount) / 255 : 0

      smoothAmplitude.current = SMOOTHING * smoothAmplitude.current + (1 - SMOOTHING) * rawAmp
      smoothBass.current = SMOOTHING * smoothBass.current + (1 - SMOOTHING) * rawBass
      smoothMids.current = SMOOTHING * smoothMids.current + (1 - SMOOTHING) * rawMids
      smoothHighs.current = SMOOTHING * smoothHighs.current + (1 - SMOOTHING) * rawHighs

      setState({
        amplitude: smoothAmplitude.current,
        bass: smoothBass.current,
        mids: smoothMids.current,
        highs: smoothHighs.current,
        fftSize: FFT_SIZE,
      })
      animationRef.current = requestAnimationFrame(tick)
    }
    animationRef.current = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(animationRef.current)
      sourceRef.current?.disconnect()
      analyserRef.current = null
      ctx.close().catch(() => {})
      audioContextRef.current = null
    }
  }, [stream, enabled])

  // Wire HTMLAudioElement when it's set (e.g. TTS or music playback)
  useEffect(() => {
    const el = elementRef.current
    const ctx = audioContextRef.current
    const existingSource = sourceRef.current
    if (!el || !ctx || !analyserRef.current) return
    if (existingSource && 'mediaStream' in existingSource) return // already using stream

    try {
      existingSource?.disconnect()
      const source = ctx.createMediaElementSource(el)
      source.connect(analyserRef.current)
      sourceRef.current = source
    } catch (e) {
      console.warn('[Avatar] Could not connect audio element:', e)
    }
    return () => {
      sourceRef.current?.disconnect()
      sourceRef.current = null
    }
  }, [state.amplitude]) // re-run when state updates so we pick up element when it's set

  return { ...state, setSourceElement }
}
