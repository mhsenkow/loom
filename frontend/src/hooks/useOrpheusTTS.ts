import { useCallback, useState, useRef } from 'react'
import type { OrpheusTTSParams } from '../types/tts'

const API_BASE = 'http://localhost:8000'

export interface UseOrpheusTTSOptions {
  backendUrl?: string
  onStart?: () => void
  onEnd?: () => void
  onError?: (e: Error) => void
}

export function useOrpheusTTS(
  orpheusParams: OrpheusTTSParams,
  options: UseOrpheusTTSOptions = {}
) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const { backendUrl = API_BASE, onStart, onEnd, onError } = options

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    const current = audioRef.current
    if (current) {
      if ('pause' in current && typeof current.pause === 'function') {
        current.pause()
        current.src = ''
      } else if (current && typeof (current as { src?: AudioBufferSourceNode }).src?.stop === 'function') {
        (current as { src: AudioBufferSourceNode }).src.stop()
      }
      audioRef.current = null
    }
    setIsSpeaking(false)
  }, [])

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      stop()

      const controller = new AbortController()
      abortRef.current = controller
      setIsSpeaking(true)
      onStart?.()

      try {
        const res = await fetch(`${backendUrl}/api/tts/speak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.trim(),
            model_type: 'orpheus',
            orpheus: {
              voice: orpheusParams.voice,
              temperature: orpheusParams.temperature,
              repetition_penalty: orpheusParams.repetitionPenalty,
              reading_style: orpheusParams.readingStyle ?? undefined,
              endpoint_override: orpheusParams.endpointOverride ?? undefined,
            },
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(err.detail || res.statusText)
        }

        const blob = await res.blob()
        const preset = orpheusParams.soundPreset ?? 'neutral'

        if (preset !== 'neutral') {
          // Apply sound preset via Web Audio (bass/treble EQ)
          const arrayBuffer = await blob.arrayBuffer()
          const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
          const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0))
          const src = ctx.createBufferSource()
          src.buffer = decoded

          const filterNode = ctx.createBiquadFilter()
          filterNode.frequency.value = preset === 'bright' ? 2400 : 200
          filterNode.type = preset === 'bright' ? 'highshelf' : 'lowshelf'
          filterNode.gain.value = preset === 'radio' ? 2 : preset === 'bright' ? 14 : 14

          const onDone = () => {
            audioRef.current = null
            abortRef.current = null
            setIsSpeaking(false)
            onEnd?.()
          }
          src.onended = onDone

          if (preset === 'radio') {
            const mid = ctx.createBiquadFilter()
            mid.type = 'peaking'
            mid.frequency.value = 1100
            mid.gain.value = 10
            mid.Q.value = 1.2
            src.connect(filterNode)
            filterNode.connect(mid)
            mid.connect(ctx.destination)
          } else {
            src.connect(filterNode)
            filterNode.connect(ctx.destination)
          }
          src.start(0)
          audioRef.current = { src } as unknown as HTMLAudioElement
          return
        }

        const url = URL.createObjectURL(blob)
        const audio = new Audio(url)
        audioRef.current = audio

        audio.onended = () => {
          URL.revokeObjectURL(url)
          audioRef.current = null
          abortRef.current = null
          setIsSpeaking(false)
          onEnd?.()
        }
        audio.onerror = () => {
          URL.revokeObjectURL(url)
          audioRef.current = null
          abortRef.current = null
          setIsSpeaking(false)
          onError?.(new Error('Orpheus TTS playback failed'))
        }

        await audio.play()
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        abortRef.current = null
        setIsSpeaking(false)
        onError?.(e instanceof Error ? e : new Error(String(e)))
      }
    },
    [backendUrl, orpheusParams.voice, orpheusParams.temperature, orpheusParams.repetitionPenalty, orpheusParams.readingStyle, orpheusParams.soundPreset, orpheusParams.endpointOverride, stop, onStart, onEnd, onError]
  )

  return { speak, stop, isSpeaking }
}
