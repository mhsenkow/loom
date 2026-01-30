import { useCallback, useState, useEffect } from 'react'
import { AvatarContainer } from './AvatarContainer'
import { AvatarLibrary } from './AvatarLibrary'
import { TTSBackendLoader } from './TTSBackendLoader'
import type { AvatarConfig, AvatarSoundVisualParams } from '../../types/avatar'
import type { AudioAnalyzerState } from '../../hooks/useAudioAnalyzer'
import type { LogEntry } from '../../types/module'
import type { TTSModelType, OrpheusTTSParams, OrpheusReadingStyle, OrpheusSoundPreset } from '../../types/tts'
import { ORPHEUS_VOICES } from '../../types/tts'

const READING_STYLES: { id: OrpheusReadingStyle; label: string }[] = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'expressive', label: 'Expressive' },
  { id: 'calm', label: 'Calm' },
  { id: 'sick', label: 'Sick (sniffling)' },
  { id: 'unsure', label: 'Unsure' },
  { id: 'angry', label: 'Angry' },
  { id: 'sad', label: 'Sad' },
]
const SOUND_PRESETS: { id: OrpheusSoundPreset; label: string }[] = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'warm', label: 'Warm (more bass)' },
  { id: 'bright', label: 'Bright (more treble)' },
  { id: 'radio', label: 'Radio' },
  { id: 'vintage', label: '80s Retro (tape + warmth)' },
]

function CollapsibleSection({
  id,
  title,
  defaultOpen = false,
  children,
  className = '',
}: {
  id: string
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className={className}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between text-left py-1.5 -mx-1 px-1 rounded hover:bg-phosphor/10 transition-colors"
        aria-expanded={open}
      >
        <h3 className="text-phosphor font-bold text-[10px] uppercase tracking-wider">
          {title}
        </h3>
        <span className="text-phosphor text-xs" aria-hidden>
          {open ? '▼' : '▶'}
        </span>
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </section>
  )
}

export interface AvatarPanelProps {
  onClose: () => void
  config: AvatarConfig
  onConfigChange: (config: AvatarConfig) => void
  audio: AudioAnalyzerState
  speaking: boolean
  listening: boolean
  onSpeak: (text: string) => void
  onStop: () => void
  /** When on, TTS is generated as soon as an AI response arrives (Orpheus only); cached for replay */
  autoGenerateAudio?: boolean
  onAutoGenerateAudioChange?: (v: boolean) => void
  /** AI entries to choose from for "Read aloud" */
  aiEntries: LogEntry[]
  /** Currently selected entry id for Read aloud */
  selectedEntryId: string | null
  onSelectEntry: (entryId: string | null) => void
  /** Cached audio blob for the selected entry (Orpheus); enables Play button */
  cachedAudioBlob?: Blob
  /** Entry id currently being generated (show "Generating…") */
  generatingEntryId?: string | null
  isOrpheusGenerating?: boolean
  /** Trigger generate for selected entry (Orpheus); when done, cache and play */
  onGenerateForSelected?: () => void
  /** Play cached blob for selected entry */
  onPlayCached?: () => void
  /** Voice controls from useSpeechSynthesis */
  voices: SpeechSynthesisVoice[]
  selectedVoice: SpeechSynthesisVoice | null
  onVoiceChange: (voice: SpeechSynthesisVoice | null) => void
  rate: number
  onRateChange: (rate: number) => void
  pitch: number
  onPitchChange: (pitch: number) => void
  volume: number
  onVolumeChange: (volume: number) => void
  /** Avatar audio sensitivity override (0.5–2) */
  audioSensitivityOverride: number
  onAudioSensitivityOverrideChange: (v: number) => void
  /** Sound → visual mapping (5 params) */
  soundVisualParams: AvatarSoundVisualParams
  onSoundVisualParamsChange: (p: AvatarSoundVisualParams) => void
  /** TTS model: browser (Web Speech API) or Orpheus */
  ttsModelType: TTSModelType
  onTTSModelTypeChange: (t: TTSModelType) => void
  /** Orpheus-TTS params when model is orpheus */
  orpheusParams: OrpheusTTSParams
  onOrpheusParamsChange: (p: OrpheusTTSParams) => void
  /** Open the focused Voice Chat modal (talk back and forth) */
  onOpenVoiceChat: () => void
  pixelate?: boolean
}

const MAX_AI_ENTRIES = 20
const TTS_API_BASE = 'http://localhost:8000'

