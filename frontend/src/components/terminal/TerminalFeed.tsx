import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type { CSSProperties } from 'react'
import type { Editor } from '@tiptap/core'
import { CommandInput } from './CommandInput'
import { SessionPanel, SaveSessionModal } from './SessionPanel'
import { CircuitTrace } from './CircuitTrace'
import { DownloadPanel } from './DownloadPanel'
import { ImageAnalysisPanel } from './ImageAnalysisPanel'
import { ImageGenerationPanel } from './ImageGenerationPanel'
import { ImageModal } from './ImageModal'
import { SystemStatusCard } from './SystemStatusCard'
import { FloatingToolbar } from './FloatingToolbar'
import { CodeContextPanel } from './CodeContextPanel'
import { MusicSetupPanel } from './MusicSetupPanel'
import { MusicGenerationPanel } from './MusicGenerationPanel'
import { MusicPlayerCard } from './MusicPlayerCard'
import { ProviderSetup } from './ProviderSetup'
import { DialogModal } from '../shell/DialogModal'
import { loadSettings, saveSettings } from '../shell/SettingsModal'
import { AvatarPanel } from '../avatar/AvatarPanel'
import { VoiceChatModal } from '../avatar/VoiceChatModal'
import { getSocketInstance, type PullStatus, useSocket } from '../../hooks/useSocket'
import { useAudioAnalyzer } from '../../hooks/useAudioAnalyzer'
import { useSpeechSynthesis } from '../../hooks/useSpeechSynthesis'
import { useMicrophoneRecorder } from '../../hooks/useMicrophoneRecorder'
import { getAvatarConfig, DEFAULT_AVATAR_ID, type AvatarSoundVisualParams, DEFAULT_SOUND_VISUAL_PARAMS } from '../../types/avatar'
import type { TTSModelType, OrpheusTTSParams } from '../../types/tts'
import { DEFAULT_TTS_MODEL_TYPE, DEFAULT_ORPHEUS_PARAMS } from '../../types/tts'
import { useOrpheusTTS } from '../../hooks/useOrpheusTTS'
import { useSystemStatus } from '../../hooks/useSystemStatus'
import type { CloudModelInfo } from '../../store/systemStore'
import { terminalOutputBus, getCircuitContext } from '../../hooks/useTerminalOutput'
import {
  useCircuitRunner,
  useCircuitExecution,
  getCircuitNames,
  loadSavedCircuits,
  saveCircuit,
} from '../../hooks/useCircuitRunner'
import { NOTEBOOK_TEMPLATES } from '../circuit/TemplatesSidebar'
import type { LogEntry } from '../../types/module'
import { buildConversationContext, buildEnhancedPrompt } from '../../utils/conversationContext'
import { buildConversationProfileFromSettings, normalizeProfileLines, toMultilineText } from '../../utils/conversationProfile'
import {
  addMemoryEntry,
  buildSettingsMemoryNotesFromVault,
  pruneMemoryVault,
  removeMemoryEntryById,
  selectRelevantMemory,
  syncLegacyMemoryNotes,
  touchMemoryEntries,
  type MemoryTier,
} from '../../utils/memoryVault'
import {
  clearMaintenanceQueue,
  loadMaintenanceQueue,
  markMaintenanceTaskDone,
  upsertMaintenanceTask,
  type MaintenanceTask,
} from '../../utils/maintenanceQueue'
import { API_BASE_URL } from '../../config/api'
import { loadEntriesFromLocalStorage } from '../../utils/terminalHistory'
import {
  deleteSessionAsync,
  generateSessionName,
  loadSessionAsync,
  saveSessionAsync,
  saveSessionSilent,
} from '../../utils/terminalSessionApi'
import { handleSessionCommand } from '../../utils/terminalSessionCommands'
import { handleWebCommand } from '../../utils/terminalWebCommands'
import { handleModelCommand } from '../../utils/terminalModelCommands'
import { handleModelBootstrapCommand } from '../../utils/terminalModelBootstrapCommand'
import { handleImageModelCommand } from '../../utils/terminalImageModelCommands'
import { handlePullCommand } from '../../utils/terminalPullCommand'
import { handleImageCommand } from '../../utils/terminalImageCommands'
import { parseSlashCommand } from '../../utils/commandParser'
import { handleCircuitCommand } from '../../utils/terminalCircuitCommands'
import { handleSimpleCommand } from '../../utils/terminalSimpleCommands'
import {
  fetchCodeContextStatus,
  indexCodeContextFolder,
  type CodeContextIndexOptions,
} from '../../utils/codeContextApi'
import { DOWNLOAD_TELEMETRY_EVENT, type DownloadTelemetryDetail } from '../../utils/downloadTelemetry'
import { showErrorToast, showInfoToast, showSuccessToast, sendDesktopNotification } from '../../utils/uiNotifications'

const BACKEND_URL = API_BASE_URL
const STORAGE_KEY = 'loom-terminal-history'
const MAX_STORED_ENTRIES = 500
const PANEL_COLLAPSED_KEY = 'loom-session-panel-collapsed'
const API_BASE = API_BASE_URL
const CODE_CONTEXT_STATUS_POLL_MS = 30000
const SESSION_SIDEBAR_REFRESH_THROTTLE_MS = 30000
const HISTORY_FILTERS_KEY = 'loom-terminal-history-filters-v1'
const VIRTUAL_ROW_ESTIMATE_PX = 110
const VIRTUAL_OVERSCAN_ROWS = 18
const AUTO_FOLLOW_BOTTOM_THRESHOLD_PX = 96
const CONNECTION_NOTICE_COOLDOWN_MS = 120000
const STREAM_SIGNAL_NORMALIZER_CPS = 180
const TELEMETRY_RAIL_MAX_LINES = 42
const IDLE_MATRIX_CHARSET = '01ABCDEF[]{}<>/\\|*+-._:;'.split('')
const TERMINAL_SNIPPETS_KEY = 'loom-terminal-snippets-v1'
const TERMINAL_PINS_KEY = 'loom-terminal-pins-v1'
const CIRCUIT_IMPORT_EVENT = 'loom:circuit-import'
const AGENT_FEEDBACK_KEY = 'loom-agent-feedback-v1'
const SESSION_MISSION_KEY = 'loom-session-mission-v1'
const QDC_CONTEXT_KEY = 'loom-qdc-context-v1'
const WATCHDOG_INTERVAL_MS = 45000

const CHAT_MODEL_EXCLUDE_KEYWORDS = ['flux', 'flux2', 'stable-diffusion', 'sdxl', 'llava', 'bakllava', 'moondream', 'vision']
const QUICK_MODEL_PRIORITY_HINTS = [
  'gemini:gemini-2.0-flash',
  'gemini:gemini-2.5-flash',
  'openai:gpt-4.1-nano',
  'openai:gpt-4o-mini',
  'anthropic:claude-3-5-haiku',
  'mistral:mistral-small',
  'deepseek:deepseek-chat',
]
const QUICK_MODEL_FALLBACK_HINTS = ['flash', 'nano', 'mini', 'haiku', 'small']
const QUICK_LOCAL_HINTS = ['tiny', ':1b', ':2b', ':3b', 'phi3:mini', 'gemma:2b']
const CONTEXT_FOLLOWUP_HINTS = [
  'as we discussed',
  'as discussed',
  'as mentioned',
  'like before',
  'continue',
  'follow up',
  'follow-up',
  'that one',
  'the same',
]
const CONTEXT_FOLLOWUP_STARTS = ['and ', 'also ', 'what about', 'how about', 'can we', 'now ']
const ASSIST_CONFIRM_YES = new Set(['yes', 'y', 'ok', 'okay', 'do it', 'run it', 'go', 'sure'])
const ASSIST_CONFIRM_NO = new Set(['no', 'n', 'cancel', 'stop', 'nevermind', 'never mind'])
const ASSIST_CONFIRM_EDIT_PREFIXES = ['edit:', 'change:', 'update:']

const CONVERSATION_STARTERS: Array<{
  id: string
  title: string
  capability: string
  prompt: string
}> = [
    {
      id: 'founder-mode',
      title: 'Build My Next Product',
      capability: 'Strategy + execution',
      prompt: 'Act like my technical cofounder. Ask 3 high-signal questions, then build a 30-day product plan with milestones, risks, and what to do first this week.',
    },
    {
      id: 'debug-mode',
      title: 'Debug Something Fast',
      capability: 'Engineering triage',
      prompt: 'Help me debug a tricky issue quickly. Start by asking for symptoms, expected behavior, and environment, then produce a ranked root-cause checklist and first 3 tests to run.',
    },
    {
      id: 'repo-audit',
      title: 'Audit This Codebase',
      capability: 'Code quality + architecture',
      prompt: 'Run a practical codebase audit mindset: identify likely reliability risks, maintainability problems, and missing tests. Give me a prioritized fix plan.',
    },
    {
      id: 'research-brief',
      title: 'Research Anything',
      capability: 'Structured research',
      prompt: 'I need a research brief on a topic. Ask me the topic and desired depth, then produce a clear brief with key findings, open questions, and an action summary.',
    },
    {
      id: 'automation-flow',
      title: 'Automate a Workflow',
      capability: 'Systems + automation',
      prompt: 'Help me automate a repetitive workflow end-to-end. Ask what I do manually now, then propose a robust automation design with fallback steps and monitoring.',
    },
    {
      id: 'image-creative',
      title: 'Create Visual Concepts',
      capability: 'Image ideation',
      prompt: 'I want to create visuals. Help me turn my idea into 5 strong image concepts with generation-ready prompts, style directions, and a recommendation for the first one to try.',
    },
    {
      id: 'music-creative',
      title: 'Compose a Track',
      capability: 'Music ideation',
      prompt: 'Help me create an original music track concept. Build mood, genre, tempo, lyrics hook, and a production prompt I can use right away.',
    },
    {
      id: 'learning-coach',
      title: 'Teach Me a Skill',
      capability: 'Adaptive tutoring',
      prompt: 'Teach me a skill efficiently. Start by checking my current level, then create a progressive learning path with exercises, checkpoints, and a mini-project.',
    },
    {
      id: 'decision-support',
      title: 'Make a Tough Decision',
      capability: 'Decision framework',
      prompt: 'Help me make a hard decision. Build a weighted decision matrix, highlight blind spots, and recommend a choice with confidence and tradeoffs.',
    },
    {
      id: 'career-ops',
      title: 'Career Power Move',
      capability: 'Career strategy',
      prompt: 'Help me plan my next career move. Ask about goals and constraints, then give me a concrete 4-week plan with networking, portfolio, and outreach actions.',
    },
    {
      id: 'business-ops',
      title: 'Grow My Business',
      capability: 'Business operations',
      prompt: 'Act as an operator. Build a growth plan for my business with acquisition ideas, conversion improvements, retention tactics, and weekly KPIs to track.',
    },
    {
      id: 'life-planning',
      title: 'Design My Week',
      capability: 'Personal planning',
      prompt: 'Help me design a focused week. Ask for priorities and constraints, then create a realistic schedule with deep work blocks, recovery time, and success criteria.',
    },
  ]

type AgentFeedbackKind = 'verbose' | 'vague' | 'robotic' | 'perfect'

interface AgentFeedbackProfile {
  verbose: number
  vague: number
  robotic: number
  perfect: number
  updatedAt: number
}

interface SessionMission {
  objective: string
  nextAction: string
  blocker: string
  progress: string
  updatedAt: number
}

// State for collecting circuit inputs
interface CircuitInputState {
  circuitName: string
  requiredInputs: string[]
  collectedInputs: Record<string, string>
  currentInputIndex: number
}

type AssistantActionType = 'image' | 'music' | 'speech' | 'quick_cloud' | 'qdc_job'

interface PendingAssistantAction {
  type: AssistantActionType
  prompt: string
  note: string
}

type CommandLifecycleState = 'working' | 'done' | 'failed'

const COMMAND_STATUS_METADATA_KIND = 'command_status'
type HistoryWindow = 'all' | '15m' | '1h' | '24h' | '7d'
const HISTORY_WINDOW_OPTIONS: Array<{ value: HistoryWindow; label: string; ms?: number }> = [
  { value: 'all', label: 'All time' },
  { value: '15m', label: 'Last 15m', ms: 15 * 60 * 1000 },
  { value: '1h', label: 'Last 1h', ms: 60 * 60 * 1000 },
  { value: '24h', label: 'Last 24h', ms: 24 * 60 * 60 * 1000 },
  { value: '7d', label: 'Last 7d', ms: 7 * 24 * 60 * 60 * 1000 },
]
const FILTERABLE_ENTRY_TYPES: LogEntry['type'][] = ['user', 'ai', 'system', 'error', 'image', 'audio']

interface PersistedHistoryFilters {
  query?: string
  window?: HistoryWindow
  types?: LogEntry['type'][]
  models?: string[]
  open?: boolean
}

