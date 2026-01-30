/** Sound → visual mapping: how each audio parameter drives the orb */
export interface AvatarSoundVisualParams {
  /** Amplitude → overall expansion & brightness (Energy) */
  energy: number
  /** Bass → inner heartbeat & deep expansion (Core) */
  core: number
  /** Mids → middle layer flow & color warmth */
  warmth: number
  /** Highs → outer flicker & edge sparkle */
  sparkle: number
  /** How fast the orb settles when sound stops (0.5 = slow, 2 = fast) */
  settle: number
}

export const DEFAULT_SOUND_VISUAL_PARAMS: AvatarSoundVisualParams = {
  energy: 1.0,
  core: 1.0,
  warmth: 1.0,
  sparkle: 1.0,
  settle: 1.0,
}

/** Avatar configuration for the WebGL avatar library */
export type IdleAnimation = 'float' | 'pulse' | 'orbit' | 'breathe' | 'drift'
export type SpeakingBehavior = 'expand' | 'wave' | 'ripple' | 'burst' | 'resonate'
export type ListeningBehavior = 'converge' | 'pulse' | 'glow' | 'attract' | 'echo'

export interface AvatarColorScheme {
  primary: string
  secondary: string
  accent: string
  glow: string
}

export interface AvatarConfig {
  id: string
  name: string
  description: string
  particleCount: number
  colorScheme: 'theme' | 'nebula' | 'ruby' | 'sapphire' | 'custom'
  customColors?: AvatarColorScheme
  idleAnimation: IdleAnimation
  speakingBehavior: SpeakingBehavior
  listeningBehavior: ListeningBehavior
  /** Base scale of the particle field (0.5 = tighter, 2 = more spread) */
  fieldScale: number
  /** How strongly audio affects the visualization (0.5–2) */
  audioSensitivity: number
  /** Blob/organic vs discrete particles */
  style: 'particles' | 'blob' | 'hybrid'
}

export const AVATAR_LIBRARY: AvatarConfig[] = [
  {
    id: 'nebula',
    name: 'Data Nebula',
    description: 'Swirling bioluminescent particle cloud',
    particleCount: 1800,
    colorScheme: 'theme',
    idleAnimation: 'drift',
    speakingBehavior: 'resonate',
    listeningBehavior: 'converge',
    fieldScale: 0.7,
    audioSensitivity: 1.0,
    style: 'hybrid',
  },
  {
    id: 'orb',
    name: 'Plasma Orb',
    description: 'Pulsating energy sphere',
    particleCount: 1400,
    colorScheme: 'theme',
    idleAnimation: 'pulse',
    speakingBehavior: 'expand',
    listeningBehavior: 'glow',
    fieldScale: 0.55,
    audioSensitivity: 1.0,
    style: 'blob',
  },
  {
    id: 'waveform',
    name: 'Audio Wave',
    description: 'Classic waveform visualization',
    particleCount: 1000,
    colorScheme: 'sapphire',
    idleAnimation: 'float',
    speakingBehavior: 'wave',
    listeningBehavior: 'echo',
    fieldScale: 0.65,
    audioSensitivity: 1.2,
    style: 'particles',
  },
  {
    id: 'ember',
    name: 'Ember',
    description: 'Warm floating embers',
    particleCount: 1200,
    colorScheme: 'ruby',
    idleAnimation: 'breathe',
    speakingBehavior: 'burst',
    listeningBehavior: 'attract',
    fieldScale: 0.7,
    audioSensitivity: 1.0,
    style: 'particles',
  },
  {
    id: 'void',
    name: 'Void Core',
    description: 'Minimal dark core with bright edges',
    particleCount: 600,
    colorScheme: 'theme',
    idleAnimation: 'orbit',
    speakingBehavior: 'ripple',
    listeningBehavior: 'pulse',
    fieldScale: 0.5,
    audioSensitivity: 1.0,
    style: 'blob',
  },
]

export const DEFAULT_AVATAR_ID = 'nebula'

export function getAvatarConfig(id: string): AvatarConfig {
  return AVATAR_LIBRARY.find((a) => a.id === id) ?? AVATAR_LIBRARY[0]
}
