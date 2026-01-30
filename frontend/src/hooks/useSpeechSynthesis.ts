import { useCallback, useEffect, useState, useRef } from 'react'

export interface SpeechSynthesisState {
  isSpeaking: boolean
  isPaused: boolean
  voices: SpeechSynthesisVoice[]
  selectedVoice: SpeechSynthesisVoice | null
  rate: number
  pitch: number
  volume: number
}

export interface UseSpeechSynthesisOptions {
  onStart?: () => void
  onEnd?: () => void
  onBoundary?: (charIndex: number) => void
  onError?: (e: Error) => void
}

export function useSpeechSynthesis(options: UseSpeechSynthesisOptions = {}) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [selectedVoice, setSelectedVoice] = useState<SpeechSynthesisVoice | null>(null)
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)
  const [volume, setVolume] = useState(1)
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null)

  useEffect(() => {
    const loadVoices = () => {
      const list = window.speechSynthesis.getVoices()
      setVoices(list)
      if (list.length > 0 && !selectedVoice) {
        const en = list.find((v) => v.lang.startsWith('en'))
        setSelectedVoice(en ?? list[0])
      }
    }
    loadVoices()
    window.speechSynthesis.onvoiceschanged = loadVoices
    return () => {
      window.speechSynthesis.onvoiceschanged = null
    }
  }, [])

  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return
      window.speechSynthesis.cancel()
      const u = new SpeechSynthesisUtterance(text)
      u.rate = rate
      u.pitch = pitch
      u.volume = volume
      if (selectedVoice) u.voice = selectedVoice
      u.onstart = () => {
        setIsSpeaking(true)
        setIsPaused(false)
        options.onStart?.()
      }
      u.onend = () => {
        setIsSpeaking(false)
        setIsPaused(false)
        options.onEnd?.()
      }
      u.onerror = (e) => {
        setIsSpeaking(false)
        options.onError?.(new Error(e.error))
      }
      u.onboundary = (e) => {
        if (e.charIndex != null) options.onBoundary?.(e.charIndex)
      }
      utteranceRef.current = u
      window.speechSynthesis.speak(u)
    },
    [rate, pitch, volume, selectedVoice, options.onStart, options.onEnd, options.onBoundary, options.onError]
  )

  const stop = useCallback(() => {
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
    setIsPaused(false)
  }, [])

  const pause = useCallback(() => {
    window.speechSynthesis.pause()
    setIsPaused(true)
  }, [])

  const resume = useCallback(() => {
    window.speechSynthesis.resume()
    setIsPaused(false)
  }, [])

  return {
    speak,
    stop,
    pause,
    resume,
    voices,
    selectedVoice,
    setSelectedVoice,
    isSpeaking,
    isPaused,
    rate,
    setRate,
    pitch,
    setPitch,
    volume,
    setVolume,
  }
}
