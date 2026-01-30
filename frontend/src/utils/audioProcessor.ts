/**
 * Advanced Audio Processing for Human-like TTS
 * 
 * Features:
 * - Crossfade between audio chunks for seamless transitions
 * - Subtle room reverb for presence/warmth
 * - Light compression to even out dynamics
 * - EQ presets (warm, bright, radio)
 * - Dynamic pacing with configurable inter-sentence pauses
 */

export type SoundPreset = 'neutral' | 'warm' | 'bright' | 'radio' | 'vintage'

export interface AudioProcessorConfig {
  preset: SoundPreset
  reverbEnabled: boolean
  reverbAmount: number // 0-1, mix of dry/wet
  compressionEnabled: boolean
  crossfadeMs: number // milliseconds of crossfade between chunks
}

export const DEFAULT_AUDIO_CONFIG: AudioProcessorConfig = {
  preset: 'neutral',
  reverbEnabled: true,
  reverbAmount: 0.15, // subtle
  compressionEnabled: true,
  crossfadeMs: 50,
}

/**
 * Create a simple convolution reverb impulse response.
 * This creates a short "room" reverb for presence.
 */
function createReverbImpulse(ctx: AudioContext, duration: number = 1.5, decay: number = 2.0): AudioBuffer {
  const sampleRate = ctx.sampleRate
  const length = sampleRate * duration
  const impulse = ctx.createBuffer(2, length, sampleRate)
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = impulse.getChannelData(channel)
    for (let i = 0; i < length; i++) {
      // Exponential decay with noise
      const t = i / sampleRate
      const envelope = Math.exp(-t * decay)
      // Stereo variation for width
      const noise = (Math.random() * 2 - 1) * envelope
      channelData[i] = noise * 0.5
    }
  }
  
  return impulse
}

/**
 * AudioProcessor class manages a persistent audio context and processing chain.
 */
export class AudioProcessor {
  private ctx: AudioContext | null = null
  private convolver: ConvolverNode | null = null
  private compressor: DynamicsCompressorNode | null = null
  private dryGain: GainNode | null = null
  private wetGain: GainNode | null = null
  private masterGain: GainNode | null = null
  private config: AudioProcessorConfig
  
  // For crossfade: track the previous source's end
  private lastSourceEndTime: number = 0
  private activeSource: AudioBufferSourceNode | null = null
  
  constructor(config: Partial<AudioProcessorConfig> = {}) {
    this.config = { ...DEFAULT_AUDIO_CONFIG, ...config }
  }
  