function loadPersistedHistoryFilters(): PersistedHistoryFilters {
  try {
    const raw = localStorage.getItem(HISTORY_FILTERS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as PersistedHistoryFilters
    return parsed || {}
  } catch {
    return {}
  }
}

interface StoredMessageSnippet {
  id: string
  entryId: string
  createdAt: number
  model?: string
  kind: 'note' | 'pin'
  text: string
  markdown: string
}

function appendSnippetToStorage(
  storageKey: string,
  snippet: StoredMessageSnippet,
  maxItems = 120,
) {
  try {
    const raw = localStorage.getItem(storageKey)
    const existing = raw ? JSON.parse(raw) as StoredMessageSnippet[] : []
    const next = [snippet, ...existing.filter(item => item.id !== snippet.id)].slice(0, maxItems)
    localStorage.setItem(storageKey, JSON.stringify(next))
  } catch {
    // Ignore storage failures for optional UX actions.
  }
}

function buildMessageMarkdown(
  entry: LogEntry,
  timestampLabel: string,
  modelName?: string,
): string {
  const title = `## ${entry.type.toUpperCase()} • ${timestampLabel}`
  const model = modelName ? `\nModel: ${modelName}` : ''
  const body = (entry.content || '').trim()
  return `${title}${model}\n\n${body}`
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.setTimeout(() => URL.revokeObjectURL(url), 400)
}

function isLikelyChatModel(modelName: string): boolean {
  const lower = modelName.toLowerCase()
  return !CHAT_MODEL_EXCLUDE_KEYWORDS.some(keyword => lower.includes(keyword))
}

function shouldAutoUseKeyContext(prompt: string, entries: LogEntry[]): boolean {
  const trimmed = prompt.trim()
  if (!trimmed) return false

  const hasHistory = entries.some(entry => entry.type === 'user' || entry.type === 'ai')
  if (!hasHistory) return false

  const lower = trimmed.toLowerCase()
  const wordCount = trimmed.split(/\s+/).filter(Boolean).length

  if (CONTEXT_FOLLOWUP_HINTS.some(hint => lower.includes(hint))) {
    return true
  }
  if (CONTEXT_FOLLOWUP_STARTS.some(prefix => lower.startsWith(prefix))) {
    return true
  }
  if (wordCount <= 18 && /\b(it|that|this|those|these|same|again|earlier|above)\b/i.test(trimmed)) {
    return true
  }
  return false
}

function pickQuickModel(
  cloudModels: CloudModelInfo[],
  localModels: string[],
  activeModel?: string,
): { model: string; reason: string } {
  const cloudCandidates = cloudModels
    .filter(model => model.provider_type === 'cloud' && !!model.id && model.supports_quick !== false)
    .map(model => model.id)

  if (cloudCandidates.length > 0) {
    const freeCandidates = cloudModels
      .filter(model => model.provider_type === 'cloud' && model.supports_quick !== false && model.is_free && !!model.id)
      .map(model => model.id)
    if (freeCandidates.length > 0) {
      return { model: freeCandidates[0], reason: 'free-tier cloud preference' }
    }

    const byLower = new Map(cloudCandidates.map(model => [model.toLowerCase(), model]))

    for (const hint of QUICK_MODEL_PRIORITY_HINTS) {
      const exact = byLower.get(hint)
      if (exact) {
        return { model: exact, reason: 'free-tier cloud preference' }
      }
      const prefix = cloudCandidates.find(model => model.toLowerCase().startsWith(`${hint}-`))
      if (prefix) {
        return { model: prefix, reason: 'free-tier cloud preference' }
      }
    }

    const hinted = cloudCandidates.find(model => QUICK_MODEL_FALLBACK_HINTS.some(hint => model.toLowerCase().includes(hint)))
    if (hinted) {
      return { model: hinted, reason: 'low-cost cloud fallback' }
    }

    return { model: cloudCandidates[0], reason: 'connected cloud fallback' }
  }

  const chatModels = localModels.filter(isLikelyChatModel)
  const tinyLocal = chatModels.find(model => QUICK_LOCAL_HINTS.some(hint => model.toLowerCase().includes(hint)))
  if (tinyLocal) {
    return { model: tinyLocal, reason: 'tiny local fallback' }
  }

  if (activeModel && isLikelyChatModel(activeModel)) {
    return { model: activeModel, reason: 'active local model' }
  }

  return { model: chatModels[0] || localModels[0] || 'llama3.1:8b', reason: 'default local fallback' }
}

function extractPromptFromActionRequest(input: string): string {
  return input
    .replace(/^(can you|could you|please|help me)\s+/i, '')
    .replace(/^(make|create|generate|write|do)\s+/i, '')
    .replace(/\?+$/g, '')
    .trim()
}

function detectAssistantAction(input: string): PendingAssistantAction | null {
  const message = input.trim()
  if (!message) return null

  const imageIntent = /\b(image|picture|photo|logo|poster|illustration|artwork|render|draw)\b/i.test(message)
    && /\b(make|create|generate|design|draw|render)\b/i.test(message)
  if (imageIntent) {
    return {
      type: 'image',
      prompt: extractPromptFromActionRequest(message),
      note: 'I can create this as an image generation node.',
    }
  }

  const musicIntent = /\b(song|music|beat|track|melody|instrumental)\b/i.test(message)
    && /\b(make|create|generate|compose|write)\b/i.test(message)
  if (musicIntent) {
    return {
      type: 'music',
      prompt: extractPromptFromActionRequest(message),
      note: 'I can run this as a music generation node.',
    }
  }

  const speechIntent = /\b(read this|speak this|say this|voice mode|text to speech|tts|read aloud)\b/i.test(message)
  if (speechIntent) {
    return {
      type: 'speech',
      prompt: message,
      note: 'I can open speech mode and read responses out loud.',
    }
  }

  const quickCloudIntent = /\b(quick|fast|cheap|free)\b/i.test(message) && /\b(cloud|online|remote)\b/i.test(message)
  const qdcIntent = /\b(qdc|qualcomm)\b/i.test(message) || (
    /\b(remote|cloud|device)\b/i.test(message) && /\b(job|run|offload)\b/i.test(message)
  )
  if (qdcIntent) {
    return {
      type: 'qdc_job',
      prompt: extractPromptFromActionRequest(message),
      note: 'I can launch this as an async QDC remote job and stream progress.',
    }
  }

  if (quickCloudIntent) {
    return {
      type: 'quick_cloud',
      prompt: extractPromptFromActionRequest(message),
      note: 'I can run this through the quick cloud lane.',
    }
  }

  return null
}

function buildCommandStatusContent(commandText: string, state: CommandLifecycleState, detail?: string): string {
  const marker = state === 'working' ? '[WORKING]' : state === 'done' ? '[DONE]' : '[FAILED]'
  if (!detail) {
    return `${marker} ${commandText}`
  }
  return `${marker} ${commandText}\n${detail}`
}

function loadAgentFeedbackProfile(): AgentFeedbackProfile {
  try {
    const raw = localStorage.getItem(AGENT_FEEDBACK_KEY)
    if (!raw) {
      return { verbose: 0, vague: 0, robotic: 0, perfect: 0, updatedAt: 0 }
    }
    const parsed = JSON.parse(raw) as Partial<AgentFeedbackProfile>
    return {
      verbose: Number(parsed.verbose || 0),
      vague: Number(parsed.vague || 0),
      robotic: Number(parsed.robotic || 0),
      perfect: Number(parsed.perfect || 0),
      updatedAt: Number(parsed.updatedAt || 0),
    }
  } catch {
    return { verbose: 0, vague: 0, robotic: 0, perfect: 0, updatedAt: 0 }
  }
}

function saveAgentFeedbackProfile(profile: AgentFeedbackProfile) {
  localStorage.setItem(AGENT_FEEDBACK_KEY, JSON.stringify(profile))
}

function feedbackToBias(profile: AgentFeedbackProfile) {
  const total = Math.max(1, profile.verbose + profile.vague + profile.robotic + profile.perfect)
  const verboseRatio = profile.verbose / total
  const vagueRatio = profile.vague / total
  const roboticRatio = profile.robotic / total
  const perfectRatio = profile.perfect / total
  return {
    conciseBias: Math.max(-1, Math.min(1, (verboseRatio * 1.4) - (perfectRatio * 0.3))),
    clarityBias: Math.max(-1, Math.min(1, (vagueRatio * 1.5) - (perfectRatio * 0.25))),
    warmthBias: Math.max(-1, Math.min(1, (roboticRatio * 1.4) - (perfectRatio * 0.2))),
    directnessBias: Math.max(-1, Math.min(1, ((vagueRatio + verboseRatio) * 0.7) - (perfectRatio * 0.15))),
  }
}

function loadMissionMap(): Record<string, SessionMission> {
  try {
    const raw = localStorage.getItem(SESSION_MISSION_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, SessionMission>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveMissionMap(map: Record<string, SessionMission>) {
  localStorage.setItem(SESSION_MISSION_KEY, JSON.stringify(map))
}

function emitCrtBurst(kind: string, strength = 1, durationMs = 170) {
  window.dispatchEvent(new CustomEvent('loom:crt-burst', {
    detail: { kind, strength, durationMs },
  }))
}

function sanitizeTelemetryToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9:._/-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 26)
}

function randomGlyphLine(minLen = 4, maxLen = 9): string {
  const targetLength = minLen + Math.floor(Math.random() * (maxLen - minLen + 1))
  let out = ''
  for (let i = 0; i < targetLength; i += 1) {
    out += IDLE_MATRIX_CHARSET[Math.floor(Math.random() * IDLE_MATRIX_CHARSET.length)]
  }
  return out
}

function buildTelemetryRailLine(
  tokens: string[],
  deltaTokens: string[],
  mode: 'idle' | 'active',
): { text: string; isToken: boolean; isDelta: boolean; isTransfer: boolean } {
  const safeTokens = tokens.length > 0 ? tokens : ['SOCKET:DOWN', 'MODEL:NONE', 'PHASE:IDLE']
  const safeDeltaTokens = deltaTokens.filter(Boolean)
  const tokenChance = mode === 'active' ? 0.95 : 0.88
  const useToken = Math.random() < tokenChance
  if (!useToken) {
    return { text: randomGlyphLine(3, 7), isToken: false, isDelta: false, isTransfer: false }
  }

  const useDeltaToken = safeDeltaTokens.length > 0 && Math.random() < (mode === 'active' ? 0.7 : 0.52)
  const pool = useDeltaToken ? safeDeltaTokens : safeTokens
  const token = pool[Math.floor(Math.random() * pool.length)]
  const noisyPrefix = randomGlyphLine(1, 2)
  const noisySuffix = randomGlyphLine(1, 2)
  const isTransferToken = token.includes('PULL:') || token.includes('PULLST:') || token.includes('PULLPCT:') || token.includes('D_PULL')
  return {
    text: useDeltaToken ? `${noisyPrefix} ${token}` : `${noisyPrefix} ${token} ${noisySuffix}`,
    isToken: true,
    isDelta: useDeltaToken,
    isTransfer: isTransferToken,
  }
}

type FeedDisplayItem =
  { key: string; entry: LogEntry }

export function TerminalFeed() {
  const { connected, sendChat, pullModel } = useSocket()
  const { status, models, cloudModels, fetchModels, setActiveModel, setVisionModel, setImageGenModel } = useSystemStatus()
  const { runCircuit, getRequiredInputs } = useCircuitRunner()
  const circuitExecution = useCircuitExecution()

  const [entries, setEntries] = useState<LogEntry[]>(() => loadEntriesFromLocalStorage(STORAGE_KEY))
  const [panelCollapsed, setPanelCollapsed] = useState(() => {
    try {
      return localStorage.getItem(PANEL_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [newSessionConfirmOpen, setNewSessionConfirmOpen] = useState(false)
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<string | null>(null)
  const [circuitInputState, setCircuitInputState] = useState<CircuitInputState | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{
    model: string
    status: string
    completed: number
    total: number
    percent?: number
    message?: string
    error?: string
    speedBps?: number
    etaSeconds?: number
    fileName?: string
    filesCompleted?: number
    filesTotal?: number
  } | null>(null)
  const [ambientDownloadProgress, setAmbientDownloadProgress] = useState<{
    model: string
    status: string
    completed: number
    total: number
    percent?: number
    message?: string
    error?: string
    scope: string
    speedBps?: number
    etaSeconds?: number
    fileName?: string
    filesCompleted?: number
    filesTotal?: number
  } | null>(null)
  const [imageAnalysis, setImageAnalysis] = useState<{
    imageUrl: string
    analysis: string
    model: string
    status: 'analyzing' | 'success' | 'error' | 'no-model'
    error?: string
    availableVisionModels?: string[]
    recommendedModels?: Array<{ name: string; description: string; size: string }>
  } | null>(null)
  const [imageGeneration, setImageGeneration] = useState<{
    prompt: string
    imageUrl?: string
    model: string
    status: 'generating' | 'success' | 'error' | 'no-model' | 'empty'
    error?: string
    progress?: number
    message?: string
    availableModels?: string[]
    recommendedModels?: Array<{ name: string; description: string; size: string }>
  } | null>(null)
  const [selectedImageModal, setSelectedImageModal] = useState<{
    imageUrl: string
    metadata: {
      prompt?: string
      model?: string
      timestamp?: number
      provider?: string
      analysis?: string
    }
    canEdit?: boolean
  } | null>(null)
  const [codeContextPanelOpen, setCodeContextPanelOpen] = useState(false)
  const [codeContextActive, setCodeContextActive] = useState(false)
  const [codeContextFolder, setCodeContextFolder] = useState<string | null>(null)
  const [codeContextFilesIndexed, setCodeContextFilesIndexed] = useState(0)
  const [codeContextIndexing, setCodeContextIndexing] = useState(false)
  const [showProviderSetup, setShowProviderSetup] = useState(false)
  const [historyFiltersOpen, setHistoryFiltersOpen] = useState(() => loadPersistedHistoryFilters().open ?? false)
  const [historyQuery, setHistoryQuery] = useState(() => loadPersistedHistoryFilters().query ?? '')
  const [historyWindow, setHistoryWindow] = useState<HistoryWindow>(() => loadPersistedHistoryFilters().window ?? 'all')
  const [historyTypeFilters, setHistoryTypeFilters] = useState<LogEntry['type'][]>(() => loadPersistedHistoryFilters().types ?? [])
  const [historyModelFilters, setHistoryModelFilters] = useState<string[]>(() => loadPersistedHistoryFilters().models ?? [])
  const [feedScrollTop, setFeedScrollTop] = useState(0)
  const [feedViewportHeight, setFeedViewportHeight] = useState(0)
  const [autoFollowFeed, setAutoFollowFeed] = useState(true)
  const [telemetryDeltaTokens, setTelemetryDeltaTokens] = useState<string[]>([])
  const [musicSetupPanelOpen, setMusicSetupPanelOpen] = useState(false)
  const [musicGeneration, setMusicGeneration] = useState<{
    prompt: string
    lyrics?: string
    audioUrl?: string
    duration: number
    status: 'empty' | 'generating' | 'success' | 'error'
    error?: string
    progress?: number
    message?: string
    seed?: number
  } | null>(null)
  const circuitNames = useMemo(() => getCircuitNames(), [panelCollapsed])
  const [pendingAssistantAction, setPendingAssistantAction] = useState<PendingAssistantAction | null>(null)
  const [_maintenanceQueue, setMaintenanceQueue] = useState<MaintenanceTask[]>(() => loadMaintenanceQueue())
  const [agentFeedbackProfile, setAgentFeedbackProfile] = useState<AgentFeedbackProfile>(loadAgentFeedbackProfile)
  const [aiRuntimeTelemetry, setAiRuntimeTelemetry] = useState({
    active: false,
    phase: 'Idle',
    signal: 0,
    charsPerSec: 0,
  })
  const aiStreamStatsRef = useRef({
    lastChunkAt: 0,
    charsPerSec: 0,
  })
  const activeQdcPollersRef = useRef<Set<string>>(new Set())
  const lastTelemetryPhaseRef = useRef<string>('')
  const lastTelemetryRateBucketRef = useRef<string>('')
  const lastTelemetryModelRef = useRef<string>('')
  const lastTelemetryRouteRef = useRef<string>('')

  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false)
  const [voiceChatModalOpen, setVoiceChatModalOpen] = useState(false)
  const [selectedAiEntryId, setSelectedAiEntryId] = useState<string | null>(null)
  const [lastUserSaid, setLastUserSaid] = useState('')
  const [lastAiSaid, setLastAiSaid] = useState('')
  const [voiceChatWaitingForAi, setVoiceChatWaitingForAi] = useState(false)
  const speakNextAiResponseRef = useRef(false)
  const voiceChatContentRef = useRef('')
  const voiceChatRecordingRef = useRef(false)
  const handleAIRequestRef = useRef<((prompt: string, timestamp: number, contextMode: 'input' | 'key' | 'full', modelOverride?: string) => void) | null>(null)

  const [avatarConfig, setAvatarConfig] = useState(() => {
    try {
      const saved = localStorage.getItem('loom-avatar-config')
      if (saved) return getAvatarConfig(saved)
    } catch { }
    return getAvatarConfig(DEFAULT_AVATAR_ID)
  })

  const { speak: speakTTS, stop: stopTTS, isSpeaking: isSpeakingBrowser, voices, selectedVoice, setSelectedVoice, rate, setRate, pitch, setPitch, volume, setVolume } = useSpeechSynthesis({})

  const [ttsModelType, setTTSModelType] = useState<TTSModelType>(() => {
    try {
      const v = localStorage.getItem('loom-tts-model-type')
      if (v === 'browser' || v === 'orpheus') return v
    } catch { }
    return DEFAULT_TTS_MODEL_TYPE
  })
  const [orpheusParams, setOrpheusParams] = useState<OrpheusTTSParams>(() => {
    try {
      const v = localStorage.getItem('loom-tts-orpheus-params')
      if (v) {
        const p = JSON.parse(v) as Partial<OrpheusTTSParams>
        return {
          voice: p.voice ?? DEFAULT_ORPHEUS_PARAMS.voice,
          temperature: Math.min(2, Math.max(0, p.temperature ?? DEFAULT_ORPHEUS_PARAMS.temperature)),
          repetitionPenalty: Math.min(2, Math.max(1, p.repetitionPenalty ?? DEFAULT_ORPHEUS_PARAMS.repetitionPenalty)),
          readingStyle: p.readingStyle ?? DEFAULT_ORPHEUS_PARAMS.readingStyle,
          soundPreset: p.soundPreset ?? DEFAULT_ORPHEUS_PARAMS.soundPreset,
          endpointOverride: p.endpointOverride,
        }
      }
    } catch { }
    return { ...DEFAULT_ORPHEUS_PARAMS }
  })

  const { speak: speakOrpheus, stop: stopOrpheus, isSpeaking: isSpeakingOrpheus, generate: generateOrpheus, playBlob: playOrpheusBlob, isGenerating: isOrpheusGenerating } = useOrpheusTTS(orpheusParams, { backendUrl: BACKEND_URL })

  const isSpeaking = ttsModelType === 'browser' ? isSpeakingBrowser : isSpeakingOrpheus
  const speakTTSUnified = useCallback((text: string) => {
    if (ttsModelType === 'browser') speakTTS(text)
    else speakOrpheus(text)
  }, [ttsModelType, speakTTS, speakOrpheus])
  const stopTTSUnified = useCallback(() => {
    if (ttsModelType === 'browser') stopTTS()
    else stopOrpheus()
  }, [ttsModelType, stopTTS, stopOrpheus])

  const [autoGenerateAudio, setAutoGenerateAudio] = useState(() => {
    try {
      const v = localStorage.getItem('loom-auto-generate-audio')
      return v === 'true'
    } catch { }
    return false
  })
  const [audioCacheByEntryId, setAudioCacheByEntryId] = useState<Record<string, Blob>>({})
  const [generatingEntryId, setGeneratingEntryId] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('loom-auto-generate-audio', String(autoGenerateAudio))
    } catch { }
  }, [autoGenerateAudio])

  /** Persist TTS blob to backend data/tts folder (long-term). Fire-and-forget. */
  const saveTTSBlobToBackend = useCallback((entryId: string, blob: Blob) => {
    const form = new FormData()
    form.append('entry_id', entryId)
    form.append('file', blob, 'audio.wav')
    fetch(`${BACKEND_URL}/api/tts/files`, { method: 'POST', body: form }).catch(() => { })
  }, [])

  /** When selected entry has no in-memory cache, try to load from backend data/tts (long-term). */
  useEffect(() => {
    if (ttsModelType !== 'orpheus' || !selectedAiEntryId || audioCacheByEntryId[selectedAiEntryId]) return
    let cancelled = false
    fetch(`${BACKEND_URL}/api/tts/files/${encodeURIComponent(selectedAiEntryId)}`)
      .then(res => {
        if (!res.ok || cancelled) return null
        return res.blob()
      })
      .then(blob => {
        if (blob && !cancelled) setAudioCacheByEntryId(prev => ({ ...prev, [selectedAiEntryId]: blob }))
      })
      .catch(() => { })
    return () => { cancelled = true }
  }, [ttsModelType, selectedAiEntryId, audioCacheByEntryId])

  const {
    startRecording,
    stopRecording,
    isRecording: isMicRecording,
    stream: micStream,
  } = useMicrophoneRecorder({
    onTranscript: (text) => {
      if (!text.trim()) return
      if (voiceChatRecordingRef.current) {
        voiceChatRecordingRef.current = false
        setLastUserSaid(text)
        speakNextAiResponseRef.current = true
        voiceChatContentRef.current = ''
        setVoiceChatWaitingForAi(true)
        handleAIRequestRef.current?.(text, Date.now(), 'full')
      } else if (commandInputEditorRef.current) {
        commandInputEditorRef.current.commands.setContent(text)
        commandInputEditorRef.current.commands.focus('end')
      }
    },
    backendUrl: BACKEND_URL,
  })
  const audioAnalyzer = useAudioAnalyzer(micStream, !!micStream)

  const [syntheticAudio, setSyntheticAudio] = useState({ amp: 0, bass: 0, mids: 0, highs: 0 })
  useEffect(() => {
    if (!isSpeaking || micStream) {
      setSyntheticAudio({ amp: 0, bass: 0, mids: 0, highs: 0 })
      return
    }
    let raf = 0
    const start = Date.now()
    const tick = () => {
      const elapsed = Date.now() - start
      const period = Math.max(150, 400 / Math.max(0.5, rate))
      const t = elapsed / period

      // Main amplitude with varied frequencies to simulate speech cadence
      const amp = 0.4 + 0.35 * Math.sin(t) + 0.15 * Math.sin(t * 2.7) + 0.1 * Math.sin(t * 0.4)

      // Bass pulses slower (like syllables)
      const bass = 0.3 + 0.4 * Math.abs(Math.sin(t * 0.7)) + 0.2 * Math.sin(t * 1.3)

      // Mids follow amplitude more closely
      const mids = amp * 0.8 + 0.1 * Math.sin(t * 3.1)

      // Highs are more erratic (consonants)
      const highs = 0.2 + 0.3 * Math.abs(Math.sin(t * 4.2)) + 0.15 * Math.random()

      setSyntheticAudio({
        amp: Math.max(0, Math.min(1, amp)),
        bass: Math.max(0, Math.min(1, bass)),
        mids: Math.max(0, Math.min(1, mids)),
        highs: Math.max(0, Math.min(1, highs)),
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isSpeaking, micStream, rate])

  const avatarAudio = micStream
    ? audioAnalyzer
    : {
      amplitude: syntheticAudio.amp,
      bass: syntheticAudio.bass,
      mids: syntheticAudio.mids,
      highs: syntheticAudio.highs,
      fftSize: 256,
    }

  const [audioSensitivityOverride, setAudioSensitivityOverride] = useState(() => {
    try {
      const v = localStorage.getItem('loom-avatar-sensitivity')
      if (v != null) {
        const n = Number(v)
        if (n >= 0.3 && n <= 2) return n
      }
    } catch { }
    return 1.0
  })

  const [soundVisualParams, setSoundVisualParams] = useState<AvatarSoundVisualParams>(() => {
    const clampV = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))
    try {
      const v = localStorage.getItem('loom-avatar-sound-visual')
      if (v) {
        const parsed = JSON.parse(v) as Partial<AvatarSoundVisualParams>
        return {
          energy: clampV(parsed.energy ?? 1, 0.3, 2),
          core: clampV(parsed.core ?? 1, 0.3, 2),
          warmth: clampV(parsed.warmth ?? 1, 0.3, 2),
          sparkle: clampV(parsed.sparkle ?? 1, 0.3, 2),
          settle: clampV(parsed.settle ?? 1, 0.5, 2),
        }
      }
    } catch { }
    return { ...DEFAULT_SOUND_VISUAL_PARAMS }
  })

  useEffect(() => {
    try {
      if (avatarConfig?.id) localStorage.setItem('loom-avatar-config', avatarConfig.id)
    } catch { }
  }, [avatarConfig?.id])

  useEffect(() => {
    try {
      localStorage.setItem('loom-avatar-sensitivity', String(audioSensitivityOverride))
    } catch { }
  }, [audioSensitivityOverride])

  useEffect(() => {
    try {
      localStorage.setItem('loom-avatar-sound-visual', JSON.stringify(soundVisualParams))
    } catch { }
  }, [soundVisualParams])

  useEffect(() => {
    try {
      localStorage.setItem('loom-tts-model-type', ttsModelType)
    } catch { }
  }, [ttsModelType])

  useEffect(() => {
    try {
      localStorage.setItem('loom-tts-orpheus-params', JSON.stringify(orpheusParams))
    } catch { }
  }, [orpheusParams])

  // Current session tracking - ChatGPT style
  const [currentSessionName, setCurrentSessionName] = useState<string | null>(() => {
    // Try to restore from localStorage
    try {
      return localStorage.getItem('loom-current-session') || null
    } catch {
      return null
    }
  })
  const [sessionMission, setSessionMission] = useState<SessionMission>(() => ({
    objective: '',
    nextAction: '',
    blocker: '',
    progress: '',
    updatedAt: 0,
  }))
  const lastSavedEntriesCountRef = useRef(0)
  const lastSessionRefreshEventMsRef = useRef(0)

  const feedRef = useRef<HTMLDivElement>(null)
  const currentAIEntryRef = useRef<string | null>(null)
  /** Accumulated content for the current AI stream (so handleStatus has full text for TTS) */
  const currentAIContentRef = useRef<string>('')
  const pendingImageUrlRef = useRef<string | null>(null)
  const commandInputEditorRef = useRef<Editor | null>(null)
  const lastDownloadToastKeyRef = useRef<string | null>(null)
  const ambientDownloadClearTimerRef = useRef<number | null>(null)
  const wasConnectedRef = useRef(false)
  const lastConnectedNoticeRef = useRef(0)
  const lastWatchdogEventRef = useRef<Record<string, number>>({})
  const initialBriefingDoneRef = useRef(false)

  useEffect(() => {
    saveAgentFeedbackProfile(agentFeedbackProfile)
  }, [agentFeedbackProfile])

  useEffect(() => {
    const map = loadMissionMap()
    const key = currentSessionName || '__current__'
    const mission = map[key]
    if (mission) {
      setSessionMission(mission)
      return
    }
    setSessionMission({ objective: '', nextAction: '', blocker: '', progress: '', updatedAt: 0 })
  }, [currentSessionName])

  const persistSessionMission = useCallback((next: SessionMission) => {
    setSessionMission(next)
    const map = loadMissionMap()
    const key = currentSessionName || '__current__'
    map[key] = next
    saveMissionMap(map)
  }, [currentSessionName])

  useEffect(() => {
    const settings = loadSettings()
    syncLegacyMemoryNotes(settings.memoryNotes || '')
  }, [])

  const isNearFeedBottom = useCallback((el: HTMLDivElement) => {
    const distanceFromBottom = el.scrollHeight - el.clientHeight - el.scrollTop
    return distanceFromBottom <= AUTO_FOLLOW_BOTTOM_THRESHOLD_PX
  }, [])

  const pushTelemetryDelta = useCallback((raw: string) => {
    const token = sanitizeTelemetryToken(raw)
    if (!token) return
    setTelemetryDeltaTokens(prev => {
      if (prev[0] === token) return prev
      const next = [token, ...prev.filter(item => item !== token)]
      return next.slice(0, 18)
    })
  }, [])

  useEffect(() => {
    const handleDownloadTelemetry = (event: Event) => {
      const custom = event as CustomEvent<DownloadTelemetryDetail>
      const detail = custom.detail
      if (!detail) return

      const nextProgress = {
        model: detail.model || 'unknown',
        status: detail.status || 'unknown',
        completed: detail.completed || 0,
        total: detail.total || 0,
        percent: detail.percent,
        message: detail.message,
        error: detail.error,
        scope: detail.scope,
        speedBps: detail.speedBps,
        etaSeconds: detail.etaSeconds,
        fileName: detail.fileName,
        filesCompleted: detail.filesCompleted,
        filesTotal: detail.filesTotal,
      }
      setAmbientDownloadProgress(nextProgress)

      const scopeToken = (detail.scope || 'unknown').toUpperCase()
      const statusToken = (detail.status || 'unknown').toUpperCase()
      pushTelemetryDelta(`D_PULL:${scopeToken}:${statusToken}`)
      if (detail.model) {
        pushTelemetryDelta(`D_PULLM:${detail.model}`)
      }
      if (typeof detail.percent === 'number') {
        pushTelemetryDelta(`D_PULLP:${Math.round(detail.percent)}`)
      }
      if (typeof detail.speedBps === 'number' && detail.speedBps > 0) {
        const speedMbps = (detail.speedBps / (1024 * 1024)).toFixed(1)
        pushTelemetryDelta(`D_PULLSPD:${speedMbps}MBPS`)
      }
      if (typeof detail.filesCompleted === 'number' && typeof detail.filesTotal === 'number' && detail.filesTotal > 0) {
        pushTelemetryDelta(`D_PULLF:${detail.filesCompleted}/${detail.filesTotal}`)
      }

      if (ambientDownloadClearTimerRef.current) {
        window.clearTimeout(ambientDownloadClearTimerRef.current)
        ambientDownloadClearTimerRef.current = null
      }
      if (detail.status === 'success' || detail.status === 'error') {
        ambientDownloadClearTimerRef.current = window.setTimeout(() => {
          setAmbientDownloadProgress(current => {
            if (!current || current.model !== nextProgress.model || current.scope !== nextProgress.scope) return current
            if (current.status !== detail.status) return current
            return null
          })
          ambientDownloadClearTimerRef.current = null
        }, 4200)
      }
    }

    window.addEventListener(DOWNLOAD_TELEMETRY_EVENT, handleDownloadTelemetry as EventListener)
    return () => {
      window.removeEventListener(DOWNLOAD_TELEMETRY_EVENT, handleDownloadTelemetry as EventListener)
      if (ambientDownloadClearTimerRef.current) {
        window.clearTimeout(ambientDownloadClearTimerRef.current)
        ambientDownloadClearTimerRef.current = null
      }
    }
  }, [pushTelemetryDelta])

  // Persist panel state
  useEffect(() => {
    try {
      localStorage.setItem(PANEL_COLLAPSED_KEY, String(panelCollapsed))
    } catch { }
  }, [panelCollapsed])

  useEffect(() => {
    if (!downloadProgress) return
    const key = `${downloadProgress.model}:${downloadProgress.status}`
    if (lastDownloadToastKeyRef.current === key) return

    if (downloadProgress.status === 'success') {
      showSuccessToast(`Model "${downloadProgress.model}" is ready.`, 'Model Download')
      lastDownloadToastKeyRef.current = key
      return
    }
    if (downloadProgress.status === 'error') {
      showErrorToast(`Failed to pull "${downloadProgress.model}".`, 'Model Download')
      lastDownloadToastKeyRef.current = key
    }
  }, [downloadProgress])

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_FILTERS_KEY, JSON.stringify({
        query: historyQuery,
        window: historyWindow,
        types: historyTypeFilters,
        models: historyModelFilters,
        open: historyFiltersOpen,
      } as PersistedHistoryFilters))
    } catch {
      // ignore storage failures
    }
  }, [historyFiltersOpen, historyModelFilters, historyQuery, historyTypeFilters, historyWindow])

  useEffect(() => {
    const feedEl = feedRef.current
    if (!feedEl) return

    const updateMetrics = () => {
      const nextViewportHeight = feedEl.clientHeight
      const nextScrollTop = feedEl.scrollTop
      setFeedViewportHeight(nextViewportHeight)
      setFeedScrollTop(nextScrollTop)
      setAutoFollowFeed(isNearFeedBottom(feedEl))
    }

    updateMetrics()

    const resizeObserver = new ResizeObserver(updateMetrics)
    resizeObserver.observe(feedEl)
    return () => resizeObserver.disconnect()
  }, [isNearFeedBottom])

  const handleFeedScroll = useCallback(() => {
    const feedEl = feedRef.current
    if (!feedEl) return

    const nextScrollTop = feedEl.scrollTop
    setFeedScrollTop(nextScrollTop)
    setAutoFollowFeed(isNearFeedBottom(feedEl))
  }, [isNearFeedBottom])

  useEffect(() => {
    if (!autoFollowFeed) return

    const feedEl = feedRef.current
    if (!feedEl) {
      return
    }

    requestAnimationFrame(() => {
      const latestFeed = feedRef.current
      if (!latestFeed) return
      latestFeed.scrollTop = latestFeed.scrollHeight
      setFeedScrollTop(latestFeed.scrollTop)
    })
  }, [entries, autoFollowFeed])

  // Persist entries to localStorage (debounced) - this is fast local backup
  useEffect(() => {
    const timeout = setTimeout(() => {
      try {
        // Only store last N entries to avoid quota issues
        const toStore = entries.slice(-MAX_STORED_ENTRIES)
        localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
      } catch (e) {
        // Quota errors are fine - backend is primary storage now
      }
    }, 500) // Debounce 500ms

    return () => clearTimeout(timeout)
  }, [entries])

  // ChatGPT-style seamless save to backend
  useEffect(() => {
    // Don't save empty/system-only sessions
    const hasUserContent = entries.some(e => e.type === 'user' || e.type === 'ai')
    if (!hasUserContent) return

    // Debounce save - triggers after 1.5s of inactivity
    const timeout = setTimeout(() => {
      // Auto-generate session name if we don't have one yet
      let sessionName = currentSessionName
      if (!sessionName) {
        sessionName = generateSessionName(entries)
        setCurrentSessionName(sessionName)
        // Persist current session name
        try {
          localStorage.setItem('loom-current-session', sessionName)
        } catch { }
      }

      // Save to backend silently
      saveSessionSilent(API_BASE, sessionName, entries, MAX_STORED_ENTRIES).then(success => {
        if (success) {
          lastSavedEntriesCountRef.current = entries.length
          const now = Date.now()
          const shouldRefreshSidebar =
            now - lastSessionRefreshEventMsRef.current >= SESSION_SIDEBAR_REFRESH_THROTTLE_MS
            || lastSessionRefreshEventMsRef.current === 0

          if (shouldRefreshSidebar) {
            lastSessionRefreshEventMsRef.current = now
            window.dispatchEvent(new CustomEvent('loom:session-saved', { detail: { name: sessionName, auto: true } }))
          }
        }
      })
    }, 1500) // 1.5s debounce

    return () => clearTimeout(timeout)
  }, [entries, currentSessionName])

  // Show connection status on change and fetch models when connected
  useEffect(() => {
    const timestamp = Date.now()
    if (connected) {
      const isRisingEdge = !wasConnectedRef.current
      const cooldownElapsed = timestamp - lastConnectedNoticeRef.current >= CONNECTION_NOTICE_COOLDOWN_MS

      if (isRisingEdge || cooldownElapsed) {
        setEntries(prev => {
          const last = prev[prev.length - 1]
          const duplicateConnectedNotice = !!last
            && last.type === 'system'
            && typeof last.content === 'string'
            && last.content.includes('[BACKEND CONNECTED]')
            && timestamp - last.timestamp < CONNECTION_NOTICE_COOLDOWN_MS

          if (duplicateConnectedNotice) return prev

          return [...prev, {
            id: `system-${timestamp}`,
            type: 'system',
            content: '[BACKEND CONNECTED] Ready for AI processing.',
            timestamp,
          }]
        })
        lastConnectedNoticeRef.current = timestamp
      }

      if (isRisingEdge) {
        // Fetch models when backend first reconnects (with retry)
        const fetchWithRetry = async (attempts = 3) => {
          for (let i = 0; i < attempts; i++) {
            const modelList = await fetchModels()
            if (modelList.length > 0) {
              return
            }
            if (i < attempts - 1) {
              await new Promise(resolve => setTimeout(resolve, 2000))
            }
          }
          return
        }
        void fetchWithRetry()
      }
    }
    wasConnectedRef.current = connected
  }, [connected, fetchModels])

  useEffect(() => {
    if (connected) return
    setAiRuntimeTelemetry({
      active: false,
      phase: 'Backend disconnected',
      signal: 0,
      charsPerSec: 0,
    })
  }, [connected])

  // Listen for output from Circuit notebook
  useEffect(() => {
    const unsubscribe = terminalOutputBus.subscribe((entry) => {
      setEntries(prev => [...prev, entry])
    })
    return unsubscribe
  }, [])

  const addSystemEntry = useCallback((content: string, timestamp: number) => {
    setEntries(prev => [...prev, {
      id: `system-${timestamp}-${Math.random()}`,
      type: 'system',
      content,
      timestamp,
    }])
  }, [])

  const addErrorEntry = useCallback((content: string, timestamp: number) => {
    setEntries(prev => [...prev, {
      id: `error-${timestamp}`,
      type: 'error',
      content,
      timestamp,
    }])
  }, [])

  const emitSessionRitualBriefing = useCallback((timestamp: number) => {
    setEntries(prev => [...prev, {
      id: `system-status-${timestamp}`,
      type: 'system',
      content: '', // Component handles display
      timestamp,
      metadata: { component: 'SystemStatusCard' },
    }])
  }, [])

  useEffect(() => {
    if (initialBriefingDoneRef.current) return
    const hasMeaningfulHistory = entries.some(entry => entry.type === 'user' || entry.type === 'ai')
    if (!hasMeaningfulHistory) return
    initialBriefingDoneRef.current = true
    emitSessionRitualBriefing(Date.now())
  }, [emitSessionRitualBriefing, entries])

  useEffect(() => {
    if (!aiRuntimeTelemetry.active) return
    const interval = window.setInterval(() => {
      setAiRuntimeTelemetry(prev => {
        if (!prev.active) return prev
        return {
          ...prev,
          signal: Math.max(0.12, prev.signal * 0.86),
          charsPerSec: prev.charsPerSec * 0.9,
        }
      })
    }, 220)
    return () => window.clearInterval(interval)
  }, [aiRuntimeTelemetry.active])

  useEffect(() => {
    if (aiRuntimeTelemetry.active) return
    const phase = (aiRuntimeTelemetry.phase || '').toLowerCase()
    if (!phase || phase === 'idle' || phase.includes('disconnected') || phase.includes('offline')) {
      return
    }

    const timeout = window.setTimeout(() => {
      setAiRuntimeTelemetry(prev => {
        if (prev.active) return prev
        return { ...prev, phase: 'Idle' }
      })
    }, 1600)

    return () => window.clearTimeout(timeout)
  }, [aiRuntimeTelemetry.active, aiRuntimeTelemetry.phase])

  const withFixHint = useCallback((content: string): string => {
    const lower = content.toLowerCase()
    const hints: string[] = []

    if (lower.includes('unknown command')) {
      hints.push('Try /help to see all available commands.')
    }
    if (lower.includes('not found') && lower.includes('model')) {
      hints.push('Try /models to list installed models.')
      hints.push('Try /pull llama3.1:8b to install a reliable default.')
    }
    if (lower.includes('backend not connected') || lower.includes('failed to fetch')) {
      hints.push('Start backend: `cd backend && python run.py`.')
    }
    if (lower.includes('session') && lower.includes('not found')) {
      hints.push('Try /sessions to list saved sessions.')
    }

    if (hints.length === 0) return content
    const dedupedHints = [...new Set(hints)]
    return `${content}\n\nTry:\n${dedupedHints.map(h => `- ${h}`).join('\n')}`
  }, [])

  // Check code-context status when relevant; avoid noisy constant polling.
  useEffect(() => {
    const checkCodeContextStatus = async () => {
      try {
        const data = await fetchCodeContextStatus(API_BASE)
        setCodeContextActive(data.active || false)
        setCodeContextFolder(data.folder_path || null)
        setCodeContextFilesIndexed(data.files_indexed || 0)
      } catch (e) {
        // Backend not available or endpoint doesn't exist, ignore silently
        return
      }
    }

    if (!connected) return

    checkCodeContextStatus()

    // Keep polling only while code context is active or panel is open.
    if (codeContextPanelOpen || codeContextActive) {
      const interval = setInterval(() => {
        if (document.visibilityState === 'visible') {
          checkCodeContextStatus()
        }
      }, CODE_CONTEXT_STATUS_POLL_MS)
      return () => clearInterval(interval)
    }
  }, [connected, codeContextPanelOpen, codeContextActive])

  // Listen for models_updated event & Orchestrator events
  useEffect(() => {
    const handleModelsUpdated = () => {
      fetchModels()
    }

    const handleOrchestratorEvent = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {}
      const type = typeof detail.type === 'string' ? detail.type : ''
      const circuit = typeof detail.circuit === 'string' ? detail.circuit : ''
      const model = typeof detail.model === 'string' ? detail.model : ''
      const previousModel = typeof detail.previous_model === 'string' ? detail.previous_model : ''
      const reason = typeof detail.reason === 'string' ? detail.reason : ''
      if (type === 'circuit_suggestion') {
        addSystemEntry(`🧠 Orchestrator Suggestion:\nI noticed you might want to run the "${circuit}" circuit.\nReason: ${reason}\n\nType /${circuit} to run it.`, Date.now())
      }
      if (type === 'model_switched' && model) {
        const fromLabel = previousModel || 'previous model'
        addSystemEntry(`🧠 Auto Model Switch:\n${fromLabel} → ${model}\nReason: ${reason}`, Date.now())
      }
    }

    const handleQdcJobEvent = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {}
      const jobId = typeof detail.job_id === 'string' ? detail.job_id : ''
      const statusValue = typeof detail.status === 'string' ? detail.status : ''
      const progress = typeof detail.progress === 'number' ? detail.progress : undefined
      const message = typeof detail.message === 'string' ? detail.message : ''
      if (!jobId) return

      const parts = [`📡 QDC ${jobId}`]
      if (statusValue) parts.push(statusValue)
      if (typeof progress === 'number') parts.push(`${progress}%`)
      if (message) parts.push(`- ${message}`)
      addSystemEntry(parts.join(' '), Date.now())
    }

    const handleAiMetaEvent = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {}
      const phase = typeof detail.phase === 'string' ? detail.phase : ''
      const entryId = currentAIEntryRef.current
      if (!entryId) return

      setEntries(prev => prev.map(entry => {
        if (entry.id !== entryId) return entry
        return {
          ...entry,
          metadata: {
            ...(entry.metadata || {}),
            route: detail.route,
            confidence: detail.confidence,
            responseContract: detail.response_contract,
            provenance: detail.provenance,
            refinedBy: detail.refinement_model || detail.refined_by,
            requiresClarification: detail.requires_clarification,
            phase: phase || entry.metadata?.phase,
          },
        }
      }))
    }

    window.addEventListener('loom:models_updated', handleModelsUpdated)
    window.addEventListener('orchestrator_event', handleOrchestratorEvent)
    window.addEventListener('qdc_job_event', handleQdcJobEvent)
    window.addEventListener('ai_meta', handleAiMetaEvent)
    getSocketInstance()

    return () => {
      window.removeEventListener('loom:models_updated', handleModelsUpdated)
      window.removeEventListener('orchestrator_event', handleOrchestratorEvent)
      window.removeEventListener('qdc_job_event', handleQdcJobEvent)
      window.removeEventListener('ai_meta', handleAiMetaEvent)
    }
  }, [fetchModels, addSystemEntry])

  useEffect(() => {
    const tick = () => {
      const now = Date.now()

      const registerWatchdog = (key: string, title: string, detail: string, severity: 'low' | 'medium' | 'high') => {
        const last = lastWatchdogEventRef.current[key] || 0
        if (now - last < 120000) return
        lastWatchdogEventRef.current[key] = now
        const task = upsertMaintenanceTask({ title, detail, severity, source: 'watchdog' })
        setMaintenanceQueue(loadMaintenanceQueue())
        addSystemEntry(`[WATCHDOG] ${title}\n${detail}\nTask: ${task.id}`, now)
      }

      if (!connected) {
        registerWatchdog(
          'backend-disconnected',
          'Backend connection unstable',
          'Socket disconnected. Verify backend process and reconnect health checks.',
          'high',
        )
      }

      if (typeof status.ramUsedPercent === 'number' && status.ramUsedPercent >= 92) {
        registerWatchdog(
          'ram-pressure',
          'High memory pressure',
          `RAM usage is ${Math.round(status.ramUsedPercent)}%. Consider unloading heavy models.`,
          'medium',
        )
      }

      const recentErrors = entries.slice(-30).filter(entry => entry.type === 'error').length
      if (recentErrors >= 3) {
        registerWatchdog(
          'error-spike',
          'Recent error spike',
          `${recentErrors} error entries in recent history. Run /eval for diagnostics.`,
          'medium',
        )
      }
    }

    tick()
    const interval = window.setInterval(tick, WATCHDOG_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [addSystemEntry, connected, entries, status.ramUsedPercent])

  // Handle folder indexing
  const handleIndexFolder = useCallback(async (folderPath: string, options?: CodeContextIndexOptions) => {
    setCodeContextIndexing(true)
    showInfoToast(`Indexing ${folderPath}...`, 'Code Context', 1800)
    try {
      // Check if backend is connected first
      if (!connected) {
        throw new Error('Backend not connected. Please wait for connection or restart the backend server.')
      }

      const data = await indexCodeContextFolder(API_BASE, folderPath, options)
      setCodeContextActive(true)
      setCodeContextFolder(data.folder_path || folderPath)
      setCodeContextFilesIndexed(data.files_indexed || 0)

      // Show success message
      addSystemEntry(`✓ Folder indexed: ${data.files_indexed || 0} files, ${data.chunks_created || 0} chunks created\n\nFolder context is now active. Code will be included in chat automatically.`, Date.now())
      showSuccessToast(`Indexed ${data.files_indexed || 0} files in ${folderPath}.`, 'Code Context')
    } catch (error) {
      let errorMessage = 'Unknown error'
      if (error instanceof Error) {
        errorMessage = error.message
        // Provide helpful context for common errors
        if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError') || errorMessage.includes('fetch') || errorMessage.includes('aborted')) {
          if (errorMessage.includes('aborted')) {
            errorMessage = `Request timed out (indexing took too long).\n\nTry indexing a smaller folder or check backend logs.\n\nOriginal error: ${errorMessage}`
          } else {
            errorMessage = `Backend connection failed.\n\nPossible causes:\n- Backend not running (start with: cd backend && python run.py)\n- CORS issue (check backend logs)\n- Network error\n\nOriginal error: ${errorMessage}`
          }
        } else if (errorMessage.includes('404')) {
          errorMessage = `API endpoint not found (404).\n\nThe code-context router may not be loaded.\nCheck backend logs for import errors.\n\nError: ${errorMessage}`
        } else if (errorMessage.includes('CORS')) {
          errorMessage = `CORS error.\n\nCheck backend CORS configuration in app/main.py\n\nError: ${errorMessage}`
        } else if (errorMessage.includes('Folder not found') || errorMessage.includes('Not a directory')) {
          errorMessage = `Path error: ${errorMessage}\n\nCheck that the folder path is correct and exists.`
        }
      }
      addErrorEntry(`Failed to index folder: ${errorMessage}`, Date.now())
      showErrorToast('Folder indexing failed. Check the terminal details for fixes.', 'Code Context')
    } finally {
      setCodeContextIndexing(false)
    }
  }, [addSystemEntry, addErrorEntry, connected])

  const handleAIRequest = useCallback((
    prompt: string,
    timestamp: number,
    contextMode: 'input' | 'key' | 'full' = 'input',
    modelOverride?: string,
  ) => {
    let effectiveContextMode: 'input' | 'key' | 'full' = contextMode
    if (contextMode === 'input' && shouldAutoUseKeyContext(prompt, entries)) {
      effectiveContextMode = 'key'
      addSystemEntry('[SMART CONTEXT] Follow-up detected, using key context.', timestamp)
    }

    const entryId = `ai-${timestamp}`
    currentAIEntryRef.current = entryId
    currentAIContentRef.current = ''
    aiStreamStatsRef.current = { lastChunkAt: 0, charsPerSec: 0 }
    setAiRuntimeTelemetry({
      active: true,
      phase: 'Dispatching request',
      signal: 0.22,
      charsPerSec: 0,
    })
    emitCrtBurst('ai-start', 0.85, 130)

    const getChatModel = (preferredModel?: string) => {
      if (preferredModel && isLikelyChatModel(preferredModel)) {
        return preferredModel
      }

      if (status.activeModel && isLikelyChatModel(status.activeModel)) {
        return status.activeModel
      }

      const chatModels = models.filter(isLikelyChatModel)
      const fallbackModel = chatModels[0] || models[0] || 'llama3.1:8b'
      if (!preferredModel && status.activeModel && fallbackModel !== status.activeModel && !isLikelyChatModel(status.activeModel)) {
        setActiveModel(fallbackModel)
      }
      return fallbackModel
    }

    const modelToUse = getChatModel(modelOverride)

    setEntries(prev => [...prev, {
      id: entryId,
      type: 'ai',
      content: '',
      timestamp,
      status: 'running',
      metadata: {
        model: modelToUse,
        requestedModel: modelToUse,
        sourcePrompt: prompt,
        contextMode: effectiveContextMode,
        requestId: entryId,
        missionObjective: sessionMission.objective || undefined,
      },
    }])

    const handleChunk = (chunk: { content: string }) => {
      const now = Date.now()
      const chunkChars = Math.max(1, chunk.content.length || 0)
      const streamStats = aiStreamStatsRef.current
      if (streamStats.lastChunkAt > 0) {
        const deltaMs = Math.max(16, now - streamStats.lastChunkAt)
        const instantCharsPerSec = chunkChars / (deltaMs / 1000)
        streamStats.charsPerSec = streamStats.charsPerSec > 0
          ? (streamStats.charsPerSec * 0.72) + (instantCharsPerSec * 0.28)
          : instantCharsPerSec
      } else {
        streamStats.charsPerSec = Math.max(streamStats.charsPerSec, chunkChars * 9)
      }
      streamStats.lastChunkAt = now

      const signal = Math.max(0.18, Math.min(1, streamStats.charsPerSec / STREAM_SIGNAL_NORMALIZER_CPS))
      setAiRuntimeTelemetry(prev => ({
        active: true,
        phase: 'Streaming response',
        signal: Math.max(signal, prev.signal * 0.72),
        charsPerSec: streamStats.charsPerSec,
      }))

      currentAIContentRef.current += chunk.content
      setEntries(prev => prev.map(entry =>
        entry.id === entryId
          ? {
            ...entry,
            content: entry.content + chunk.content,
            metadata: {
              ...(entry.metadata || {}),
              streamSignal: signal,
              streamCharsPerSec: streamStats.charsPerSec,
              streamUpdatedAt: now,
            },
          }
          : entry
      ))
    }

    const handleStatus = (statusData: {
      status: string
      message: string
      model?: string
      route?: string
      confidence?: number
      response_contract?: string
      provenance?: string[]
      refined_by?: string
      requires_clarification?: boolean
      agent_mode?: 'off' | 'auto'
      agent_used?: boolean
    }) => {
      if (statusData.status === 'running') {
        setAiRuntimeTelemetry(prev => ({
          active: true,
          phase: (statusData.message || 'Processing').trim(),
          signal: Math.max(prev.signal, 0.22),
          charsPerSec: prev.charsPerSec,
        }))
        setEntries(prev => prev.map(ent => (
          ent.id === entryId
            ? {
              ...ent,
              metadata: {
                ...(ent.metadata || {}),
                route: statusData.route ?? ent.metadata?.route,
                confidence: typeof statusData.confidence === 'number' ? statusData.confidence : ent.metadata?.confidence,
                responseContract: statusData.response_contract ?? ent.metadata?.responseContract,
                provenance: statusData.provenance ?? ent.metadata?.provenance,
                refinedBy: statusData.refined_by ?? ent.metadata?.refinedBy,
                requiresClarification: statusData.requires_clarification ?? ent.metadata?.requiresClarification,
                agentMode: statusData.agent_mode ?? ent.metadata?.agentMode,
                agentUsed: typeof statusData.agent_used === 'boolean' ? statusData.agent_used : ent.metadata?.agentUsed,
              },
            }
            : ent
        )))
        return
      }

      if (statusData.status === 'success' || statusData.status === 'error') {
        const isSuccess = statusData.status === 'success'
        emitCrtBurst(isSuccess ? 'ai-done' : 'ai-error', isSuccess ? 0.95 : 1.35, isSuccess ? 140 : 200)
        // Desktop notification when tab is backgrounded
        if (isSuccess) {
          const preview = (currentAIContentRef.current || '').trim().slice(0, 120)
          sendDesktopNotification('LOOM — Response Ready', preview || 'AI response complete')
        } else {
          sendDesktopNotification('LOOM — Error', statusData.message || 'AI response failed')
        }
        setAiRuntimeTelemetry({
          active: false,
          phase: isSuccess ? 'Complete' : (statusData.message || 'Error').trim(),
          signal: 0,
          charsPerSec: 0,
        })
        const content = (currentAIContentRef.current || '').trim()
        if (isSuccess && content && autoGenerateAudio && ttsModelType === 'orpheus') {
          setGeneratingEntryId(entryId)
          setSelectedAiEntryId(entryId)
          generateOrpheus(content).then(blob => {
            setAudioCacheByEntryId(prev => ({ ...prev, [entryId]: blob }))
            saveTTSBlobToBackend(entryId, blob)
            setGeneratingEntryId(null)
            playOrpheusBlob(blob)
          }).catch(() => setGeneratingEntryId(null))
        }
        setEntries(prev => {
          if (speakNextAiResponseRef.current) {
            speakNextAiResponseRef.current = false
            setVoiceChatWaitingForAi(false)
            if (isSuccess) {
              const text = currentAIContentRef.current || ''
              setLastAiSaid(text)
              if (!(autoGenerateAudio && ttsModelType === 'orpheus')) {
                setTimeout(() => speakTTSUnified(text), 0)
              }
            }
          }
          return prev.map(ent =>
            ent.id === entryId
              ? {
                ...ent,
                status: statusData.status as 'success' | 'error',
                metadata: {
                  ...(ent.metadata || {}),
                  model: statusData.model || (ent.metadata?.model as string | undefined) || modelToUse,
                  requestedModel: (ent.metadata?.requestedModel as string | undefined) || modelToUse,
                  sourcePrompt: (ent.metadata?.sourcePrompt as string | undefined) || prompt,
                  contextMode: (ent.metadata?.contextMode as string | undefined) || effectiveContextMode,
                  route: statusData.route ?? ent.metadata?.route,
                  confidence: typeof statusData.confidence === 'number' ? statusData.confidence : ent.metadata?.confidence,
                  responseContract: statusData.response_contract ?? ent.metadata?.responseContract,
                  provenance: statusData.provenance ?? ent.metadata?.provenance,
                  refinedBy: statusData.refined_by ?? ent.metadata?.refinedBy,
                  requiresClarification: statusData.requires_clarification ?? ent.metadata?.requiresClarification,
                  agentMode: statusData.agent_mode ?? ent.metadata?.agentMode,
                  agentUsed: typeof statusData.agent_used === 'boolean' ? statusData.agent_used : ent.metadata?.agentUsed,
                  streamSignal: 0,
                },
                content: statusData.status === 'error'
                  ? (ent.content || `Error: ${statusData.message}`)
                  : (currentAIContentRef.current || ent.content || 'No response received.'),
              }
              : ent
          )
        })
        currentAIEntryRef.current = null
      }
    }

    const activeSettings = loadSettings()
    const memoryVault = pruneMemoryVault()
    const relevantMemory = selectRelevantMemory(prompt, memoryVault, 8)
    if (relevantMemory.length > 0) {
      touchMemoryEntries(relevantMemory.map(item => item.entry.id))
    }
    const relevantMemoryLines = relevantMemory.map(item => {
      const confidenceLabel = `${Math.round(item.entry.confidence * 100)}%`
      return `[${item.entry.tier}|${confidenceLabel}] ${item.entry.text}`
    })
    const baseMemoryLines = normalizeProfileLines(activeSettings.memoryNotes, { maxItems: 40 })
    const mergedMemoryLines = [...new Set([...relevantMemoryLines, ...baseMemoryLines])].slice(0, 40)
    const missionUserGoals = sessionMission.objective
      ? [sessionMission.objective]
      : []
    const missionMemoryNotes = [
      sessionMission.nextAction ? `Current next action: ${sessionMission.nextAction}` : '',
      sessionMission.blocker ? `Known blocker: ${sessionMission.blocker}` : '',
      sessionMission.progress ? `Progress note: ${sessionMission.progress}` : '',
    ].filter(Boolean)

    const conversationProfile = buildConversationProfileFromSettings({
      goalsEnabled: activeSettings.goalsEnabled,
      memoryEnabled: activeSettings.memoryEnabled,
      userGoals: toMultilineText([...normalizeProfileLines(activeSettings.userGoals), ...missionUserGoals]),
      assistantGoals: activeSettings.assistantGoals,
      memoryNotes: toMultilineText([...mergedMemoryLines, ...missionMemoryNotes]),
    })

    const circuitContext = getCircuitContext()
    const promptWordCount = prompt.trim().split(/\s+/).filter(Boolean).length
    const adaptiveMaxTurns = effectiveContextMode === 'full'
      ? (promptWordCount >= 90 ? 140 : promptWordCount >= 35 ? 100 : 72)
      : (promptWordCount >= 30 ? 32 : 20)
    const conversationBlock = effectiveContextMode === 'input'
      ? null
      : buildConversationContext(entries, {
        contextMode: effectiveContextMode,
        maxTurns: adaptiveMaxTurns,
      })
    const enhancedPrompt = buildEnhancedPrompt(prompt, conversationBlock, circuitContext, conversationProfile)
    const feedbackBias = feedbackToBias(agentFeedbackProfile)

    const useCodeContext = codeContextActive
    const sent = sendChat(
      enhancedPrompt,
      modelToUse,
      handleChunk,
      handleStatus,
      useCodeContext,
      {
        rawPrompt: prompt,
        contextMode: effectiveContextMode,
        source: 'terminal',
        clientRequestId: entryId,
        conversationProfile,
        feedbackProfile: feedbackBias,
        agentMode: activeSettings.mistralAgentMode,
      },
    )

    if (!sent) {
      setAiRuntimeTelemetry({
        active: false,
        phase: 'Backend offline',
        signal: 0,
        charsPerSec: 0,
      })
      setEntries(prev => prev.map(entry =>
        entry.id === entryId
          ? {
            ...entry,
            content: `[OFFLINE MODE]\n\nBackend not connected. Start the backend server:\n\ncd backend && python run.py\n\nYour prompt was: "${prompt}"`,
            status: 'error',
          }
          : entry
      ))
    }
  }, [
    sendChat,
    status.activeModel,
    models,
    entries,
    speakTTSUnified,
    autoGenerateAudio,
    ttsModelType,
    generateOrpheus,
    playOrpheusBlob,
    saveTTSBlobToBackend,
    setGeneratingEntryId,
    setAudioCacheByEntryId,
    setSelectedAiEntryId,
    codeContextActive,
    setActiveModel,
    addSystemEntry,
    sessionMission.objective,
    sessionMission.nextAction,
    sessionMission.blocker,
    sessionMission.progress,
    agentFeedbackProfile,
  ])

  useEffect(() => {
    handleAIRequestRef.current = handleAIRequest
  }, [handleAIRequest])

  const fetchQuickModelSuggestion = useCallback(async (): Promise<{ model: string; reason: string }> => {
    try {
      const params = new URLSearchParams()
      if (status.activeModel) {
        params.set('active_model', status.activeModel)
      }
      const res = await fetch(`${API_BASE}/api/providers/quick-model?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (typeof data?.model === 'string' && data.model.trim()) {
          return {
            model: data.model.trim(),
            reason: typeof data?.reason === 'string' ? data.reason : 'backend quick selection',
          }
        }
      }
    } catch {
      // Fallback below
    }

    return pickQuickModel(cloudModels, models, status.activeModel)
  }, [cloudModels, models, status.activeModel])

  const generateImageFromPrompt = useCallback((prompt: string, modelName?: string) => {
    const model = modelName || status.imageGenModel || 'auto-detecting'
    setImageGeneration({
      prompt,
      model,
      status: 'generating',
      progress: 0,
      message: 'Starting image node...',
    })

    fetch(`${BACKEND_URL}/api/images/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        provider: 'ollama',
        model: modelName || status.imageGenModel || undefined,
      }),
    })
      .then(async res => {
        const data = await res.json()
        if (res.ok && data.status === 'success' && data.image) {
          setImageGeneration({
            prompt,
            imageUrl: data.image,
            model: data.model || model,
            status: 'success',
          })
          if (data.model) {
            setImageGenModel(data.model)
          }
          return
        }
        throw new Error(data.error || data.message || 'Generation failed')
      })
      .catch(err => {
        setImageGeneration({
          prompt,
          model,
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        })
      })
  }, [status.imageGenModel, setImageGenModel])

  const generateMusicFromPrompt = useCallback(
    (prompt: string, lyrics = '', duration = 30, guidanceScale = 7.0, steps = 20, seed?: number) => {
      setMusicGeneration({
        prompt,
        lyrics: lyrics || undefined,
        duration,
        status: 'generating',
        progress: 0,
        message: 'Starting music node...',
        seed,
      })

      fetch(`${BACKEND_URL}/api/music/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          lyrics: lyrics || undefined,
          use_lyrics: !!lyrics,
          duration,
          guidance_scale: guidanceScale,
          steps,
          seed,
        }),
      })
        .then(async res => {
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            throw new Error(errData.detail || 'Generation failed')
          }
          const data = await res.json()
          if (data.status === 'success' && data.audio_url) {
            setMusicGeneration({
              prompt,
              lyrics: lyrics || undefined,
              duration,
              audioUrl: `${BACKEND_URL}${data.audio_url}`,
              status: 'success',
              seed: data.seed,
            })
            return
          }
          throw new Error(data.message || 'Unknown error')
        })
        .catch(err => {
          setMusicGeneration({
            prompt,
            lyrics: lyrics || undefined,
            duration,
            status: 'error',
            error: err.message,
          })
        })
    },
    [],
  )

  const pollQdcJob = useCallback((jobId: string) => {
    if (!jobId || activeQdcPollersRef.current.has(jobId)) return
    activeQdcPollersRef.current.add(jobId)

    let lastStatus = ''
    const intervalId = window.setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/qdc/jobs/${encodeURIComponent(jobId)}`)
        if (!res.ok) {
          return
        }
        const data = await res.json()
        const job = data?.job
        const statusValue = typeof job?.status === 'string' ? job.status : ''
        if (!statusValue) return

        if (statusValue !== lastStatus) {
          lastStatus = statusValue
          addSystemEntry(`📡 QDC ${jobId}: ${statusValue}`, Date.now())
        }

        if (statusValue === 'succeeded' || statusValue === 'failed' || statusValue === 'canceled') {
          window.clearInterval(intervalId)
          activeQdcPollersRef.current.delete(jobId)
          if (statusValue === 'succeeded') {
            const resultRes = await fetch(`${API_BASE}/api/qdc/jobs/${encodeURIComponent(jobId)}/results`)
            if (resultRes.ok) {
              const resultData = await resultRes.json()
              const summary = typeof resultData?.result?.summary === 'string'
                ? resultData.result.summary
                : 'QDC job completed.'
              const assistantReply = typeof resultData?.result?.assistant_reply === 'string'
                ? resultData.result.assistant_reply.trim()
                : ''
              const artifactId = typeof resultData?.result?.artifact_id === 'string'
                ? resultData.result.artifact_id
                : ''
              const model = typeof resultData?.result?.model === 'string'
                ? resultData.result.model
                : 'qdc:micro-brain'
              setEntries(prev => [...prev, {
                id: `qdc-result-${jobId}-${Date.now()}`,
                type: 'system',
                content: `📡 QDC RESULT (${jobId})\n${summary}`,
                timestamp: Date.now(),
                status: 'success',
              }])
              if (assistantReply) {
                setEntries(prev => [...prev, {
                  id: `qdc-ai-${jobId}-${Date.now()}`,
                  type: 'ai',
                  content: assistantReply,
                  timestamp: Date.now(),
                  status: 'success',
                  metadata: {
                    model,
                    route: 'qdc_job',
                    provenance: ['qdc-cloud'],
                    artifactId,
                  },
                }])
                try {
                  localStorage.setItem(QDC_CONTEXT_KEY, JSON.stringify({
                    jobId,
                    summary,
                    assistantReply,
                    model,
                    artifactId,
                    timestamp: Date.now(),
                  }))
                } catch {
                  // Ignore storage errors.
                }
              }
            }
          } else {
            addErrorEntry(`QDC job ${jobId} ended with status: ${statusValue}`, Date.now())
          }
        }
      } catch {
        // Keep polling; transient errors are expected occasionally.
      }
    }, 2400)
  }, [addSystemEntry, addErrorEntry])

  const startQdcJobFromPrompt = useCallback(async (prompt: string) => {
    const cleaned = prompt.trim()
    if (!cleaned) {
      throw new Error('QDC prompt is empty')
    }

    const statusRes = await fetch(`${API_BASE}/api/qdc/status`)
    if (statusRes.ok) {
      const statusData = await statusRes.json()
      if (!statusData?.provider_connected) {
        setShowProviderSetup(true)
        throw new Error('QDC is not connected yet. Open Provider Setup and connect Qualcomm QDC token first.')
      }
    }

    const res = await fetch(`${API_BASE}/api/qdc/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: cleaned,
        target: 'auto',
        priority: 'normal',
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.job?.id) {
      const detail = typeof data?.detail === 'string' ? data.detail : 'Failed to start QDC job'
      throw new Error(detail)
    }

    const jobId = String(data.job.id)
    addSystemEntry(`📡 QDC job started: ${jobId}\nPrompt: ${cleaned}`, Date.now())
    pollQdcJob(jobId)
    return jobId
  }, [addSystemEntry, pollQdcJob])

  const createQdcPackage = useCallback(async (
    artifactPath: string,
    startupCommand?: string,
    packageKind: 'application' | 'model' = 'application',
  ) => {
    const cleanedPath = artifactPath.trim()
    if (!cleanedPath) {
      throw new Error('QDC artifact path is empty')
    }

    const res = await fetch(`${API_BASE}/api/qdc/package`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: cleanedPath,
        startup_command: (startupCommand || '').trim() || undefined,
        package_kind: packageKind,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.package?.path) {
      const detail = typeof data?.detail === 'string' ? data.detail : 'Failed to build QDC package'
      throw new Error(detail)
    }
    return data.package as {
      id: string
      name: string
      path: string
      size_bytes: number
      file_count: number
      recommended_upload_type?: string
    }
  }, [])

  const packageAndRunQdc = useCallback(async (
    artifactPath: string,
    prompt: string,
    startupCommand?: string,
    packageKind: 'application' | 'model' = 'application',
  ) => {
    const cleanedPath = artifactPath.trim()
    const cleanedPrompt = prompt.trim()
    if (!cleanedPath || !cleanedPrompt) {
      throw new Error('QDC ship requires both a path and a prompt')
    }

    const statusRes = await fetch(`${API_BASE}/api/qdc/status`)
    if (statusRes.ok) {
      const statusData = await statusRes.json()
      if (!statusData?.provider_connected) {
        setShowProviderSetup(true)
        throw new Error('QDC is not connected yet. Open Provider Setup and connect Qualcomm QDC token first.')
      }
    }

    const sid = getSocketInstance()?.id || undefined
    const res = await fetch(`${API_BASE}/api/qdc/package-and-run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: cleanedPath,
        prompt: cleanedPrompt,
        startup_command: (startupCommand || '').trim() || undefined,
        package_kind: packageKind,
        target: 'auto',
        priority: 'normal',
        sid,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || !data?.job?.id) {
      const detail = typeof data?.detail === 'string' ? data.detail : 'Failed to package and run QDC job'
      throw new Error(detail)
    }

    const packagePath = String(data?.package?.path || '')
    const packageSize = Number(data?.package?.size_bytes || 0)
    const uploadType = typeof data?.package?.recommended_upload_type === 'string'
      ? data.package.recommended_upload_type
      : ''
    const artifactId = String(data?.artifact?.id || '')
    const jobId = String(data?.job?.id || '')
    addSystemEntry(
      [
        `📡 QDC package created: ${packagePath || '(unknown path)'}`,
        packageSize > 0 ? `Size: ${Math.round(packageSize / 1024)} KB` : '',
        uploadType ? `Upload Type: ${uploadType}` : '',
        artifactId ? `Artifact: ${artifactId}` : '',
        `Job: ${jobId}`,
      ].filter(Boolean).join('\n'),
      Date.now(),
    )
    pollQdcJob(jobId)
    return {
      jobId,
      artifactId,
      packagePath,
    }
  }, [addSystemEntry, pollQdcJob])

  const handleSlashCommand = useCallback((command: string, timestamp: number) => {
    const { cmd: normalizedCmd, args } = parseSlashCommand(command)

    const commandText = args.length > 0 ? `/${normalizedCmd} ${args.join(' ')}` : `/${normalizedCmd}`
    const commandStatusId = `cmd-status-${timestamp}`
    let commandPending = false
    let commandFinalized = false

    setEntries(prev => [...prev, {
      id: commandStatusId,
      type: 'system',
      content: buildCommandStatusContent(commandText, 'working'),
      timestamp,
      status: 'running',
      metadata: {
        kind: COMMAND_STATUS_METADATA_KIND,
        command: commandText,
        state: 'working',
      },
    }])

    const setCommandStatus = (state: CommandLifecycleState, detail?: string) => {
      const mappedStatus: NonNullable<LogEntry['status']> =
        state === 'working' ? 'running' : state === 'done' ? 'success' : 'error'
      if (state !== 'working') {
        commandFinalized = true
        emitCrtBurst(state === 'done' ? 'command-done' : 'command-failed', state === 'done' ? 0.85 : 1.25, state === 'done' ? 120 : 190)
      }
      setEntries(prev => {
        let found = false
        const next = prev.map(entry => {
          if (entry.id !== commandStatusId) return entry
          found = true
          return {
            ...entry,
            status: mappedStatus,
            content: buildCommandStatusContent(commandText, state, detail),
            metadata: {
              ...(entry.metadata || {}),
              kind: COMMAND_STATUS_METADATA_KIND,
              command: commandText,
              state,
              detail,
            },
          }
        })
        if (found) return next
        return [
          ...next,
          {
            id: commandStatusId,
            type: 'system',
            content: buildCommandStatusContent(commandText, state, detail),
            timestamp: Date.now(),
            status: mappedStatus,
            metadata: {
              kind: COMMAND_STATUS_METADATA_KIND,
              command: commandText,
              state,
              detail,
            },
          },
        ]
      })
    }

    if (normalizedCmd === 'status') {
      setEntries(prev => [...prev, {
        id: `system-status-${timestamp}`,
        type: 'system',
        content: '',
        timestamp,
        metadata: { component: 'SystemStatusCard' },
      }])
      setCommandStatus('done', 'system status')
      return
    }

    const markCommandPending = (detail?: string) => {
      commandPending = true
      setCommandStatus('working', detail)
    }

    const addSystemEntryForCommand = (content: string, ts: number) => {
      addSystemEntry(content, ts)
    }

    const addErrorEntryForCommand = (content: string, ts: number) => {
      const improved = withFixHint(content)
      addErrorEntry(improved, ts)
      emitCrtBurst('command-error', 1.35, 210)
      const firstLine = improved.split('\n')[0] || 'command failed'
      setCommandStatus('failed', firstLine)
      showErrorToast(firstLine, 'Command Failed')
    }

    const finalizeCommandIfSynchronous = () => {
      if (!commandPending && !commandFinalized) {
        setCommandStatus('done')
      }
    }

    if (normalizedCmd === 'crt') {
      const mode = (args[0] || 'status').toLowerCase()
      const validModes = ['on', 'off', 'subtle', 'medium', 'full', 'insane', 'toggle', 'status', 'burst']
      if (!validModes.includes(mode)) {
        addErrorEntryForCommand('Usage: /crt [on|off|subtle|medium|full|insane|toggle|status|burst]', timestamp)
        return
      }

      try {
        const current = loadSettings()
        const currentEnabled = current.crtEnabled
        const currentIntensity = current.crtIntensity

        let nextEnabled = currentEnabled
        let nextIntensity = currentIntensity

        if (mode === 'on') nextEnabled = true
        if (mode === 'off') nextEnabled = false
        if (mode === 'toggle') nextEnabled = !currentEnabled
        if (mode === 'subtle' || mode === 'medium' || mode === 'full' || mode === 'insane') {
          nextEnabled = true
          nextIntensity = mode
        }
        if (mode === 'burst') {
          emitCrtBurst('manual', 1.6, 220)
          addSystemEntryForCommand('CRT burst triggered.', timestamp)
          setCommandStatus('done', 'crt burst')
          return
        }

        const nextSettings = {
          ...current,
          crtEnabled: nextEnabled,
          crtIntensity: nextIntensity,
        }

        saveSettings(nextSettings)

        addSystemEntryForCommand(
          `CRT ${nextEnabled ? 'ON' : 'OFF'}${nextEnabled ? ` (${String(nextIntensity).toUpperCase()})` : ''}`,
          timestamp
        )
        setCommandStatus('done', `crt ${nextEnabled ? String(nextIntensity) : 'off'}`)
      } catch (error) {
        addErrorEntryForCommand('Failed to update CRT settings.', timestamp)
      }
      return
    }

    if (normalizedCmd === 'glitch') {
      emitCrtBurst('manual-glitch', 1.8, 230)
      addSystemEntryForCommand('CRT glitch burst triggered.', timestamp)
      setCommandStatus('done', 'glitch burst')
      return
    }

    if (normalizedCmd === 'mission') {
      const action = (args[0] || 'show').toLowerCase()
      const value = args.slice(1).join(' ').trim()
      const currentMission = sessionMission

      if (action === 'show') {
        addSystemEntryForCommand(
          [
            'SESSION MISSION:',
            `  Objective: ${currentMission.objective || '(not set)'}`,
            `  Next: ${currentMission.nextAction || '(not set)'}`,
            `  Blocker: ${currentMission.blocker || 'none'}`,
            `  Progress: ${currentMission.progress || '(not set)'}`,
            '',
            'Usage: /mission set <objective> | /mission next <action> | /mission block <issue> | /mission progress <note> | /mission clear',
          ].join('\n'),
          timestamp,
        )
        setCommandStatus('done', 'mission status')
        return
      }

      if (action === 'clear') {
        const cleared: SessionMission = { objective: '', nextAction: '', blocker: '', progress: '', updatedAt: Date.now() }
        persistSessionMission(cleared)
        addSystemEntryForCommand('Session mission cleared.', timestamp)
        setCommandStatus('done', 'mission cleared')
        return
      }

      if (!value) {
        addErrorEntryForCommand('Usage: /mission set|next|block|progress <text>', timestamp)
        return
      }

      const updated: SessionMission = {
        ...currentMission,
        objective: action === 'set' ? value : currentMission.objective,
        nextAction: action === 'next' ? value : currentMission.nextAction,
        blocker: action === 'block' ? value : currentMission.blocker,
        progress: action === 'progress' ? value : currentMission.progress,
        updatedAt: Date.now(),
      }
      if (!['set', 'next', 'block', 'progress'].includes(action)) {
        addErrorEntryForCommand('Usage: /mission set|next|block|progress <text> | /mission show | /mission clear', timestamp)
        return
      }
      persistSessionMission(updated)
      addSystemEntryForCommand(`Mission ${action} updated: ${value}`, timestamp)
      setCommandStatus('done', `mission ${action}`)
      return
    }

    if (normalizedCmd === 'goals' || normalizedCmd === 'goal' || normalizedCmd === 'memory' || normalizedCmd === 'remember' || normalizedCmd === 'forget') {
      const current = loadSettings()

      if (normalizedCmd === 'goals') {
        const toggle = (args[0] || '').toLowerCase()
        if (toggle === 'on' || toggle === 'off') {
          saveSettings({ ...current, goalsEnabled: toggle === 'on' })
          setCommandStatus('done', `goals ${toggle}`)
          addSystemEntryForCommand(`Goals layer ${toggle.toUpperCase()}.`, timestamp)
          return
        }

        const profile = buildConversationProfileFromSettings({
          goalsEnabled: current.goalsEnabled,
          memoryEnabled: current.memoryEnabled,
          userGoals: current.userGoals,
          assistantGoals: current.assistantGoals,
          memoryNotes: current.memoryNotes,
        })

        const lines = [
          `GOALS LAYER: ${profile.goalsEnabled ? 'ON' : 'OFF'}`,
          '',
          'User Goals:',
          ...(profile.userGoals.length > 0 ? profile.userGoals.map((goal, index) => `  ${index + 1}. ${goal}`) : ['  (none)']),
          '',
          'Assistant Goals:',
          ...(profile.assistantGoals.length > 0 ? profile.assistantGoals.map((goal, index) => `  ${index + 1}. ${goal}`) : ['  (none)']),
          '',
          'Commands: /goal user <text>, /goal assistant <text>, /goal clear <user|assistant|all>, /goals on|off',
        ]
        addSystemEntryForCommand(lines.join('\n'), timestamp)
        setCommandStatus('done', 'show goals')
        return
      }

      if (normalizedCmd === 'goal') {
        const lane = (args[0] || '').toLowerCase()
        if (lane !== 'user' && lane !== 'assistant' && lane !== 'clear') {
          addErrorEntryForCommand('Usage: /goal user <text> | /goal assistant <text> | /goal clear <user|assistant|all>', timestamp)
          return
        }

        if (lane === 'clear') {
          const target = (args[1] || '').toLowerCase()
          if (!['user', 'assistant', 'all'].includes(target)) {
            addErrorEntryForCommand('Usage: /goal clear <user|assistant|all>', timestamp)
            return
          }
          const next = { ...current }
          if (target === 'user' || target === 'all') next.userGoals = ''
          if (target === 'assistant' || target === 'all') next.assistantGoals = ''
          saveSettings(next)
          addSystemEntryForCommand(`Cleared ${target} goals.`, timestamp)
          setCommandStatus('done', `goal clear ${target}`)
          return
        }

        const goalText = args.slice(1).join(' ').trim()
        if (!goalText) {
          addErrorEntryForCommand(`Usage: /goal ${lane} <text>`, timestamp)
          return
        }

        const sourceField = lane === 'user' ? current.userGoals : current.assistantGoals
        const updatedLines = normalizeProfileLines(toMultilineText([...normalizeProfileLines(sourceField), goalText]))
        const next = lane === 'user'
          ? { ...current, userGoals: toMultilineText(updatedLines), goalsEnabled: true }
          : { ...current, assistantGoals: toMultilineText(updatedLines), goalsEnabled: true }
        saveSettings(next)
        addSystemEntryForCommand(`Added ${lane} goal #${updatedLines.length}: ${goalText}`, timestamp)
        setCommandStatus('done', `goal ${lane} updated`)
        return
      }

      if (normalizedCmd === 'memory') {
        const sub = (args[0] || 'show').toLowerCase()
        if (sub === 'on' || sub === 'off') {
          saveSettings({ ...current, memoryEnabled: sub === 'on' })
          addSystemEntryForCommand(`Memory layer ${sub.toUpperCase()}.`, timestamp)
          setCommandStatus('done', `memory ${sub}`)
          return
        }
        if (sub === 'clear') {
          localStorage.removeItem('loom-memory-vault-v1')
          saveSettings({ ...current, memoryNotes: '' })
          addSystemEntryForCommand('Cleared all memory notes.', timestamp)
          setCommandStatus('done', 'memory cleared')
          return
        }

        const notes = pruneMemoryVault()
        const lines = [
          `MEMORY LAYER: ${current.memoryEnabled ? 'ON' : 'OFF'}`,
          '',
          ...(notes.length > 0
            ? notes.slice(0, 20).map((note, index) => `  ${index + 1}. [${note.tier}|${Math.round(note.confidence * 100)}%] ${note.text}`)
            : ['  (empty)']),
          '',
          'Commands: /remember [session|working|long] <fact> [@0.0-1.0], /forget <index>, /memory on|off|clear',
        ]
        addSystemEntryForCommand(lines.join('\n'), timestamp)
        setCommandStatus('done', 'show memory')
        return
      }

      if (normalizedCmd === 'remember') {
        if (args.length === 0) {
          addErrorEntryForCommand('Usage: /remember [session|working|long] <fact> [@0.0-1.0]', timestamp)
          return
        }
        const maybeTier = (args[0] || '').toLowerCase()
        const tier: MemoryTier = (maybeTier === 'session' || maybeTier === 'working' || maybeTier === 'long')
          ? maybeTier
          : 'long'
        const textArgs = tier === 'long' && maybeTier !== 'long'
          ? args
          : args.slice(1)
        const raw = textArgs.join(' ').trim()
        const confidenceMatch = raw.match(/@([01](?:\.\d{1,2})?)\s*$/)
        const confidence = confidenceMatch ? Number(confidenceMatch[1]) : 0.72
        const note = confidenceMatch ? raw.replace(/@([01](?:\.\d{1,2})?)\s*$/, '').trim() : raw
        if (!note) {
          addErrorEntryForCommand('Usage: /remember [session|working|long] <fact> [@0.0-1.0]', timestamp)
          return
        }
        const added = addMemoryEntry(note, { tier, confidence, source: 'user' })
        if (!added) {
          addErrorEntryForCommand('Could not save memory note.', timestamp)
          return
        }
        const nextVault = pruneMemoryVault()
        saveSettings({
          ...current,
          memoryEnabled: true,
          memoryNotes: buildSettingsMemoryNotesFromVault(nextVault),
        })
        addSystemEntryForCommand(`Saved memory [${tier}] conf ${Math.round(added.confidence * 100)}%: ${note}`, timestamp)
        setCommandStatus('done', 'memory saved')
        return
      }

      if (normalizedCmd === 'forget') {
        const target = args.join(' ').trim()
        if (!target) {
          addErrorEntryForCommand('Usage: /forget <index>', timestamp)
          return
        }
        const index = Number(target)
        if (!Number.isInteger(index) || index < 1) {
          addErrorEntryForCommand('Usage: /forget <index> (1-based)', timestamp)
          return
        }

        const notes = pruneMemoryVault()
        if (index > notes.length) {
          addErrorEntryForCommand(`No memory entry at index ${index}.`, timestamp)
          return
        }
        const removed = notes[index - 1]
        const nextNotes = removeMemoryEntryById(removed.id)
        saveSettings({ ...current, memoryNotes: buildSettingsMemoryNotesFromVault(nextNotes) })
        addSystemEntryForCommand(`Removed memory #${index}: ${removed.text}`, timestamp)
        setCommandStatus('done', 'memory removed')
        return
      }
    }

    if (normalizedCmd === 'improve') {
      const sub = (args[0] || 'list').toLowerCase()
      if (sub === 'list') {
        const queue = loadMaintenanceQueue()
        const open = queue.filter(task => task.status === 'open')
        if (open.length === 0) {
          addSystemEntryForCommand('No open maintenance tasks.', timestamp)
          setCommandStatus('done', 'improve list empty')
          return
        }
        const lines = ['MAINTENANCE QUEUE:']
        open.slice(0, 12).forEach((task, idx) => {
          lines.push(`  ${idx + 1}. [${task.severity.toUpperCase()}] ${task.title}`)
          lines.push(`     ${task.detail}`)
        })
        addSystemEntryForCommand(lines.join('\n'), timestamp)
        setCommandStatus('done', `improve list ${open.length}`)
        return
      }

      if (sub === 'add') {
        const detail = args.slice(1).join(' ').trim()
        if (!detail) {
          addErrorEntryForCommand('Usage: /improve add <task detail>', timestamp)
          return
        }
        const task = upsertMaintenanceTask({
          title: detail.slice(0, 64),
          detail,
          severity: 'medium',
          source: 'manual',
        })
        setMaintenanceQueue(loadMaintenanceQueue())
        addSystemEntryForCommand(`Queued maintenance task ${task.id}: ${task.title}`, timestamp)
        setCommandStatus('done', 'improve add')
        return
      }

      if (sub === 'done') {
        const index = Number(args[1] || '')
        const open = loadMaintenanceQueue().filter(task => task.status === 'open')
        if (!Number.isInteger(index) || index < 1 || index > open.length) {
          addErrorEntryForCommand('Usage: /improve done <open-task-index>', timestamp)
          return
        }
        const target = open[index - 1]
        const next = markMaintenanceTaskDone(target.id)
        setMaintenanceQueue(next)
        addSystemEntryForCommand(`Marked done: ${target.title}`, timestamp)
        setCommandStatus('done', 'improve done')
        return
      }

      if (sub === 'clear') {
        const next = clearMaintenanceQueue('open')
        setMaintenanceQueue(next)
        addSystemEntryForCommand('Cleared all open maintenance tasks.', timestamp)
        setCommandStatus('done', 'improve clear')
        return
      }

      addErrorEntryForCommand('Usage: /improve [list|add <task>|done <index>|clear]', timestamp)
      return
    }

    if (normalizedCmd === 'eval') {
      const queue = loadMaintenanceQueue()
      const openTasks = queue.filter(task => task.status === 'open').length
      const memoryCount = pruneMemoryVault().length
      const recent = entries.slice(-80)
      const userCount = recent.filter(item => item.type === 'user').length
      const aiCount = recent.filter(item => item.type === 'ai').length
      const errorCount = recent.filter(item => item.type === 'error').length
      const avgSignal = recent
        .filter(item => item.type === 'ai' && typeof item.metadata?.streamCharsPerSec === 'number')
        .reduce((sum, item) => sum + Number(item.metadata?.streamCharsPerSec || 0), 0)
      const avgCps = aiCount > 0 ? Math.round(avgSignal / Math.max(1, aiCount)) : 0
      const feedback = loadAgentFeedbackProfile()
      const healthScore = Math.max(0, Math.min(100,
        100
        - (errorCount * 7)
        - (openTasks * 3)
        - (feedback.verbose * 1.2)
        - (feedback.vague * 1.6)
        - (feedback.robotic * 1.4)
        + (feedback.perfect * 1.8)
      ))
      addSystemEntryForCommand(
        [
          'AGENT EVAL:',
          `  Health Score: ${Math.round(healthScore)}/100`,
          `  Recent turns: user ${userCount}, ai ${aiCount}, errors ${errorCount}`,
          `  Avg stream speed: ${avgCps} chars/sec`,
          `  Open maintenance tasks: ${openTasks}`,
          `  Memory entries: ${memoryCount}`,
          `  Feedback totals: verbose ${feedback.verbose}, vague ${feedback.vague}, robotic ${feedback.robotic}, perfect ${feedback.perfect}`,
        ].join('\n'),
        timestamp,
      )
      setCommandStatus('done', 'eval complete')
      return
    }

    if (normalizedCmd === 'quick' || normalizedCmd === 'fast') {
      const prompt = args.join(' ').trim()
      if (!prompt) {
        addErrorEntryForCommand('Usage: /quick <question>\nRuns a low-priority question on a free/low-cost cloud model when available.', timestamp)
        return
      }
      markCommandPending('selecting quick lane model...')
      void fetchQuickModelSuggestion()
        .then(selected => {
          addSystemEntryForCommand(`⚡ Quick lane model: ${selected.model}\nReason: ${selected.reason}`, Date.now())
          handleAIRequest(prompt, timestamp, 'input', selected.model)
          setCommandStatus('done', `quick question via ${selected.model}`)
        })
        .catch(() => {
          const fallback = pickQuickModel(cloudModels, models, status.activeModel)
          addSystemEntryForCommand(`⚡ Quick lane fallback: ${fallback.model}\nReason: ${fallback.reason}`, Date.now())
          handleAIRequest(prompt, timestamp, 'input', fallback.model)
          setCommandStatus('done', `quick question via ${fallback.model}`)
        })
      return
    }

    if (normalizedCmd === 'qdc') {
      const sub = (args[0] || 'status').toLowerCase()

      if (sub === 'status') {
        markCommandPending('checking qdc status...')
        void fetch(`${API_BASE}/api/qdc/status`)
          .then(async res => {
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              throw new Error(typeof data?.detail === 'string' ? data.detail : 'Failed to fetch QDC status')
            }
            addSystemEntryForCommand(
              [
                'QDC STATUS:',
                `  Mode: ${data.mode || 'unknown'}`,
                `  Connected: ${data.provider_connected ? 'YES' : 'NO'}`,
                `  Jobs: ${data.jobs ?? 0}`,
                `  Artifacts: ${data.artifacts ?? 0}`,
                data.provider_connected ? '' : 'Connect token in Provider Setup before running jobs.',
              ].filter(Boolean).join('\n'),
              Date.now(),
            )
            setCommandStatus('done', 'qdc status')
          })
          .catch(err => {
            addErrorEntryForCommand(err instanceof Error ? err.message : String(err), Date.now())
          })
        return
      }

      if (sub === 'jobs') {
        markCommandPending('loading qdc jobs...')
        void fetch(`${API_BASE}/api/qdc/jobs?limit=8`)
          .then(async res => {
            const data = await res.json().catch(() => ({}))
            if (!res.ok) {
              throw new Error(typeof data?.detail === 'string' ? data.detail : 'Failed to list QDC jobs')
            }
            const jobs = Array.isArray(data?.jobs) ? data.jobs : []
            if (jobs.length === 0) {
              addSystemEntryForCommand('No QDC jobs yet. Run: /qdc run <prompt>', Date.now())
              setCommandStatus('done', 'qdc jobs: empty')
              return
            }
            const lines = ['RECENT QDC JOBS:']
            for (const job of jobs) {
              const id = String(job?.id || 'unknown')
              const status = String(job?.status || 'unknown')
              const prompt = String(job?.prompt || '').slice(0, 64)
              lines.push(`  - ${id} [${status}] ${prompt}`)
            }
            addSystemEntryForCommand(lines.join('\n'), Date.now())
            setCommandStatus('done', `qdc jobs: ${jobs.length}`)
          })
          .catch(err => {
            addErrorEntryForCommand(err instanceof Error ? err.message : String(err), Date.now())
          })
        return
      }

      if (sub === 'run') {
        const prompt = args.slice(1).join(' ').trim()
        if (!prompt) {
          addErrorEntryForCommand('Usage: /qdc run <prompt>', timestamp)
          return
        }
        markCommandPending('starting qdc job...')
        void startQdcJobFromPrompt(prompt)
          .then(jobId => {
            setCommandStatus('done', `qdc job started: ${jobId}`)
          })
          .catch(err => {
            addErrorEntryForCommand(err instanceof Error ? err.message : String(err), Date.now())
          })
        return
      }

      if (sub === 'package' || sub === 'package-model') {
        const raw = args.slice(1).join(' ').trim()
        if (!raw) {
          addErrorEntryForCommand('Usage: /qdc package <path> [:: <startup command>] or /qdc package-model <path>', timestamp)
          return
        }
        const [pathPart, startupPart] = raw.split('::', 2).map(part => part.trim())
        if (!pathPart) {
          addErrorEntryForCommand('Usage: /qdc package <path> [:: <startup command>] or /qdc package-model <path>', timestamp)
          return
        }
        const packageKind = sub === 'package-model' ? 'model' : 'application'

        markCommandPending('building qdc package...')
        void createQdcPackage(pathPart, startupPart, packageKind)
          .then(pkg => {
            addSystemEntryForCommand(
              [
                'QDC PACKAGE READY:',
                `  ID: ${pkg.id}`,
                `  Path: ${pkg.path}`,
                `  Files: ${pkg.file_count}`,
                `  Size: ${Math.round((Number(pkg.size_bytes) || 0) / 1024)} KB`,
                pkg.recommended_upload_type ? `  Upload Type: ${pkg.recommended_upload_type}` : '',
                '  Next: Upload this .zip in qdc.qualcomm.com interactive session.',
              ].join('\n'),
              Date.now(),
            )
            setCommandStatus('done', `qdc package ${pkg.name}`)
          })
          .catch(err => {
            addErrorEntryForCommand(err instanceof Error ? err.message : String(err), Date.now())
          })
        return
      }

      if (sub === 'ship' || sub === 'ship-model') {
        const raw = args.slice(1).join(' ').trim()
        if (!raw || !raw.includes('::')) {
          addErrorEntryForCommand('Usage: /qdc ship <path> :: <remote task prompt> or /qdc ship-model <path> :: <remote task prompt>', timestamp)
          return
        }
        const [pathPart, promptPart] = raw.split('::', 2).map(part => part.trim())
        if (!pathPart || !promptPart) {
          addErrorEntryForCommand('Usage: /qdc ship <path> :: <remote task prompt> or /qdc ship-model <path> :: <remote task prompt>', timestamp)
          return
        }
        const packageKind = sub === 'ship-model' ? 'model' : 'application'
        markCommandPending('packaging and launching qdc job...')
        void packageAndRunQdc(pathPart, promptPart, undefined, packageKind)
          .then(payload => {
            setCommandStatus('done', `qdc ship job ${payload.jobId}`)
          })
          .catch(err => {
            addErrorEntryForCommand(err instanceof Error ? err.message : String(err), Date.now())
          })
        return
      }

      if (sub === 'relay') {
        const prompt = args.slice(1).join(' ').trim()
        if (!prompt) {
          addErrorEntryForCommand('Usage: /qdc relay <follow-up question>', timestamp)
          return
        }
        let snapshot: { jobId?: string; summary?: string; assistantReply?: string; model?: string } | null = null
        try {
          const raw = localStorage.getItem(QDC_CONTEXT_KEY)
          snapshot = raw ? JSON.parse(raw) as { jobId?: string; summary?: string; assistantReply?: string; model?: string } : null
        } catch {
          snapshot = null
        }
        if (!snapshot || (!snapshot.summary && !snapshot.assistantReply)) {
          addErrorEntryForCommand('No recent QDC context found. Run /qdc run or /qdc ship first.', timestamp)
          return
        }

        const relayPrompt = [
          'Use this cloud execution context from QDC as grounding data.',
          `QDC Job: ${snapshot.jobId || 'unknown'}`,
          `QDC Model: ${snapshot.model || 'qdc:micro-brain'}`,
          `QDC Summary: ${snapshot.summary || ''}`,
          `QDC Assistant Output:\n${snapshot.assistantReply || ''}`,
          `User Follow-up: ${prompt}`,
          'Respond directly to the follow-up, avoid repeating raw logs, and end with a concrete next action.',
        ].join('\n\n')

        addSystemEntryForCommand(`Relaying follow-up with context from QDC job ${snapshot.jobId || 'unknown'}...`, timestamp)
        handleAIRequest(relayPrompt, timestamp, 'input')
        setCommandStatus('done', 'qdc relay')
        return
      }

      addErrorEntryForCommand('Usage: /qdc [status|jobs|run <prompt>|package <path>|package-model <path>|ship <path> :: <task>|ship-model <path> :: <task>|relay <follow-up>]', timestamp)
      return
    }

    if (handleSessionCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      entries,
      apiBase: API_BASE,
      storageKey: STORAGE_KEY,
      setEntries,
      clearCircuitInputState: () => setCircuitInputState(null),
      addSystemEntry: addSystemEntryForCommand,
      addErrorEntry: addErrorEntryForCommand,
      setCommandStatus,
      markCommandPending,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    if (handleWebCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      apiBase: API_BASE,
      setEntries,
      addSystemEntry: addSystemEntryForCommand,
      addErrorEntry: addErrorEntryForCommand,
      handleAIRequest,
      setCommandStatus,
      markCommandPending,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    if (handleModelCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      backendUrl: BACKEND_URL,
      status,
      models,
      fetchModels,
      setActiveModel,
      setVisionModel,
      setImageGenModel,
      addSystemEntry: addSystemEntryForCommand,
      addErrorEntry: addErrorEntryForCommand,
      setCommandStatus,
      markCommandPending,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    if (handleImageModelCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      backendUrl: BACKEND_URL,
      connected,
      addSystemEntry: addSystemEntryForCommand,
      addErrorEntry: addErrorEntryForCommand,
      setCommandStatus,
      markCommandPending,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    if (handleModelBootstrapCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      backendUrl: BACKEND_URL,
      connected,
      activeModel: status.activeModel,
      imageGenModel: status.imageGenModel,
      pullModel,
      fetchModels,
      setActiveModel,
      setImageGenModel,
      addSystemEntry: addSystemEntryForCommand,
      addErrorEntry: addErrorEntryForCommand,
      setCommandStatus,
      markCommandPending,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    if (handlePullCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      backendUrl: BACKEND_URL,
      systemStatus: status,
      pullModel,
      fetchModels,
      setVisionModel,
      setImageGenModel,
      setDownloadProgress,
      setEntries,
      addSystemEntry: addSystemEntryForCommand,
      addErrorEntry: addErrorEntryForCommand,
      setCommandStatus,
      markCommandPending,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    if (handleImageCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      backendUrl: BACKEND_URL,
      systemStatus: status,
      setImageGenModel,
      setImageGeneration,
      addSystemEntry: addSystemEntryForCommand,
      setCommandStatus,
      markCommandPending,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    if (handleCircuitCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      templates: NOTEBOOK_TEMPLATES,
      getCircuitNames,
      loadSavedCircuits,
      saveCircuit,
      getRequiredInputs,
      runCircuit,
      setCircuitInputState,
      setEntries,
      addSystemEntry: addSystemEntryForCommand,
      addErrorEntry: addErrorEntryForCommand,
      setCommandStatus,
      markCommandPending,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    if (handleSimpleCommand({
      cmd: normalizedCmd,
      args,
      timestamp,
      connected,
      status,
      modelsCount: models.length,
      getCircuitCount: () => getCircuitNames().length,
      setMusicSetupPanelOpen,
      setMusicGeneration,
      handleAIRequest,
      addSystemEntry: addSystemEntryForCommand,
      addErrorEntry: addErrorEntryForCommand,
    })) {
      finalizeCommandIfSynchronous()
      return
    }

    addErrorEntryForCommand(`Unknown command: /${normalizedCmd}`, timestamp)
    setCommandStatus('failed', `unknown command: /${normalizedCmd}`)
  }, [
    addSystemEntry,
    addErrorEntry,
    handleAIRequest,
    fetchModels,
    connected,
    status,
    models,
    cloudModels,
    fetchQuickModelSuggestion,
    startQdcJobFromPrompt,
    createQdcPackage,
    packageAndRunQdc,
    getRequiredInputs,
    runCircuit,
    entries,
    setActiveModel,
    setVisionModel,
    setImageGenModel,
    pullModel,
    withFixHint,
    persistSessionMission,
    sessionMission,
  ])

  const handleRunCircuitFromMenu = useCallback((circuitName: string, content: string) => {
    // Check if we can run immediately (0 or 1 input) or need interactive mode
    // We assume the content of the message is the primary input
    const required = getRequiredInputs(circuitName)

    // If 0 inputs, run immediately
    if (required.length === 0) {
      // Manually add entry since addSystemEntry isn't easily accessible here if it's local
      // But we can use setEntries which is available
      setEntries(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: `Running circuit: ${circuitName}...`,
        timestamp: Date.now(),
      }])

      runCircuit(circuitName, {}).then(output => {
        setEntries(prev => [...prev, {
          id: `circuit-output-${Date.now()}`,
          type: 'ai',
          content: output,
          timestamp: Date.now(),
          status: 'success',
        }])
      }).catch(err => {
        setEntries(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'error',
          content: `Circuit failed: ${err.message}`,
          timestamp: Date.now(),
        }])
      })
      return
    }

    // If 1 input, use content as that input
    if (required.length === 1) {
      const inputName = required[0]
      setEntries(prev => [...prev, {
        id: `system-${Date.now()}`,
        type: 'system',
        content: `Running circuit: ${circuitName} with input [${inputName}]...`,
        timestamp: Date.now(),
      }])

      runCircuit(circuitName, { [inputName]: content }).then(output => {
        setEntries(prev => [...prev, {
          id: `circuit-output-${Date.now()}`,
          type: 'ai',
          content: output,
          timestamp: Date.now(),
          status: 'success',
        }])
      }).catch(err => {
        setEntries(prev => [...prev, {
          id: `error-${Date.now()}`,
          type: 'error',
          content: `Circuit failed: ${err.message}`,
          timestamp: Date.now(),
        }])
      })
      return
    }

    // Fallback: Use the slash command system to trigger the circuit
    handleSlashCommand(`/run ${circuitName}`, Date.now())

    // Copy content to clipboard for user convenience
    navigator.clipboard.writeText(content).catch(() => { })
    showInfoToast(`Running ${circuitName}... (Message copied to clipboard)`, 'Circuit')
  }, [handleSlashCommand, getRequiredInputs, runCircuit, setEntries])

  const handleCommand = useCallback((command: string, contextMode: 'input' | 'key' | 'full' = 'input') => {
    const timestamp = Date.now()
    setAutoFollowFeed(true)

    const userEntry: LogEntry = {
      id: `user-${timestamp}`,
      type: 'user',
      content: command,
      timestamp,
    }

    setEntries(prev => [...prev, userEntry])

    if (circuitInputState) {
      const { circuitName, requiredInputs, collectedInputs, currentInputIndex } = circuitInputState
      const currentLabel = requiredInputs[currentInputIndex]

      // Store this input
      const newCollectedInputs = { ...collectedInputs, [currentLabel]: command }

      if (currentInputIndex < requiredInputs.length - 1) {
        // More inputs needed
        const nextLabel = requiredInputs[currentInputIndex + 1]
        setCircuitInputState({
          ...circuitInputState,
          collectedInputs: newCollectedInputs,
          currentInputIndex: currentInputIndex + 1,
        })
        addSystemEntry(`[${nextLabel}]:`, timestamp)
      } else {
        // All inputs collected, run the circuit
        setCircuitInputState(null)
        addSystemEntry(`All inputs collected. Running ${circuitName}...`, timestamp)

        runCircuit(circuitName, newCollectedInputs).then(output => {
          setEntries(prev => [...prev, {
            id: `circuit-output-${Date.now()}`,
            type: 'ai',
            content: output,
            timestamp: Date.now(),
            status: 'success',
          }])
        }).catch(err => {
          addErrorEntry(`Circuit failed: ${err.message}`, Date.now())
        })
      }
      return
    }

    if (command.startsWith('/')) {
      handleSlashCommand(command, timestamp)
    } else {
      const trimmed = command.trim()
      const normalized = trimmed.toLowerCase()

      if (pendingAssistantAction) {
        const editPrefix = ASSIST_CONFIRM_EDIT_PREFIXES.find(prefix => normalized.startsWith(prefix))
        const isYes = ASSIST_CONFIRM_YES.has(normalized) || normalized.startsWith('yes ')
        const isNo = ASSIST_CONFIRM_NO.has(normalized) || normalized.startsWith('no ')
        if (isYes) {
          const action = pendingAssistantAction
          setPendingAssistantAction(null)

          if (action.type === 'image') {
            addSystemEntry(`🧩 Launching image node...\nPrompt: ${action.prompt}`, timestamp)
            generateImageFromPrompt(action.prompt)
            return
          }
          if (action.type === 'music') {
            addSystemEntry(`🧩 Launching music node...\nPrompt: ${action.prompt}`, timestamp)
            generateMusicFromPrompt(action.prompt)
            return
          }
          if (action.type === 'speech') {
            setAvatarPanelOpen(true)
            setAutoGenerateAudio(true)
            addSystemEntry('🗣 Speech mode is on. AI replies will be read aloud.', timestamp)
            const speechMatch = action.prompt.match(/[:\-]\s*(.+)$/)
            const speechText = speechMatch?.[1]?.trim()
            if (speechText) {
              speakTTSUnified(speechText)
            }
            return
          }
          if (action.type === 'quick_cloud') {
            addSystemEntry('⚡ Running in quick cloud lane...', timestamp)
            void fetchQuickModelSuggestion()
              .then(selected => {
                addSystemEntry(`⚡ Quick lane model: ${selected.model}\nReason: ${selected.reason}`, Date.now())
                handleAIRequest(action.prompt, Date.now(), 'input', selected.model)
              })
              .catch(() => {
                handleAIRequest(action.prompt, Date.now(), 'input')
              })
            return
          }
          if (action.type === 'qdc_job') {
            addSystemEntry('📡 Launching QDC remote job...', timestamp)
            void startQdcJobFromPrompt(action.prompt)
              .catch(err => {
                addErrorEntry(err instanceof Error ? err.message : String(err), Date.now())
              })
            return
          }
        }

        if (isNo) {
          setPendingAssistantAction(null)
          addSystemEntry('Canceled. Continuing with normal chat.', timestamp)
          return
        }

        if (editPrefix) {
          const updatedPrompt = trimmed.slice(editPrefix.length).trim()
          if (!updatedPrompt) {
            addErrorEntry('Usage while pending action: edit: <new prompt>', timestamp)
            return
          }
          const updatedAction: PendingAssistantAction = {
            ...pendingAssistantAction,
            prompt: updatedPrompt,
          }
          setPendingAssistantAction(updatedAction)
          addSystemEntry(
            `${updatedAction.note}\nUpdated prompt: ${updatedPrompt}\nReply "yes" to run, "no" to cancel.`,
            timestamp,
          )
          return
        }

        addSystemEntry('Reply with "yes", "no", or "edit: <new prompt>".', timestamp)
        return
      }

      const suggestedAction = detectAssistantAction(trimmed)
      if (suggestedAction) {
        setPendingAssistantAction(suggestedAction)
        addSystemEntry(
          `${suggestedAction.note}\nPrompt: ${suggestedAction.prompt || trimmed}\nReply "yes" to run, "edit: ..." to tweak, or "no" to keep chatting normally.`,
          timestamp,
        )
        return
      }

      handleAIRequest(command, timestamp, contextMode)
    }
  }, [
    handleSlashCommand,
    handleAIRequest,
    circuitInputState,
    addSystemEntry,
    addErrorEntry,
    runCircuit,
    pendingAssistantAction,
    generateImageFromPrompt,
    generateMusicFromPrompt,
    setAutoGenerateAudio,
    speakTTSUnified,
    fetchQuickModelSuggestion,
    startQdcJobFromPrompt,
  ])

  // Session panel handlers
  const handleLoadSession = useCallback((name: string) => {
    // Use async API that checks backend first
    loadSessionAsync(API_BASE, name).then(sessionEntries => {
      if (sessionEntries) {
        // Set current session to the loaded one
        setCurrentSessionName(name)
        try {
          localStorage.setItem('loom-current-session', name)
        } catch { }

        const timestamp = Date.now()
        setEntries([
          {
            id: `system-${timestamp}`,
            type: 'system',
            content: `Loaded: ${name} (${sessionEntries.length} entries)`,
            timestamp,
          },
          ...sessionEntries,
        ])
        setTimeout(() => emitSessionRitualBriefing(Date.now()), 0)
        showSuccessToast(`Loaded session "${name}".`, 'Session')
      } else {
        const timestamp = Date.now()
        setEntries(prev => [...prev, {
          id: `error-${timestamp}`,
          type: 'error',
          content: `Session "${name}" not found`,
          timestamp,
        }])
        showErrorToast(`Session "${name}" was not found.`, 'Session')
      }
    })
  }, [emitSessionRitualBriefing])

  const handleSaveSession = useCallback((name: string) => {
    // Filter out system initialization messages
    const filtered = entries.filter(e =>
      !(e.type === 'system' && (e.content.includes('INITIALIZED') || e.content.includes('BACKEND CONNECTED')))
    )

    // Use async API that saves to backend
    saveSessionAsync(API_BASE, name, filtered).then(success => {
      const timestamp = Date.now()
      if (success) {
        // Update current session name to the manually saved name
        setCurrentSessionName(name)
        try {
          localStorage.setItem('loom-current-session', name)
        } catch { }

        setEntries(prev => [...prev, {
          id: `system-${timestamp}`,
          type: 'system',
          content: `Session saved as "${name}" (${filtered.length} entries)`,
          timestamp,
        }])
        showSuccessToast(`Saved "${name}".`, 'Session')
      } else {
        setEntries(prev => [...prev, {
          id: `error-${timestamp}`,
          type: 'error',
          content: `Failed to save session "${name}"`,
          timestamp,
        }])
        showErrorToast(`Could not save "${name}".`, 'Session')
      }
    })
  }, [entries])

  const beginNewSession = useCallback(() => {
    // Clear current session - next autosave will create new auto-named session
    setCurrentSessionName(null)
    try {
      localStorage.removeItem('loom-current-session')
    } catch { }

    const timestamp = Date.now()
    setEntries([{
      id: `system-${timestamp}`,
      type: 'system',
      content: 'NEW SESSION STARTED',
      timestamp,
    }, {
      id: `system-${timestamp + 1}`,
      type: 'system',
      content: 'Type /help for available commands.',
      timestamp: timestamp + 1,
    }])
    setTimeout(() => emitSessionRitualBriefing(Date.now()), 0)
    showInfoToast('Started a new session.', 'Session')
  }, [emitSessionRitualBriefing])

  const handleNewSession = useCallback(() => {
    const hasWork = entries.some(e => e.type === 'user' || e.type === 'ai' || e.type === 'image' || e.type === 'audio')
    if (hasWork) {
      setNewSessionConfirmOpen(true)
      return
    }
    beginNewSession()
  }, [entries, beginNewSession])

  const handleDeleteSession = useCallback((name: string) => {
    setDeleteSessionTarget(name)
  }, [])

  const confirmDeleteSession = useCallback(() => {
    if (!deleteSessionTarget) return
    const target = deleteSessionTarget
    setDeleteSessionTarget(null)

    deleteSessionAsync(API_BASE, target).then(success => {
      const timestamp = Date.now()
      if (success) {
        setEntries(prev => [...prev, {
          id: `system-${timestamp}`,
          type: 'system',
          content: `Session "${target}" deleted`,
          timestamp,
        }])
        showSuccessToast(`Deleted "${target}".`, 'Session')
      } else {
        showErrorToast(`Failed to delete "${target}".`, 'Session')
      }
    })
  }, [deleteSessionTarget])

  // Handle image upload and analysis
  const handleImageUpload = useCallback(async (imageBase64: string) => {
    const imageUrl = imageBase64 // Store for display
    pendingImageUrlRef.current = imageUrl // Store for retry after model install

    // Set analyzing state
    setImageAnalysis({
      imageUrl,
      analysis: '',
      model: 'auto-detecting',
      status: 'analyzing',
    })

    try {
      const response = await fetch(`${BACKEND_URL}/api/images/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: imageBase64,
          prompt: "Describe this image in detail. What do you see? List the key elements, objects, text, colors, composition, and any notable features. Be specific and thorough.",
          model: status.visionModel || undefined, // Use vision model if set, otherwise auto-detect
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }))
        throw new Error(errorData.detail || errorData.error || `Analysis failed: ${response.statusText}`)
      }

      const data = await response.json()

      if (data.success) {
        const usedModel = data.model || 'auto-detected'
        setImageAnalysis({
          imageUrl,
          analysis: data.analysis,
          model: usedModel,
          status: 'success',
          availableVisionModels: data.available_vision_models || [],
        })

        // Update vision model in status if it was auto-detected or explicitly set
        if (usedModel !== 'auto-detected' && !status.visionModel) {
          setVisionModel(usedModel)
        } else if (usedModel !== 'auto-detected') {
          setVisionModel(usedModel)
        }

        // Also add to terminal as a log entry
        const timestamp = Date.now()
        setEntries(prev => [...prev, {
          id: `image-analysis-${timestamp}`,
          type: 'system',
          content: `Image analyzed: ${data.analysis.substring(0, 100)}...`,
          timestamp,
        }])
      } else if (data.status === 'no-model') {
        // No vision model available - show recommendations
        setImageAnalysis({
          imageUrl,
          analysis: '',
          model: '',
          status: 'no-model',
          error: data.error,
          availableVisionModels: data.available_vision_models || [],
          recommendedModels: data.recommended_models || [],
        })
      } else {
        throw new Error(data.detail || data.error || 'Analysis failed')
      }
    } catch (error) {
      let errorMessage = 'Failed to analyze image'
      if (error instanceof Error) {
        errorMessage = error.message
        // Check if it's a response error with detail
        if (error.message.includes('detail')) {
          try {
            const match = error.message.match(/detail[:\s]+(.+)/i)
            if (match) errorMessage = match[1]
          } catch { }
        }
      }

      setImageAnalysis({
        imageUrl,
        analysis: '',
        model: '',
        status: 'error',
        error: errorMessage,
      })
    }
  }, [])

  const formatTimestamp = (ts: number) => {
    const date = new Date(ts)
    return date.toISOString().slice(0, 19).replace('T', ' ')
  }

  const hasConversationHistory = useMemo(
    () => entries.some(entry => entry.type === 'user' || entry.type === 'ai' || entry.type === 'image' || entry.type === 'audio'),
    [entries],
  )

  const connectedCloudProviders = useMemo(() => {
    const providers = new Set(cloudModels.map(model => model.provider).filter(Boolean))
    return [...providers]
  }, [cloudModels])

  const cloudModelProviderById = useMemo(() => {
    const map = new Map<string, string>()
    for (const model of cloudModels) {
      if (!model.id) continue
      map.set(model.id.toLowerCase(), String(model.provider || 'cloud').toUpperCase())
    }
    return map
  }, [cloudModels])

  const chatModels = useMemo(() => models.filter(isLikelyChatModel), [models])

  const availableHistoryModels = useMemo(() => {
    const uniqueModels = new Set<string>()
    for (const entry of entries) {
      const modelName = typeof entry.metadata?.model === 'string' ? entry.metadata.model : ''
      if (modelName) uniqueModels.add(modelName)
    }
    return [...uniqueModels].sort((a, b) => a.localeCompare(b))
  }, [entries])

  const onboardingChecklist = useMemo(() => {
    const hasLocalChatModel = chatModels.length > 0
    const hasProviderConnection = connectedCloudProviders.length > 0
    const hasIndexedCodeContext = Boolean(codeContextActive && codeContextFolder && codeContextFilesIndexed > 0)

    return [
      {
        id: 'models',
        label: 'Chat model ready',
        complete: hasLocalChatModel,
        actionLabel: 'Setup stack',
        action: () => handleCommand('/setup-models', 'input'),
      },
      {
        id: 'providers',
        label: 'Provider connected',
        complete: hasProviderConnection,
        actionLabel: 'Configure',
        action: () => setShowProviderSetup(true),
      },
      {
        id: 'code-context',
        label: 'Code context indexed',
        complete: hasIndexedCodeContext,
        actionLabel: 'Index folder',
        action: () => setCodeContextPanelOpen(true),
      },
    ] as const
  }, [chatModels.length, connectedCloudProviders.length, codeContextActive, codeContextFolder, codeContextFilesIndexed, handleCommand])

  const onboardingCompleteCount = useMemo(
    () => onboardingChecklist.filter(item => item.complete).length,
    [onboardingChecklist],
  )
  const showOnboardingChecklist = !hasConversationHistory || onboardingCompleteCount < onboardingChecklist.length
  const effectiveDownloadProgress = downloadProgress || ambientDownloadProgress

  const idleTelemetryTokens = useMemo(() => {
    const userCount = entries.reduce((count, entry) => count + (entry.type === 'user' ? 1 : 0), 0)
    const aiCount = entries.reduce((count, entry) => count + (entry.type === 'ai' ? 1 : 0), 0)
    const currentRate = Math.max(0, Math.round(aiRuntimeTelemetry.charsPerSec || 0))
    const ramUsedPercent = typeof status.ramUsedPercent === 'number' ? Math.round(status.ramUsedPercent) : null
    const freeRam = typeof status.ramAvailableGb === 'number' ? status.ramAvailableGb.toFixed(1) : null
    const modelFootprint = typeof status.ramModelUsedGb === 'number' && status.ramModelUsedGb > 0
      ? status.ramModelUsedGb.toFixed(1)
      : null
    const recentModels = entries
      .slice()
      .reverse()
      .map(entry => (typeof entry.metadata?.model === 'string' ? entry.metadata.model : ''))
      .filter(Boolean)
      .filter((modelName, index, list) => list.indexOf(modelName) === index)
      .slice(0, 4)

    const baseTokens = [
      `SOCKET:${connected ? 'UP' : 'DOWN'}`,
      `OLLAMA:${status.connected ? 'READY' : 'STANDBY'}`,
      `MODEL:${status.loadedModelName || status.activeModel || 'AUTO'}`,
      `PHASE:${aiRuntimeTelemetry.phase || 'IDLE'}`,
      `RATE:${currentRate}CPS`,
      `RAM:${ramUsedPercent !== null ? `${ramUsedPercent}PCT` : 'UNK'}`,
      `FREE:${freeRam !== null ? `${freeRam}GB` : 'UNK'}`,
      `MODMEM:${modelFootprint !== null ? `${modelFootprint}GB` : 'NA'}`,
      `CTX:${codeContextActive ? 'ON' : 'OFF'}`,
      `IDX:${codeContextFilesIndexed}`,
      `ENTRIES:${entries.length}`,
      `USR:${userCount}`,
      `AI:${aiCount}`,
      `CRT:${loadSettings().crtIntensity.toUpperCase()}`,
    ]
    if (effectiveDownloadProgress) {
      const pullPct = typeof effectiveDownloadProgress.percent === 'number'
        ? Math.round(effectiveDownloadProgress.percent)
        : null
      baseTokens.push(`PULL:${effectiveDownloadProgress.model}`)
      baseTokens.push(`PULLST:${String(effectiveDownloadProgress.status || 'running').toUpperCase()}`)
      if ('scope' in effectiveDownloadProgress && typeof effectiveDownloadProgress.scope === 'string') {
        baseTokens.push(`PULLSRC:${effectiveDownloadProgress.scope.toUpperCase()}`)
      }
      if (pullPct !== null) {
        baseTokens.push(`PULLPCT:${pullPct}`)
      }
      if (typeof effectiveDownloadProgress.speedBps === 'number' && effectiveDownloadProgress.speedBps > 0) {
        const speedMb = (effectiveDownloadProgress.speedBps / (1024 * 1024)).toFixed(1)
        baseTokens.push(`PULLSPD:${speedMb}MBPS`)
      }
      if (
        typeof effectiveDownloadProgress.filesCompleted === 'number'
        && typeof effectiveDownloadProgress.filesTotal === 'number'
        && effectiveDownloadProgress.filesTotal > 0
      ) {
        baseTokens.push(`PULLFILES:${effectiveDownloadProgress.filesCompleted}/${effectiveDownloadProgress.filesTotal}`)
      }
    }
    if (imageGeneration?.status === 'generating') {
      baseTokens.push(`IMG:RUN`)
    }
    if (musicGeneration?.status === 'generating') {
      baseTokens.push(`MUSIC:RUN`)
    }
    const modelTokens = recentModels.map(modelName => `RECENT:${modelName}`)

    return [...new Set([...telemetryDeltaTokens, ...baseTokens, ...modelTokens])]
      .map(sanitizeTelemetryToken)
      .filter(Boolean)
      .slice(0, 24)
  }, [
    telemetryDeltaTokens,
    entries,
    connected,
    status.loadedModelName,
    status.activeModel,
    aiRuntimeTelemetry.phase,
    aiRuntimeTelemetry.charsPerSec,
    status.connected,
    status.ramUsedPercent,
    status.ramAvailableGb,
    status.ramModelUsedGb,
    codeContextActive,
    codeContextFilesIndexed,
    effectiveDownloadProgress,
    imageGeneration?.status,
    musicGeneration?.status,
  ])

  useEffect(() => {
    pushTelemetryDelta(`D_SOCKET:${connected ? 'UP' : 'DOWN'}`)
  }, [connected, pushTelemetryDelta])

  useEffect(() => {
    pushTelemetryDelta(`D_OLLAMA:${status.connected ? 'READY' : 'STANDBY'}`)
  }, [status.connected, pushTelemetryDelta])

  useEffect(() => {
    const modelName = (status.loadedModelName || status.activeModel || '').trim()
    if (!modelName || modelName === lastTelemetryModelRef.current) return
    lastTelemetryModelRef.current = modelName
    pushTelemetryDelta(`D_MODEL:${modelName}`)

    const provider = cloudModelProviderById.get(modelName.toLowerCase())
    const route = provider ? `CLOUD_${provider}` : 'LOCAL'
    if (route !== lastTelemetryRouteRef.current) {
      lastTelemetryRouteRef.current = route
      pushTelemetryDelta(`D_ROUTE:${route}`)
    }
  }, [status.loadedModelName, status.activeModel, cloudModelProviderById, pushTelemetryDelta])

  useEffect(() => {
    const phase = (aiRuntimeTelemetry.phase || 'IDLE').trim()
    if (!phase || phase === lastTelemetryPhaseRef.current) return
    lastTelemetryPhaseRef.current = phase
    pushTelemetryDelta(`D_PHASE:${phase}`)
  }, [aiRuntimeTelemetry.phase, pushTelemetryDelta])

  useEffect(() => {
    const rate = aiRuntimeTelemetry.charsPerSec || 0
    const nextBucket = rate >= 180 ? 'FAST' : rate >= 70 ? 'MED' : rate > 0 ? 'LOW' : 'ZERO'
    if (nextBucket === lastTelemetryRateBucketRef.current) return
    lastTelemetryRateBucketRef.current = nextBucket
    pushTelemetryDelta(`D_RATE:${nextBucket}`)
  }, [aiRuntimeTelemetry.charsPerSec, pushTelemetryDelta])

  const commandRuntimeTelemetry = useMemo(() => ({
    ...aiRuntimeTelemetry,
    transportConnected: connected,
    engineReady: status.connected,
    modelName: status.loadedModelName || status.activeModel,
    ramUsedPercent: status.ramUsedPercent,
  }), [
    aiRuntimeTelemetry,
    connected,
    status.connected,
    status.loadedModelName,
    status.activeModel,
    status.ramUsedPercent,
  ])

  const matrixTelemetryMode = useMemo<'off' | 'idle' | 'active'>(() => {
    const imageBusy = imageGeneration?.status === 'generating'
    const musicBusy = musicGeneration?.status === 'generating'
    const anyBusy = aiRuntimeTelemetry.active || codeContextIndexing || imageBusy || musicBusy || !!effectiveDownloadProgress
    if (!connected) return 'off'
    return anyBusy ? 'active' : 'idle'
  }, [
    connected,
    aiRuntimeTelemetry.active,
    codeContextIndexing,
    imageGeneration?.status,
    musicGeneration?.status,
    effectiveDownloadProgress,
  ])

  const toggleHistoryType = useCallback((entryType: LogEntry['type']) => {
    setHistoryTypeFilters(prev =>
      prev.includes(entryType) ? prev.filter(type => type !== entryType) : [...prev, entryType],
    )
  }, [])

  const toggleHistoryModel = useCallback((modelName: string) => {
    setHistoryModelFilters(prev =>
      prev.includes(modelName) ? prev.filter(name => name !== modelName) : [...prev, modelName],
    )
  }, [])

  const filteredEntries = useMemo(() => {
    const query = historyQuery.trim().toLowerCase()
    const now = Date.now()
    const selectedWindow = HISTORY_WINDOW_OPTIONS.find(option => option.value === historyWindow)
    const cutoff = selectedWindow?.ms ? now - selectedWindow.ms : null
    const typeFilterSet = new Set(historyTypeFilters)
    const modelFilterSet = new Set(historyModelFilters)

    return entries.filter(entry => {
      if (cutoff && entry.timestamp < cutoff) return false
      if (typeFilterSet.size > 0 && !typeFilterSet.has(entry.type)) return false
      if (modelFilterSet.size > 0) {
        const modelName = typeof entry.metadata?.model === 'string' ? entry.metadata.model : ''
        if (!modelName || !modelFilterSet.has(modelName)) return false
      }
      if (!query) return true

      const blob = `${entry.content}\n${entry.imageAnalysis || ''}`.toLowerCase()
      return blob.includes(query)
    })
  }, [entries, historyModelFilters, historyQuery, historyTypeFilters, historyWindow])
  const hasActiveHistoryFilters = Boolean(
    historyQuery
    || historyWindow !== 'all'
    || historyTypeFilters.length > 0
    || historyModelFilters.length > 0,
  )

  const displayItems = useMemo<FeedDisplayItem[]>(
    () => filteredEntries.map(entry => ({ key: entry.id, entry })),
    [filteredEntries],
  )

  // Estimated-height virtualization introduced visible scroll jumps with mixed entry heights.
  // Keep full rendering for stable, predictable scroll behavior.
  const shouldVirtualize = false
  const totalRows = displayItems.length
  const visibleRows = Math.max(1, Math.ceil((feedViewportHeight || 1) / VIRTUAL_ROW_ESTIMATE_PX))
  const virtualStart = shouldVirtualize
    ? Math.floor(feedScrollTop / VIRTUAL_ROW_ESTIMATE_PX) - VIRTUAL_OVERSCAN_ROWS
    : 0
  const virtualEnd = shouldVirtualize
    ? Math.min(totalRows, virtualStart + visibleRows + (VIRTUAL_OVERSCAN_ROWS * 2))
    : totalRows
  const topSpacerHeight = shouldVirtualize ? virtualStart * VIRTUAL_ROW_ESTIMATE_PX : 0
  const bottomSpacerHeight = shouldVirtualize ? Math.max(0, (totalRows - virtualEnd) * VIRTUAL_ROW_ESTIMATE_PX) : 0
  const visibleItems = shouldVirtualize ? displayItems.slice(virtualStart, virtualEnd) : displayItems

  const handleImageClick = useCallback((imageUrl: string, metadata: { prompt?: string; model?: string; timestamp?: number; provider?: string; analysis?: string; }, canEdit?: boolean) => {
    setSelectedImageModal({ imageUrl, metadata, canEdit })
  }, [])

  const handleRerunWithModel = useCallback((entry: LogEntry, modelName: string) => {
    const metadata = entry.metadata && typeof entry.metadata === 'object'
      ? entry.metadata as Record<string, unknown>
      : null

    let sourcePrompt = typeof metadata?.sourcePrompt === 'string'
      ? metadata.sourcePrompt.trim()
      : ''

    if (!sourcePrompt) {
      const index = entries.findIndex(candidate => candidate.id === entry.id)
      for (let i = index - 1; i >= 0; i--) {
        if (entries[i].type === 'user' && entries[i].content.trim()) {
          sourcePrompt = entries[i].content.trim()
          break
        }
      }
    }

    if (!sourcePrompt) {
      showErrorToast('Could not find the original prompt for this response.', 'Re-run')
      return
    }

    const rawMode = typeof metadata?.contextMode === 'string' ? metadata.contextMode : 'full'
    const contextMode: 'input' | 'key' | 'full' =
      rawMode === 'input' || rawMode === 'key' || rawMode === 'full'
        ? rawMode
        : 'full'

    setAutoFollowFeed(true)
    handleAIRequest(sourcePrompt, Date.now(), contextMode, modelName)
    showInfoToast(`Re-running with ${modelName}.`, 'Compare Models', 1200)
  }, [entries, handleAIRequest])

  const handleAgentFeedback = useCallback((entry: LogEntry, kind: AgentFeedbackKind) => {
    const nextProfile: AgentFeedbackProfile = {
      ...agentFeedbackProfile,
      [kind]: agentFeedbackProfile[kind] + 1,
      updatedAt: Date.now(),
    }
    setAgentFeedbackProfile(nextProfile)

    const feedbackLabels: Record<AgentFeedbackKind, string> = {
      verbose: 'Too verbose',
      vague: 'Too vague',
      robotic: 'Too robotic',
      perfect: 'Perfect tone',
    }
    addSystemEntry(`[FEEDBACK] ${feedbackLabels[kind]} captured for model ${(entry.metadata?.model as string | undefined) || 'unknown'}.`, Date.now())

    if (kind !== 'perfect') {
      upsertMaintenanceTask({
        title: `Tone quality: ${feedbackLabels[kind]}`,
        detail: `Recent assistant message flagged as "${feedbackLabels[kind]}". Tighten response shaping and self-check.`,
        severity: kind === 'vague' ? 'high' : 'medium',
        source: 'feedback',
      })
      setMaintenanceQueue(loadMaintenanceQueue())
    }
  }, [addSystemEntry, agentFeedbackProfile])

  const handleConversationStarter = useCallback((prompt: string) => {
    const starterPrompt = prompt.trim()
    if (!starterPrompt) return

    const timestamp = Date.now()
    setAutoFollowFeed(true)
    setPendingAssistantAction(null)
    setHistoryQuery('')
    setHistoryWindow('all')
    setHistoryTypeFilters([])
    setHistoryModelFilters([])

    setEntries(prev => [...prev, {
      id: `user-${timestamp}`,
      type: 'user',
      content: starterPrompt,
      timestamp,
    }])

    handleAIRequest(starterPrompt, timestamp, 'full')
  }, [handleAIRequest])

  return (
    <div className="h-full flex relative">
      {/* Floating Toolbar */}
      <FloatingToolbar
        onImageGenClick={() => {
          // Populate /dream in chat input and focus it
          if (commandInputEditorRef.current) {
            const editor = commandInputEditorRef.current
            editor.commands.setContent('/dream ')
            // Focus the editor
            setTimeout(() => {
              editor.commands.focus('end')
            }, 50)
          }

          // Open image generation panel with empty state
          if (!imageGeneration) {
            setImageGeneration({
              prompt: '',
              model: status.imageGenModel || 'auto-detecting',
              status: 'empty',
              availableModels: [],
            })
          }
        }}
        onFolderContextClick={() => setCodeContextPanelOpen(!codeContextPanelOpen)}
        onAvatarClick={() => setAvatarPanelOpen(true)}
        imageGenActive={!!imageGeneration}
        folderContextActive={codeContextActive}
        avatarActive={avatarPanelOpen}
      />

      {/* Session Panel */}
      <SessionPanel
        isCollapsed={panelCollapsed}
        onToggleCollapse={() => setPanelCollapsed(prev => !prev)}
        onLoadSession={handleLoadSession}
        onSaveSession={() => setShowSaveModal(true)}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        currentEntryCount={entries.length}
        currentSessionName={currentSessionName}
      />

      {/* Main Terminal Area */}
      <div className={`relative flex-1 flex flex-col transition-all duration-200 ${(imageGeneration || musicGeneration || avatarPanelOpen) ? 'mr-0 xl:mr-96' : ''}`}>
        <IdleTelemetryMatrix mode={matrixTelemetryMode} tokens={idleTelemetryTokens} deltaTokens={telemetryDeltaTokens} />
        <AmbientTransferHud progress={effectiveDownloadProgress} />

        {/* Terminal Feed */}
        <div
          ref={feedRef}
          onScroll={handleFeedScroll}
          className="relative z-10 flex-1 overflow-y-auto p-4"
          aria-live="polite"
        >
          <div className="relative z-10 terminal-reading-lane space-y-3 pb-10">
            <div className="sticky top-0 z-20 border border-terminal-border bg-void/90 backdrop-blur px-3 py-2 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] text-terminal-muted tracking-widest">
                  Timeline: {filteredEntries.length} / {entries.length}
                </div>
                <button
                  type="button"
                  onClick={() => setHistoryFiltersOpen(prev => !prev)}
                  className="text-[10px] px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                >
                  {historyFiltersOpen ? 'Hide Filters' : hasActiveHistoryFilters ? 'Filters *' : 'Filters'}
                </button>
              </div>
              {historyFiltersOpen && (
                <div className="space-y-2 border-t border-terminal-border/60 pt-2">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={historyQuery}
                      onChange={(event) => setHistoryQuery(event.target.value)}
                      placeholder="Search terminal history..."
                      className="flex-1 bg-void border border-terminal-border px-2 py-1.5 text-xs text-phosphor focus:outline-none focus:border-phosphor"
                    />
                    <select
                      value={historyWindow}
                      onChange={(event) => setHistoryWindow(event.target.value as HistoryWindow)}
                      className="bg-void border border-terminal-border px-2 py-1.5 text-xs text-phosphor focus:outline-none focus:border-phosphor"
                      aria-label="Filter by time window"
                    >
                      {HISTORY_WINDOW_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {FILTERABLE_ENTRY_TYPES.map(type => {
                      const active = historyTypeFilters.includes(type)
                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => toggleHistoryType(type)}
                          className={`px-2 py-1 text-[10px] border transition-colors ${active
                            ? 'border-phosphor bg-phosphor/15 text-phosphor'
                            : 'border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor'
                            }`}
                        >
                          {type.toUpperCase()}
                        </button>
                      )
                    })}
                  </div>
                  {availableHistoryModels.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-[10px] text-terminal-muted tracking-widest">Models</div>
                      <div className="flex flex-wrap gap-1">
                        {availableHistoryModels.map(modelName => {
                          const active = historyModelFilters.includes(modelName)
                          return (
                            <button
                              key={modelName}
                              type="button"
                              onClick={() => toggleHistoryModel(modelName)}
                              className={`px-2 py-1 text-[10px] border transition-colors ${active
                                ? 'border-phosphor bg-phosphor/15 text-phosphor'
                                : 'border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor'
                                }`}
                              title={modelName}
                            >
                              {modelName.replace(':latest', '')}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  {historyTypeFilters.length > 0 || historyModelFilters.length > 0 || historyQuery || historyWindow !== 'all' ? (
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setHistoryQuery('')
                          setHistoryWindow('all')
                          setHistoryTypeFilters([])
                          setHistoryModelFilters([])
                        }}
                        className="px-2 py-1 text-[10px] border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                      >
                        Clear
                      </button>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {showOnboardingChecklist && (
              <div className="border border-phosphor/40 bg-phosphor/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] tracking-widest text-phosphor">ONBOARDING CHECKLIST</div>
                  <div className="text-[10px] text-terminal-muted">{onboardingCompleteCount}/{onboardingChecklist.length} complete</div>
                </div>
                <div className="space-y-1.5">
                  {onboardingChecklist.map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className={item.complete ? 'text-phosphor' : 'text-terminal-muted'}>
                          {item.complete ? '●' : '○'}
                        </span>
                        <span className={item.complete ? 'text-phosphor' : 'text-terminal-muted'}>
                          {item.label}
                        </span>
                      </div>
                      {!item.complete && (
                        <button
                          type="button"
                          onClick={item.action}
                          className="text-[10px] px-2 py-1 border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                        >
                          {item.actionLabel}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!hasConversationHistory && (
              <div className="border border-terminal-border bg-void/40 p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] tracking-widest text-phosphor">CONVERSATION STARTERS</div>
                  <div className="text-[10px] text-terminal-muted">Click one to begin</div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                  {CONVERSATION_STARTERS.map(starter => (
                    <button
                      key={starter.id}
                      type="button"
                      onClick={() => handleConversationStarter(starter.prompt)}
                      className="text-left border border-terminal-border bg-void/70 px-3 py-2 hover:border-phosphor hover:text-phosphor transition-colors"
                    >
                      <div className="text-[11px] font-bold tracking-wide text-phosphor">{starter.title}</div>
                      <div className="text-[9px] uppercase tracking-wider text-terminal-muted mt-0.5">{starter.capability}</div>
                      <div className="text-[10px] text-terminal-muted mt-1 line-clamp-3">{starter.prompt}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {topSpacerHeight > 0 && (
              <div style={{ height: `${topSpacerHeight}px` }} aria-hidden />
            )}
            {visibleItems.map((item, index) => (
              <LogEntryBlock
                key={item.key}
                entry={item.entry}
                rowIndex={virtualStart + index}
                formatTimestamp={formatTimestamp}
                availableChatModels={models}
                onRerunWithModel={handleRerunWithModel}
                onAgentFeedback={handleAgentFeedback}
                onImageClick={handleImageClick}
                onRunCommand={(cmd) => handleSlashCommand(cmd, Date.now())}
                circuitNames={circuitNames}
                onRunCircuit={handleRunCircuitFromMenu}
              />
            ))}
            {bottomSpacerHeight > 0 && (
              <div style={{ height: `${bottomSpacerHeight}px` }} aria-hidden />
            )}
            {filteredEntries.length === 0 && (
              <div className="border border-terminal-border bg-void/30 p-4 text-center">
                <div className="text-[10px] tracking-widest text-terminal-muted">NO RESULTS</div>
                <div className="text-xs text-terminal-muted mt-1">Adjust filters or clear the search query.</div>
              </div>
            )}
          </div>
        </div>

        {/* Command Input */}
        <div className="relative z-10 border-t border-terminal-border px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="terminal-reading-lane">
            <CommandInput
              onSubmit={handleCommand}
              placeholder={circuitInputState
                ? `[${circuitInputState.circuitName}] Enter ${circuitInputState.requiredInputs[circuitInputState.currentInputIndex]} (or /cancel)...`
                : undefined
              }
              onImageUpload={handleImageUpload}
              onEditorReady={(editor) => {
                commandInputEditorRef.current = editor
              }}
              codeContextActive={codeContextActive}
              runtimeTelemetry={commandRuntimeTelemetry}
            />
          </div>
        </div>
      </div>

      {/* Circuit Execution Trace */}
      {circuitExecution && <CircuitTrace />}

      {/* Download Panel */}
      {downloadProgress && (
        <DownloadPanel
          progress={downloadProgress}
          onClose={() => setDownloadProgress(null)}
        />
      )}

      {/* Avatar & Voice Panel */}
      {avatarPanelOpen && (
        <AvatarPanel
          onClose={() => setAvatarPanelOpen(false)}
          config={avatarConfig}
          onConfigChange={setAvatarConfig}
          audio={avatarAudio}
          speaking={isSpeaking}
          listening={isMicRecording}
          onSpeak={speakTTSUnified}
          onStop={stopTTSUnified}
          autoGenerateAudio={autoGenerateAudio}
          onAutoGenerateAudioChange={setAutoGenerateAudio}
          ttsModelType={ttsModelType}
          onTTSModelTypeChange={setTTSModelType}
          orpheusParams={orpheusParams}
          onOrpheusParamsChange={setOrpheusParams}
          aiEntries={entries}
          selectedEntryId={selectedAiEntryId}
          onSelectEntry={setSelectedAiEntryId}
          cachedAudioBlob={selectedAiEntryId ? audioCacheByEntryId[selectedAiEntryId] : undefined}
          generatingEntryId={generatingEntryId}
          isOrpheusGenerating={isOrpheusGenerating}
          onGenerateForSelected={ttsModelType === 'orpheus' ? (() => {
            const id = selectedAiEntryId
            const text = entries.find(e => e.id === id)?.content?.trim()
            if (!id || !text) return
            setGeneratingEntryId(id)
            generateOrpheus(text).then(blob => {
              setAudioCacheByEntryId(prev => ({ ...prev, [id]: blob }))
              saveTTSBlobToBackend(id, blob)
              setGeneratingEntryId(null)
              playOrpheusBlob(blob)
            }).catch(() => setGeneratingEntryId(null))
          }) : undefined}
          onPlayCached={selectedAiEntryId && audioCacheByEntryId[selectedAiEntryId] ? () => playOrpheusBlob(audioCacheByEntryId[selectedAiEntryId]) : undefined}
          voices={voices}
          selectedVoice={selectedVoice}
          onVoiceChange={setSelectedVoice}
          rate={rate}
          onRateChange={setRate}
          pitch={pitch}
          onPitchChange={setPitch}
          volume={volume}
          onVolumeChange={setVolume}
          audioSensitivityOverride={audioSensitivityOverride}
          onAudioSensitivityOverrideChange={setAudioSensitivityOverride}
          soundVisualParams={soundVisualParams}
          onSoundVisualParamsChange={setSoundVisualParams}
          onOpenVoiceChat={() => setVoiceChatModalOpen(true)}
          pixelate={true}
        />
      )}

      {/* Voice Chat Modal (talk back and forth) */}
      <VoiceChatModal
        isOpen={voiceChatModalOpen}
        onClose={() => setVoiceChatModalOpen(false)}
        config={avatarConfig}
        audio={avatarAudio}
        speaking={isSpeaking}
        listening={isMicRecording}
        onStartRecording={() => {
          voiceChatRecordingRef.current = true
          startRecording()
        }}
        onStopRecording={stopRecording}
        isMicActive={isMicRecording}
        lastUserSaid={lastUserSaid}
        lastAiSaid={lastAiSaid}
        waitingForAi={voiceChatWaitingForAi}
        audioSensitivityOverride={audioSensitivityOverride}
        soundVisualParams={soundVisualParams}
        pixelate={true}
      />

      {/* Image Analysis Panel */}
      {imageAnalysis && (
        <ImageAnalysisPanel
          analysis={imageAnalysis}
          onClose={() => setImageAnalysis(null)}
          allModels={models}
          onRetryAnalysis={(imageUrl, modelName) => {
            // Retry analysis with different model
            setImageAnalysis({
              imageUrl,
              analysis: '',
              model: modelName,
              status: 'analyzing',
            })

            // Re-analyze with the selected model
            fetch(`${BACKEND_URL}/api/images/analyze`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                image_base64: imageUrl,
                prompt: "Describe this image in detail. What do you see? List the key elements, objects, text, colors, composition, and any notable features. Be specific and thorough.",
                model: modelName,
              }),
            })
              .then(res => res.json())
              .then(data => {
                if (data.success) {
                  const usedModel = data.model || modelName
                  setImageAnalysis({
                    imageUrl,
                    analysis: data.analysis,
                    model: usedModel,
                    status: 'success',
                    availableVisionModels: data.available_vision_models || [],
                  })
                  // Update vision model in status
                  setVisionModel(usedModel)
                } else {
                  throw new Error(data.detail || data.error || 'Analysis failed')
                }
              })
              .catch(error => {
                setImageAnalysis({
                  imageUrl,
                  analysis: '',
                  model: modelName,
                  status: 'error',
                  error: error instanceof Error ? error.message : 'Failed to analyze image',
                })
              })
          }}
          onApproveToChat={(imageUrl, analysis) => {
            // Add image entry to chat
            const timestamp = Date.now()
            setEntries(prev => [...prev, {
              id: `image-${timestamp}`,
              type: 'image',
              content: 'Image added to chat context',
              timestamp,
              imageUrl,
              imageAnalysis: analysis,
            }])
          }}
          onPullModel={(modelName) => {
            // Start download
            pullModel(modelName, (progress: PullStatus) => {
              const status = progress.status || 'unknown'
              const completed = progress.completed || 0
              const total = progress.total || 0

              setDownloadProgress({
                model: modelName,
                status: status,
                completed: completed,
                total: total,
                percent: progress.percent,
                message: progress.message,
                error: progress.error,
                speedBps: progress.speed_bps,
                etaSeconds: progress.eta_seconds,
                fileName: progress.file_name,
                filesCompleted: progress.files_completed,
                filesTotal: progress.files_total,
              })

              // On success, refresh models and retry analysis
              if (status === 'success') {
                fetchModels().then(() => {
                  // Set as vision model if it's a vision model
                  const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']
                  const isVisionModel = visionKeywords.some(keyword =>
                    modelName.toLowerCase().includes(keyword)
                  )
                  if (isVisionModel) {
                    setVisionModel(modelName)
                  }
                })
                // Retry image analysis after a short delay
                setTimeout(() => {
                  const pendingImage = pendingImageUrlRef.current
                  if (pendingImage) {
                    // Create a new analysis request
                    handleImageUpload(pendingImage)
                  }
                }, 2000)
              }
            })
          }}
          downloadProgress={downloadProgress}
        />
      )}

      {/* Image Generation Panel */}
      {imageGeneration && (
        <ImageGenerationPanel
          generation={imageGeneration}
          onClose={() => setImageGeneration(null)}
          onEditImage={(imageUrl, editPrompt) => {
            // Perform image-to-image editing
            if (!imageGeneration) return

            setImageGeneration({
              prompt: editPrompt,
              model: imageGeneration.model || status.imageGenModel || 'auto-detecting',
              status: 'generating',
              progress: 0,
            })

            // Call backend with input_image for img2img
            fetch(`${BACKEND_URL}/api/images/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: editPrompt,
                provider: 'ollama',
                model: imageGeneration.model || status.imageGenModel || undefined,
                input_image: imageUrl, // Pass the original image for editing
              }),
            })
              .then(async res => {
                const data = await res.json()
                if (res.ok && data.status === 'success' && data.image) {
                  setImageGeneration({
                    prompt: editPrompt,
                    imageUrl: data.image,
                    model: data.model || imageGeneration.model || 'Ollama',
                    status: 'success',
                  })
                } else {
                  throw new Error(data.error || data.message || 'Image editing failed')
                }
              })
              .catch((err) => {
                setImageGeneration({
                  prompt: editPrompt,
                  model: imageGeneration.model || 'unknown',
                  status: 'error',
                  error: err instanceof Error ? err.message : String(err),
                })
              })
          }}
          onApproveToChat={(imageUrl, prompt) => {
            const timestamp = Date.now()
            // Store prompt in content for easy retrieval, and model info in imageAnalysis
            setEntries(prev => [...prev, {
              id: `image-gen-${timestamp}`,
              type: 'image',
              content: prompt, // Store the actual prompt, not "Generated: {prompt}"
              timestamp,
              imageUrl,
              imageAnalysis: `Generated using ${imageGeneration.model}`, // Model info here
            }])
            setImageGeneration(null)
          }}
          onRetryGeneration={(prompt, modelName) => {
            generateImageFromPrompt(prompt, modelName)
          }}
          onPullModel={(modelName) => {
            // Start download
            pullModel(modelName, (progress: PullStatus) => {
              const status = progress.status || 'unknown'
              const completed = progress.completed || 0
              const total = progress.total || 0

              setDownloadProgress({
                model: modelName,
                status: status,
                completed: completed,
                total: total,
                percent: progress.percent,
                message: progress.message,
                error: progress.error,
                speedBps: progress.speed_bps,
                etaSeconds: progress.eta_seconds,
                fileName: progress.file_name,
                filesCompleted: progress.files_completed,
                filesTotal: progress.files_total,
              })

              // On success, refresh models and retry generation
              if (status === 'success') {
                fetchModels().then(() => {
                  // Set as image gen model if it's an image gen model
                  const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']
                  const isImageGenModel = imageGenKeywords.some(keyword =>
                    modelName.toLowerCase().includes(keyword)
                  )
                  if (isImageGenModel) {
                    setImageGenModel(modelName)
                  }
                })
                // Retry generation after a short delay
                if (imageGeneration) {
                  setTimeout(() => {
                    const prompt = imageGeneration.prompt
                    fetch(`${BACKEND_URL}/api/images/generate`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        prompt,
                        provider: 'ollama',
                        model: modelName,
                      }),
                    })
                      .then(async res => {
                        const data = await res.json()
                        if (res.ok && data.status === 'success' && data.image) {
                          setImageGeneration({
                            prompt,
                            imageUrl: data.image,
                            model: data.model || modelName,
                            status: 'success',
                          })
                        }
                      })
                      .catch(() => {
                        // Ignore errors on retry
                      })
                  }, 2000)
                }
              }
            })
          }}
          downloadProgress={downloadProgress}
          allModels={models}
          cloudModels={cloudModels}
        />
      )}

      {/* Save Session Modal */}
      <SaveSessionModal
        isOpen={showSaveModal}
        onClose={() => setShowSaveModal(false)}
        onSave={handleSaveSession}
      />

      <DialogModal
        isOpen={newSessionConfirmOpen}
        title="Start New Session"
        message="Start a new session? Current history will be cleared from view."
        confirmLabel="Start New"
        cancelLabel="Cancel"
        danger
        onConfirm={() => {
          setNewSessionConfirmOpen(false)
          beginNewSession()
        }}
        onCancel={() => setNewSessionConfirmOpen(false)}
      />

      <DialogModal
        isOpen={!!deleteSessionTarget}
        title="Delete Session"
        message={`Delete session "${deleteSessionTarget || ''}" permanently?`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDeleteSession}
        onCancel={() => setDeleteSessionTarget(null)}
      />

      {/* Code Context Panel */}
      <CodeContextPanel
        isOpen={codeContextPanelOpen}
        onClose={() => setCodeContextPanelOpen(false)}
        onIndexFolder={handleIndexFolder}
        activeFolder={codeContextFolder}
        filesIndexed={codeContextFilesIndexed}
        isIndexing={codeContextIndexing}
      />

      {/* Music Setup Panel */}
      {musicSetupPanelOpen && (
        <MusicSetupPanel
          onClose={() => setMusicSetupPanelOpen(false)}
          onModelReady={() => {
            addSystemEntry('🎵 Music model is now ready! Try /song <style> to generate music.', Date.now())
          }}
        />
      )}

      {/* Music Generation Panel */}
      {musicGeneration && (
        <MusicGenerationPanel
          generation={musicGeneration}
          onClose={() => setMusicGeneration(null)}
          onGenerate={(prompt, lyrics, duration, guidanceScale, steps, seed) => {
            generateMusicFromPrompt(prompt, lyrics, duration, guidanceScale, steps, seed)
          }}
          onApproveToChat={(audioUrl, prompt, duration) => {
            // Add audio message to chat
            const timestamp = Date.now()
            setEntries(prev => [...prev, {
              id: `entry-${timestamp}`,
              type: 'audio', // Use specific audio type
              content: `Generated song: "${prompt}"`,
              timestamp,
              audioUrl,
              audioPrompt: prompt,
              audioDuration: duration,
            }])
            setMusicGeneration(null)
          }}
        />
      )}

      <ProviderSetup
        isOpen={showProviderSetup}
        onClose={() => setShowProviderSetup(false)}
      />

      {/* Image Modal for viewing/editing images in feed */}
      {selectedImageModal && (
        <ImageModal
          isOpen={!!selectedImageModal}
          onClose={() => setSelectedImageModal(null)}
          imageUrl={selectedImageModal.imageUrl}
          metadata={selectedImageModal.metadata}
          canEdit={selectedImageModal.canEdit}
          onEdit={(imageUrl, editPrompt) => {
            // Close modal and open image generation panel with edit
            setSelectedImageModal(null)
            setImageGeneration({
              prompt: editPrompt,
              model: selectedImageModal.metadata.model || status.imageGenModel || 'auto-detecting',
              status: 'generating',
              progress: 0,
              message: 'Editing image...',
            })

            // Call backend with input_image for img2img
            fetch(`${BACKEND_URL}/api/images/generate`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                prompt: editPrompt,
                provider: 'ollama',
                model: selectedImageModal.metadata.model || status.imageGenModel || undefined,
                input_image: imageUrl, // Pass the original image for editing
              }),
            })
              .then(async res => {
                const data = await res.json()
                if (res.ok && data.status === 'success' && data.image) {
                  setImageGeneration({
                    prompt: editPrompt,
                    imageUrl: data.image,
                    model: data.model || selectedImageModal.metadata.model || 'Ollama',
                    status: 'success',
                  })
                } else {
                  throw new Error(data.error || data.message || 'Image editing failed')
                }
              })
              .catch((err) => {
                setImageGeneration({
                  prompt: editPrompt,
                  model: selectedImageModal.metadata.model || 'unknown',
                  status: 'error',
                  error: err instanceof Error ? err.message : String(err),
                })
              })
          }}
        />
      )}
    </div>
  )
}

