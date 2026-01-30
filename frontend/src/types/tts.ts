/** TTS engine: browser (Web Speech API) or Orpheus (backend) */
export type TTSModelType = 'browser' | 'orpheus'

/** How the model reads: affects temperature + optional Orpheus emotive tags */
export type OrpheusReadingStyle =
  | 'neutral'
  | 'expressive'
  | 'calm'
  | 'sick'    // <sniffle>
  | 'unsure'  // hesitant, <sigh>
  | 'angry'
  | 'sad'     // <sigh>

/** Post-playback sound character: EQ-style presets (bass/treble) */
export type OrpheusSoundPreset = 'neutral' | 'warm' | 'bright' | 'radio'

/** Orpheus-TTS parameters (see https://github.com/canopyai/Orpheus-TTS) */
export interface OrpheusTTSParams {
  /** Voice name: tara, leah, jess, leo, dan, mia, zac, zoe (English) */
  voice: string
  /** Sampling temperature (higher = more variable). Default 0.7 */
  temperature: number
  /** Repetition penalty (>= 1.1 required for stability). Default 1.1 */
  repetitionPenalty: number
  /** How words are read: neutral / more expressive / calmer (maps to temperature) */
  readingStyle?: OrpheusReadingStyle
  /** Sound character after TTS: neutral, warmer (more bass), brighter (more treble), radio-style */
  soundPreset?: OrpheusSoundPreset
  /** Optional: override backend default Orpheus endpoint URL */
  endpointOverride?: string
}

export const ORPHEUS_VOICES = [
  { id: 'tara', name: 'Tara' },
  { id: 'leah', name: 'Leah' },
  { id: 'jess', name: 'Jess' },
  { id: 'leo', name: 'Leo' },
  { id: 'dan', name: 'Dan' },
  { id: 'mia', name: 'Mia' },
  { id: 'zac', name: 'Zac' },
  { id: 'zoe', name: 'Zoe' },
] as const

export const DEFAULT_ORPHEUS_PARAMS: OrpheusTTSParams = {
  voice: 'tara',
  temperature: 0.7,
  repetitionPenalty: 1.1,
  readingStyle: 'neutral',
  soundPreset: 'neutral',
}

export const DEFAULT_TTS_MODEL_TYPE: TTSModelType = 'browser'
