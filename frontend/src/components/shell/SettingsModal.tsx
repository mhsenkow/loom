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

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export type ThemeId = 'phosphor' | 'ruby' | 'sapphire' | 'diamond' | 'ebony'
export type CrtIntensityPreset = 'subtle' | 'medium' | 'full' | 'insane'
export type MistralAgentMode = 'off' | 'auto'
export type UiPresetId = 'command' | 'broadcast' | 'arcade' | 'lab' | 'vault'
export type UiCornerStyle = 'hard' | 'soft' | 'chamfer'
export type VisualSystemSettings = Pick<
  Settings,
  'uiPreset' | 'uiCornerStyle' | 'uiFrameWeight' | 'uiGlowLevel' | 'uiTextureLevel' | 'uiContrastLevel' | 'uiTintShift'
>

export interface Settings {
  huggingfaceToken: string
  comfyuiUrl: string
  comfyuiEnabled: boolean
  dataFolderPath: string
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
  | 'integrations'
  | 'image_models'

const SETTINGS_SECTIONS: Array<{
  id: SettingsSectionId
  label: string
  subtitle: string
  icon: string
}> = [
  { id: 'appearance', label: 'Appearance', subtitle: 'Theme, CRT, effects', icon: '◉' },
  { id: 'conversation', label: 'Conversation', subtitle: 'Goals and memory', icon: '◍' },
  { id: 'model_library', label: 'Model Library', subtitle: 'Cloud + local model catalog', icon: '◍' },
  { id: 'orchestrator', label: 'Orchestrator', subtitle: 'Routing and priorities', icon: '◈' },
  { id: 'storage', label: 'Storage', subtitle: 'Data folder and files', icon: '◌' },
  { id: 'sharing', label: 'Share Chat Site', subtitle: 'One-click public link', icon: '◐' },
  { id: 'voice', label: 'Voice & Avatar', subtitle: 'Speech and persona', icon: '◎' },
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

export function applyVisualSystem(settings: VisualSystemSettings) {
  const root = document.documentElement
  root.dataset.uiPreset = settings.uiPreset
  root.dataset.uiCorners = settings.uiCornerStyle

  const frameWeightPx = (1 + (settings.uiFrameWeight / 100) * 3.2).toFixed(2)
  const buttonLiftPx = (1 + (settings.uiFrameWeight / 100) * 3).toFixed(2)
  const glow = (0.05 + (settings.uiGlowLevel / 100) * 0.52).toFixed(3)
  const texture = ((settings.uiTextureLevel / 100) * 0.34).toFixed(3)
  const contrast = (0.92 + (settings.uiContrastLevel / 100) * 0.3).toFixed(3)
  const tintMix = Math.round(Math.abs(settings.uiTintShift) * 0.65)
  const cornerRadiusPx = settings.uiCornerStyle === 'soft'
    ? `${Math.round(3 + (settings.uiFrameWeight / 100) * 8)}px`
    : '0px'
  const cornerCutPx = settings.uiCornerStyle === 'chamfer'
    ? `${Math.round(6 + (settings.uiFrameWeight / 100) * 10)}px`
    : '0px'

  root.style.setProperty('--ui-frame-weight', `${frameWeightPx}px`)
  root.style.setProperty('--ui-button-lift', `${buttonLiftPx}px`)
  root.style.setProperty('--ui-glow-strength', glow)
  root.style.setProperty('--ui-texture-opacity', texture)
  root.style.setProperty('--ui-contrast-scale', contrast)
  root.style.setProperty('--ui-tint-angle', `${settings.uiTintShift}deg`)
  root.style.setProperty('--ui-tint-mix', `${tintMix}%`)
  root.style.setProperty('--ui-global-radius', cornerRadiusPx)
  root.style.setProperty('--ui-led-radius', settings.uiCornerStyle === 'soft' ? '50%' : cornerRadiusPx)
  root.style.setProperty('--ui-corner-cut', cornerCutPx)
}

// Load settings from localStorage
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const merged = { ...defaultSettings(), ...parsed }
      if (!THEMES.some(t => t.id === merged.theme)) {
        merged.theme = 'phosphor'
      }
      if (!CRT_INTENSITY_PRESETS.some(preset => preset.id === merged.crtIntensity)) {
        merged.crtIntensity = 'medium'
      }
      if (!UI_PRESET_OPTIONS.some(option => option.id === merged.uiPreset)) {
        merged.uiPreset = 'command'
      }
      if (!UI_CORNER_OPTIONS.some(option => option.id === merged.uiCornerStyle)) {
        merged.uiCornerStyle = 'hard'
      }
      if (typeof merged.crtBurstsEnabled !== 'boolean') {
        merged.crtBurstsEnabled = true
      }
      if (typeof merged.crtNoiseEnabled !== 'boolean') {
        merged.crtNoiseEnabled = true
      }
      merged.crtNoiseLevel = normalizeNumber(merged.crtNoiseLevel, 22, 0, 100)
      merged.crtBloomLevel = normalizeNumber(merged.crtBloomLevel, 28, 0, 100)
      merged.crtJitterLevel = normalizeNumber(merged.crtJitterLevel, 8, 0, 40)
      merged.crtScanDrift = normalizeNumber(merged.crtScanDrift, 100, 50, 180)
      merged.uiFrameWeight = normalizeNumber(merged.uiFrameWeight, 38, UI_FRAME_WEIGHT_MIN, UI_FRAME_WEIGHT_MAX)
      merged.uiGlowLevel = normalizeNumber(merged.uiGlowLevel, 48, UI_GLOW_MIN, UI_GLOW_MAX)
      merged.uiTextureLevel = normalizeNumber(merged.uiTextureLevel, 42, UI_TEXTURE_MIN, UI_TEXTURE_MAX)
      merged.uiContrastLevel = normalizeNumber(merged.uiContrastLevel, 46, UI_CONTRAST_MIN, UI_CONTRAST_MAX)
      merged.uiTintShift = normalizeNumber(merged.uiTintShift, 0, UI_TINT_MIN, UI_TINT_MAX)
      if (typeof merged.goalsEnabled !== 'boolean') {
        merged.goalsEnabled = true
      }
      if (typeof merged.memoryEnabled !== 'boolean') {
        merged.memoryEnabled = true
      }
      merged.userGoals = normalizeMultilineSetting(
        merged.userGoals,
        'Help me move projects forward with practical, high-signal answers.',
      )
      merged.assistantGoals = normalizeMultilineSetting(
        merged.assistantGoals,
        'Be accurate, concise, and explicit about assumptions and tradeoffs.',
      )
      merged.memoryNotes = normalizeMultilineSetting(merged.memoryNotes)
      if (merged.mistralAgentMode !== 'auto') {
        merged.mistralAgentMode = 'off'
      }
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
    uiFrameWeight: 38,
    uiGlowLevel: 48,
    uiTextureLevel: 42,
    uiContrastLevel: 46,
    uiTintShift: 0,
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

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('appearance')
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
      setSettings(loadSettings())
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

    saveSettings(settings)
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

  const selectedSection = SETTINGS_SECTIONS.find(section => section.id === activeSection) ?? SETTINGS_SECTIONS[0]
  const conversationProfile = buildConversationProfileFromSettings(settings)
  const conversationStoragePreview = buildConversationProfileStoragePreview(conversationProfile)
  const memoryVaultPreview = loadMemoryVault().slice(0, 10)

  const renderActiveSection = () => {
    if (activeSection === 'appearance') {
      return (
        <section className="space-y-4">
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
                    onClick={() => updateSetting('uiPreset', preset.id)}
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

          <div className="pt-2 border-t border-terminal-border/60">
            <div className="text-[10px] text-phosphor font-bold tracking-wider mb-2">HACKER PROFILES</div>
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
            <div className="text-terminal-muted text-center py-2 space-y-1">
              <div className="text-phosphor text-[11px]">No models downloaded yet</div>
              <div className="text-[10px]">First run: start Ollama, then download one model below.</div>
              <div className="text-[10px]">You can also run: <code className="text-phosphor">/pull x/flux2-klein</code></div>
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

            {renderActiveSection()}
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
