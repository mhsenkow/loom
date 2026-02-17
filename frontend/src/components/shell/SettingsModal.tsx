import { useState, useEffect, useCallback } from 'react'
import { OrchestratorSettings } from '../settings/OrchestratorSettings'
import { API_BASE_URL } from '../../config/api'
import {
  fetchImageModels as fetchImageModelsApi,
  invalidateImageModelsCache,
  notifyImageModelsUpdated,
} from '../../utils/imageModelsApi'
import { dispatchDownloadTelemetry } from '../../utils/downloadTelemetry'
import { buildConversationProfileFromSettings, buildConversationProfileStoragePreview } from '../../utils/conversationProfile'
import { loadMemoryVault } from '../../utils/memoryVault'
import { getSocketInstance, type PullStatus } from '../../hooks/useSocket'
import { refreshCircuitsFromBackend } from '../../hooks/useCircuitRunner'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export type ThemeId = 'phosphor' | 'ruby' | 'sapphire' | 'diamond' | 'ebony'
export type CrtIntensityPreset = 'subtle' | 'medium' | 'full' | 'insane'
export type MistralAgentMode = 'off' | 'auto'
export type UiPresetId = 'command' | 'broadcast' | 'arcade' | 'lab' | 'vault'
export type UiCornerStyle = 'hard' | 'soft' | 'chamfer'

export type AppearanceMode = 'retro' | 'normcore' | 'business'
export type NormcoreBase = 'light' | 'dark' | 'system'
export type NormcoreBorders = 'none' | 'hairline' | 'thin'
export type BusinessPresetId = 'enterprise' | 'dashboard' | 'suite' | 'conference'
export type BusinessAccentId = 'blue' | 'slate' | 'indigo' | 'neutral'
export type BusinessDensityId = 'comfortable' | 'compact' | 'dense'
export type BusinessCornersId = 'sharp' | 'slight' | 'rounded'
export type BusinessShadowsId = 'subtle' | 'flat' | 'elevation'
export type FontWeightSetId = 'default' | 'light' | 'medium' | 'heavy' | 'custom'

export type FontWeightValues = {
  fontWeightBody: number
  fontWeightHeading: number
  fontWeightMono: number
  fontWeightUi: number
}

export type VisualSystemSettings = Pick<
  Settings,
  'uiPreset' | 'uiCornerStyle' | 'uiFrameWeight' | 'uiGlowLevel' | 'uiTextureLevel' | 'uiContrastLevel' | 'uiTintShift'
>

export interface Settings {
  huggingfaceToken: string
  comfyuiUrl: string
  comfyuiEnabled: boolean
  dataFolderPath: string
  appearanceMode: AppearanceMode
  theme: ThemeId
  crtEnabled: boolean
  crtIntensity: CrtIntensityPreset
  crtBurstsEnabled: boolean
  crtNoiseEnabled: boolean
  crtNoiseLevel: number
  crtBloomLevel: number
  crtJitterLevel: number
  crtScanDrift: number
  uiPreset: UiPresetId
  uiCornerStyle: UiCornerStyle
  uiFrameWeight: number
  uiGlowLevel: number
  uiTextureLevel: number
  uiContrastLevel: number
  uiTintShift: number
  // Normcore
  normcoreBase: NormcoreBase
  normcoreContrast: number
  normcoreBorders: NormcoreBorders
  normcoreGreyLevel: number
  normcoreOpacity: number
  // Business
  businessPreset: BusinessPresetId
  businessAccent: BusinessAccentId
  businessDensity: BusinessDensityId
  businessCorners: BusinessCornersId
  businessShadows: BusinessShadowsId
  fontWeightSet: FontWeightSetId
  fontWeightBody: number
  fontWeightHeading: number
  fontWeightMono: number
  fontWeightUi: number
  goalsEnabled: boolean
  userGoals: string
  assistantGoals: string
  memoryEnabled: boolean
  memoryNotes: string
  mistralAgentMode: MistralAgentMode
}

const SETTINGS_KEY = 'loom-settings'

const THEMES: { id: ThemeId; name: string; subtitle: string; swatch: string }[] = [
  { id: 'phosphor', name: 'Phosphor', subtitle: 'DEC VT100, early PC', swatch: '#33ff00' },
  { id: 'ruby', name: 'Ruby', subtitle: 'Soviet, Eastern bloc amber', swatch: '#e85c20' },
  { id: 'sapphire', name: 'Sapphire', subtitle: 'IBM 3270, Fujitsu, NEC', swatch: '#3d8cff' },
  { id: 'diamond', name: 'Diamond', subtitle: 'Medical, SGI, precision', swatch: '#b8ccf0' },
  { id: 'ebony', name: 'Ebony', subtitle: 'Apple II, NeXT, ivory', swatch: '#d8d4c8' },
]

const CRT_INTENSITY_PRESETS: { id: CrtIntensityPreset; label: string; subtitle: string }[] = [
  { id: 'subtle', label: 'SUBTLE', subtitle: 'Low scanlines, easy on eyes' },
  { id: 'medium', label: 'MEDIUM', subtitle: 'Balanced retro look' },
  { id: 'full', label: 'FULL', subtitle: 'Strong tube + glitch feel' },
  { id: 'insane', label: 'INSANE', subtitle: 'Arcade chaos mode' },
]

const UI_PRESET_OPTIONS: Array<{ id: UiPresetId; label: string; subtitle: string }> = [
  { id: 'command', label: 'Command Deck', subtitle: 'Classic mission terminal' },
  { id: 'broadcast', label: 'Broadcast Rack', subtitle: 'War-room monitor stack' },
  { id: 'arcade', label: 'Arcade Tube', subtitle: 'Punchy consumer CRT vibe' },
  { id: 'lab', label: 'Lab Instrument', subtitle: 'Clean bench console look' },
  { id: 'vault', label: 'Archive Station', subtitle: 'Dusty long-session terminal' },
]

const UI_CORNER_OPTIONS: Array<{ id: UiCornerStyle; label: string; subtitle: string }> = [
  { id: 'hard', label: 'HARD', subtitle: 'Sharp utility geometry' },
  { id: 'soft', label: 'SOFT', subtitle: 'Slightly rounded console edges' },
  { id: 'chamfer', label: 'CHAMFER', subtitle: 'Cut corners, machine panel feel' },
]

const APPEARANCE_TABS: Array<{ id: AppearanceMode; label: string; subtitle: string }> = [
  { id: 'retro', label: 'Retro', subtitle: 'CRT, glow, terminal vibe' },
  { id: 'normcore', label: 'Normcore', subtitle: 'Plain, grey, low impact' },
  { id: 'business', label: 'Business', subtitle: 'Design system, enterprise' },
]

const NORMCORE_BASE_OPTIONS: Array<{ id: NormcoreBase; label: string; subtitle: string }> = [
  { id: 'light', label: 'Light', subtitle: 'Light grey background' },
  { id: 'dark', label: 'Dark', subtitle: 'Dark grey background' },
  { id: 'system', label: 'System', subtitle: 'Follow OS preference' },
]

const NORMCORE_BORDER_OPTIONS: Array<{ id: NormcoreBorders; label: string; subtitle: string }> = [
  { id: 'none', label: 'None', subtitle: 'No borders' },
  { id: 'hairline', label: 'Hairline', subtitle: '1px neutral line' },
  { id: 'thin', label: 'Thin', subtitle: 'Minimal separation' },
]

const BUSINESS_PRESET_OPTIONS: Array<{ id: BusinessPresetId; label: string; subtitle: string }> = [
  { id: 'enterprise', label: 'Microsoft', subtitle: 'Fluent, Segoe UI, acrylic glass' },
  { id: 'dashboard', label: 'IBM', subtitle: 'Plex, data-forward, structured' },
  { id: 'suite', label: 'Apple', subtitle: 'SF Pro, Apple glass, refined' },
  { id: 'conference', label: 'Meta', subtitle: 'Clean presentation, system UI' },
]

const BUSINESS_ACCENT_OPTIONS: Array<{ id: BusinessAccentId; label: string; subtitle: string }> = [
  { id: 'blue', label: 'Blue', subtitle: 'Microsoft / Meta blue' },
  { id: 'slate', label: 'Slate', subtitle: 'IBM neutral' },
  { id: 'indigo', label: 'Indigo', subtitle: 'Accent pop' },
  { id: 'neutral', label: 'Neutral', subtitle: 'Grey-only' },
]

const BUSINESS_DENSITY_OPTIONS: Array<{ id: BusinessDensityId; label: string; subtitle: string }> = [
  { id: 'comfortable', label: 'Comfortable', subtitle: 'Spacious layout' },
  { id: 'compact', label: 'Compact', subtitle: 'Balanced density' },
  { id: 'dense', label: 'Dense', subtitle: 'Information density' },
]

const BUSINESS_CORNER_OPTIONS: Array<{ id: BusinessCornersId; label: string; subtitle: string }> = [
  { id: 'sharp', label: 'Sharp', subtitle: 'No radius' },
  { id: 'slight', label: 'Slight', subtitle: '2–4px radius' },
  { id: 'rounded', label: 'Rounded', subtitle: '6–8px radius' },
]

const BUSINESS_SHADOW_OPTIONS: Array<{ id: BusinessShadowsId; label: string; subtitle: string }> = [
  { id: 'subtle', label: 'Subtle', subtitle: 'Light depth' },
  { id: 'flat', label: 'Flat', subtitle: 'No shadow' },
  { id: 'elevation', label: 'Elevation', subtitle: 'Layered cards' },
]

const FONT_WEIGHT_PRESETS: Array<{ id: FontWeightSetId; label: string; subtitle: string; values: FontWeightValues }> = [
  { id: 'default', label: 'Default', subtitle: 'Standard readability', values: { fontWeightBody: 400, fontWeightHeading: 600, fontWeightMono: 400, fontWeightUi: 500 } },
  { id: 'light', label: 'Light', subtitle: 'Thinner strokes', values: { fontWeightBody: 300, fontWeightHeading: 500, fontWeightMono: 300, fontWeightUi: 400 } },
  { id: 'medium', label: 'Medium', subtitle: 'Slightly heavier', values: { fontWeightBody: 500, fontWeightHeading: 600, fontWeightMono: 500, fontWeightUi: 600 } },
  { id: 'heavy', label: 'Heavy', subtitle: 'Bold terminal feel', values: { fontWeightBody: 600, fontWeightHeading: 700, fontWeightMono: 600, fontWeightUi: 700 } },
  { id: 'custom', label: 'Custom', subtitle: 'Use values below', values: { fontWeightBody: 400, fontWeightHeading: 600, fontWeightMono: 400, fontWeightUi: 500 } },
]

const FONT_WEIGHT_MIN = 100
const FONT_WEIGHT_MAX = 900
const FONT_WEIGHT_STEP = 100

const UI_VISUAL_PRESETS: Record<
  UiPresetId,
  Pick<Settings, 'uiFrameWeight' | 'uiGlowLevel' | 'uiTextureLevel' | 'uiContrastLevel' | 'uiTintShift' | 'uiCornerStyle'>
> = {
  command: { uiFrameWeight: 30, uiGlowLevel: 24, uiTextureLevel: 36, uiContrastLevel: 46, uiTintShift: 0, uiCornerStyle: 'hard' },
  broadcast: { uiFrameWeight: 54, uiGlowLevel: 40, uiTextureLevel: 46, uiContrastLevel: 62, uiTintShift: -8, uiCornerStyle: 'chamfer' },
  arcade: { uiFrameWeight: 46, uiGlowLevel: 64, uiTextureLevel: 64, uiContrastLevel: 72, uiTintShift: 16, uiCornerStyle: 'soft' },
  lab: { uiFrameWeight: 22, uiGlowLevel: 16, uiTextureLevel: 14, uiContrastLevel: 54, uiTintShift: -6, uiCornerStyle: 'soft' },
  vault: { uiFrameWeight: 64, uiGlowLevel: 26, uiTextureLevel: 78, uiContrastLevel: 40, uiTintShift: 5, uiCornerStyle: 'chamfer' },
}

const APPEARANCE_PROFILE_PRESETS: Array<{
  id: string
  label: string
  subtitle: string
  values: Pick<Settings, 'crtNoiseEnabled' | 'crtNoiseLevel' | 'crtBloomLevel' | 'crtJitterLevel' | 'crtScanDrift'>
}> = [
  {
    id: 'operator',
    label: 'Operator',
    subtitle: 'Readable mission mode',
    values: { crtNoiseEnabled: true, crtNoiseLevel: 18, crtBloomLevel: 24, crtJitterLevel: 6, crtScanDrift: 90 },
  },
  {
    id: 'intrusion',
    label: 'Intrusion',
    subtitle: 'Classic hacker pressure',
    values: { crtNoiseEnabled: true, crtNoiseLevel: 34, crtBloomLevel: 46, crtJitterLevel: 14, crtScanDrift: 120 },
  },
  {
    id: 'storm',
    label: 'Signal Storm',
    subtitle: 'Noisy war-room chaos',
    values: { crtNoiseEnabled: true, crtNoiseLevel: 52, crtBloomLevel: 58, crtJitterLevel: 22, crtScanDrift: 145 },
  },
]

const APPEARANCE_LIVE_KEYS: Array<keyof Settings> = [
  'crtEnabled',
  'crtIntensity',
  'crtBurstsEnabled',
  'crtNoiseEnabled',
  'crtNoiseLevel',
  'crtBloomLevel',
  'crtJitterLevel',
  'crtScanDrift',
  'uiPreset',
  'uiCornerStyle',
  'uiFrameWeight',
  'uiGlowLevel',
  'uiTextureLevel',
  'uiContrastLevel',
  'uiTintShift',
  'fontWeightSet',
  'fontWeightBody',
  'fontWeightHeading',
  'fontWeightMono',
  'fontWeightUi',
]

const UI_FRAME_WEIGHT_MIN = 0
const UI_FRAME_WEIGHT_MAX = 100
const UI_GLOW_MIN = 0
const UI_GLOW_MAX = 100
const UI_TEXTURE_MIN = 0
const UI_TEXTURE_MAX = 100
const UI_CONTRAST_MIN = 0
const UI_CONTRAST_MAX = 100
const UI_TINT_MIN = -45
const UI_TINT_MAX = 45

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function normalizeNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return clamp(numeric, min, max)
}

function normalizeMultilineSetting(value: unknown, fallback = ''): string {
  if (typeof value !== 'string') return fallback
  return value
    .split(/\r?\n/)
    .map(line => line.trim())
    .join('\n')
    .trim()
}

type SettingsSectionId =
  | 'appearance'
  | 'conversation'
  | 'model_library'
  | 'orchestrator'
  | 'storage'
  | 'sharing'
  | 'voice'
  | 'connections'
  | 'extensions'
  | 'integrations'
  | 'image_models'

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId
  label: string
  subtitle: string
  icon: string
}> = [
  { id: 'appearance', label: 'Appearance', subtitle: 'Retro, Normcore, Business', icon: '◉' },
  { id: 'conversation', label: 'Conversation', subtitle: 'Goals and memory', icon: '◍' },
  { id: 'model_library', label: 'Model Library', subtitle: 'Cloud + local model catalog', icon: '◍' },
  { id: 'orchestrator', label: 'Orchestrator', subtitle: 'Routing and priorities', icon: '◈' },
  { id: 'storage', label: 'Storage', subtitle: 'Data folder and files', icon: '◌' },
  { id: 'sharing', label: 'Share Chat Site', subtitle: 'One-click public link', icon: '◐' },
  { id: 'voice', label: 'Voice & Avatar', subtitle: 'Speech and persona', icon: '◎' },
  { id: 'connections', label: 'Connections', subtitle: 'Telegram, Discord in/out', icon: '◔' },
  { id: 'extensions', label: 'Extensions', subtitle: 'Skills → circuits and cell types', icon: '◇' },
]

