import { useCallback, useEffect, useState, useRef } from 'react'

export interface MicrophoneRecorderState {
  isRecording: boolean
  isSupported: boolean
  error: string | null
  /** Current recording level 0–1 for avatar reactivity */
  level: number
  /** Active mic stream while recording (for useAudioAnalyzer) */
  stream: MediaStream | null
}

export function useMicrophoneRecorder(options: {
  onTranscript?: (text: string) => void
  onStart?: () => void
  onStop?: () => void
  /** Backend URL for Whisper or similar STT (optional) */
  backendUrl?: string
}) {
  const [isRecording, setIsRecording] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [level, setLevel] = useState(0)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const analyserRef = useRef<AnalyserNode | null>(null)
  const animationRef = useRef<number>(0)
  const audioContextRef = useRef<AudioContext | null>(null)

  const isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!window.MediaRecorder

  const stopAnalyser = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current)
    analyserRef.current = null
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    setLevel(0)
  }, [])

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      setError('Microphone not supported')
      return
    }
    setError(null)
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = mediaStream
      setStream(mediaStream)

      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      audioContextRef.current = ctx
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 128
      analyser.smoothingTimeConstant = 0.8
      ctx.createMediaStreamSource(mediaStream).connect(analyser)
      analyserRef.current = analyser

      const dataArray = new Uint8Array(analyser.frequencyBinCount)
      let smoothLevel = 0
      const tick = () => {
        if (!analyserRef.current) return
        analyserRef.current.getByteFrequencyData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i]
        const raw = dataArray.length > 0 ? (sum / dataArray.length) / 255 : 0
        smoothLevel = 0.85 * smoothLevel + 0.15 * raw
        setLevel(smoothLevel)
        animationRef.current = requestAnimationFrame(tick)
      }
      animationRef.current = requestAnimationFrame(tick)

      const recorder = new MediaRecorder(mediaStream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = async () => {
        stopAnalyser()
        mediaStream.getTracks().forEach((t) => t.stop())
        streamRef.current = null
        setStream(null)
        if (chunksRef.current.length === 0) {
          options.onStop?.()
          return
        }
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        if (options.backendUrl) {
          try {
            const form = new FormData()
            form.append('file', blob, 'recording.webm')
            const res = await fetch(`${options.backendUrl}/api/transcribe`, {
              method: 'POST',
              body: form,
            })
            if (res.ok) {
              const data = await res.json()
              if (data.text) options.onTranscript?.(data.text)
            }
          } catch (e) {
            console.warn('[Avatar] Transcribe failed:', e)
          }
        }
        options.onStop?.()
      }
      recorder.start(100)
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      options.onStart?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to access microphone')
      options.onStop?.()
    }
  }, [isSupported, options.onStart, options.onStop, options.onTranscript, options.backendUrl, stopAnalyser])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
    }
    setIsRecording(false)
  }, [])

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      stopAnalyser()
    }
  }, [stopAnalyser])

  return {
    startRecording,
    stopRecording,
    isRecording,
    isSupported,
    error,
    level,
    stream,
  }
}