function AmbientTransferHud({
  progress,
}: {
  progress: {
    model: string
    status: string
    completed: number
    total: number
    percent?: number
    message?: string
    error?: string
    scope?: string
    speedBps?: number
    etaSeconds?: number
    fileName?: string
    filesCompleted?: number
    filesTotal?: number
  } | null
}) {
  if (!progress) return null

  const normalizedPercent = typeof progress.percent === 'number'
    ? Math.max(0, Math.min(100, Math.round(progress.percent)))
    : null
  const status = (progress.status || 'unknown').toLowerCase()
  const scope = (progress.scope || 'model').toUpperCase()
  const isSuccess = status === 'success'
  const isError = status === 'error'
  const statusLabel = isSuccess ? 'DONE' : isError ? 'ERROR' : 'ACTIVE'
  const statusClass = isSuccess
    ? 'text-phosphor'
    : isError
      ? 'text-red-400'
      : 'text-amber-300'
  const speedLabel = typeof progress.speedBps === 'number' && progress.speedBps > 0
    ? `${(progress.speedBps / (1024 * 1024)).toFixed(1)} MB/s`
    : null
  const etaLabel = typeof progress.etaSeconds === 'number' && progress.etaSeconds >= 0
    ? formatDurationLabel(progress.etaSeconds)
    : null
  const filesLabel = typeof progress.filesCompleted === 'number' && typeof progress.filesTotal === 'number' && progress.filesTotal > 0
    ? `${Math.max(0, progress.filesCompleted)}/${progress.filesTotal} files`
    : null
  const friendlyMessage = getFriendlyTransferMessage(status, progress.model)

  return (
    <div className="pointer-events-none absolute top-3 right-4 z-[12] w-[clamp(176px,16vw,268px)]">
      <div className="border border-terminal-border/70 bg-void/55 backdrop-blur-[1px] px-2 py-1.5 font-mono">
        <div className="flex items-center justify-between text-[9px] tracking-wider text-terminal-muted">
          <span>XFER {scope}</span>
          <span className={statusClass}>{statusLabel}</span>
        </div>
        <div className="mt-1 truncate text-[10px] text-phosphor">{progress.model}</div>
        <div className="mt-1 text-[9px] text-terminal-muted">{friendlyMessage}</div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[9px] text-terminal-muted/90">
          <span className="truncate">{progress.message || progress.fileName || progress.error || progress.status}</span>
          {normalizedPercent !== null && (
            <span className="text-phosphor">{normalizedPercent}%</span>
          )}
        </div>
        {(speedLabel || etaLabel || filesLabel) && (
          <div className="mt-1 flex items-center gap-2 text-[8px] text-terminal-muted">
            {filesLabel && <span>{filesLabel}</span>}
            {speedLabel && <span>{speedLabel}</span>}
            {etaLabel && <span>ETA {etaLabel}</span>}
          </div>
        )}
        {normalizedPercent !== null && (
          <div className="mt-1 h-1 border border-terminal-border/70 bg-void">
            <div className="h-full bg-phosphor/80 transition-all duration-300" style={{ width: `${normalizedPercent}%` }} />
          </div>
        )}
      </div>
    </div>
  )
}