const OLLAMA_LIBRARY_RECOMMENDED = [
  { model: 'llama3.1:8b', label: 'Llama 3.1 8B', kind: 'chat' },
  { model: 'qwen2.5:7b', label: 'Qwen 2.5 7B', kind: 'chat' },
  { model: 'mistral:7b', label: 'Mistral 7B', kind: 'chat' },
  { model: 'llava:7b', label: 'LLaVA 7B', kind: 'vision' },
  { model: 'x/flux2-klein:4b', label: 'FLUX.2 Klein 4B', kind: 'image' },
]

interface ProviderInfo {
  name: string
  display_name: string
  connected: boolean
  key_url: string
  key_hint: string
  supports_chat?: boolean
  supports_quick?: boolean
  free_tier_available?: boolean
  notes?: string
}

interface ShareStatusPayload {
  active: boolean
  provider: string
  cloudflared_installed: boolean
  cloudflared_path?: string | null
  local_target_url?: string
  local_chat_url?: string
  public_base_url?: string | null
  public_chat_url?: string | null
  started_at?: number | null
  last_error?: string | null
  remote_api_blocked?: boolean
  status?: string
}

// Apply theme to document (call on load and when user changes)
export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

// Apply appearance mode (retro / normcore / business) for CSS and layout
export function applyAppearanceMode(mode: AppearanceMode) {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  if (root) root.dataset.appearanceMode = mode
}

const THEME_INLINE_KEYS = [
  '--theme-void',
  '--theme-slate',
  '--theme-phosphor',
  '--theme-phosphor-dim',
  '--theme-phosphor-glow',
  '--theme-terminal-border',
  '--theme-terminal-muted',
  '--theme-terminal-gray',
  '--theme-font',
  '--theme-font-primary',
] as const

/** Clear inline theme variables so stylesheet [data-theme="…"] rules apply (Retro). */
export function clearThemeInlineOverrides() {
  const root = typeof document !== 'undefined' ? document.documentElement : null
  if (!root?.style) return
  THEME_INLINE_KEYS.forEach((key) => root.style.removeProperty(key))
}

type NormcoreSettings = Pick<Settings, 'normcoreBase' | 'normcoreContrast' | 'normcoreBorders' | 'normcoreGreyLevel' | 'normcoreOpacity'>
type BusinessSettings = Pick<Settings, 'businessPreset' | 'businessAccent' | 'businessDensity' | 'businessCorners' | 'businessShadows'>

function lerpHex(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t)
}

/** Apply normcore parameters: same --theme-* and --ui-* pipeline, plain grey look. */
export function applyNormcoreSystem(settings: NormcoreSettings | null | undefined) {
  try {
    const s = settings ?? defaultSettings()
    const root = typeof document !== 'undefined' ? document.documentElement : null
    if (!root?.style) return

    let scheme: 'light' | 'dark' = s.normcoreBase === 'dark' ? 'dark' : 'light'
    if (s.normcoreBase === 'system' && typeof window !== 'undefined') {
      scheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    root.dataset.normcoreScheme = scheme

    const contrast = s.normcoreContrast / 100
    const greyLevel = s.normcoreGreyLevel / 100
    const opacity = s.normcoreOpacity / 100

    if (scheme === 'light') {
      const voidR = lerpHex(232, 250, greyLevel)
      const slateR = lerpHex(224, 242, greyLevel)
      const phosphorR = lerpHex(40, 80, 1 - greyLevel)
      root.style.setProperty('--theme-void', `rgb(${voidR},${voidR},${voidR})`)
      root.style.setProperty('--theme-slate', `rgba(${slateR},${slateR},${slateR},${opacity})`)
      root.style.setProperty('--theme-phosphor', `rgb(${phosphorR},${phosphorR},${phosphorR})`)
      root.style.setProperty('--theme-phosphor-dim', `rgb(${lerpHex(60, 100, 1 - greyLevel)},${lerpHex(60, 100, 1 - greyLevel)},${lerpHex(60, 100, 1 - greyLevel)})`)
      root.style.setProperty('--theme-phosphor-glow', `rgba(${phosphorR},${phosphorR},${phosphorR},0.35)`)
      root.style.setProperty('--theme-terminal-border', `rgb(${lerpHex(200, 220, greyLevel)},${lerpHex(200, 220, greyLevel)},${lerpHex(200, 220, greyLevel)})`)
      root.style.setProperty('--theme-terminal-muted', `rgb(${lerpHex(100, 140, 1 - greyLevel)},${lerpHex(100, 140, 1 - greyLevel)},${lerpHex(100, 140, 1 - greyLevel)})`)
      root.style.setProperty('--theme-terminal-gray', `rgb(${lerpHex(180, 200, greyLevel)},${lerpHex(180, 200, greyLevel)},${lerpHex(180, 200, greyLevel)})`)
    } else {
      const voidR = lerpHex(18, 8, greyLevel)
      const slateR = lerpHex(28, 18, greyLevel)
      const phosphorR = lerpHex(180, 220, greyLevel)
      root.style.setProperty('--theme-void', `rgb(${voidR},${voidR},${voidR})`)
      root.style.setProperty('--theme-slate', `rgba(${slateR},${slateR},${slateR},${opacity})`)
      root.style.setProperty('--theme-phosphor', `rgb(${phosphorR},${phosphorR},${phosphorR})`)
      root.style.setProperty('--theme-phosphor-dim', `rgb(${lerpHex(120, 160, greyLevel)},${lerpHex(120, 160, greyLevel)},${lerpHex(120, 160, greyLevel)})`)
      root.style.setProperty('--theme-phosphor-glow', `rgba(${phosphorR},${phosphorR},${phosphorR},0.35)`)
      root.style.setProperty('--theme-terminal-border', `rgb(${lerpHex(45, 60, greyLevel)},${lerpHex(45, 60, greyLevel)},${lerpHex(45, 60, greyLevel)})`)
      root.style.setProperty('--theme-terminal-muted', `rgb(${lerpHex(100, 130, greyLevel)},${lerpHex(100, 130, greyLevel)},${lerpHex(100, 130, greyLevel)})`)
      root.style.setProperty('--theme-terminal-gray', `rgb(${lerpHex(55, 75, greyLevel)},${lerpHex(55, 75, greyLevel)},${lerpHex(55, 75, greyLevel)})`)
    }

    const borderWidth = s.normcoreBorders === 'none' ? '0px' : s.normcoreBorders === 'hairline' ? '1px' : '2px'
    root.style.setProperty('--ui-border-width', borderWidth)
    root.style.setProperty('--ui-frame-weight', '1.2px')
    root.style.setProperty('--ui-button-lift', '1px')
    root.style.setProperty('--ui-glow-strength', '0')
    root.style.setProperty('--ui-texture-opacity', '0')
    root.style.setProperty('--ui-contrast-scale', String(0.92 + contrast * 0.2))
    root.style.setProperty('--ui-tint-angle', '0deg')
    root.style.setProperty('--ui-tint-mix', '0%')
    root.style.setProperty('--ui-global-radius', '2px')
    root.style.setProperty('--ui-led-radius', '2px')
    root.style.setProperty('--ui-corner-cut', '0px')
    root.style.setProperty('--ui-grid-opacity', '0')
    root.style.setProperty('--ui-ambient-opacity', '0')
    root.style.setProperty('--ui-panel-tone', '4%')
  } catch (e) {
    console.warn('[LOOM] applyNormcoreSystem failed:', e)
  }
}

const BUSINESS_PRESET_THEMES: Record<
  BusinessPresetId,
  {
    font: string
    void: string
    slate: string
    accent: { main: string; dim: string; border: string }
    radius: string
    glassBlur: string
    glassOpacity: string
    panelBg: string
  }
> = {
  enterprise: {
    font: "'Segoe UI Variable', 'Segoe UI', system-ui, -apple-system, sans-serif",
    void: '#202020',
    slate: 'rgba(32, 32, 32, 0.72)',
    accent: { main: '#0078D4', dim: '#106EBE', border: '#005A9E' },
    radius: '4px',
    glassBlur: '20px',
    glassOpacity: '0.85',
    panelBg: 'rgba(243, 243, 243, 0.08)',
  },
  dashboard: {
    font: "'IBM Plex Sans', 'IBM Plex Mono', system-ui, sans-serif",
    void: '#0f0f0f',
    slate: 'rgba(22, 22, 22, 0.9)',
    accent: { main: '#0f62fe', dim: '#0043ce', border: '#002d9c' },
    radius: '0px',
    glassBlur: '12px',
    glassOpacity: '0.92',
    panelBg: 'rgba(15, 15, 15, 0.85)',
  },
  suite: {
    font: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif",
    void: '#1c1c1e',
    slate: 'rgba(44, 44, 46, 0.72)',
    accent: { main: '#0a84ff', dim: '#0066cc', border: '#0055aa' },
    radius: '10px',
    glassBlur: '40px',
    glassOpacity: '0.72',
    panelBg: 'rgba(44, 44, 46, 0.65)',
  },
  conference: {
    font: "system-ui, -apple-system, 'Segoe UI', 'Helvetica Neue', sans-serif",
    void: '#18191a',
    slate: 'rgba(24, 25, 26, 0.85)',
    accent: { main: '#1877F2', dim: '#166fe5', border: '#0d65d9' },
    radius: '8px',
    glassBlur: '16px',
    glassOpacity: '0.88',
    panelBg: 'rgba(36, 37, 38, 0.75)',
  },
}

/** Apply business parameters: Microsoft/IBM/Apple/Meta-style with Fluent/Apple glass, fonts, accents. */
export function applyBusinessSystem(settings: BusinessSettings | null | undefined) {
  try {
    const s = settings ?? defaultSettings()
    const root = typeof document !== 'undefined' ? document.documentElement : null
    if (!root?.style) return

    const presetTheme = BUSINESS_PRESET_THEMES[s.businessPreset]
    const accentMap: Record<BusinessAccentId, { main: string; dim: string; border: string }> = {
      blue: { main: '#2563eb', dim: '#1e40af', border: '#1e3a8a' },
      slate: { main: '#475569', dim: '#334155', border: '#1e293b' },
      indigo: { main: '#4f46e5', dim: '#3730a3', border: '#312e81' },
      neutral: { main: '#525252', dim: '#404040', border: '#262626' },
    }
    /* Accent always from user choice so Preset (Microsoft/Apple/etc.) + Accent (blue/slate/etc.) both matter */
    const accent = accentMap[s.businessAccent]

    root.style.setProperty('--theme-void', presetTheme?.void ?? '#0f172a')
    root.style.setProperty('--theme-slate', presetTheme?.slate ?? '#1e293b')
    root.style.setProperty('--theme-phosphor', accent.main)
    root.style.setProperty('--theme-phosphor-dim', accent.dim)
    root.style.setProperty('--theme-phosphor-glow', `${accent.main}50`)
    root.style.setProperty('--theme-terminal-border', accent.border)
    root.style.setProperty('--theme-terminal-muted', '#94a3b8')
    root.style.setProperty('--theme-terminal-gray', '#334155')
    if (presetTheme?.font) {
      root.style.setProperty('--theme-font', presetTheme.font)
      root.style.setProperty('--theme-font-primary', presetTheme.font.split(',')[0].trim().replace(/'/g, ''))
    }
    root.style.setProperty('--business-glass-blur', presetTheme?.glassBlur ?? '16px')
    root.style.setProperty('--business-glass-opacity', presetTheme?.glassOpacity ?? '0.88')
    root.style.setProperty('--business-panel-bg', presetTheme?.panelBg ?? 'rgba(30, 41, 59, 0.85)')

    const radiusMap: Record<BusinessCornersId, string> = {
      sharp: '0px',
      slight: '4px',
      rounded: '8px',
    }
    const radius = radiusMap[s.businessCorners]
    root.style.setProperty('--ui-global-radius', radius)
    root.style.setProperty('--ui-led-radius', radius)
    root.style.setProperty('--ui-corner-cut', '0px')
    root.style.setProperty('--ui-border-width', '1px')
    root.style.setProperty('--ui-frame-weight', '1.5px')
    root.style.setProperty('--ui-button-lift', s.businessShadows === 'flat' ? '0px' : '1px')
    root.style.setProperty('--ui-glow-strength', '0.04')
    root.style.setProperty('--ui-texture-opacity', '0')
    root.style.setProperty('--ui-contrast-scale', '1.05')
    root.style.setProperty('--ui-tint-angle', '0deg')
    root.style.setProperty('--ui-tint-mix', '0%')
    root.style.setProperty('--ui-grid-opacity', '0.04')
    root.style.setProperty('--ui-ambient-opacity', '0.06')
    root.style.setProperty('--ui-panel-tone', '6%')
    const densityScale = { comfortable: 1, compact: 0.9, dense: 0.78 }[s.businessDensity]
    root.style.setProperty('--business-density-scale', String(densityScale))
    root.dataset.businessPreset = s.businessPreset
    root.dataset.businessShadows = s.businessShadows
    root.dataset.businessDensity = s.businessDensity
  } catch (e) {
    console.warn('[LOOM] applyBusinessSystem failed:', e)
  }
}

const VISUAL_SYSTEM_DEFAULTS: VisualSystemSettings = {
  uiPreset: 'command',
  uiCornerStyle: 'hard',
  uiFrameWeight: 30,
  uiGlowLevel: 24,
  uiTextureLevel: 42,
  uiContrastLevel: 46,
  uiTintShift: 0,
}

export function applyVisualSystem(settings: VisualSystemSettings | null | undefined) {
  try {
    const s = settings ?? VISUAL_SYSTEM_DEFAULTS
    const uiPreset = s.uiPreset ?? VISUAL_SYSTEM_DEFAULTS.uiPreset
    const uiCornerStyle = s.uiCornerStyle ?? VISUAL_SYSTEM_DEFAULTS.uiCornerStyle
    const uiFrameWeight = Number(s.uiFrameWeight) || VISUAL_SYSTEM_DEFAULTS.uiFrameWeight
    const uiGlowLevel = Number(s.uiGlowLevel) ?? VISUAL_SYSTEM_DEFAULTS.uiGlowLevel
    const uiTextureLevel = Number(s.uiTextureLevel) ?? VISUAL_SYSTEM_DEFAULTS.uiTextureLevel
    const uiContrastLevel = Number(s.uiContrastLevel) ?? VISUAL_SYSTEM_DEFAULTS.uiContrastLevel
    const uiTintShift = Number(s.uiTintShift) ?? VISUAL_SYSTEM_DEFAULTS.uiTintShift

    const root = typeof document !== 'undefined' ? document.documentElement : null
    if (!root?.style) return
    root.dataset.uiPreset = String(uiPreset)
    root.dataset.uiCorners = String(uiCornerStyle)

    const frameWeightPx = (1 + (uiFrameWeight / 100) * 2.4).toFixed(2)
    const borderWidthPx = (1 + (uiFrameWeight / 100) * 0.9).toFixed(2)
    const buttonLiftPx = (1 + (uiFrameWeight / 100) * 2.2).toFixed(2)
    const glow = (0.01 + (uiGlowLevel / 100) * 0.3).toFixed(3)
    const texture = ((uiTextureLevel / 100) * 0.5).toFixed(3)
    const contrast = (0.78 + (uiContrastLevel / 100) * 0.64).toFixed(3)
    const tintMix = Math.round(Math.abs(Number(uiTintShift)) * 0.65)
    const cornerRadiusPx = uiCornerStyle === 'soft'
      ? `${Math.round(3 + (uiFrameWeight / 100) * 8)}px`
      : '0px'
    const cornerCutPx = uiCornerStyle === 'chamfer'
      ? `${Math.round(6 + (uiFrameWeight / 100) * 10)}px`
      : '0px'

    root.style.setProperty('--ui-frame-weight', `${frameWeightPx}px`)
    root.style.setProperty('--ui-border-width', `${borderWidthPx}px`)
    root.style.setProperty('--ui-button-lift', `${buttonLiftPx}px`)
    root.style.setProperty('--ui-glow-strength', glow)
    root.style.setProperty('--ui-texture-opacity', texture)
    root.style.setProperty('--ui-contrast-scale', contrast)
    root.style.setProperty('--ui-tint-angle', `${uiTintShift}deg`)
    root.style.setProperty('--ui-tint-mix', `${tintMix}%`)
    root.style.setProperty('--ui-global-radius', cornerRadiusPx)
    root.style.setProperty('--ui-led-radius', uiCornerStyle === 'soft' ? '50%' : cornerRadiusPx)
    root.style.setProperty('--ui-corner-cut', cornerCutPx)
  } catch (e) {
    console.warn('[LOOM] applyVisualSystem failed:', e)
  }
}

type FontWeightSettings = Pick<Settings, 'fontWeightSet' | 'fontWeightBody' | 'fontWeightHeading' | 'fontWeightMono' | 'fontWeightUi'>

export function applyFontWeights(settings: FontWeightSettings | null | undefined) {
  try {
    const s = settings ?? defaultSettings()
    const root = typeof document !== 'undefined' ? document.documentElement : null
    if (!root?.style) return
    const preset = s.fontWeightSet !== 'custom'
      ? FONT_WEIGHT_PRESETS.find(p => p.id === s.fontWeightSet)
      : null
    const body = preset ? preset.values.fontWeightBody : Number(s.fontWeightBody) || 400
    const heading = preset ? preset.values.fontWeightHeading : Number(s.fontWeightHeading) || 600
    const mono = preset ? preset.values.fontWeightMono : Number(s.fontWeightMono) || 400
    const ui = preset ? preset.values.fontWeightUi : Number(s.fontWeightUi) || 500
    root.style.setProperty('--font-weight-body', String(clamp(body, 100, 900)))
    root.style.setProperty('--font-weight-heading', String(clamp(heading, 100, 900)))
    root.style.setProperty('--font-weight-mono', String(clamp(mono, 100, 900)))
    root.style.setProperty('--font-weight-ui', String(clamp(ui, 100, 900)))
  } catch (e) {
    console.warn('[LOOM] applyFontWeights failed:', e)
  }
}

/** Return CSS custom properties for font weights so the app container can set them inline (guarantees they apply). */
export function getFontWeightVars(settings: FontWeightSettings | null | undefined): Record<string, string> {
  try {
    const s = settings ?? defaultSettings()
    const preset = s.fontWeightSet !== 'custom'
      ? FONT_WEIGHT_PRESETS.find(p => p.id === s.fontWeightSet)
      : null
    const body = preset ? preset.values.fontWeightBody : Number(s.fontWeightBody) || 400
    const heading = preset ? preset.values.fontWeightHeading : Number(s.fontWeightHeading) || 600
    const mono = preset ? preset.values.fontWeightMono : Number(s.fontWeightMono) || 400
    const ui = preset ? preset.values.fontWeightUi : Number(s.fontWeightUi) || 500
    return {
      '--font-weight-body': String(clamp(body, 100, 900)),
      '--font-weight-heading': String(clamp(heading, 100, 900)),
      '--font-weight-mono': String(clamp(mono, 100, 900)),
      '--font-weight-ui': String(clamp(ui, 100, 900)),
    }
  } catch {
    return {
      '--font-weight-body': '400',
      '--font-weight-heading': '600',
      '--font-weight-mono': '400',
      '--font-weight-ui': '500',
    }
  }
}

// Load settings from localStorage. Never throws: returns defaultSettings() on any error.
export function loadSettings(): Settings {
  try {
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem(SETTINGS_KEY) : null
    if (stored && typeof stored === 'string') {
      const parsed = JSON.parse(stored) as Record<string, unknown>
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return defaultSettings()
      }
      const merged = { ...defaultSettings(), ...parsed } as Settings
      if (Array.isArray(THEMES) && !THEMES.some(t => t.id === merged.theme)) {
        merged.theme = 'phosphor'
      }
      if (Array.isArray(CRT_INTENSITY_PRESETS) && !CRT_INTENSITY_PRESETS.some(preset => preset.id === merged.crtIntensity)) {
        merged.crtIntensity = 'medium'
      }
      if (Array.isArray(UI_PRESET_OPTIONS) && !UI_PRESET_OPTIONS.some(option => option.id === merged.uiPreset)) {
        merged.uiPreset = 'command'
      }
      /* Default corners to hard (never chamfer) when missing or invalid */
      if (Array.isArray(UI_CORNER_OPTIONS) && !UI_CORNER_OPTIONS.some(option => option.id === merged.uiCornerStyle)) {
        merged.uiCornerStyle = 'hard'
      }
      if (typeof merged.crtBurstsEnabled !== 'boolean') merged.crtBurstsEnabled = true
      if (typeof merged.crtNoiseEnabled !== 'boolean') merged.crtNoiseEnabled = true
      merged.crtNoiseLevel = normalizeNumber(merged.crtNoiseLevel, 22, 0, 100)
      merged.crtBloomLevel = normalizeNumber(merged.crtBloomLevel, 28, 0, 100)
      merged.crtJitterLevel = normalizeNumber(merged.crtJitterLevel, 8, 0, 40)
      merged.crtScanDrift = normalizeNumber(merged.crtScanDrift, 100, 50, 180)
      merged.uiFrameWeight = normalizeNumber(merged.uiFrameWeight, 30, UI_FRAME_WEIGHT_MIN, UI_FRAME_WEIGHT_MAX)
      merged.uiGlowLevel = normalizeNumber(merged.uiGlowLevel, 24, UI_GLOW_MIN, UI_GLOW_MAX)
      merged.uiTextureLevel = normalizeNumber(merged.uiTextureLevel, 42, UI_TEXTURE_MIN, UI_TEXTURE_MAX)
      merged.uiContrastLevel = normalizeNumber(merged.uiContrastLevel, 46, UI_CONTRAST_MIN, UI_CONTRAST_MAX)
      merged.uiTintShift = normalizeNumber(merged.uiTintShift, 0, UI_TINT_MIN, UI_TINT_MAX)
      if (typeof merged.goalsEnabled !== 'boolean') merged.goalsEnabled = true
      if (typeof merged.memoryEnabled !== 'boolean') merged.memoryEnabled = true
      merged.userGoals = normalizeMultilineSetting(
        merged.userGoals,
        'Help me move projects forward with practical, high-signal answers.',
      )
      merged.assistantGoals = normalizeMultilineSetting(
        merged.assistantGoals,
        'Be accurate, concise, and explicit about assumptions and tradeoffs.',
      )
      merged.memoryNotes = normalizeMultilineSetting(merged.memoryNotes)
      if (merged.mistralAgentMode !== 'auto') merged.mistralAgentMode = 'off'
      if (!['retro', 'normcore', 'business'].includes(merged.appearanceMode)) merged.appearanceMode = 'retro'
      if (!['light', 'dark', 'system'].includes(merged.normcoreBase)) merged.normcoreBase = 'system'
      merged.normcoreContrast = normalizeNumber(merged.normcoreContrast, 50, 0, 100)
      if (!['none', 'hairline', 'thin'].includes(merged.normcoreBorders)) merged.normcoreBorders = 'hairline'
      merged.normcoreGreyLevel = normalizeNumber(merged.normcoreGreyLevel, 50, 0, 100)
      merged.normcoreOpacity = normalizeNumber(merged.normcoreOpacity, 100, 20, 100)
      if (!['enterprise', 'dashboard', 'suite', 'conference'].includes(merged.businessPreset)) merged.businessPreset = 'enterprise'
      if (!['blue', 'slate', 'indigo', 'neutral'].includes(merged.businessAccent)) merged.businessAccent = 'blue'
      if (!['comfortable', 'compact', 'dense'].includes(merged.businessDensity)) merged.businessDensity = 'comfortable'
      if (!['sharp', 'slight', 'rounded'].includes(merged.businessCorners)) merged.businessCorners = 'slight'
      if (!['subtle', 'flat', 'elevation'].includes(merged.businessShadows)) merged.businessShadows = 'subtle'
      if (!['default', 'light', 'medium', 'heavy', 'custom'].includes(merged.fontWeightSet)) merged.fontWeightSet = 'default'
      const round100 = (n: number) => Math.round(n / 100) * 100
      merged.fontWeightBody = round100(normalizeNumber(merged.fontWeightBody, 400, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX))
      merged.fontWeightHeading = round100(normalizeNumber(merged.fontWeightHeading, 600, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX))
      merged.fontWeightMono = round100(normalizeNumber(merged.fontWeightMono, 400, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX))
      merged.fontWeightUi = round100(normalizeNumber(merged.fontWeightUi, 500, FONT_WEIGHT_MIN, FONT_WEIGHT_MAX))
      return merged
    }
  } catch (e) {
    console.warn('[LOOM] Failed to load settings:', e)
  }
  return defaultSettings()
}

function defaultSettings(): Settings {
  return {
    huggingfaceToken: '',
    comfyuiUrl: 'http://localhost:8188',
    comfyuiEnabled: false,
    dataFolderPath: '',
    appearanceMode: 'retro',
    theme: 'phosphor',
    crtEnabled: true,
    crtIntensity: 'medium',
    crtBurstsEnabled: true,
    crtNoiseEnabled: true,
    crtNoiseLevel: 22,
    crtBloomLevel: 28,
    crtJitterLevel: 8,
    crtScanDrift: 100,
    uiPreset: 'command',
    uiCornerStyle: 'hard',
    uiFrameWeight: 30,
    uiGlowLevel: 24,
    uiTextureLevel: 42,
    uiContrastLevel: 46,
    uiTintShift: 0,
    normcoreBase: 'system',
    normcoreContrast: 50,
    normcoreBorders: 'hairline',
    normcoreGreyLevel: 50,
    normcoreOpacity: 100,
    businessPreset: 'enterprise',
    businessAccent: 'blue',
    businessDensity: 'comfortable',
    businessCorners: 'slight',
    businessShadows: 'subtle',
    fontWeightSet: 'default',
    fontWeightBody: 400,
    fontWeightHeading: 600,
    fontWeightMono: 400,
    fontWeightUi: 500,
    goalsEnabled: true,
    userGoals: 'Help me move projects forward with practical, high-signal answers.',
    assistantGoals: 'Be accurate, concise, and explicit about assumptions and tradeoffs.',
    memoryEnabled: true,
    memoryNotes: '',
    mistralAgentMode: 'off',
  }
}

// Save settings to localStorage
export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('loom:settings-updated', { detail: settings }))
  }
}

