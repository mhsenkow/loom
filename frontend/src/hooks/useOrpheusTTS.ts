import { useCallback, useState, useRef, useEffect } from 'react'
import type { OrpheusTTSParams } from '../types/tts'
import { AudioProcessor, type SoundPreset, type AudioProcessorConfig } from '../utils/audioProcessor'

const API_BASE = 'http://localhost:8000'

export interface UseOrpheusTTSOptions {
  backendUrl?: string
  onStart?: () => void
  onEnd?: () => void
  onError?: (e: Error) => void
  /** Enable reverb for presence/warmth (default: true) */
  reverbEnabled?: boolean
  /** Reverb amount 0-1 (default: 0.15) */
  reverbAmount?: number
  /** Enable compression for even dynamics (default: true) */
  compressionEnabled?: boolean
}

export function useOrpheusTTS(
  orpheusParams: OrpheusTTSParams,
  options: UseOrpheusTTSOptions = {}
) {
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const generateAbortRef = useRef<AbortController | null>(null)
  const processorRef = useRef<AudioProcessor | null>(null)
  
  const { 
    backendUrl = API_BASE, 
    onStart, 
    onEnd, 
    onError,
    reverbEnabled = true,
    reverbAmount = 0.15,
    compressionEnabled = true,
  } = options
  const preset = (orpheusParams.soundPreset ?? 'neutral') as SoundPreset

  // Initialize and update audio processor
  useEffect(() => {
    if (!processorRef.current) {
      processorRef.current = new AudioProcessor({
        preset,
        reverbEnabled,
        reverbAmount,
        compressionEnabled,
        crossfadeMs: 40,
      })
    } else {
      processorRef.current.updateConfig({
        preset,
        reverbEnabled,
        reverbAmount,
        compressionEnabled,
      })
    }
  }, [preset, reverbEnabled, reverbAmount, compressionEnabled])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processorRef.current?.close()
      processorRef.current = null
    }
  }, [])

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    processorRef.current?.stop()
    setIsSpeaking(false)
  }, [])

  /** Fetch TTS audio only; returns blob for caching. Does not play. */
  const generate = useCallback(
    async (text: string): Promise<Blob> => {
      if (!text.trim()) throw new Error('Empty text')
      if (generateAbortRef.current) generateAbortRef.current.abort()
      const controller = new AbortController()
      generateAbortRef.current = controller
      setIsGenerating(true)
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
              // Enable prosody engine for human-like speech
              naturalize: true,
              breath_frequency: 0.35,
              dynamic_temperature: true,
            },
          }),
          signal: controller.signal,
        })
        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(err.detail || res.statusText)
        }
        const blob = await res.blob()
        generateAbortRef.current = null
        setIsGenerating(false)
        return blob
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e
        generateAbortRef.current = null
        setIsGenerating(false)
        throw e
      }
    },
    [backendUrl, orpheusParams.voice, orpheusParams.temperature, orpheusParams.repetitionPenalty, orpheusParams.readingStyle, orpheusParams.endpointOverride]
  )

  /** Play a cached blob with full audio processing (reverb, compression, EQ). Optional customOnEnd for chaining. */
  const playBlob = useCallback(
    (blob: Blob, customOnEnd?: () => void) => {
      stop()
      setIsSpeaking(true)
      onStart?.()
      
      const done = () => {
        setIsSpeaking(false)
        if (customOnEnd) {
          customOnEnd()
        } else {
          onEnd?.()
        }
      }
      
      if (!processorRef.current) {
        processorRef.current = new AudioProcessor({
          preset,
          reverbEnabled,
          reverbAmount,
          compressionEnabled,
          crossfadeMs: 40,
        })
      }
      
      processorRef.current.playBlob(blob, done, (e) => {
        setIsSpeaking(false)
        onError?.(e)
        if (customOnEnd) customOnEnd()
      })
    },
    [preset, reverbEnabled, reverbAmount, compressionEnabled, stop, onStart, onEnd, onError]
  )

  /** Play a sequence of blobs with crossfade and pauses. */
  const playSequence = useCallback(
    (blobs: Blob[], pausesBetween: number[] = [], onAllEnd?: () => void) => {
      if (blobs.length === 0) {
        onAllEnd?.()
        return
      }
      
      stop()
      setIsSpeaking(true)
      onStart?.()
      
      if (!processorRef.current) {
        processorRef.current = new AudioProcessor({
          preset,
          reverbEnabled,
          reverbAmount,
          compressionEnabled,
          crossfadeMs: 40,
        })
      }
      
      processorRef.current.playSequence(blobs, pausesBetween, () => {
        setIsSpeaking(false)
        onEnd?.()
        onAllEnd?.()
      }, (e) => {
        setIsSpeaking(false)
        onError?.(e)
      })
    },
    [preset, reverbEnabled, reverbAmount, compressionEnabled, stop, onStart, onEnd, onError]
  )

  const speak = useCallback(
    async (text: string) => {
      if (!text.trim()) return
      stop()
      if (generateAbortRef.current) generateAbortRef.current.abort()
      generateAbortRef.current = null

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
              naturalize: true,
              breath_frequency: 0.35,
              dynamic_temperature: true,
            },
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: res.statusText }))
          throw new Error(err.detail || res.statusText)
        }

        const blob = await res.blob()
        
        if (!processorRef.current) {
          processorRef.current = new AudioProcessor({
            preset,
            reverbEnabled,
            reverbAmount,
            compressionEnabled,
            crossfadeMs: 40,
          })
        }
        
        processorRef.current.playBlob(blob, () => {
          setIsSpeaking(false)
          onEnd?.()
        }, (e) => {
          setIsSpeaking(false)
          onError?.(e)
        })
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        abortRef.current = null
        setIsSpeaking(false)
        onError?.(e instanceof Error ? e : new Error(String(e)))
      }
    },
    [backendUrl, orpheusParams.voice, orpheusParams.temperature, orpheusParams.repetitionPenalty, orpheusParams.readingStyle, orpheusParams.endpointOverride, preset, reverbEnabled, reverbAmount, compressionEnabled, stop, onStart, onEnd, onError]
  )

  return { speak, stop, isSpeaking, generate, playBlob, playSequence, isGenerating }
}