function getFriendlyTransferMessage(status: string, model: string): string {
  if (status === 'success') return `${model} is ready to use.`
  if (status === 'error') return `Could not finish installing ${model}.`
  if (status === 'loading' || status === 'verifying') return `Finishing setup for ${model}...`
  if (status === 'starting') return `Getting ${model} ready...`
  return `Downloading ${model}. You can keep using the app.`
}

function formatDurationLabel(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '--'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  if (minutes < 60) return `${minutes}m ${remainder}s`
  const hours = Math.floor(minutes / 60)
  const minutesOnly = minutes % 60
  return `${hours}h ${minutesOnly}m`
}

interface IdleTelemetryLine {
  id: string
  text: string
  isToken: boolean
  isDelta: boolean
  isTransfer: boolean
}

function IdleTelemetryMatrix({
  mode,
  tokens,
  deltaTokens,
}: {
  mode: 'off' | 'idle' | 'active'
  tokens: string[]
  deltaTokens: string[]
}) {
  const [lines, setLines] = useState<IdleTelemetryLine[]>([])

  useEffect(() => {
    if (mode === 'off') {
      setLines([])
      return
    }

    const seed = Array.from({ length: TELEMETRY_RAIL_MAX_LINES }, (_, index) => {
      const next = buildTelemetryRailLine(tokens, deltaTokens, mode)
      return {
        id: `telemetry-seed-${index}-${Date.now()}`,
        text: next.text,
        isToken: next.isToken,
        isDelta: next.isDelta,
        isTransfer: next.isTransfer,
      }
    })
    setLines(seed)

    const tick = () => {
      const next = buildTelemetryRailLine(tokens, deltaTokens, mode)
      setLines(prev => {
        const appended = [
          ...prev,
          {
            id: `telemetry-${Date.now()}-${Math.random()}`,
            text: next.text,
            isToken: next.isToken,
            isDelta: next.isDelta,
            isTransfer: next.isTransfer,
          },
        ]
        return appended.slice(-TELEMETRY_RAIL_MAX_LINES)
      })
    }

    const intervalMs = mode === 'active' ? 170 : 280
    const interval = window.setInterval(tick, intervalMs)
    return () => window.clearInterval(interval)
  }, [mode, tokens, deltaTokens])

  if (mode === 'off' || lines.length === 0) return null

  return (
    <div className="idle-telemetry-matrix" data-mode={mode} aria-hidden>
      <div className="idle-telemetry-rail">
        {lines.map((line, index) => (
          <div
            key={line.id}
            className={`idle-telemetry-line ${line.isToken ? 'is-token' : ''} ${line.isDelta ? 'is-delta' : ''} ${line.isTransfer ? 'is-transfer' : ''}`}
            style={{ opacity: Math.max(0.16, (index + 1) / lines.length) }}
          >
            {line.text}
          </div>
        ))}
      </div>
      <div className="idle-telemetry-matrix-mask" />
    </div>
  )
}