// Configure data folder on backend
async function configureDataFolder(path: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    return response.ok
  } catch (e) {
    console.error('[LOOM] Failed to configure data folder:', e)
    return false
  }
}

function getInitialSettings(): Settings {
  try {
    return loadSettings()
  } catch {
    return defaultSettings()
  }
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(getInitialSettings)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance')
  const [appearanceTab, setAppearanceTab] = useState<AppearanceMode>(() => getInitialSettings().appearanceMode)
  const [fontWeightsAccordionOpen, setFontWeightsAccordionOpen] = useState(false)
  const [saved, setSaved] = useState(false)
  const [dataFolderStatus, setDataFolderStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [imageModels, setImageModels] = useState<Array<{ name: string; type: string; vram?: string }>>([])
  const [imageModelCatalog, setImageModelCatalog] = useState<string[]>([])
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [providerInputs, setProviderInputs] = useState<Record<string, string>>({})
  const [providerBusy, setProviderBusy] = useState<string | null>(null)
  const [providerFeedback, setProviderFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [ollamaDownloadStatus, setOllamaDownloadStatus] = useState<{ model: string; status: string; message?: string; percent?: number } | null>(null)
  const [pullingOllamaModel, setPullingOllamaModel] = useState<string | null>(null)
  const [hfTokenBusy, setHfTokenBusy] = useState(false)
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{ model: string; status: string; message?: string } | null>(null)
  const [openFolderStatus, setOpenFolderStatus] = useState<string | null>(null)
  const [shareStatus, setShareStatus] = useState<ShareStatusPayload | null>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareFeedback, setShareFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [telegramToken, setTelegramToken] = useState('')
  const [telegramVerify, setTelegramVerify] = useState<null | 'checking' | { ok: true; username: string } | { error: string }>(null)
  const [connectorsStatus, setConnectorsStatus] = useState<{
    telegram?: { connected: boolean; username?: string }
    discord?: { connected: boolean; username?: string }
  }>({})
  const [connectorsBusy, setConnectorsBusy] = useState<string | null>(null)
  const [extensionsSources, setExtensionsSources] = useState<Array<{ id: string; url?: string; label?: string }>>([])
  const [extensionsInstalled, setExtensionsInstalled] = useState<Array<{ id: string; name: string; version: string; description?: string; circuitCount: number }>>([])
  const [extensionsInstallUrl, setExtensionsInstallUrl] = useState('')
  const [extensionsInstallPath, setExtensionsInstallPath] = useState('')
  const [extensionsInstallBusy, setExtensionsInstallBusy] = useState(false)
  const [extensionsInstallError, setExtensionsInstallError] = useState<string | null>(null)
  const [extensionsUninstallBusy, setExtensionsUninstallBusy] = useState<string | null>(null)

  const fetchExtensionsSources = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/extensions/sources`)
      if (r.ok) {
        const list = await r.json()
        setExtensionsSources(Array.isArray(list) ? list : [])
      }
    } catch (e) {
      console.error('[LOOM] Failed to fetch extensions sources:', e)
    }
  }, [])

  const fetchExtensionsInstalled = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/extensions/installed`)
      if (r.ok) {
        const list = await r.json()
        setExtensionsInstalled(Array.isArray(list) ? list : [])
      }
    } catch (e) {
      console.error('[LOOM] Failed to fetch extensions installed:', e)
    }
  }, [])

  const handleInstallExtension = useCallback(async () => {
    const url = extensionsInstallUrl.trim()
    const path = extensionsInstallPath.trim()
    if (!url && !path) {
      setExtensionsInstallError('Enter a URL or a folder path.')
      return
    }
    setExtensionsInstallBusy(true)
    setExtensionsInstallError(null)
    try {
      const r = await fetch(`${API_BASE_URL}/api/extensions/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(url ? { url } : { path }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) {
        setExtensionsInstallError(data.detail || data.error || 'Install failed')
        return
      }
      setExtensionsInstallUrl('')
      setExtensionsInstallPath('')
      await fetchExtensionsInstalled()
      await refreshCircuitsFromBackend()
    } catch (e) {
      setExtensionsInstallError(e instanceof Error ? e.message : 'Install failed')
    } finally {
      setExtensionsInstallBusy(false)
    }
  }, [extensionsInstallUrl, extensionsInstallPath, fetchExtensionsInstalled])

  const handleUninstallExtension = useCallback(async (skillId: string) => {
    setExtensionsUninstallBusy(skillId)
    try {
      const r = await fetch(`${API_BASE_URL}/api/extensions/installed/${encodeURIComponent(skillId)}`, { method: 'DELETE' })
      if (!r.ok) {
        const data = await r.json().catch(() => ({}))
        setExtensionsInstallError(data.detail || 'Remove failed')
        return
      }
      await fetchExtensionsInstalled()
      await refreshCircuitsFromBackend()
    } catch (e) {
      setExtensionsInstallError(e instanceof Error ? e.message : 'Remove failed')
    } finally {
      setExtensionsUninstallBusy(null)
    }
  }, [fetchExtensionsInstalled])

  const fetchConnectorsStatus = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/connectors/status`)
      if (!response.ok) return
      const data = await response.json()
      setConnectorsStatus({
        telegram: data.telegram,
        discord: data.discord,
      })
    } catch (e) {
      console.error('[LOOM] Failed to fetch connectors status:', e)
    }
  }, [])

  const fetchProviders = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/providers/`)
      if (!response.ok) return
      const payload = await response.json() as { providers?: ProviderInfo[] }
      setProviders(Array.isArray(payload.providers) ? payload.providers : [])
    } catch (error) {
      console.error('[LOOM] Failed to fetch providers:', error)
    }
  }, [])

  const fetchOllamaModels = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/models`)
      if (!response.ok) return
      const payload = await response.json() as { models?: Array<{ name?: string } | string> }
      const normalized = Array.isArray(payload.models)
        ? payload.models
          .map(entry => typeof entry === 'string' ? entry : entry?.name || '')
          .filter((name): name is string => Boolean(name))
        : []
      setOllamaModels(normalized)
    } catch (error) {
      console.error('[LOOM] Failed to fetch Ollama models:', error)
    }
  }, [])

  const fetchImageModels = useCallback(async () => {
    try {
      const data = await fetchImageModelsApi(API_BASE_URL)
      setImageModels(data.local.map(m => ({
        name: m.name,
        type: m.type || 'unknown',
        vram: m.vram,
      })))
      const catalog = (data.hf_models || data.huggingface || [])
        .map(name => String(name).trim())
        .filter(Boolean)
      setImageModelCatalog(catalog)
    } catch (error) {
      console.error('[LOOM] Failed to fetch image models:', error)
    }
  }, [])

  const refreshModelLibrary = useCallback(async () => {
    await Promise.all([
      fetchProviders(),
      fetchOllamaModels(),
      fetchImageModels(),
    ])
  }, [fetchProviders, fetchOllamaModels, fetchImageModels])

  const fetchShareStatus = useCallback(async (): Promise<ShareStatusPayload | null> => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/share/status`)
      if (!response.ok) return null
      const payload = await response.json() as ShareStatusPayload
      setShareStatus(payload)
      return payload
    } catch (error) {
      console.error('[LOOM] Failed to fetch share status:', error)
      return null
    }
  }, [])

  const copyText = useCallback(async (value: string): Promise<boolean> => {
    if (!value) return false
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch (error) {
      console.error('[LOOM] Clipboard write failed:', error)
      return false
    }
  }, [])

  const startChatShare = useCallback(async () => {
    setShareBusy(true)
    setShareFeedback(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/share/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_url: API_BASE_URL }),
      })
      const payload = await response.json().catch(() => ({})) as ShareStatusPayload & { detail?: string }
      if (!response.ok) {
        const detail = typeof payload.detail === 'string' ? payload.detail : 'Failed to start sharing.'
        throw new Error(detail)
      }
      setShareStatus(payload)
      window.dispatchEvent(new CustomEvent('loom:share-status-changed', { detail: payload }))
      if (payload.public_chat_url) {
        const copied = await copyText(payload.public_chat_url)
        setShareFeedback({
          type: 'success',
          message: copied
            ? 'Public chat link is live and copied to clipboard.'
            : 'Public chat link is live.',
        })
      } else {
        setShareFeedback({ type: 'success', message: 'Sharing started.' })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setShareFeedback({ type: 'error', message })
    } finally {
      setShareBusy(false)
    }
  }, [copyText])

  const stopChatShare = useCallback(async () => {
    setShareBusy(true)
    setShareFeedback(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/share/stop`, { method: 'POST' })
      const payload = await response.json().catch(() => ({})) as ShareStatusPayload & { detail?: string }
      if (!response.ok) {
        const detail = typeof payload.detail === 'string' ? payload.detail : 'Failed to stop sharing.'
        throw new Error(detail)
      }
      setShareStatus(payload)
      window.dispatchEvent(new CustomEvent('loom:share-status-changed', { detail: payload }))
      setShareFeedback({ type: 'success', message: 'Public sharing stopped.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setShareFeedback({ type: 'error', message })
    } finally {
      setShareBusy(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) {
      const loaded = loadSettings()
      setSettings(loaded)
      setAppearanceTab(loaded.appearanceMode)
      setActiveSection('appearance')
      setSaved(false)
      setDataFolderStatus('idle')
      setProviderFeedback(null)
      setShareFeedback(null)
      void refreshModelLibrary()
      void fetchShareStatus()
    }
  }, [isOpen, refreshModelLibrary, fetchShareStatus])

  useEffect(() => {
    if (!isOpen || activeSection !== 'model_library') return
    void refreshModelLibrary()
  }, [activeSection, isOpen, refreshModelLibrary])

  useEffect(() => {
    if (!isOpen || activeSection !== 'sharing') return
    void fetchShareStatus()
    const intervalId = window.setInterval(() => {
      void fetchShareStatus()
    }, 8000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [activeSection, isOpen, fetchShareStatus])

  useEffect(() => {
    if (!isOpen || activeSection !== 'connections') return
    void fetchConnectorsStatus()
  }, [activeSection, isOpen, fetchConnectorsStatus])

  useEffect(() => {
    if (!isOpen || activeSection !== 'extensions') return
    void fetchExtensionsSources()
    void fetchExtensionsInstalled()
  }, [activeSection, isOpen, fetchExtensionsSources, fetchExtensionsInstalled])

  // Live-preview appearance: apply the current tab's system so changes are visible before Save
  useEffect(() => {
    if (!isOpen || activeSection !== 'appearance') return
    if (appearanceTab === 'retro') {
      applyAppearanceMode('retro')
      clearThemeInlineOverrides()
      applyTheme(settings.theme)
      applyVisualSystem(settings)
      applyFontWeights(settings)
    } else if (appearanceTab === 'normcore') {
      applyAppearanceMode('normcore')
      applyNormcoreSystem(settings)
    } else if (appearanceTab === 'business') {
      applyAppearanceMode('business')
      applyBusinessSystem(settings)
    }
  }, [isOpen, activeSection, appearanceTab, settings.theme, settings.normcoreBase, settings.normcoreContrast, settings.normcoreBorders, settings.normcoreGreyLevel, settings.normcoreOpacity, settings.businessPreset, settings.businessAccent, settings.businessDensity, settings.businessCorners, settings.businessShadows, settings.uiPreset, settings.uiCornerStyle, settings.uiFrameWeight, settings.uiGlowLevel, settings.uiTextureLevel, settings.uiContrastLevel, settings.uiTintShift, settings.fontWeightSet, settings.fontWeightBody, settings.fontWeightHeading, settings.fontWeightMono, settings.fontWeightUi])

  const handleConnectTelegram = async () => {
    const token = telegramToken.trim()
    if (!token) return
    setConnectorsBusy('telegram')
    try {
      const username =
        typeof telegramVerify === 'object' && telegramVerify !== null && 'ok' in telegramVerify
          ? (telegramVerify as { username?: string }).username
          : undefined
      const response = await fetch(`${API_BASE_URL}/api/connectors/telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, username }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : 'Connect failed'
        throw new Error(detail)
      }
      setTelegramToken('')
      setTelegramVerify(null)
      setConnectorsStatus({ ...connectorsStatus, telegram: data?.telegram })
      await fetchConnectorsStatus()
    } catch (e) {
      setProviderFeedback({ type: 'error', message: e instanceof Error ? e.message : 'Connect failed' })
    } finally {
      setConnectorsBusy(null)
    }
  }

  const handleDisconnectTelegram = async () => {
    setConnectorsBusy('telegram')
    try {
      const response = await fetch(`${API_BASE_URL}/api/connectors/telegram`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(typeof data?.detail === 'string' ? data.detail : 'Disconnect failed')
      setConnectorsStatus({ ...connectorsStatus, telegram: data?.telegram })
      await fetchConnectorsStatus()
    } catch (e) {
      setProviderFeedback({ type: 'error', message: e instanceof Error ? e.message : 'Disconnect failed' })
    } finally {
      setConnectorsBusy(null)
    }
  }

  const handleConnectProvider = async (providerName: string) => {
    const apiKey = (providerInputs[providerName] || '').trim()
    if (!apiKey) {
      setProviderFeedback({ type: 'error', message: `Enter an API key for ${providerName}.` })
      return
    }
    setProviderBusy(providerName)
    setProviderFeedback(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/providers/${providerName}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : `Failed to connect ${providerName}.`
        throw new Error(detail)
      }
      setProviderInputs(prev => ({ ...prev, [providerName]: '' }))
      setProviderFeedback({
        type: 'success',
        message: `Connected ${String(payload?.display_name || providerName)}.`,
      })
      window.dispatchEvent(new CustomEvent('loom:providers_updated'))
      await fetchProviders()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProviderFeedback({ type: 'error', message })
    } finally {
      setProviderBusy(null)
    }
  }

  const handleDisconnectProvider = async (providerName: string) => {
    setProviderBusy(providerName)
    setProviderFeedback(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/providers/${providerName}/disconnect`, {
        method: 'DELETE',
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : `Failed to disconnect ${providerName}.`
        throw new Error(detail)
      }
      setProviderFeedback({ type: 'success', message: `Disconnected ${providerName}.` })
      window.dispatchEvent(new CustomEvent('loom:providers_updated'))
      await fetchProviders()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProviderFeedback({ type: 'error', message })
    } finally {
      setProviderBusy(null)
    }
  }

  const handleVerifyTelegram = async () => {
    const token = telegramToken.trim()
    if (!token) return
    setTelegramVerify('checking')
    try {
      const response = await fetch(`${API_BASE_URL}/api/connectors/telegram/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : 'Verification failed'
        setTelegramVerify({ error: detail })
        return
      }
      setTelegramVerify({ ok: true, username: data.username ?? data?.result?.username ?? 'Bot' })
    } catch (e) {
      setTelegramVerify({ error: e instanceof Error ? e.message : 'Request failed' })
    }
  }

  const applyHuggingFaceToken = async () => {
    const token = settings.huggingfaceToken.trim()
    if (!token) {
      setProviderFeedback({ type: 'error', message: 'Hugging Face token is empty.' })
      return
    }
    setHfTokenBusy(true)
    setProviderFeedback(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/images/config/huggingface`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      if (!response.ok) {
        throw new Error('Failed to save Hugging Face token on backend.')
      }
      setProviderFeedback({ type: 'success', message: 'Hugging Face token saved and ready for gated models.' })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setProviderFeedback({ type: 'error', message })
    } finally {
      setHfTokenBusy(false)
    }
  }

  const handlePullOllamaModel = async (modelName: string) => {
    const socket = getSocketInstance()
    if (!socket) {
      setProviderFeedback({ type: 'error', message: 'Backend socket is not connected.' })
      return
    }

    const requested = modelName.trim()
    if (!requested) return
    const requestedNormalized = requested.includes(':') ? requested.toLowerCase() : `${requested.toLowerCase()}:latest`

    setPullingOllamaModel(requested)
    setOllamaDownloadStatus({
      model: requested,
      status: 'starting',
      message: `Preparing ${requested}...`,
    })

    const handler = (data: PullStatus) => {
      const eventModel = String(data.model || '').toLowerCase()
      if (eventModel && eventModel !== requested.toLowerCase() && eventModel !== requestedNormalized) {
        return
      }

      setOllamaDownloadStatus({
        model: requested,
        status: data.status || 'unknown',
        message: data.message,
        percent: typeof data.percent === 'number' ? data.percent : undefined,
      })

      if (data.status === 'success' || data.status === 'error') {
        socket.off('pull_status', handler)
        setPullingOllamaModel(null)
        void fetchOllamaModels()
        setTimeout(() => setOllamaDownloadStatus(null), 2500)
      }
    }

    socket.on('pull_status', handler)
    socket.emit('pull_model', { model: requested })
    setTimeout(() => socket.off('pull_status', handler), 15 * 60 * 1000)
  }

  const handleDownloadModel = async (modelName: string) => {
    setDownloadingModel(modelName)
    setDownloadProgress({ model: modelName, status: 'starting', message: 'Preparing download...' })
    dispatchDownloadTelemetry({
      scope: modelName.startsWith('x/') ? 'image' : 'diffusers',
      model: modelName,
      status: 'starting',
      message: 'Preparing download...',
    })

    try {
      const socket = getSocketInstance()
      const isOllamaImageModel = modelName.startsWith('x/')
      const progressEvent = isOllamaImageModel ? 'pull_status' : 'pull_image_status'
      const emitEvent = isOllamaImageModel ? 'pull_model' : 'pull_image_model'
      const normalizedRequested = modelName.trim().toLowerCase()
      const normalizedRequestedLatest = normalizedRequested.includes(':') ? normalizedRequested : `${normalizedRequested}:latest`

      const handler = (data: PullStatus) => {
        const incomingModel = String(data.model || '').toLowerCase().trim()
        if (incomingModel && incomingModel !== normalizedRequested && incomingModel !== normalizedRequestedLatest) return

        setDownloadProgress({
          model: modelName,
          status: data.status,
          message: data.message,
        })

        if (data.status === 'success' || data.status === 'error') {
          socket.off(progressEvent, handler)
          setDownloadingModel(null)
          setTimeout(() => {
            setDownloadProgress(null)
            invalidateImageModelsCache()
            fetchImageModels()
            notifyImageModelsUpdated()
          }, 2000)
        }
      }

      socket.on(progressEvent, handler)
      socket.emit(emitEvent, { model: modelName })
      setTimeout(() => socket.off(progressEvent, handler), 15 * 60 * 1000)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed'
      setDownloadProgress({
        model: modelName,
        status: 'error',
        message: errorMessage
      })
      dispatchDownloadTelemetry({
        scope: modelName.startsWith('x/') ? 'image' : 'diffusers',
        model: modelName,
        status: 'error',
        message: errorMessage,
        error: errorMessage,
      })
      setTimeout(() => {
        setDownloadingModel(null)
        setDownloadProgress(null)
      }, 3000)
    }
  }

  const handleSave = async () => {
    // Configure data folder on backend if set
    if (settings.dataFolderPath) {
      setDataFolderStatus('checking')
      const success = await configureDataFolder(settings.dataFolderPath)
      setDataFolderStatus(success ? 'valid' : 'invalid')
      if (!success) {
        return // Don't save if data folder is invalid
      }
    }

    if (settings.huggingfaceToken.trim()) {
      try {
        const response = await fetch(`${API_BASE_URL}/api/images/config/huggingface`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: settings.huggingfaceToken.trim() }),
        })
        if (!response.ok) {
          setProviderFeedback({ type: 'error', message: 'Failed to save Hugging Face token on backend.' })
          return
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        setProviderFeedback({ type: 'error', message })
        return
      }
    }

    const toSave = { ...settings, appearanceMode: appearanceTab }
    saveSettings(toSave)
    applyAppearanceMode(toSave.appearanceMode)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const openModelFolder = async (target: 'ollama' | 'diffusion' | 'music') => {
    try {
      setOpenFolderStatus(`Opening ${target} folder...`)
      const response = await fetch(`${API_BASE_URL}/api/sessions/open-model-folder?target=${encodeURIComponent(target)}`, {
        method: 'POST',
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Request failed (${response.status})`)
      }
      const payload = await response.json() as { path?: string }
      const openedPath = payload.path || target
      setOpenFolderStatus(`Opened: ${openedPath}`)
      setTimeout(() => setOpenFolderStatus(null), 4000)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setOpenFolderStatus(`Failed to open folder: ${message}`)
    }
  }

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      if (APPEARANCE_LIVE_KEYS.includes(key)) {
        applyVisualSystem(next)
        applyFontWeights(next)
        window.dispatchEvent(new CustomEvent('loom:settings-updated', { detail: next }))
      }
      return next
    })
    if (key === 'dataFolderPath') {
      setDataFolderStatus('idle')
    }
    if (key === 'theme') {
      applyTheme(value as ThemeId)
    }
  }

  const applyAppearanceProfile = (profileId: string) => {
    const preset = APPEARANCE_PROFILE_PRESETS.find(item => item.id === profileId)
    if (!preset) return
    setSettings((prev) => {
      const next = { ...prev, ...preset.values }
      applyVisualSystem(next)
      window.dispatchEvent(new CustomEvent('loom:settings-updated', { detail: next }))
      return next
    })
  }

  const applyUiPreset = (presetId: UiPresetId) => {
    const presetValues = UI_VISUAL_PRESETS[presetId]
    if (!presetValues) return
    setSettings((prev) => {
      const next = { ...prev, uiPreset: presetId, ...presetValues }
      applyVisualSystem(next)
      window.dispatchEvent(new CustomEvent('loom:settings-updated', { detail: next }))
      return next
    })
  }

  const applyFontWeightPreset = (presetId: FontWeightSetId) => {
    const preset = FONT_WEIGHT_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    setSettings((prev) => {
      const next = {
        ...prev,
        fontWeightSet: presetId,
        ...(presetId !== 'custom' ? preset.values : {}),
      }
      applyFontWeights(next)
      window.dispatchEvent(new CustomEvent('loom:settings-updated', { detail: next }))
      return next
    })
  }

  const safeSettings = settings ?? defaultSettings()
  const selectedSection = SETTINGS_SECTIONS.find(section => section.id === activeSection) ?? SETTINGS_SECTIONS[0]
  const conversationProfile = buildConversationProfileFromSettings(safeSettings)
  const conversationStoragePreview = buildConversationProfileStoragePreview(conversationProfile)
  let memoryVaultPreview: Record<string, unknown>[] = []
  try {
    memoryVaultPreview = loadMemoryVault().slice(0, 10)
  } catch {
    // ignore
  }

  const renderActiveSection = () => {
    if (activeSection === 'appearance') {
      return (
        <section className="space-y-4">
          <div className="flex border-b border-terminal-border gap-0">
            {APPEARANCE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAppearanceTab(tab.id)}
                className={`flex-1 px-3 py-2 text-left border-b-2 transition-colors ${
                  appearanceTab === tab.id
                    ? 'border-phosphor text-phosphor bg-void'
                    : 'border-transparent text-terminal-muted hover:text-phosphor hover:border-phosphor/50 -mb-px'
                }`}
              >
                <span className="text-[10px] font-bold tracking-wider block">{tab.label}</span>
                <span className="text-[9px] opacity-80 block mt-0.5">{tab.subtitle}</span>
              </button>
            ))}
          </div>

          {appearanceTab === 'retro' && (
          <>
          <p className="text-[10px] text-terminal-muted">CRT, terminal colors, and panel style. Pick a palette and tweak the vibe.</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 p-2 border border-terminal-border bg-void">
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider">EFFECT</div>
                <div className="text-[10px] text-terminal-muted">Global CRT overlay across terminal + circuit</div>
              </div>
              <button
                type="button"
                onClick={() => updateSetting('crtEnabled', !settings.crtEnabled)}
                className={`px-3 py-1 text-[10px] border font-bold tracking-wider ${
                  settings.crtEnabled
                    ? 'border-phosphor bg-phosphor text-void'
                    : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                }`}
              >
                {settings.crtEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 p-2 border border-terminal-border bg-void">
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider">GLITCH BURSTS</div>
                <div className="text-[10px] text-terminal-muted">Pulse on model switches, AI responses, and failures</div>
              </div>
              <button
                type="button"
                onClick={() => updateSetting('crtBurstsEnabled', !settings.crtBurstsEnabled)}
                className={`px-3 py-1 text-[10px] border font-bold tracking-wider ${
                  settings.crtBurstsEnabled
                    ? 'border-phosphor bg-phosphor text-void'
                    : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                }`}
              >
                {settings.crtBurstsEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {CRT_INTENSITY_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateSetting('crtIntensity', preset.id)}
                  className={`p-2 border text-left ${
                    settings.crtIntensity === preset.id
                      ? 'border-phosphor bg-void'
                      : 'border-terminal-border hover:border-phosphor/50'
                  }`}
                >
                  <div className="text-[10px] text-phosphor font-bold tracking-wider">{preset.label}</div>
                  <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{preset.subtitle}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">PALETTE</div>
            <div className="text-[9px] text-terminal-muted mb-2">Terminal color set — phosphor, ruby, sapphire, diamond, ebony.</div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => updateSetting('theme', t.id)}
                className={`flex flex-col items-center p-3 border transition-colors ${
                  settings.theme === t.id
                    ? 'border-phosphor bg-void'
                    : 'border-terminal-border hover:border-phosphor/50'
                }`}
                title={t.subtitle}
              >
                <span
                  className="w-8 h-8 mb-2 border-2"
                  style={{
                    backgroundColor: t.swatch,
                    borderColor: 'currentColor',
                    boxShadow: `0 0 12px ${t.swatch}80`,
                  }}
                />
                <span className="text-[10px] font-bold text-phosphor">{t.name}</span>
                <span className="text-[9px] text-terminal-muted mt-0.5 text-center leading-tight">
                  {t.subtitle}
                </span>
              </button>
            ))}
          </div>

          <div className="border border-terminal-border p-3 bg-void/70 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider">RETRO UI SYSTEM</div>
                <div className="text-[9px] text-terminal-muted">Changes panel depth, corners, glow, and texture across terminal + circuit.</div>
              </div>
            </div>

            <div>
              <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">STYLE PRESET</div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-2">
                {UI_PRESET_OPTIONS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyUiPreset(preset.id)}
                    className={`p-2 border text-left ${
                      settings.uiPreset === preset.id
                        ? 'border-phosphor bg-void'
                        : 'border-terminal-border hover:border-phosphor/50'
                    }`}
                  >
                    <div className="text-[10px] text-phosphor font-bold tracking-wider">{preset.label}</div>
                    <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{preset.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">CORNERS</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                {UI_CORNER_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => updateSetting('uiCornerStyle', option.id)}
                    className={`p-2 border text-left ${
                      settings.uiCornerStyle === option.id
                        ? 'border-phosphor bg-void'
                        : 'border-terminal-border hover:border-phosphor/50'
                    }`}
                  >
                    <div className="text-[10px] text-phosphor font-bold tracking-wider">{option.label}</div>
                    <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{option.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-2">
              <div className="border border-terminal-border p-2 bg-void space-y-1">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">FRAME WEIGHT</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={UI_FRAME_WEIGHT_MIN}
                    max={UI_FRAME_WEIGHT_MAX}
                    step={1}
                    value={settings.uiFrameWeight}
                    onChange={(e) => updateSetting('uiFrameWeight', Number(e.target.value))}
                    className="flex-1 accent-phosphor"
                  />
                  <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.uiFrameWeight}%</span>
                </div>
              </div>

              <div className="border border-terminal-border p-2 bg-void space-y-1">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">GLOW FIELD</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={UI_GLOW_MIN}
                    max={UI_GLOW_MAX}
                    step={1}
                    value={settings.uiGlowLevel}
                    onChange={(e) => updateSetting('uiGlowLevel', Number(e.target.value))}
                    className="flex-1 accent-phosphor"
                  />
                  <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.uiGlowLevel}%</span>
                </div>
              </div>

              <div className="border border-terminal-border p-2 bg-void space-y-1">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">TEXTURE MIX</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={UI_TEXTURE_MIN}
                    max={UI_TEXTURE_MAX}
                    step={1}
                    value={settings.uiTextureLevel}
                    onChange={(e) => updateSetting('uiTextureLevel', Number(e.target.value))}
                    className="flex-1 accent-phosphor"
                  />
                  <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.uiTextureLevel}%</span>
                </div>
              </div>

              <div className="border border-terminal-border p-2 bg-void space-y-1">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">CONTRAST BIAS</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={UI_CONTRAST_MIN}
                    max={UI_CONTRAST_MAX}
                    step={1}
                    value={settings.uiContrastLevel}
                    onChange={(e) => updateSetting('uiContrastLevel', Number(e.target.value))}
                    className="flex-1 accent-phosphor"
                  />
                  <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.uiContrastLevel}%</span>
                </div>
              </div>

              <div className="border border-terminal-border p-2 bg-void space-y-1">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">TINT SHIFT</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={UI_TINT_MIN}
                    max={UI_TINT_MAX}
                    step={1}
                    value={settings.uiTintShift}
                    onChange={(e) => updateSetting('uiTintShift', Number(e.target.value))}
                    className="flex-1 accent-phosphor"
                  />
                  <span className="text-[10px] text-phosphor font-mono w-12 text-right">{settings.uiTintShift}deg</span>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-terminal-border bg-void/70">
            <button
              type="button"
              onClick={() => setFontWeightsAccordionOpen((open) => !open)}
              className="w-full flex items-center justify-between gap-2 p-3 text-left border-b border-terminal-border/50 hover:bg-void"
            >
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider">TYPOGRAPHY WEIGHT</div>
                <div className="text-[9px] text-terminal-muted">
                  {FONT_WEIGHT_PRESETS.find(p => p.id === settings.fontWeightSet)?.label ?? 'Custom'} — preset or fine-tune body, heading, mono, UI
                </div>
              </div>
              <span className="text-phosphor text-sm transition-transform" style={{ transform: fontWeightsAccordionOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
            </button>
            {fontWeightsAccordionOpen && (
              <div className="p-3 space-y-3 border-t border-terminal-border/50">
                <div>
                  <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">PRESET</div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {FONT_WEIGHT_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyFontWeightPreset(preset.id)}
                        className={`p-2 border text-left ${
                          settings.fontWeightSet === preset.id ? 'border-phosphor bg-void' : 'border-terminal-border hover:border-phosphor/50'
                        }`}
                      >
                        <div className="text-[10px] font-bold tracking-wider">{preset.label}</div>
                        <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{preset.subtitle}</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider">FINE-TUNE (sliders apply when Custom or override preset)</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {[
                    { key: 'fontWeightBody' as const, label: 'Body', desc: 'Main content' },
                    { key: 'fontWeightHeading' as const, label: 'Heading', desc: 'Titles, section headers' },
                    { key: 'fontWeightMono' as const, label: 'Mono', desc: 'Code, terminal' },
                    { key: 'fontWeightUi' as const, label: 'UI', desc: 'Buttons, labels' },
                  ].map(({ key, label, desc }) => (
                    <div key={key} className="border border-terminal-border p-2 bg-void space-y-1">
                      <div className="text-[10px] text-phosphor font-bold tracking-wider">{label}</div>
                      <div className="text-[9px] text-terminal-muted">{desc}</div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={FONT_WEIGHT_MIN}
                          max={FONT_WEIGHT_MAX}
                          step={FONT_WEIGHT_STEP}
                          value={settings[key]}
                          onChange={(e) => {
                            const value = Number(e.target.value)
                            setSettings((prev) => {
                              const next = { ...prev, fontWeightSet: 'custom' as const, [key]: value }
                              applyFontWeights(next)
                              window.dispatchEvent(new CustomEvent('loom:settings-updated', { detail: next }))
                              return next
                            })
                          }}
                          className="flex-1 accent-phosphor"
                        />
                        <span className="text-[10px] text-phosphor font-mono w-10 text-right">{settings[key]}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="pt-2 border-t border-terminal-border/60">
            <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">ONE-CLICK VIBES</div>
            <div className="text-[9px] text-terminal-muted mb-2">Apply a full retro style (theme + UI preset + corners) in one tap.</div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-2">
              {APPEARANCE_PROFILE_PRESETS.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => applyAppearanceProfile(profile.id)}
                  className="p-2 border border-terminal-border text-left hover:border-phosphor/60"
                >
                  <div className="text-[10px] text-phosphor font-bold tracking-wider">{profile.label}</div>
                  <div className="text-[9px] text-terminal-muted mt-1">{profile.subtitle}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="border border-terminal-border p-2 space-y-2 bg-void">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">SIGNAL NOISE</div>
                <button
                  type="button"
                  onClick={() => updateSetting('crtNoiseEnabled', !settings.crtNoiseEnabled)}
                  className={`px-2 py-0.5 text-[10px] border font-bold tracking-wider ${
                    settings.crtNoiseEnabled
                      ? 'border-phosphor bg-phosphor text-void'
                      : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                  }`}
                >
                  {settings.crtNoiseEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="text-[9px] text-terminal-muted">Analog grain and static texture</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.crtNoiseLevel}
                  onChange={(e) => updateSetting('crtNoiseLevel', Number(e.target.value))}
                  disabled={!settings.crtNoiseEnabled}
                  className="flex-1 accent-phosphor disabled:opacity-50"
                />
                <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.crtNoiseLevel}%</span>
              </div>
            </div>

            <div className="border border-terminal-border p-2 space-y-2 bg-void">
              <div className="text-[10px] text-phosphor font-bold tracking-wider">BLOOM GLOW</div>
              <div className="text-[9px] text-terminal-muted">Screen phosphor glow halo</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={settings.crtBloomLevel}
                  onChange={(e) => updateSetting('crtBloomLevel', Number(e.target.value))}
                  className="flex-1 accent-phosphor"
                />
                <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.crtBloomLevel}%</span>
              </div>
            </div>

            <div className="border border-terminal-border p-2 space-y-2 bg-void">
              <div className="text-[10px] text-phosphor font-bold tracking-wider">TUBE JITTER</div>
              <div className="text-[9px] text-terminal-muted">Micro drift for unstable signal feel</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={40}
                  step={1}
                  value={settings.crtJitterLevel}
                  onChange={(e) => updateSetting('crtJitterLevel', Number(e.target.value))}
                  className="flex-1 accent-phosphor"
                />
                <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.crtJitterLevel}</span>
              </div>
            </div>

            <div className="border border-terminal-border p-2 space-y-2 bg-void">
              <div className="text-[10px] text-phosphor font-bold tracking-wider">SCAN DRIFT</div>
              <div className="text-[9px] text-terminal-muted">Scanline animation speed</div>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={50}
                  max={180}
                  step={5}
                  value={settings.crtScanDrift}
                  onChange={(e) => updateSetting('crtScanDrift', Number(e.target.value))}
                  className="flex-1 accent-phosphor"
                />
                <span className="text-[10px] text-phosphor font-mono w-10 text-right">{settings.crtScanDrift}%</span>
              </div>
            </div>
          </div>
          </>
          )}

          {appearanceTab === 'normcore' && (
          <div className="space-y-4">
            <p className="text-[10px] text-terminal-muted">Plain, grey, low-impact. Base, borders, contrast, and opacity.</p>
            <div className="border border-terminal-border p-3 bg-void/70 space-y-3">
              <div className="text-[10px] text-phosphor font-bold tracking-wider">NORMCORE UI</div>
              <div className="text-[9px] text-terminal-muted">Light, dark, or system. Monotype grey, minimal chrome.</div>
            </div>
            <div>
              <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">BASE</div>
              <div className="grid grid-cols-3 gap-2">
                {NORMCORE_BASE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('normcoreBase', opt.id)}
                    className={`p-2 border text-left ${
                      settings.normcoreBase === opt.id ? 'border-phosphor bg-void' : 'border-terminal-border hover:border-phosphor/50'
                    }`}
                  >
                    <div className="text-[10px] font-bold tracking-wider">{opt.label}</div>
                    <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{opt.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">BORDERS</div>
              <div className="grid grid-cols-3 gap-2">
                {NORMCORE_BORDER_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('normcoreBorders', opt.id)}
                    className={`p-2 border text-left ${
                      settings.normcoreBorders === opt.id ? 'border-phosphor bg-void' : 'border-terminal-border hover:border-phosphor/50'
                    }`}
                  >
                    <div className="text-[10px] font-bold tracking-wider">{opt.label}</div>
                    <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{opt.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              <div className="border border-terminal-border p-2 bg-void space-y-1">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">CONTRAST</div>
                <div className="text-[9px] text-terminal-muted">How much grey steps differ</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.normcoreContrast}
                    onChange={(e) => updateSetting('normcoreContrast', Number(e.target.value))}
                    className="flex-1 accent-phosphor"
                  />
                  <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.normcoreContrast}%</span>
                </div>
              </div>
              <div className="border border-terminal-border p-2 bg-void space-y-1">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">GREY LEVEL</div>
                <div className="text-[9px] text-terminal-muted">Overall grey tone</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={settings.normcoreGreyLevel}
                    onChange={(e) => updateSetting('normcoreGreyLevel', Number(e.target.value))}
                    className="flex-1 accent-phosphor"
                  />
                  <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.normcoreGreyLevel}%</span>
                </div>
              </div>
              <div className="border border-terminal-border p-2 bg-void space-y-1 lg:col-span-2">
                <div className="text-[10px] text-phosphor font-bold tracking-wider">OPACITY</div>
                <div className="text-[9px] text-terminal-muted">Panel opacity for a flatter look</div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={1}
                    value={settings.normcoreOpacity}
                    onChange={(e) => updateSetting('normcoreOpacity', Number(e.target.value))}
                    className="flex-1 accent-phosphor"
                  />
                  <span className="text-[10px] text-phosphor font-mono w-8 text-right">{settings.normcoreOpacity}%</span>
                </div>
              </div>
            </div>
          </div>
          )}

          {appearanceTab === 'business' && (
          <div className="space-y-4">
            <p className="text-[10px] text-terminal-muted">Microsoft, Apple, Meta, IBM–style. Preset sets fonts and glass; Accent tints links and borders.</p>
            <div className="border border-terminal-border p-3 bg-void/70 space-y-3">
              <div className="text-[10px] text-phosphor font-bold tracking-wider">BUSINESS UI SYSTEM</div>
              <div className="text-[9px] text-terminal-muted">Design system–aligned: Fluent, Plex, SF, glass. Preset + Accent + Density + Corners + Shadows.</div>
            </div>
            <div>
              <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">PRESET</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {BUSINESS_PRESET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('businessPreset', opt.id)}
                    className={`p-2 border text-left ${
                      settings.businessPreset === opt.id ? 'border-phosphor bg-void' : 'border-terminal-border hover:border-phosphor/50'
                    }`}
                  >
                    <div className="text-[10px] font-bold tracking-wider">{opt.label}</div>
                    <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{opt.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">ACCENT</div>
              <div className="text-[9px] text-terminal-muted mb-1.5">Tints the preset: links, borders, focus.</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                {BUSINESS_ACCENT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('businessAccent', opt.id)}
                    className={`p-2 border text-left ${
                      settings.businessAccent === opt.id ? 'border-phosphor bg-void' : 'border-terminal-border hover:border-phosphor/50'
                    }`}
                  >
                    <div className="text-[10px] font-bold tracking-wider">{opt.label}</div>
                    <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{opt.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">DENSITY</div>
              <div className="grid grid-cols-3 gap-2">
                {BUSINESS_DENSITY_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => updateSetting('businessDensity', opt.id)}
                    className={`p-2 border text-left ${
                      settings.businessDensity === opt.id ? 'border-phosphor bg-void' : 'border-terminal-border hover:border-phosphor/50'
                    }`}
                  >
                    <div className="text-[10px] font-bold tracking-wider">{opt.label}</div>
                    <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{opt.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">CORNERS</div>
                <div className="grid grid-cols-3 gap-2">
                  {BUSINESS_CORNER_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateSetting('businessCorners', opt.id)}
                      className={`p-2 border text-left ${
                        settings.businessCorners === opt.id ? 'border-phosphor bg-void' : 'border-terminal-border hover:border-phosphor/50'
                      }`}
                    >
                      <div className="text-[10px] font-bold tracking-wider">{opt.label}</div>
                      <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{opt.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">SHADOWS</div>
                <div className="grid grid-cols-3 gap-2">
                  {BUSINESS_SHADOW_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => updateSetting('businessShadows', opt.id)}
                      className={`p-2 border text-left ${
                        settings.businessShadows === opt.id ? 'border-phosphor bg-void' : 'border-terminal-border hover:border-phosphor/50'
                      }`}
                    >
                      <div className="text-[10px] font-bold tracking-wider">{opt.label}</div>
                      <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{opt.subtitle}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          )}
        </section>
      )
    }

    if (activeSection === 'orchestrator') {
      return (
        <section>
          <OrchestratorSettings />
        </section>
      )
    }

    if (activeSection === 'conversation') {
      return (
        <section className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <div className="flex items-center justify-between gap-3 p-2 border border-terminal-border bg-void">
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider">GOALS LAYER</div>
                <div className="text-[10px] text-terminal-muted">Inject user + assistant goals into each reply</div>
              </div>
              <button
                type="button"
                onClick={() => updateSetting('goalsEnabled', !settings.goalsEnabled)}
                className={`px-3 py-1 text-[10px] border font-bold tracking-wider ${
                  settings.goalsEnabled
                    ? 'border-phosphor bg-phosphor text-void'
                    : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                }`}
              >
                {settings.goalsEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 p-2 border border-terminal-border bg-void">
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider">MEMORY LAYER</div>
                <div className="text-[10px] text-terminal-muted">Inject remembered facts when relevant</div>
              </div>
              <button
                type="button"
                onClick={() => updateSetting('memoryEnabled', !settings.memoryEnabled)}
                className={`px-3 py-1 text-[10px] border font-bold tracking-wider ${
                  settings.memoryEnabled
                    ? 'border-phosphor bg-phosphor text-void'
                    : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                }`}
              >
                {settings.memoryEnabled ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>

          <div className="border border-terminal-border p-3 bg-void/70 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider">MISTRAL AGENT ROUTING</div>
                <div className="text-[10px] text-terminal-muted">When enabled, Mistral chats can spin up a task-specific agent automatically.</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => updateSetting('mistralAgentMode', 'off')}
                className={`px-3 py-2 text-[10px] border font-bold tracking-wider ${
                  settings.mistralAgentMode === 'off'
                    ? 'border-phosphor bg-phosphor text-void'
                    : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                }`}
              >
                OFF
              </button>
              <button
                type="button"
                onClick={() => updateSetting('mistralAgentMode', 'auto')}
                className={`px-3 py-2 text-[10px] border font-bold tracking-wider ${
                  settings.mistralAgentMode === 'auto'
                    ? 'border-phosphor bg-phosphor text-void'
                    : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                }`}
              >
                AUTO
              </button>
            </div>
            <div className="text-[10px] text-terminal-muted">
              Requires a connected Mistral provider and a `mistral:*` model selection.
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="border border-terminal-border p-3 bg-void/70">
              <label className="text-[10px] text-phosphor font-bold tracking-wider block mb-2">USER GOALS (one per line)</label>
              <textarea
                value={settings.userGoals}
                onChange={(e) => updateSetting('userGoals', e.target.value)}
                rows={6}
                placeholder="Ship a reliable local AI workspace&#10;Minimize friction and context switching"
                className="w-full bg-slate border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-phosphor resize-y min-h-[120px]"
              />
            </div>

            <div className="border border-terminal-border p-3 bg-void/70">
              <label className="text-[10px] text-phosphor font-bold tracking-wider block mb-2">ASSISTANT GOALS (one per line)</label>
              <textarea
                value={settings.assistantGoals}
                onChange={(e) => updateSetting('assistantGoals', e.target.value)}
                rows={6}
                placeholder="Be direct and implementation-first&#10;Flag uncertainty clearly"
                className="w-full bg-slate border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-phosphor resize-y min-h-[120px]"
              />
            </div>
          </div>

          <div className="border border-terminal-border p-3 bg-void/70">
            <label className="text-[10px] text-phosphor font-bold tracking-wider block mb-2">MEMORY NOTES (one fact per line)</label>
            <textarea
              value={settings.memoryNotes}
              onChange={(e) => updateSetting('memoryNotes', e.target.value)}
              rows={6}
              placeholder="Prefers concise answers with concrete next steps&#10;Current project codename: Atlas"
              className="w-full bg-slate border border-terminal-border p-2 text-phosphor font-mono text-xs focus:outline-none focus:border-phosphor resize-y min-h-[120px]"
            />
            <div className="text-[10px] text-terminal-muted mt-2">
              Stored in local settings (`loom-settings`) and injected into prompts only when enabled.
            </div>
          </div>

          <div className="border border-terminal-border p-3 bg-void/70">
            <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">STORAGE PREVIEW</div>
            <pre className="text-[10px] text-terminal-muted overflow-auto bg-slate border border-terminal-border p-2 max-h-56 whitespace-pre-wrap break-words">
{JSON.stringify(conversationStoragePreview, null, 2)}
            </pre>
          </div>

          <div className="border border-terminal-border p-3 bg-void/70">
            <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">DYNAMIC MEMORY VAULT (LIVE)</div>
            {memoryVaultPreview.length > 0 ? (
              <div className="space-y-1 max-h-52 overflow-auto pr-1">
                {memoryVaultPreview.map(entry => (
                  <div key={entry.id} className="text-[10px] text-terminal-muted border border-terminal-border bg-slate px-2 py-1">
                    <span className="text-phosphor mr-2">[{entry.tier.toUpperCase()}]</span>
                    <span className="text-terminal-muted/90 mr-2">conf {Math.round(entry.confidence * 100)}%</span>
                    <span>{entry.text}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[10px] text-terminal-muted">No dynamic memory entries yet. Use `/remember ...` in terminal.</div>
            )}
          </div>
        </section>
      )
    }

    if (activeSection === 'model_library') {
      const providerStyle: Record<string, { emoji: string; color: string }> = {
        openai: { emoji: '🤖', color: '#10a37f' },
        anthropic: { emoji: '🧠', color: '#d4a574' },
        gemini: { emoji: '✨', color: '#4285f4' },
        mistral: { emoji: '🌊', color: '#ff7000' },
        deepseek: { emoji: '🔮', color: '#0066ff' },
        openrouter: { emoji: '🛰', color: '#8b5cf6' },
        qdc: { emoji: '📡', color: '#2ec4b6' },
      }
      const normalizedOllamaInstalled = new Set(ollamaModels.map(name => name.toLowerCase()))
      const normalizedImageInstalled = new Set(imageModels.map(model => model.name.toLowerCase()))

      const isOllamaInstalled = (model: string): boolean => {
        const normalized = model.toLowerCase()
        const family = normalized.split(':')[0]
        return Array.from(normalizedOllamaInstalled).some(installed =>
          installed === normalized || installed.startsWith(`${family}:`) || installed === family,
        )
      }

      const isImageModelInstalled = (model: string): boolean => {
        const normalized = model.toLowerCase()
        return Array.from(normalizedImageInstalled).some(installed =>
          installed === normalized || installed.startsWith(`${normalized}:`) || normalized.startsWith(installed),
        )
      }

      return (
        <section className="space-y-4">
          {providerFeedback && (
            <div className={`border px-3 py-2 text-[11px] ${
              providerFeedback.type === 'success'
                ? 'border-phosphor text-phosphor bg-void'
                : 'border-red-500/60 text-red-300 bg-red-950/20'
            }`}>
              {providerFeedback.message}
            </div>
          )}

          <div className="border border-terminal-border bg-void/70 p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] text-phosphor font-bold tracking-wider">CLOUD PROVIDERS</div>
                <div className="text-[10px] text-terminal-muted">Connect keys once, then models appear in quick + orchestration lanes.</div>
              </div>
              <button
                type="button"
                onClick={() => { void fetchProviders() }}
                className="px-2 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
              >
                REFRESH
              </button>
            </div>

            <div className="space-y-2">
              {providers.map(provider => {
                const style = providerStyle[provider.name] || { emoji: '⚡', color: '#9ca3af' }
                const draftValue = providerInputs[provider.name] || ''
                return (
                  <div
                    key={provider.name}
                    className="border p-2"
                    style={{
                      borderColor: provider.connected ? `${style.color}66` : 'var(--theme-terminal-border)',
                      background: provider.connected ? `${style.color}11` : 'transparent',
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[12px] text-phosphor font-bold flex items-center gap-2">
                          <span>{style.emoji}</span>
                          <span>{provider.display_name}</span>
                        </div>
                        <div className="text-[10px] text-terminal-muted mt-1">
                          {provider.connected ? 'Connected' : 'Not connected'}
                          {provider.supports_chat === false ? ' • Job connector' : ' • Chat provider'}
                          {provider.supports_quick ? ' • Quick lane' : ''}
                          {provider.free_tier_available ? ' • Free tier' : ''}
                        </div>
                        {provider.notes && (
                          <div className="text-[10px] text-terminal-muted mt-1">{provider.notes}</div>
                        )}
                      </div>
                      {provider.connected ? (
                        <button
                          type="button"
                          onClick={() => { void handleDisconnectProvider(provider.name) }}
                          disabled={providerBusy === provider.name}
                          className="px-2 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor disabled:opacity-50"
                        >
                          {providerBusy === provider.name ? 'WORKING...' : 'DISCONNECT'}
                        </button>
                      ) : (
                        <a
                          href={provider.key_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-phosphor hover:underline"
                        >
                          GET KEY
                        </a>
                      )}
                    </div>

                    {!provider.connected && (
                      <div className="mt-2 flex gap-2">
                        <input
                          type="password"
                          value={draftValue}
                          onChange={(event) => {
                            const value = event.target.value
                            setProviderInputs(prev => ({ ...prev, [provider.name]: value }))
                          }}
                          placeholder={provider.key_hint}
                          className="flex-1 bg-slate border border-terminal-border px-2 py-1 text-[11px] text-phosphor font-mono focus:outline-none focus:border-phosphor"
                        />
                        <button
                          type="button"
                          onClick={() => { void handleConnectProvider(provider.name) }}
                          disabled={providerBusy === provider.name || !draftValue.trim()}
                          className="px-2 py-1 text-[10px] border border-phosphor text-phosphor hover:bg-phosphor/10 disabled:opacity-40"
                        >
                          {providerBusy === provider.name ? '...' : 'CONNECT'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
              {providers.length === 0 && (
                <div className="text-[10px] text-terminal-muted border border-terminal-border p-2">No providers found.</div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="border border-terminal-border bg-void/70 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-phosphor font-bold tracking-wider">OLLAMA LIBRARY</div>
                <button
                  type="button"
                  onClick={() => { void fetchOllamaModels() }}
                  className="px-2 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                >
                  REFRESH
                </button>
              </div>

              <div className="border border-terminal-border bg-void p-2 max-h-44 overflow-auto">
                {ollamaModels.length > 0 ? (
                  <div className="space-y-1">
                    {ollamaModels.map(model => (
                      <div key={model} className="text-[10px] text-terminal-muted font-mono">
                        {model}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[10px] text-terminal-muted">No local Ollama models detected yet.</div>
                )}
              </div>

              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">RECOMMENDED INSTALLS</div>
                <div className="flex flex-wrap gap-2">
                  {OLLAMA_LIBRARY_RECOMMENDED.map(entry => {
                    const installed = isOllamaInstalled(entry.model)
                    const pulling = pullingOllamaModel === entry.model
                    return (
                      <button
                        key={entry.model}
                        type="button"
                        onClick={() => { void handlePullOllamaModel(entry.model) }}
                        disabled={installed || pullingOllamaModel !== null}
                        className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor disabled:opacity-45"
                        title={`${entry.model} (${entry.kind})`}
                      >
                        {pulling ? 'DOWNLOADING...' : installed ? `${entry.label} ✓` : entry.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {ollamaDownloadStatus && (
                <div className="border border-phosphor/50 bg-void px-2 py-1 text-[10px] text-phosphor">
                  {ollamaDownloadStatus.message || ollamaDownloadStatus.status}
                  {typeof ollamaDownloadStatus.percent === 'number' ? ` (${ollamaDownloadStatus.percent}%)` : ''}
                </div>
              )}
            </div>

            <div className="border border-terminal-border bg-void/70 p-3 space-y-3">
              <div className="text-[11px] text-phosphor font-bold tracking-wider">HUGGING FACE LOCAL MODELS</div>

              <div className="space-y-2">
                <label className="text-[10px] text-terminal-muted">Hugging Face Token</label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={settings.huggingfaceToken}
                    onChange={(event) => updateSetting('huggingfaceToken', event.target.value)}
                    placeholder="hf_..."
                    className="flex-1 bg-slate border border-terminal-border px-2 py-1 text-[11px] text-phosphor font-mono focus:outline-none focus:border-phosphor"
                  />
                  <button
                    type="button"
                    onClick={() => { void applyHuggingFaceToken() }}
                    disabled={hfTokenBusy || !settings.huggingfaceToken.trim()}
                    className="px-2 py-1 text-[10px] border border-phosphor text-phosphor hover:bg-phosphor/10 disabled:opacity-40"
                  >
                    {hfTokenBusy ? 'SAVING...' : 'APPLY'}
                  </button>
                </div>
                <a
                  href="https://huggingface.co/settings/tokens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-phosphor hover:underline"
                >
                  Get token at huggingface.co/settings/tokens
                </a>
              </div>

              <div>
                <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">DIFFUSERS CATALOG</div>
                {imageModelCatalog.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {imageModelCatalog.map(modelName => {
                      const installed = isImageModelInstalled(modelName)
                      const isDownloading = downloadingModel === modelName
                      return (
                        <button
                          key={modelName}
                          type="button"
                          onClick={() => { void handleDownloadModel(modelName) }}
                          disabled={downloadingModel !== null || installed}
                          className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor disabled:opacity-45"
                          title={modelName}
                        >
                          {isDownloading ? 'DOWNLOADING...' : installed ? `${modelName} ✓` : modelName}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-[10px] text-terminal-muted border border-terminal-border bg-void p-2">
                    No local image catalog found yet.
                  </div>
                )}
              </div>

              {downloadProgress && (
                <div className="border border-phosphor/50 bg-void px-2 py-1 text-[10px] text-phosphor">
                  {downloadProgress.message || downloadProgress.status}
                </div>
              )}
            </div>
          </div>

          <div className="border border-terminal-border bg-void/70 p-3">
            <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">MODEL STORAGE LOCATIONS</div>
            <div className="text-[10px] text-terminal-muted space-y-1">
              <p>Ollama: <code className="text-phosphor">~/.ollama/models/</code></p>
              <p>Diffusion cache: <code className="text-phosphor">~/.cache/huggingface/</code></p>
              <p>Music cache: <code className="text-phosphor">~/.cache/ace-step/checkpoints/</code></p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => { void openModelFolder('ollama') }}
                className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
              >
                Open Ollama Folder
              </button>
              <button
                onClick={() => { void openModelFolder('diffusion') }}
                className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
              >
                Open Diffusion Folder
              </button>
              <button
                onClick={() => { void openModelFolder('music') }}
                className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
              >
                Open Music Cache
              </button>
            </div>
            {openFolderStatus && (
              <p className="mt-2 text-[10px] text-phosphor">{openFolderStatus}</p>
            )}
          </div>
        </section>
      )
    }

    if (activeSection === 'storage') {
      return (
        <section className="space-y-2">
          <label className="text-xs text-terminal-muted">Folder Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={settings.dataFolderPath}
              onChange={(e) => updateSetting('dataFolderPath', e.target.value)}
              placeholder="~/Documents/loom-data or /Users/you/data"
              className="flex-1 bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm focus:outline-none focus:border-cyan-400"
            />
            {dataFolderStatus === 'valid' && (
              <span className="text-phosphor self-center">✓</span>
            )}
            {dataFolderStatus === 'invalid' && (
              <span className="text-red-400 self-center">✗</span>
            )}
          </div>
          <p className="text-[10px] text-terminal-muted">
            Use absolute path or ~ for home. Folder must exist.
          </p>
          {dataFolderStatus === 'invalid' && (
            <p className="text-[10px] text-red-400">
              Folder not found or not accessible.
            </p>
          )}
        </section>
      )
    }

    if (activeSection === 'sharing') {
      const isActive = Boolean(shareStatus?.active)
      const publicUrl = shareStatus?.public_chat_url || ''
      const localUrl = shareStatus?.local_chat_url || `${API_BASE_URL}/chat`

      return (
        <section className="space-y-4">
          {shareFeedback && (
            <div className={`border px-3 py-2 text-[11px] ${
              shareFeedback.type === 'success'
                ? 'border-phosphor text-phosphor bg-void'
                : 'border-red-500/60 text-red-300 bg-red-950/20'
            }`}>
              {shareFeedback.message}
            </div>
          )}

          <div className="border border-terminal-border bg-void/70 p-3 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] text-phosphor font-bold tracking-wider">ONE-CLICK PUBLIC CHAT SITE</div>
                <div className="text-[10px] text-terminal-muted mt-1">
                  Turns your local `/chat` into a public link tied to your machine.
                </div>
              </div>
              <div className={`px-2 py-1 text-[10px] border ${
                isActive
                  ? 'border-phosphor text-phosphor'
                  : 'border-terminal-border text-terminal-muted'
              }`}>
                {isActive ? 'LIVE' : 'OFF'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  if (isActive) {
                    void stopChatShare()
                    return
                  }
                  void startChatShare()
                }}
                disabled={shareBusy}
                className="px-3 py-1 text-[10px] border border-phosphor text-phosphor hover:bg-phosphor/10 disabled:opacity-50"
              >
                {shareBusy ? 'WORKING...' : isActive ? 'STOP SHARING' : 'START SHARING'}
              </button>
              <button
                type="button"
                onClick={() => { void fetchShareStatus() }}
                disabled={shareBusy}
                className="px-3 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor disabled:opacity-50"
              >
                REFRESH
              </button>
              <button
                type="button"
                onClick={() => {
                  void copyText(localUrl).then((copied) => {
                    setShareFeedback({
                      type: copied ? 'success' : 'error',
                      message: copied ? 'Local chat URL copied.' : 'Could not copy local chat URL.',
                    })
                  })
                }}
                className="px-3 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
              >
                COPY LOCAL URL
              </button>
            </div>

            {!shareStatus?.cloudflared_installed && (
              <div className="border border-yellow-600/70 bg-yellow-900/20 px-3 py-2 text-[10px] text-yellow-200">
                `cloudflared` is not installed. Install it first, then click Start Sharing.
                <div className="mt-1 font-mono text-yellow-100">brew install cloudflared</div>
              </div>
            )}

            <div className="space-y-2">
              <div>
                <div className="text-[10px] text-terminal-muted mb-1">Public URL</div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={publicUrl || 'Not active yet'}
                    readOnly
                    className="flex-1 bg-slate border border-terminal-border px-2 py-1 text-[11px] text-phosphor font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!publicUrl) return
                      void copyText(publicUrl).then((copied) => {
                        setShareFeedback({
                          type: copied ? 'success' : 'error',
                          message: copied ? 'Public chat URL copied.' : 'Could not copy public chat URL.',
                        })
                      })
                    }}
                    disabled={!publicUrl}
                    className="px-3 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor disabled:opacity-45"
                  >
                    COPY
                  </button>
                </div>
              </div>

              <div>
                <div className="text-[10px] text-terminal-muted mb-1">Local URL</div>
                <input
                  type="text"
                  value={localUrl}
                  readOnly
                  className="w-full bg-slate border border-terminal-border px-2 py-1 text-[11px] text-terminal-muted font-mono"
                />
              </div>
            </div>
          </div>

          <div className="border border-terminal-border bg-void/50 p-3 text-[10px] text-terminal-muted space-y-1">
            <p>Share mode uses Cloudflare Quick Tunnel (`cloudflared tunnel --url ...`).</p>
            <p>Safety: `/api/remote/*` command/filesystem endpoints are disabled while sharing is active.</p>
            <p>Keep this app running while shared links are in use.</p>
          </div>
        </section>
      )
    }

    if (activeSection === 'voice') {
      return (
        <section>
          <p className="text-terminal-muted text-xs mb-2">
            Use the <strong className="text-phosphor">✦</strong> button on the right sidebar to open the Voice & Avatar panel.
          </p>
          <ul className="text-terminal-muted text-[10px] list-disc list-inside space-y-1">
            <li><strong className="text-phosphor">Response to read</strong> - Pick any AI reply and read it aloud (TTS)</li>
            <li><strong className="text-phosphor">Voice (TTS)</strong> - Voice, rate, and pitch for read-aloud</li>
            <li><strong className="text-phosphor">Avatar</strong> - Pick a style (Data Nebula, Plasma Orb, etc.)</li>
            <li><strong className="text-phosphor">Voice chat</strong> - Opens a modal to talk back and forth (hold to talk, AI replies aloud)</li>
          </ul>
        </section>
      )
    }

    if (activeSection === 'extensions') {
      return (
        <section className="space-y-4">
          <p className="text-[11px] text-terminal-muted">
            Install <strong className="text-phosphor">skills</strong> and LOOM turns them into circuits you can run from the Circuit Board or <code className="text-phosphor">/run &lt;name&gt;</code>.
          </p>
          <div className="border border-terminal-border bg-void/40 p-4 space-y-3">
            <div className="text-[10px] text-phosphor font-bold tracking-wider">INSTALL A SKILL</div>
            <p className="text-[10px] text-terminal-muted">
              GitHub repo URL, .zip link, or local folder path containing <code className="text-phosphor">SKILL.md</code>.
            </p>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[10px] text-terminal-muted">Quick example:</span>
              <button
                type="button"
                onClick={async () => {
                  setExtensionsInstallBusy(true)
                  setExtensionsInstallError(null)
                  try {
                    const r = await fetch(`${API_BASE_URL}/api/extensions/install`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ path: 'sample-skill' }),
                    })
                    const data = await r.json().catch(() => ({}))
                    if (!r.ok) {
                      setExtensionsInstallError(data.detail || data.error || 'Install failed')
                      return
                    }
                    await fetchExtensionsInstalled()
                    await refreshCircuitsFromBackend()
                  } catch (e) {
                    setExtensionsInstallError(e instanceof Error ? e.message : 'Install failed')
                  } finally {
                    setExtensionsInstallBusy(false)
                  }
                }}
                disabled={extensionsInstallBusy}
                className="px-2 py-1 text-[10px] font-medium border border-phosphor text-phosphor hover:bg-phosphor hover:text-void disabled:opacity-50"
              >
                Try sample skill
              </button>
              <span className="text-[10px] text-terminal-muted">(built-in <code className="text-phosphor">sample-skill</code> in this repo — adds circuit <code className="text-phosphor">/sample-echo</code>)</span>
            </div>
            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={extensionsInstallUrl}
                onChange={(e) => { setExtensionsInstallUrl(e.target.value); setExtensionsInstallError(null) }}
                placeholder="https://github.com/user/repo or .zip URL"
                className="w-full bg-void border border-terminal-border p-2 text-phosphor text-sm font-mono placeholder:text-terminal-muted focus:outline-none focus:border-phosphor"
              />
              <input
                type="text"
                value={extensionsInstallPath}
                onChange={(e) => { setExtensionsInstallPath(e.target.value); setExtensionsInstallError(null) }}
                placeholder="Or folder path"
                className="w-full bg-void border border-terminal-border p-2 text-phosphor text-sm font-mono placeholder:text-terminal-muted focus:outline-none focus:border-phosphor"
              />
              {extensionsInstallError && <p className="text-[10px] text-red-400">{extensionsInstallError}</p>}
              <button
                type="button"
                onClick={() => void handleInstallExtension()}
                disabled={extensionsInstallBusy || (!extensionsInstallUrl.trim() && !extensionsInstallPath.trim())}
                className="self-start px-3 py-1.5 text-[11px] font-bold border border-phosphor text-phosphor hover:bg-phosphor hover:text-void disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {extensionsInstallBusy ? 'Installing…' : 'Install'}
              </button>
            </div>
          </div>
          <div className="border border-terminal-border bg-void/40 p-4 space-y-3">
            <div className="text-[10px] text-phosphor font-bold tracking-wider">INSTALLED SKILLS</div>
            {extensionsInstalled.length === 0 ? (
              <p className="text-[10px] text-terminal-muted">None yet. Install one above; circuits show on the Circuit Board and in <code className="text-phosphor">/circuits</code>.</p>
            ) : (
              <ul className="space-y-2">
                {extensionsInstalled.map((skill) => (
                  <li key={skill.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-terminal-border/40 last:border-0">
                    <div className="min-w-0">
                      <span className="text-[11px] text-phosphor font-medium">{skill.name}</span>
                      <span className="text-[10px] text-terminal-muted ml-1.5">v{skill.version}</span>
                      {skill.circuitCount > 0 && <span className="text-[10px] text-terminal-muted block mt-0.5">{skill.circuitCount} circuit{skill.circuitCount !== 1 ? 's' : ''}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleUninstallExtension(skill.id)}
                      disabled={extensionsUninstallBusy === skill.id}
                      className="shrink-0 px-2 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:border-red-500 hover:text-red-400 disabled:opacity-50"
                    >
                      {extensionsUninstallBusy === skill.id ? '…' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-[10px] text-terminal-muted">
            <strong className="text-phosphor">1:1 with Agent Skills:</strong> Same <code className="text-phosphor">SKILL.md</code> as{' '}
            <a href="https://github.com/anthropics/skills" target="_blank" rel="noopener noreferrer" className="text-phosphor hover:underline">anthropics/skills</a>.
            {' '}Instruction-only skills (name + description + body) become one runnable circuit each; skills with a <code className="text-phosphor">circuits</code> block use those. Install a skill folder from that repo (e.g. path to <code className="text-phosphor">skills/…</code>) to get <code className="text-phosphor">/run &lt;name&gt;</code>. See docs/SKILLS_AND_CIRCUITS.md.
          </p>
        </section>
      )
    }

    if (activeSection === 'connections') {
      const tgIsObj = typeof telegramVerify === 'object' && telegramVerify !== null
      const tgOk = tgIsObj && 'ok' in telegramVerify
      const tgErr = tgIsObj && 'error' in telegramVerify
      return (
        <section className="space-y-4">
          <p className="text-[11px] text-terminal-muted">
            Optional in/out links: receive messages in LOOM and send from LOOM. LOOM stays your home base.
          </p>
          <div className="border border-terminal-border bg-void/40 p-4 space-y-3">
            <div className="text-[10px] text-phosphor font-bold tracking-wider">TELEGRAM</div>
            <ul className="text-[10px] text-terminal-muted list-disc list-inside space-y-0.5">
              <li>Receive: DMs to your bot appear in the LOOM feed</li>
              <li>Send: Post from LOOM to a Telegram chat or channel</li>
            </ul>
            <p className="text-[10px] text-terminal-muted">
              Get a bot token in one step:{' '}
              <a
                href="https://t.me/BotFather"
                target="_blank"
                rel="noopener noreferrer"
                className="text-phosphor hover:underline"
              >
                Open @BotFather in Telegram
              </a>
              {' '}→ send <code className="text-phosphor">/newbot</code> → name it → paste the token below.
            </p>
            <a
              href="https://core.telegram.org/bots#6-botfather"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-phosphor hover:underline block"
            >
              Bot API docs (core.telegram.org/bots)
            </a>
            <div className="flex items-center gap-2">
              <input
                type="password"
                value={telegramToken}
                onChange={(e) => { setTelegramToken(e.target.value); setTelegramVerify(null) }}
                placeholder="Bot token (e.g. 123456:ABC…)"
                className="flex-1 min-w-0 bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm focus:outline-none focus:border-phosphor"
              />
              <button
                type="button"
                onClick={() => void handleVerifyTelegram()}
                disabled={!telegramToken.trim() || telegramVerify === 'checking'}
                title={
                  telegramVerify === 'checking'
                    ? 'Verifying…'
                    : tgOk
                      ? `Verified: ${(telegramVerify as { username?: string }).username ?? 'Bot'}`
                      : tgErr
                        ? (telegramVerify as { error: string }).error
                        : 'Verify token'
                }
                className={`shrink-0 w-8 h-8 flex items-center justify-center border text-sm ${
                  telegramVerify === 'checking'
                    ? 'border-terminal-border text-terminal-muted'
                    : tgOk
                      ? 'border-phosphor text-phosphor'
                      : tgErr
                        ? 'border-red-500 text-red-400'
                        : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                }`}
              >
                {telegramVerify === 'checking' ? '…' : tgOk ? '✓' : tgErr ? '✗' : '✓'}
              </button>
            </div>
            {tgErr && (
              <span className="text-[10px] text-red-400">{(telegramVerify as { error: string }).error}</span>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] text-terminal-muted">
                Status: {connectorsStatus.telegram?.connected ? `Connected as ${connectorsStatus.telegram.username ?? 'Bot'}` : 'Not connected'}
              </span>
              {connectorsStatus.telegram?.connected ? (
                <button
                  type="button"
                  onClick={() => void handleDisconnectTelegram()}
                  disabled={connectorsBusy === 'telegram'}
                  className="px-2 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor disabled:opacity-50"
                >
                  {connectorsBusy === 'telegram' ? '…' : 'Disconnect'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleConnectTelegram()}
                  disabled={!telegramToken.trim() || connectorsBusy === 'telegram'}
                  className="px-2 py-1 text-[10px] border border-phosphor text-phosphor hover:bg-phosphor hover:text-void disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {connectorsBusy === 'telegram' ? '…' : 'Connect'}
                </button>
              )}
            </div>
          </div>
          <div className="border border-terminal-border bg-void/40 p-4 space-y-3">
            <div className="text-[10px] text-phosphor font-bold tracking-wider">DISCORD</div>
            <ul className="text-[10px] text-terminal-muted list-disc list-inside space-y-0.5">
              <li>Receive: DMs or channel messages to the bot appear in the LOOM feed</li>
              <li>Send: Post from LOOM to a Discord channel or DM</li>
            </ul>
            <p className="text-[10px] text-terminal-muted">
              Get a bot token:{' '}
              <a
                href="https://discord.com/developers/applications"
                target="_blank"
                rel="noopener noreferrer"
                className="text-phosphor hover:underline"
              >
                Discord Developer Portal
              </a>
              {' '}→ New Application → Bot → Add Bot → Reset Token → copy. Invite the bot to your server with the right scopes.
            </p>
            <a
              href="https://discord.com/developers/docs/getting-started"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-phosphor hover:underline block"
            >
              Discord developer docs
            </a>
            <input
              type="password"
              placeholder="Bot token"
              className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm focus:outline-none focus:border-phosphor"
            />
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-terminal-muted">Status: Not connected</span>
              <button type="button" disabled className="px-2 py-1 text-[10px] border border-terminal-border text-terminal-muted cursor-not-allowed">Connect</button>
            </div>
          </div>
          <span className="text-[10px] text-terminal-muted">Implementation guide: docs/CONNECTIONS_TELEGRAM_DISCORD.md in the repo.</span>
        </section>
      )
    }

    if (activeSection === 'integrations') {
      return (
        <section className="space-y-2">
          <label className="text-xs text-terminal-muted">Hugging Face API Token</label>
          <input
            type="password"
            value={settings.huggingfaceToken}
            onChange={(e) => updateSetting('huggingfaceToken', e.target.value)}
            placeholder="hf_..."
            className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm focus:outline-none focus:border-phosphor"
          />
          <a
            href="https://huggingface.co/settings/tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-xs text-phosphor hover:underline"
          >
            &rarr; Get token at huggingface.co/settings/tokens
          </a>
        </section>
      )
    }

    return (
      <section className="space-y-3 text-xs">
        {imageModels.length > 0 ? (
          <div className="bg-void p-3 border border-terminal-border">
            <div className="text-phosphor font-bold mb-2">Downloaded Models:</div>
            <div className="space-y-1">
              {imageModels.map((model) => (
                <div key={model.name} className="flex items-center justify-between py-1 border-b border-terminal-border/30 last:border-0">
                  <div>
                    <span className="text-phosphor">{model.name}</span>
                    {model.vram && model.vram !== 'varies' && (
                      <span className="text-terminal-muted ml-2">({model.vram})</span>
                    )}
                    <span className="text-terminal-muted ml-2 text-[10px]">
                      [{model.type === 'ollama' ? 'Ollama' : 'Local'}]
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-void p-3 border border-terminal-border">
            <div className="text-terminal-muted text-center py-2 space-y-2">
              <div className="text-phosphor text-[11px]">No models downloaded yet</div>
              <div className="text-[10px]">Have <strong className="text-phosphor">Ollama</strong> running (ollama.app or <code className="text-phosphor">ollama serve</code>), then get the default chat + image stack with one click.</div>
              <button
                type="button"
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('loom:run-setup-models'))
                  onClose()
                }}
                className="w-full py-2 px-3 text-[11px] font-bold border-2 border-phosphor bg-phosphor/10 text-phosphor hover:bg-phosphor hover:text-void transition-colors"
              >
                Get base models
              </button>
              <div className="text-[10px]">Or run in terminal: <code className="text-phosphor">/setup-models</code> or <code className="text-phosphor">/pull llama3.1:8b</code></div>
            </div>
          </div>
        )}

        <div className="bg-void p-3 border border-terminal-border">
          <div className="text-phosphor font-bold mb-2">Download from Ollama:</div>
          <div className="space-y-2">
            <div className="text-[10px] text-terminal-muted mb-2">
              Available image generation models from Ollama:
            </div>
            <div className="flex flex-wrap gap-2">
              {['x/flux2-klein:9b', 'x/flux2-klein:4b', 'x/flux2-klein'].map((modelName) => {
                const isDownloaded = imageModels.some(m => m.name.includes('flux2-klein'))
                const isDownloading = downloadingModel === modelName
                const shortName = modelName.includes(':9b')
                  ? 'FLUX.2 Klein 9B'
                  : modelName.includes(':4b')
                    ? 'FLUX.2 Klein 4B'
                    : 'FLUX.2 Klein'
                return (
                  <button
                    key={modelName}
                    onClick={() => handleDownloadModel(modelName)}
                    disabled={downloadingModel !== null || isDownloaded}
                    className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? 'Downloading...' : isDownloaded ? `${shortName} ✓` : shortName}
                  </button>
                )
              })}
            </div>
            <div className="text-[9px] text-terminal-muted mt-2">
              Note: Only Ollama image models are shown. Local diffusers models (SDXL, etc.) are not available via Ollama.
            </div>
          </div>
        </div>

        {downloadProgress && (
          <div className="bg-void p-2 border border-phosphor/50">
            <div className="text-[10px] text-phosphor">
              {downloadProgress.status === 'downloading' && '⬇ '}
              {downloadProgress.status === 'success' && '✓ '}
              {downloadProgress.status === 'error' && '✗ '}
              {downloadProgress.message || downloadProgress.status}
            </div>
          </div>
        )}

        <div className="text-terminal-muted text-[10px]">
          <p>Ollama models stored in: <code className="text-phosphor">~/.ollama/models/</code></p>
          <p className="mt-1">Download via: <code className="text-phosphor">ollama pull x/flux2-klein:9b</code></p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              onClick={() => { void openModelFolder('ollama') }}
              className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
              title="Open Ollama models folder"
            >
              Open Ollama Folder
            </button>
            <button
              onClick={() => { void openModelFolder('diffusion') }}
              className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
              title="Open local diffusion models folder"
            >
              Open Diffusion Folder
            </button>
            <button
              onClick={() => { void openModelFolder('music') }}
              className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
              title="Open music model cache folder"
            >
              Open Music Cache
            </button>
          </div>
          {openFolderStatus && (
            <p className="mt-2 text-[10px] text-phosphor">{openFolderStatus}</p>
          )}
        </div>
      </section>
    )
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-void/90"
        onClick={onClose}
      />

      <div className="relative bg-slate border border-terminal-border w-full max-w-6xl mx-4 shadow-glow h-[88vh] max-h-[900px] flex flex-col overflow-hidden">
        <div className="bg-phosphor text-void px-4 py-2 flex items-center justify-between">
          <span className="font-bold text-sm tracking-wider">SETTINGS</span>
          <button
            onClick={onClose}
            className="text-void hover:bg-void/20 px-2"
          >
            ×
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          <aside className="md:w-72 border-b md:border-b-0 md:border-r border-terminal-border bg-void/60 p-3 overflow-x-auto md:overflow-y-auto">
            <nav className="flex md:flex-col gap-2 min-w-max md:min-w-0">
              {SETTINGS_SECTIONS.map((section) => {
                const isActive = section.id === activeSection
                return (
                  <button
                    key={section.id}
                    type="button"
                    onClick={() => setActiveSection(section.id)}
                    className={`text-left px-3 py-2 border rounded-sm transition-colors ${
                      isActive
                        ? 'border-phosphor bg-phosphor/10 text-phosphor'
                        : 'border-terminal-border text-terminal-muted hover:border-phosphor/50 hover:text-phosphor'
                    }`}
                  >
                    <div className="text-xs font-bold tracking-wide flex items-center gap-2">
                      <span className="text-[10px]">{section.icon}</span>
                      <span>{section.label}</span>
                    </div>
                    <div className="text-[10px] mt-1 opacity-80">{section.subtitle}</div>
                  </button>
                )
              })}
            </nav>
          </aside>

          <main className="flex-1 min-h-0 overflow-y-auto p-5 md:p-6">
            <div className="border border-terminal-border bg-void/40 p-4 mb-4">
              <div className="text-phosphor text-sm font-bold tracking-wide flex items-center gap-2">
                <span>{selectedSection.icon}</span>
                <span>{selectedSection.label}</span>
              </div>
              <p className="text-terminal-muted text-xs mt-1">{selectedSection.subtitle}</p>
            </div>

            <div
              data-appearance-retro-tab={activeSection === 'appearance' && appearanceTab === 'retro' ? 'true' : undefined}
              className="contents"
            >
              {renderActiveSection()}
            </div>
          </main>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-terminal-border bg-slate/90">
          <span className={`text-xs ${saved ? 'text-phosphor' : 'text-transparent'}`}>
            ✓ Settings saved
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-terminal-muted border border-terminal-border hover:text-phosphor hover:border-phosphor"
            >
              CANCEL
            </button>
            <button
              onClick={handleSave}
              disabled={dataFolderStatus === 'checking'}
              className="btn-terminal text-sm disabled:opacity-50"
            >
              {dataFolderStatus === 'checking' ? 'CHECKING...' : 'SAVE'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