interface TTSStatus {
  orpheus_model_cached: boolean
  orpheus_downloading: boolean
  orpheus_download_progress: number
  orpheus_download_message: string
  orpheus_error: string | null
}

export function AvatarPanel({
  onClose,
  config,
  onConfigChange,
  audio,
  speaking,
  listening,
  onSpeak,
  onStop,
  autoGenerateAudio = false,
  onAutoGenerateAudioChange,
  aiEntries,
  selectedEntryId,
  onSelectEntry,
  cachedAudioBlob,
  generatingEntryId = null,
  isOrpheusGenerating = false,
  onGenerateForSelected,
  onPlayCached,
  voices,
  selectedVoice,
  onVoiceChange,
  rate,
  onRateChange,
  pitch,
  onPitchChange,
  volume,
  onVolumeChange,
  audioSensitivityOverride,
  onAudioSensitivityOverrideChange,
  soundVisualParams,
  onSoundVisualParamsChange,
  ttsModelType,
  onTTSModelTypeChange,
  orpheusParams,
  onOrpheusParamsChange,
  onOpenVoiceChat,
  pixelate = true,
}: AvatarPanelProps) {
  const [ttsStatus, setTtsStatus] = useState<TTSStatus | null>(null)
  const selectedContent = aiEntries.find((e) => e.id === selectedEntryId)?.content ?? ''

  const fetchTTSStatus = useCallback(async () => {
    try {
      const res = await fetch(`${TTS_API_BASE}/api/tts/status`)
      if (!res.ok) return
      const data = await res.json()
      setTtsStatus({
        orpheus_model_cached: data.orpheus_model_cached ?? false,
        orpheus_downloading: data.orpheus_downloading ?? false,
        orpheus_download_progress: data.orpheus_download_progress ?? 0,
        orpheus_download_message: data.orpheus_download_message ?? '',
        orpheus_error: data.orpheus_error ?? null,
      })
    } catch {
      setTtsStatus(null)
    }
  }, [])

  useEffect(() => {
    if (ttsModelType !== 'orpheus') return
    fetchTTSStatus()
    const interval = setInterval(fetchTTSStatus, 3000)
    return () => clearInterval(interval)
  }, [ttsModelType, fetchTTSStatus])
  const handleReadAloud = useCallback(() => {
    if (selectedContent.trim()) onSpeak(selectedContent)
  }, [selectedContent, onSpeak])

  const list = aiEntries.filter((e) => e.type === 'ai' && (e.content?.trim() ?? '')).slice(-MAX_AI_ENTRIES).reverse()

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-slate border-l-2 border-phosphor z-40 flex flex-col overflow-hidden">
      {/* Avatar view – tall, centered; floating TTS loader to the left when generating */}
      <div className="absolute top-0 left-0 right-0 h-[480px] flex items-center justify-center pointer-events-none overflow-hidden opacity-65">
        <TTSBackendLoader active={!!isOrpheusGenerating} />
        <AvatarContainer
          config={config}
          audio={audio}
          speaking={speaking}
          listening={listening}
          audioSensitivityOverride={audioSensitivityOverride}
          soundVisualParams={soundVisualParams}
          pixelate={false}
          transparent={true}
          width={420}
          height={420}
          className=""
        />
      </div>

      {/* Header */}
      <div className="p-4 pt-6 flex items-center justify-between shrink-0 relative z-10">
        <div>
          <h2 className="text-sm font-bold text-phosphor">VOICE & AVATAR</h2>
          <p className="text-[10px] text-terminal-muted mt-0.5">Read aloud, voice chat</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-terminal-muted hover:text-phosphor text-lg px-2"
          title="Close panel"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col relative z-10">
        {/* Spacer pushes sections to bottom so avatar has room at top */}
        <div className="flex-1 min-h-[280px]" />
        <div className="flex flex-col gap-3 pb-4">
        {/* Select response to read / play */}
        <CollapsibleSection
          id="read-aloud"
          title={autoGenerateAudio ? 'Response audio' : 'Response to read aloud'}
          defaultOpen={true}
          className="bg-void/80 backdrop-blur-sm p-3 -mx-4 px-4 border-y border-terminal-border/30"
        >
          {onAutoGenerateAudioChange && (
            <label className="flex items-center gap-2 mb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoGenerateAudio}
                onChange={(e) => onAutoGenerateAudioChange(e.target.checked)}
                className="rounded border-terminal-border bg-void text-phosphor"
              />
              <span className="text-[10px] text-phosphor">Automatically generate audio</span>
            </label>
          )}
          <p className="text-[9px] text-terminal-muted mb-2">
            {autoGenerateAudio && ttsModelType === 'orpheus'
              ? 'Full response is generated as one chunk when the AI finishes; use Play to replay.'
              : autoGenerateAudio
                ? 'Use Orpheus-TTS (below) for generated recordings and replay.'
                : 'Select a response, then Read or Generate.'}
          </p>
          <div className="border border-terminal-border bg-void max-h-32 overflow-y-auto">
            {list.length === 0 ? (
              <div className="p-3 text-terminal-muted text-[10px]">No AI responses yet</div>
            ) : (
              <ul className="divide-y divide-terminal-border">
                {list.map((entry) => (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={() => onSelectEntry(selectedEntryId === entry.id ? null : entry.id)}
                      className={`w-full text-left p-2 text-[10px] font-mono block truncate transition-colors ${
                        selectedEntryId === entry.id
                          ? 'bg-phosphor/20 text-phosphor border-l-2 border-phosphor'
                          : 'text-terminal-muted hover:text-phosphor hover:bg-void'
                      }`}
                      title={entry.content?.slice(0, 200)}
                    >
                      {(entry.content ?? '').slice(0, 60)}
                      {(entry.content?.length ?? 0) > 60 ? '…' : ''}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex gap-2 mt-2 flex-wrap items-center">
            {generatingEntryId === selectedEntryId && isOrpheusGenerating ? (
              <span className="text-xs text-phosphor px-3 py-1.5" title="Audio is being generated">
                Generating…
              </span>
            ) : cachedAudioBlob && onPlayCached ? (
              <button
                type="button"
                onClick={onPlayCached}
                disabled={speaking}
                className="btn-terminal text-xs px-3 py-1.5 disabled:opacity-50"
                title="Play saved recording"
              >
                ▶ Play
              </button>
            ) : onGenerateForSelected && selectedContent.trim() ? (
              <button
                type="button"
                onClick={onGenerateForSelected}
                disabled={speaking || isOrpheusGenerating || !selectedContent.trim()}
                className="btn-terminal text-xs px-3 py-1.5 disabled:opacity-50"
                title="Generate and play audio (Orpheus)"
              >
                Generate
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReadAloud}
                disabled={speaking || !selectedContent.trim()}
                className="btn-terminal text-xs px-3 py-1.5 disabled:opacity-50"
                title="Read selected response aloud"
              >
                🔊 Read
              </button>
            )}
            {speaking && (
              <button
                type="button"
                onClick={onStop}
                className="text-xs px-3 py-1.5 border border-red-500 text-red-400 hover:bg-red-900/30"
                title="Stop speaking"
              >
                ⏹ Stop
              </button>
            )}
            {selectedEntryId && !speaking && (
              <button
                type="button"
                onClick={() => onSelectEntry(null)}
                className="text-[10px] text-terminal-muted hover:text-phosphor border border-terminal-border px-2 py-1"
              >
                Clear
              </button>
            )}
          </div>
        </CollapsibleSection>

        {/* TTS model type: Browser vs Orpheus — collapsed when auto-generate is on */}
        <CollapsibleSection
          id="tts-model"
          title="TTS model"
          defaultOpen={!autoGenerateAudio}
          className="bg-void/70 backdrop-blur-sm p-3 -mx-4 px-4 border-y border-terminal-border/50"
        >
          <div className="space-y-2">
            <label className="text-[10px] text-terminal-muted block">Engine</label>
            <select
              value={ttsModelType}
              onChange={(e) => onTTSModelTypeChange(e.target.value as TTSModelType)}
              className="w-full bg-void border border-terminal-border p-2 text-phosphor text-xs font-mono"
            >
              <option value="browser">Browser (Web Speech API)</option>
              <option value="orpheus">Orpheus-TTS</option>
            </select>
            {ttsModelType === 'orpheus' && (
              <>
                <p className="text-[9px] text-terminal-muted">
                  Human-like speech. Set <code className="text-phosphor/80">ORPHEUS_TTS_URL</code> on the backend or override below.
                </p>
                <p className="text-[9px] text-amber-400/90 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                  <strong>No sound?</strong> On Mac, run <code className="text-phosphor/80">make install-orpheus-mac</code> in the project root (installs orpheus-cpp + Metal), then restart the backend. Or use <strong>Browser</strong> or <strong>Baseten</strong> (below).
                </p>
                <details className="text-[9px] text-terminal-muted mt-1 border border-terminal-border/50 rounded px-2 py-1.5">
                  <summary className="cursor-pointer text-phosphor/80 hover:text-phosphor">How do I get the inference link?</summary>
                  <p className="text-[9px] text-phosphor/80 mt-1">On Mac: run <code>make install-orpheus-mac</code> in the project root for local Orpheus (no link needed).</p>
                  <ol className="list-decimal list-inside mt-1.5 space-y-1 pl-0.5">
                    <li>Go to <a href="https://www.baseten.co/library/orpheus-tts/" target="_blank" rel="noopener noreferrer" className="text-phosphor/80 underline">Baseten Orpheus TTS</a> and click <strong>Deploy now</strong>.</li>
                    <li>Sign up or log in; wait for the model to deploy (a few minutes).</li>
                    <li>On the model page, copy the <strong>predict URL</strong> (looks like <code className="text-phosphor/70">https://model-xxxx.api.baseten.co/.../predict</code>).</li>
                    <li>In Baseten: <strong>Settings → API keys</strong>, create a key and copy it.</li>
                    <li>In your backend env set <code className="text-phosphor/70">ORPHEUS_TTS_URL</code>=that URL and <code className="text-phosphor/70">ORPHEUS_TTS_API_KEY</code>=your key (or paste the URL in Endpoint override below and keep the API key only on the backend).</li>
                  </ol>
                </details>
                <div>
                  <label className="text-[10px] text-terminal-muted block">Voice</label>
                  <select
                    value={orpheusParams.voice}
                    onChange={(e) => onOrpheusParamsChange({ ...orpheusParams, voice: e.target.value })}
                    className="w-full bg-void border border-terminal-border p-2 text-phosphor text-xs font-mono"
                  >
                    {ORPHEUS_VOICES.map((v) => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-terminal-muted block">Temperature</label>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.1}
                    value={orpheusParams.temperature}
                    onChange={(e) => onOrpheusParamsChange({ ...orpheusParams, temperature: Number(e.target.value) })}
                    className="w-full"
                  />
                  <span className="text-[10px] text-phosphor">{orpheusParams.temperature.toFixed(1)}</span>
                </div>
                <div>
                  <label className="text-[10px] text-terminal-muted block">Repetition penalty</label>
                  <input
                    type="range"
                    min={1}
                    max={2}
                    step={0.05}
                    value={orpheusParams.repetitionPenalty}
                    onChange={(e) => onOrpheusParamsChange({ ...orpheusParams, repetitionPenalty: Number(e.target.value) })}
                    className="w-full"
                  />
                  <span className="text-[10px] text-phosphor">{orpheusParams.repetitionPenalty.toFixed(2)}</span>
                </div>
                <div>
                  <label className="text-[10px] text-terminal-muted block">Reading style</label>
                  <select
                    value={orpheusParams.readingStyle ?? 'neutral'}
                    onChange={(e) => onOrpheusParamsChange({ ...orpheusParams, readingStyle: e.target.value as OrpheusReadingStyle })}
                    className="w-full bg-void border border-terminal-border p-2 text-phosphor text-xs font-mono"
                  >
                    {READING_STYLES.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-terminal-muted mt-0.5">How words are read. Odd styles use Orpheus emotive tags (e.g. &lt;sniffle&gt;, &lt;sigh&gt;).</p>
                </div>
                <div>
                  <label className="text-[10px] text-terminal-muted block">Sound</label>
                  <select
                    value={orpheusParams.soundPreset ?? 'neutral'}
                    onChange={(e) => onOrpheusParamsChange({ ...orpheusParams, soundPreset: e.target.value as OrpheusSoundPreset })}
                    className="w-full bg-void border border-terminal-border p-2 text-phosphor text-xs font-mono"
                  >
                    {SOUND_PRESETS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <p className="text-[9px] text-terminal-muted mt-0.5">Heavy EQ after TTS: warm = strong bass, bright = strong treble, radio = strong mid push.</p>
                </div>
                <div>
                  <label className="text-[10px] text-terminal-muted block">Endpoint override (optional)</label>
                  <input
                    type="text"
                    value={orpheusParams.endpointOverride ?? ''}
                    onChange={(e) => onOrpheusParamsChange({ ...orpheusParams, endpointOverride: e.target.value.trim() || undefined })}
                    placeholder="https://..."
                    className="w-full bg-void border border-terminal-border p-2 text-phosphor text-xs font-mono"
                  />
                </div>
                {/* Download Orpheus model */}
                <div className="border-t border-terminal-border/50 pt-2 mt-2">
                  <label className="text-[10px] text-terminal-muted block mb-1">Orpheus model (local)</label>
                  {ttsStatus?.orpheus_model_cached ? (
                    <p className="text-[10px] text-phosphor">Model downloaded (Hugging Face cache)</p>
                  ) : ttsStatus?.orpheus_downloading ? (
                    <p className="text-[10px] text-phosphor">
                      {ttsStatus.orpheus_download_message}
                      {ttsStatus.orpheus_download_progress > 0 && ` ${Math.round(ttsStatus.orpheus_download_progress)}%`}
                    </p>
                  ) : ttsStatus?.orpheus_error ? (
                    <p className="text-[10px] text-red-400">{ttsStatus.orpheus_error}</p>
                  ) : !ttsStatus ? (
                    <p className="text-[10px] text-terminal-muted">Could not reach backend. Start the server and open this panel again.</p>
                  ) : null}
                  {(!ttsStatus || (!ttsStatus.orpheus_model_cached && !ttsStatus.orpheus_downloading)) && (
                    <button
                      type="button"
                      onClick={async () => {
                        const fallbackState: TTSStatus = {
                          orpheus_model_cached: false,
                          orpheus_downloading: false,
                          orpheus_download_progress: 0,
                          orpheus_download_message: '',
                          orpheus_error: null,
                        }
                        try {
                          const res = await fetch(`${TTS_API_BASE}/api/tts/download-model`, { method: 'POST' })
                          const data = await res.json().catch(() => ({}))
                          if (!res.ok) {
                            const msg = data.detail ?? data.message ?? res.statusText
                            setTtsStatus((s) => ({ ...(s ?? fallbackState), orpheus_error: typeof msg === 'string' ? msg : JSON.stringify(msg) }))
                            return
                          }
                          setTtsStatus((s) => ({ ...(s ?? fallbackState), orpheus_error: null }))
                          await fetchTTSStatus()
                          setTimeout(fetchTTSStatus, 600)
                        } catch {
                          setTtsStatus((s) => ({ ...(s ?? fallbackState), orpheus_error: 'Could not reach backend. Is the server running on port 8000?' }))
                        }
                      }}
                      className="btn-terminal text-xs px-3 py-1.5 mt-1"
                    >
                      Download Orpheus model
                    </button>
                  )}
                  <p className="text-[9px] text-terminal-muted mt-1">
                    Downloads canopylabs/orpheus-3b-0.1-ft to ~/.cache/huggingface. You may need to accept the model terms on Hugging Face first.
                  </p>
                </div>
                <a
                  href="https://github.com/canopyai/Orpheus-TTS"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[9px] text-phosphor/70 hover:text-phosphor"
                >
                  Orpheus-TTS on GitHub
                </a>
              </>
            )}
          </div>
        </CollapsibleSection>

        {/* Voice control options (browser TTS) */}
        <CollapsibleSection
          id="voice-tts"
          title="Voice (TTS)"
          defaultOpen={false}
          className="bg-void/70 backdrop-blur-sm p-3 -mx-4 px-4 border-y border-terminal-border/50"
        >
          <div className="space-y-2">
            {ttsModelType === 'browser' && (
              <>
            <label className="text-[10px] text-terminal-muted block">Voice</label>
            <select
              value={selectedVoice?.name ?? ''}
              onChange={(e) => {
                const v = voices.find((x) => x.name === e.target.value) ?? null
                onVoiceChange(v)
              }}
              className="w-full bg-void border border-terminal-border p-2 text-phosphor text-xs font-mono"
            >
              {voices.map((v) => (
                <option key={v.name + v.lang} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-terminal-muted block">Rate</label>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={rate}
                  onChange={(e) => onRateChange(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-[10px] text-phosphor">{rate.toFixed(1)}</span>
              </div>
              <div>
                <label className="text-[10px] text-terminal-muted block">Pitch</label>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={pitch}
                  onChange={(e) => onPitchChange(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-[10px] text-phosphor">{pitch.toFixed(1)}</span>
              </div>
              <div className="col-span-2">
                <label className="text-[10px] text-terminal-muted block">Volume</label>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => onVolumeChange(Number(e.target.value))}
                  className="w-full"
                />
                <span className="text-[10px] text-phosphor">{(volume * 100).toFixed(0)}%</span>
              </div>
            </div>
              </>
            )}
            {ttsModelType === 'orpheus' && (
              <p className="text-[10px] text-terminal-muted">Orpheus uses the voice and params from TTS model above.</p>
            )}
          </div>
        </CollapsibleSection>

        {/* Sound → visual (5 parameters) */}
        <CollapsibleSection
          id="sound-orb"
          title="Sound → orb"
          defaultOpen={false}
          className="bg-void/70 backdrop-blur-sm p-3 -mx-4 px-4 border-y border-terminal-border/50"
        >
          <p className="text-[9px] text-terminal-muted mb-2">
            How each part of your voice drives the orb
          </p>
          <div className="space-y-2">
            <div>
              <label className="text-[10px] text-terminal-muted block">
                Energy (loudness → expansion & brightness)
              </label>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.05}
                value={soundVisualParams.energy}
                onChange={(e) => onSoundVisualParamsChange({ ...soundVisualParams, energy: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-[10px] text-phosphor">{soundVisualParams.energy.toFixed(2)}</span>
            </div>
            <div>
              <label className="text-[10px] text-terminal-muted block">
                Core (bass → inner pulse & heartbeat)
              </label>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.05}
                value={soundVisualParams.core}
                onChange={(e) => onSoundVisualParamsChange({ ...soundVisualParams, core: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-[10px] text-phosphor">{soundVisualParams.core.toFixed(2)}</span>
            </div>
            <div>
              <label className="text-[10px] text-terminal-muted block">
                Warmth (mids → flow & color)
              </label>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.05}
                value={soundVisualParams.warmth}
                onChange={(e) => onSoundVisualParamsChange({ ...soundVisualParams, warmth: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-[10px] text-phosphor">{soundVisualParams.warmth.toFixed(2)}</span>
            </div>
            <div>
              <label className="text-[10px] text-terminal-muted block">
                Sparkle (highs → outer flicker & edge)
              </label>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.05}
                value={soundVisualParams.sparkle}
                onChange={(e) => onSoundVisualParamsChange({ ...soundVisualParams, sparkle: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-[10px] text-phosphor">{soundVisualParams.sparkle.toFixed(2)}</span>
            </div>
            <div>
              <label className="text-[10px] text-terminal-muted block">
                Settle (how fast orb returns to rest)
              </label>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.05}
                value={soundVisualParams.settle}
                onChange={(e) => onSoundVisualParamsChange({ ...soundVisualParams, settle: Number(e.target.value) })}
                className="w-full"
              />
              <span className="text-[10px] text-phosphor">{soundVisualParams.settle.toFixed(2)}</span>
            </div>
          </div>
        </CollapsibleSection>

        {/* Avatar style & sensitivity */}
        <CollapsibleSection
          id="avatar-style"
          title="Avatar style"
          defaultOpen={false}
          className="bg-void/70 backdrop-blur-sm p-3 -mx-4 px-4 border-y border-terminal-border/50"
        >
          <AvatarLibrary selected={config} onSelect={onConfigChange} />
          <div className="mt-2">
            <label className="text-[10px] text-terminal-muted block">Master sensitivity</label>
            <input
              type="range"
              min={0.3}
              max={2.0}
              step={0.05}
              value={audioSensitivityOverride}
              onChange={(e) => onAudioSensitivityOverrideChange(Number(e.target.value))}
              className="w-full"
            />
            <span className="text-[10px] text-phosphor">{audioSensitivityOverride.toFixed(2)}×</span>
          </div>
        </CollapsibleSection>

        {/* Focus into Voice Chat modal */}
        <section className="mt-auto pt-4 bg-void/80 backdrop-blur-sm p-3 -mx-4 px-4 border-t border-terminal-border/50">
          <button
            type="button"
            onClick={onOpenVoiceChat}
            className="btn-terminal w-full text-sm py-2"
            title="Talk back and forth with the AI (voice in, voice out)"
          >
            🎤 Voice chat
          </button>
          <p className="text-[10px] text-terminal-muted mt-2">
            Hold to talk in the modal; AI reply is read aloud.
          </p>
        </section>
        </div>
      </div>
    </div>
  )
}