interface LogEntryBlockProps {
  entry: LogEntry
  rowIndex: number
  formatTimestamp: (ts: number) => string
  availableChatModels?: string[]
  onRerunWithModel?: (entry: LogEntry, modelName: string) => void
  onAgentFeedback?: (entry: LogEntry, kind: AgentFeedbackKind) => void
  onImageClick?: (imageUrl: string, metadata: { prompt?: string; model?: string; timestamp?: number; provider?: string; analysis?: string }, canEdit: boolean) => void
  onRunCommand?: (command: string) => void
  circuitNames?: string[]
  onRunCircuit?: (circuit: string, content: string) => void
}

function LogEntryBlock({
  entry,
  rowIndex,
  formatTimestamp,
  availableChatModels = [],
  onRerunWithModel,
  onAgentFeedback,
  onImageClick,
  onRunCommand,
  circuitNames = [],
  onRunCircuit,
}: LogEntryBlockProps) {
  if (entry.type === 'system' && entry.metadata?.component === 'SystemStatusCard') {
    return (
      <div className={`log-rhythm-row ${rowIndex % 2 === 0 ? 'log-rhythm-even' : 'log-rhythm-odd'} border-l-2 border-terminal-muted pl-4 py-2`}>
        <SystemStatusCard timestamp={entry.timestamp} onRunCommand={onRunCommand || (() => { })} />
      </div>
    )
  }

  const typeStyles = {
    user: 'border-phosphor',
    system: 'border-terminal-muted',
    ai: 'border-phosphor',
    error: 'border-red-500',
    image: 'border-cyan-500',
    audio: 'border-purple-500',
  }

  const typeLabels = {
    user: 'USER',
    system: 'SYSTEM',
    ai: 'ASSISTANT',
    error: 'ERROR',
    image: 'IMAGE',
    audio: 'MUSIC',
  }

  const textColors = {
    user: 'text-phosphor',
    system: 'text-terminal-muted',
    ai: 'text-phosphor',
    error: 'text-red-400',
    image: 'text-cyan-400',
    audio: 'text-purple-400',
  }

  const metadataRecord = entry.metadata && typeof entry.metadata === 'object'
    ? entry.metadata as Record<string, unknown>
    : null
  const modelName = typeof metadataRecord?.model === 'string' ? metadataRecord.model : ''
  const routeLabel = typeof metadataRecord?.route === 'string' ? metadataRecord.route : ''
  const confidenceValue = typeof metadataRecord?.confidence === 'number'
    ? Math.max(0, Math.min(1, Number(metadataRecord.confidence)))
    : null
  const responseContract = typeof metadataRecord?.responseContract === 'string'
    ? metadataRecord.responseContract
    : ''
  const provenance = Array.isArray(metadataRecord?.provenance)
    ? metadataRecord?.provenance.map(value => String(value)).filter(Boolean).slice(0, 4)
    : []
  const refinedBy = typeof metadataRecord?.refinedBy === 'string'
    ? metadataRecord.refinedBy
    : ''
  const streamSignalRaw = typeof metadataRecord?.streamSignal === 'number'
    ? Number(metadataRecord.streamSignal)
    : 0
  const streamSignal = Number.isFinite(streamSignalRaw) ? Math.max(0, Math.min(1, streamSignalRaw)) : 0
  const isAiStreaming = entry.type === 'ai' && entry.status === 'running'
  const isCommandStatus = metadataRecord?.kind === COMMAND_STATUS_METADATA_KIND
  const contentLength = entry.content?.length ?? 0
  const lineCount = entry.content ? entry.content.split('\n').length : 1
  const isLongFormContent = lineCount >= 10 || contentLength >= 680
  const entryLabel = isCommandStatus ? 'COMMAND' : typeLabels[entry.type]
  const entryTextColor = isCommandStatus ? 'text-amber-400' : textColors[entry.type]
  const contentClassName = isCommandStatus
    ? 'log-entry-body text-amber-300 whitespace-pre-wrap font-mono text-xs leading-relaxed'
    : `log-entry-body ${isLongFormContent ? 'log-entry-body-long' : ''} ${entryTextColor} whitespace-pre-wrap font-mono text-sm ${isAiStreaming ? 'ai-streaming-text' : ''}`
  const contentStyle: CSSProperties | undefined = isAiStreaming
    ? ({ '--stream-strength': String(Math.max(0.15, streamSignal || 0.18)) } as CSSProperties)
    : undefined

  const rerunModelOptions = useMemo(() => {
    const deduped = [...new Set(availableChatModels)]
    if (modelName && !deduped.includes(modelName) && isLikelyChatModel(modelName)) {
      return [modelName, ...deduped]
    }
    return deduped
  }, [availableChatModels, modelName])

  const [rerunModel, setRerunModel] = useState<string>(() => modelName || rerunModelOptions[0] || '')
  useEffect(() => {
    setRerunModel(prev => {
      if (prev && rerunModelOptions.includes(prev)) return prev
      return modelName || rerunModelOptions[0] || ''
    })
  }, [entry.id, modelName, rerunModelOptions])

  const showRerunControls =
    entry.type === 'ai'
    && entry.status !== 'running'
    && !isCommandStatus
    && !!onRerunWithModel
    && rerunModelOptions.length > 0
  const supportsMessageActions = entry.type === 'ai'
  const hasCopyableText = supportsMessageActions && Boolean(entry.content?.trim())
  const showMessageActions = supportsMessageActions && (Boolean(modelName) || showRerunControls || hasCopyableText)
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false)
  const [showCircuitMenu, setShowCircuitMenu] = useState(false)
  const actionMenuRef = useRef<HTMLDivElement | null>(null)
  const markdownContent = useMemo(() => {
    if (!hasCopyableText) return ''
    return buildMessageMarkdown(entry, formatTimestamp(entry.timestamp), modelName || undefined)
  }, [entry, formatTimestamp, hasCopyableText, modelName])

  useEffect(() => {
    setIsActionMenuOpen(false)
  }, [entry.id])

  useEffect(() => {
    if (!isActionMenuOpen) return
    const onPointerDown = (event: MouseEvent) => {
      if (!actionMenuRef.current?.contains(event.target as Node)) {
        setIsActionMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsActionMenuOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isActionMenuOpen])

  const handleCopyMessage = useCallback(async () => {
    if (!hasCopyableText || !entry.content) return
    try {
      await navigator.clipboard.writeText(entry.content)
      showSuccessToast('Message copied to clipboard.', 'Clipboard', 1200)
      setIsActionMenuOpen(false)
    } catch {
      showErrorToast('Could not copy this message.', 'Clipboard')
    }
  }, [entry.content, hasCopyableText])

  const handleCopyMarkdown = useCallback(async () => {
    if (!markdownContent) return
    try {
      await navigator.clipboard.writeText(markdownContent)
      showSuccessToast('Markdown copied.', 'Clipboard', 1200)
      setIsActionMenuOpen(false)
    } catch {
      showErrorToast('Could not copy markdown.', 'Clipboard')
    }
  }, [markdownContent])

  const saveSnippet = useCallback((kind: 'note' | 'pin') => {
    if (!entry.content?.trim()) return
    const snippet: StoredMessageSnippet = {
      id: `${entry.id}-${kind}-${Date.now()}`,
      entryId: entry.id,
      createdAt: Date.now(),
      model: modelName || undefined,
      kind,
      text: entry.content,
      markdown: markdownContent || entry.content,
    }
    appendSnippetToStorage(kind === 'note' ? TERMINAL_SNIPPETS_KEY : TERMINAL_PINS_KEY, snippet)
    window.dispatchEvent(new CustomEvent(kind === 'note' ? 'loom:snippet-saved' : 'loom:snippet-pinned', {
      detail: { snippet },
    }))
    showSuccessToast(kind === 'note' ? 'Saved to Notes.' : 'Pinned message.', kind === 'note' ? 'Notes' : 'Pinned', 1300)
    setIsActionMenuOpen(false)
  }, [entry.content, entry.id, markdownContent, modelName])

  const handleSendToCircuit = useCallback(() => {
    const content = entry.content?.trim()
    if (!content) return
    window.dispatchEvent(new CustomEvent(CIRCUIT_IMPORT_EVENT, {
      detail: {
        open: true,
        source: 'terminal-message',
        content,
        markdown: markdownContent || content,
        model: modelName || undefined,
        timestamp: entry.timestamp,
      },
    }))
    showSuccessToast('Sent to Circuit.', 'Circuit', 1300)
    setIsActionMenuOpen(false)
  }, [entry.content, entry.timestamp, markdownContent, modelName])

  const handleExportMarkdown = useCallback(() => {
    if (!markdownContent) return
    const stamp = new Date(entry.timestamp).toISOString().replace(/[:.]/g, '-')
    downloadTextFile(`loom-message-${stamp}.md`, markdownContent)
    showInfoToast('Exported markdown.', 'Export', 1200)
    setIsActionMenuOpen(false)
  }, [entry.timestamp, markdownContent])

  return (
    <div className={`log-rhythm-row ${rowIndex % 2 === 0 ? 'log-rhythm-even' : 'log-rhythm-odd'} ${showMessageActions ? 'has-message-actions' : ''} ${isActionMenuOpen ? 'is-actions-open' : ''} border-l-2 ${typeStyles[entry.type]} pl-4 py-2`}>
      {/* Header */}
      <div className="flex items-center gap-3 text-xs text-terminal-muted mb-1">
        <span className="text-terminal-gray">[{formatTimestamp(entry.timestamp)}]</span>
        <span className={`font-bold ${entryTextColor}`}>
          {entryLabel}
        </span>
        {entry.status === 'running' && (
          <span className="flex items-center gap-1">
            <span className="led led-running"></span>
            <span className="text-amber-500 animate-pulse">PROCESSING</span>
          </span>
        )}
        {entry.status === 'success' && (
          <span className="led led-success"></span>
        )}
        {entry.status === 'error' && (
          <span className="led led-error"></span>
        )}
      </div>
      {showMessageActions && (
        <div ref={actionMenuRef} className="message-action-anchor" aria-label="Message actions">
          <button
            type="button"
            className="message-action-trigger"
            onClick={() => setIsActionMenuOpen(prev => !prev)}
            aria-expanded={isActionMenuOpen}
            aria-haspopup="menu"
            title="Message actions"
          >
            ...
          </button>
          {isActionMenuOpen && (
            <aside className="message-action-menu" role="menu">
              <div className="message-action-title-row">
                <span className="message-action-title">Actions</span>
                {modelName && (
                  <span className="message-action-model" title={`Generated by ${modelName}`}>
                    {modelName.replace(':latest', '')}
                  </span>
                )}
              </div>
              {hasCopyableText && (
                <div className="message-action-grid">
                  <button type="button" className="message-action-btn" onClick={handleCopyMessage}>Copy</button>
                  <button type="button" className="message-action-btn" onClick={handleCopyMarkdown}>Copy MD</button>
                  <button type="button" className="message-action-btn" onClick={() => saveSnippet('note')}>Save Note</button>
                  <button
                    type="button"
                    className={`message-action-btn ${showCircuitMenu ? 'bg-phosphor/20 text-phosphor' : ''}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowCircuitMenu(prev => !prev)
                    }}
                  >
                    Run With...
                  </button>
                  <button type="button" className="message-action-btn" onClick={() => saveSnippet('pin')}>Pin</button>
                  <button type="button" className="message-action-btn" onClick={handleExportMarkdown}>Export</button>
                </div>
              )}

              {showCircuitMenu && circuitNames.length > 0 && (
                <div className="bg-void border-t border-terminal-border/50 py-1 max-h-32 overflow-y-auto">
                  <div className="px-2 py-1 text-[10px] text-terminal-muted uppercase tracking-wider">Select Circuit</div>
                  {circuitNames.map(name => (
                    <button
                      key={name}
                      type="button"
                      className="w-full text-left px-3 py-1 text-xs text-terminal-muted hover:text-phosphor hover:bg-phosphor/10 transition-colors truncate"
                      onClick={() => {
                        onRunCircuit?.(name, entry.content || '')
                        setIsActionMenuOpen(false)
                        setShowCircuitMenu(false)
                      }}
                    >
                      {name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1 text-xs text-terminal-muted hover:text-phosphor hover:bg-phosphor/10 transition-colors italic border-t border-terminal-border/20 mt-1 pt-1"
                    onClick={handleSendToCircuit}
                  >
                    Open in Circuit Board...
                  </button>
                </div>
              )}
              {showRerunControls && (
                <div className="message-action-rerun">
                  <label className="message-action-label" htmlFor={`rerun-model-${entry.id}`}>Re-run with</label>
                  <select
                    id={`rerun-model-${entry.id}`}
                    value={rerunModel}
                    onChange={(event) => setRerunModel(event.target.value)}
                    className="message-action-select"
                    aria-label="Select model to compare this response"
                  >
                    {rerunModelOptions.map(option => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!rerunModel) return
                      onRerunWithModel?.(entry, rerunModel)
                      setIsActionMenuOpen(false)
                    }}
                    className="message-action-btn message-action-btn-primary"
                  >
                    Re-run
                  </button>
                </div>
              )}
              {onAgentFeedback && entry.type === 'ai' && (
                <div className="message-action-grid">
                  <button type="button" className="message-action-btn" onClick={() => onAgentFeedback(entry, 'verbose')}>Too Verbose</button>
                  <button type="button" className="message-action-btn" onClick={() => onAgentFeedback(entry, 'vague')}>Too Vague</button>
                  <button type="button" className="message-action-btn" onClick={() => onAgentFeedback(entry, 'robotic')}>Too Robotic</button>
                  <button type="button" className="message-action-btn" onClick={() => onAgentFeedback(entry, 'perfect')}>Perfect Tone</button>
                </div>
              )}
            </aside>
          )}
        </div>
      )}

      {/* Content */}
      {(routeLabel || confidenceValue !== null || responseContract || provenance.length > 0 || refinedBy) && (
        <div className="flex flex-wrap items-center gap-2 text-[10px] text-terminal-muted mb-2">
          {routeLabel && (
            <span className="px-2 py-0.5 border border-terminal-border">{routeLabel}</span>
          )}
          {confidenceValue !== null && (
            <span className="px-2 py-0.5 border border-terminal-border">conf {Math.round(confidenceValue * 100)}%</span>
          )}
          {responseContract && (
            <span className="px-2 py-0.5 border border-terminal-border">contract {responseContract}</span>
          )}
          {refinedBy && (
            <span className="px-2 py-0.5 border border-terminal-border">refined {refinedBy}</span>
          )}
          {provenance.map(item => (
            <span key={`${entry.id}-${item}`} className="px-2 py-0.5 border border-terminal-border/70 text-terminal-muted/80">
              {item}
            </span>
          ))}
        </div>
      )}
      <div className={contentClassName} style={contentStyle}>
        {entry.type === 'audio' && entry.audioUrl ? (
          <MusicPlayerCard
            audioUrl={entry.audioUrl}
            prompt={entry.audioPrompt || 'Generated Track'}
            duration={entry.audioDuration}
            timestamp={entry.timestamp}
          />
        ) : entry.type === 'image' && entry.imageUrl ? (
          <div className="space-y-3">
            <div className="border border-terminal-border bg-void p-3">
              <img
                src={entry.imageUrl}
                alt="Chat image"
                className="max-w-full h-auto max-h-64 border border-terminal-border cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  if (!onImageClick || !entry.imageUrl) return

                  // Extract prompt and model from entry
                  const prompt = entry.content || 'Generated image'
                  const modelMatch = entry.imageAnalysis?.match(/Generated using (.+)/)
                  const model = modelMatch ? modelMatch[1] : undefined

                  // Check if this was generated (has model info) - enable editing for generated images
                  // Enable editing if it has a model and is from a supported provider (flux, ollama, or local SDXL)
                  const canEdit = !!model && (model.toLowerCase().includes('flux') || model.toLowerCase().includes('ollama') || model.toLowerCase().includes('sdxl'))

                  // Open modal with metadata
                  onImageClick(entry.imageUrl, {
                    prompt,
                    model,
                    timestamp: entry.timestamp,
                    provider: model?.toLowerCase().includes('sdxl') ? 'local' : 'ollama',
                    analysis: entry.imageAnalysis,
                  }, canEdit)
                }}
                title="Click to view full screen and edit"
              />
            </div>
            {entry.imageAnalysis && (
              <div className="text-terminal-muted text-sm border-l-2 border-cyan-500/50 pl-3">
                <div className="text-[10px] text-terminal-muted tracking-widest mb-1">ANALYSIS</div>
                {entry.imageAnalysis}
              </div>
            )}
            {entry.content && (
              <div className="mt-2">{entry.content}</div>
            )}
          </div>
        ) : (
          entry.content || (entry.status === 'running' ? '...' : '')
        )}
      </div>
    </div>
  )
}