  private async ensureContext(): Promise<AudioContext> {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
      await this.setupProcessingChain()
    }
    if (this.ctx.state === 'suspended') {
      await this.ctx.resume()
    }
    return this.ctx
  }
  
  private async setupProcessingChain(): Promise<void> {
    if (!this.ctx) return
    
    // Create reverb (convolver)
    this.convolver = this.ctx.createConvolver()
    this.convolver.buffer = createReverbImpulse(this.ctx, 1.2, 2.5)
    
    // Create compressor for even dynamics
    this.compressor = this.ctx.createDynamicsCompressor()
    this.compressor.threshold.value = -24 // dB
    this.compressor.knee.value = 12
    this.compressor.ratio.value = 4
    this.compressor.attack.value = 0.003 // fast attack
    this.compressor.release.value = 0.15 // medium release
    
    // Dry/wet mix for reverb
    this.dryGain = this.ctx.createGain()
    this.wetGain = this.ctx.createGain()
    this.masterGain = this.ctx.createGain()
    
    this.updateGains()
    
    // Wet path: convolver -> wetGain
    this.convolver.connect(this.wetGain)
    this.wetGain.connect(this.masterGain)
    
    // Dry path: dryGain
    this.dryGain.connect(this.masterGain)
    
    // Master -> compressor -> destination
    if (this.config.compressionEnabled) {
      this.masterGain.connect(this.compressor)
      this.compressor.connect(this.ctx.destination)
    } else {
      this.masterGain.connect(this.ctx.destination)
    }
  }
  
  private updateGains(): void {
    if (!this.dryGain || !this.wetGain) return
    
    const wetAmount = this.config.reverbEnabled ? this.config.reverbAmount : 0
    this.wetGain.gain.value = wetAmount
    this.dryGain.gain.value = 1 - wetAmount * 0.3 // slight reduction when reverb is on
  }
  
  /**
   * Create EQ filter chain based on preset.
   */
  private createEQChain(ctx: AudioContext): BiquadFilterNode[] {
    const filters: BiquadFilterNode[] = []
    const preset = this.config.preset
    
    if (preset === 'neutral') {
      return filters
    }
    
    if (preset === 'warm') {
      // Bass boost, slight high cut
      const lowShelf = ctx.createBiquadFilter()
      lowShelf.type = 'lowshelf'
      lowShelf.frequency.value = 200
      lowShelf.gain.value = 10
      filters.push(lowShelf)
      
      // Slight presence dip for warmth
      const highShelf = ctx.createBiquadFilter()
      highShelf.type = 'highshelf'
      highShelf.frequency.value = 6000
      highShelf.gain.value = -3
      filters.push(highShelf)
    } else if (preset === 'bright') {
      // Treble boost, presence boost
      const highShelf = ctx.createBiquadFilter()
      highShelf.type = 'highshelf'
      highShelf.frequency.value = 2400
      highShelf.gain.value = 12
      filters.push(highShelf)
      
      // Presence peak
      const presence = ctx.createBiquadFilter()
      presence.type = 'peaking'
      presence.frequency.value = 3500
      presence.gain.value = 4
      presence.Q.value = 0.8
      filters.push(presence)
    } else if (preset === 'radio') {
      // Classic "radio voice": bass cut, mid boost, treble cut
      const lowCut = ctx.createBiquadFilter()
      lowCut.type = 'highpass'
      lowCut.frequency.value = 300
      lowCut.Q.value = 0.7
      filters.push(lowCut)
      
      const midBoost = ctx.createBiquadFilter()
      midBoost.type = 'peaking'
      midBoost.frequency.value = 1100
      midBoost.gain.value = 10
      midBoost.Q.value = 1.2
      filters.push(midBoost)
      
      const highCut = ctx.createBiquadFilter()
      highCut.type = 'lowpass'
      highCut.frequency.value = 8000
      highCut.Q.value = 0.7
      filters.push(highCut)
    } else if (preset === 'vintage') {
      // 80s retro: tape warmth (bass bump), rolled-off highs, mid presence
      const lowShelf = ctx.createBiquadFilter()
      lowShelf.type = 'lowshelf'
      lowShelf.frequency.value = 180
      lowShelf.gain.value = 6
      filters.push(lowShelf)
      
      const midPresence = ctx.createBiquadFilter()
      midPresence.type = 'peaking'
      midPresence.frequency.value = 2200
      midPresence.gain.value = 4
      midPresence.Q.value = 0.7
      filters.push(midPresence)
      
      const highRolloff = ctx.createBiquadFilter()
      highRolloff.type = 'highshelf'
      highRolloff.frequency.value = 5000
      highRolloff.gain.value = -5
      filters.push(highRolloff)
      
      const lowpass = ctx.createBiquadFilter()
      lowpass.type = 'lowpass'
      lowpass.frequency.value = 10000
      lowpass.Q.value = 0.5
      filters.push(lowpass)
    }
    
    return filters
  }
  
  /**
   * Play an audio blob with full processing chain.
   * Returns a promise that resolves when playback ends.
   */
  async playBlob(
    blob: Blob,
    onEnd?: () => void,
    onError?: (e: Error) => void,
  ): Promise<void> {
    try {
      const ctx = await this.ensureContext()
      const arrayBuffer = await blob.arrayBuffer()
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
      
      // Stop previous source if any
      if (this.activeSource) {
        try {
          this.activeSource.stop()
        } catch {
          // Already stopped
        }
      }
      
      // Create source
      const source = ctx.createBufferSource()
      source.buffer = audioBuffer
      this.activeSource = source
      
      // Build chain: source -> EQ -> dry/wet split -> master
      let lastNode: AudioNode = source
      
      // EQ chain
      const eqFilters = this.createEQChain(ctx)
      for (const filter of eqFilters) {
        lastNode.connect(filter)
        lastNode = filter
      }
      
      // Split to dry and wet (reverb)
      if (this.dryGain && this.wetGain && this.convolver) {
        lastNode.connect(this.dryGain)
        if (this.config.reverbEnabled) {
          lastNode.connect(this.convolver)
        }
      } else {
        // Fallback: connect directly to destination
        lastNode.connect(ctx.destination)
      }
      
      // Crossfade: if we're starting close to when the last source ended
      const now = ctx.currentTime
      const timeSinceLast = now - this.lastSourceEndTime
      const crossfadeMs = this.config.crossfadeMs
      
      if (timeSinceLast < crossfadeMs / 1000 && this.masterGain) {
        // Quick fade in
        this.masterGain.gain.setValueAtTime(0.5, now)
        this.masterGain.gain.linearRampToValueAtTime(1, now + crossfadeMs / 1000)
      }
      
      source.onended = () => {
        this.lastSourceEndTime = ctx.currentTime
        this.activeSource = null
        onEnd?.()
      }
      
      source.start(0)
    } catch (e) {
      onError?.(e instanceof Error ? e : new Error(String(e)))
    }
  }
  
  /**
   * Play a sequence of blobs with crossfade and optional pauses between them.
   * pausesBetween: array of pause durations in ms (one less than blobs.length)
   */
  async playSequence(
    blobs: Blob[],
    pausesBetween: number[] = [],
    onAllEnd?: () => void,
    onError?: (e: Error) => void,
  ): Promise<void> {
    if (blobs.length === 0) {
      onAllEnd?.()
      return
    }
    
    let index = 0
    
    const playNext = () => {
      if (index >= blobs.length) {
        onAllEnd?.()
        return
      }
      
      const blob = blobs[index]
      const pauseAfter = pausesBetween[index] ?? 0
      index++
      
      this.playBlob(blob, () => {
        if (pauseAfter > 0) {
          setTimeout(playNext, pauseAfter)
        } else {
          // Immediate (with crossfade)
          playNext()
        }
      }, onError)
    }
    
    playNext()
  }
  
  /**
   * Stop current playback.
   */
  stop(): void {
    if (this.activeSource) {
      try {
        this.activeSource.stop()
      } catch {
        // Already stopped
      }
      this.activeSource = null
    }
  }
  
  /**
   * Update configuration and rebuild processing chain if needed.
   */
  updateConfig(config: Partial<AudioProcessorConfig>): void {
    const needsRebuild = 
      config.compressionEnabled !== undefined && config.compressionEnabled !== this.config.compressionEnabled
    
    this.config = { ...this.config, ...config }
    this.updateGains()
    
    if (needsRebuild && this.ctx) {
      // Rebuild chain
      this.setupProcessingChain()
    }
  }
  
  /**
   * Close the audio context and clean up.
   */
  async close(): Promise<void> {
    this.stop()
    if (this.ctx && this.ctx.state !== 'closed') {
      await this.ctx.close()
    }
    this.ctx = null
  }
}

/**
 * Simple helper to play a single blob with preset (legacy compatibility).
 * For streaming/chained playback, use AudioProcessor class.
 */
export async function playBlobWithPreset(
  blob: Blob,
  preset: SoundPreset = 'neutral',
  onEnd?: () => void,
  onError?: (e: Error) => void,
): Promise<void> {
  const processor = new AudioProcessor({ preset, reverbEnabled: true, reverbAmount: 0.12 })
  await processor.playBlob(blob, () => {
    processor.close()
    onEnd?.()
  }, (e) => {
    processor.close()
    onError?.(e)
  })
}

/**
 * Fetch pause hint from backend for a sentence.
 */
export async function fetchPauseHint(sentence: string, backendUrl: string = 'http://localhost:8000'): Promise<number> {
  try {
    const res = await fetch(`${backendUrl}/api/tts/pause-hint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence }),
    })
    if (!res.ok) return 300 // default pause
    const data = await res.json()
    return data.pause_ms ?? 300
  } catch {
    return 300
  }
}
