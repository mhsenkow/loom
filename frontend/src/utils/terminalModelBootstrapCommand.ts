import type { PullStatus } from '../hooks/useSocket'
import { fetchImageModels } from './imageModelsApi'

const CHAT_MODEL_EXCLUDE_KEYWORDS = ['embed', 'llava', 'bakllava', 'moondream', 'vision', 'flux', 'stable-diffusion', 'sd3']
const IMAGE_MODEL_HINTS = ['flux', 'flux2', 'stable-diffusion', 'sdxl', 'sd-1.5']
const TINY_MODEL_HINTS = ['tiny', ':1b', ':2b', ':3b', 'mini', 'phi3:mini', 'gemma:2b']

const DEFAULT_ROUTER_MODEL = 'tinyllama'
const DEFAULT_CHAT_MODEL = 'llama3.1:8b'
const DEFAULT_IMAGE_MODEL = 'x/flux2-klein'

interface HandleModelBootstrapCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  backendUrl: string
  connected: boolean
  activeModel?: string
  imageGenModel?: string
  pullModel: (modelName: string, onStatus?: (status: PullStatus) => void) => boolean
  fetchModels: () => Promise<string[]>
  setActiveModel: (model: string) => void
  setImageGenModel: (model: string) => void
  addSystemEntry: (content: string, timestamp: number) => void
  addErrorEntry: (content: string, timestamp: number) => void
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void
  markCommandPending?: (detail?: string) => void
}

interface MusicStatusResponse {
  model_ready?: boolean
  model_downloading?: boolean
  setup_required?: boolean
}

interface BootstrapReadiness {
  hasTinyRouter: boolean
  hasNormalChat: boolean
  hasImageModel: boolean
  musicReady: boolean
  musicDownloading: boolean
}

interface BootstrapPlan {
  missingLocalModels: string[]
  needsMusicDownload: boolean
  allReady: boolean
}

function normalizeModelName(modelName: string): string {
  return modelName.trim().toLowerCase()
}

function isLikelyChatModel(modelName: string): boolean {
  const lowerName = normalizeModelName(modelName)
  return !CHAT_MODEL_EXCLUDE_KEYWORDS.some(keyword => lowerName.includes(keyword))
}

function isImageModel(modelName: string): boolean {
  const lowerName = normalizeModelName(modelName)
  return IMAGE_MODEL_HINTS.some(keyword => lowerName.includes(keyword))
}

function isTinyModel(modelName: string): boolean {
  const lowerName = normalizeModelName(modelName)
  return TINY_MODEL_HINTS.some(keyword => lowerName.includes(keyword))
}

export function assessBootstrapReadiness(
  modelNames: string[],
  hasAnyImageModel: boolean,
  musicReady: boolean,
  musicDownloading: boolean,
): BootstrapReadiness {
  const hasTinyRouter = modelNames.some(isTinyModel)
  const hasNormalChat = modelNames.some(model => isLikelyChatModel(model) && !isTinyModel(model))
  const hasImageModel = hasAnyImageModel || modelNames.some(isImageModel)

  return {
    hasTinyRouter,
    hasNormalChat,
    hasImageModel,
    musicReady,
    musicDownloading,
  }
}

export function buildBootstrapPlan(readiness: BootstrapReadiness): BootstrapPlan {
  const missingLocalModels: string[] = []
  if (!readiness.hasTinyRouter) missingLocalModels.push(DEFAULT_ROUTER_MODEL)
  if (!readiness.hasNormalChat) missingLocalModels.push(DEFAULT_CHAT_MODEL)
  if (!readiness.hasImageModel) missingLocalModels.push(DEFAULT_IMAGE_MODEL)

  const needsMusicDownload = !readiness.musicReady && !readiness.musicDownloading
  const allReady = missingLocalModels.length === 0 && (readiness.musicReady || readiness.musicDownloading)

  return {
    missingLocalModels,
    needsMusicDownload,
    allReady,
  }
}

async function pullModelWithProgress(
  modelName: string,
  pullModel: (modelName: string, onStatus?: (status: PullStatus) => void) => boolean,
  onProgress: (progress: PullStatus) => void,
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      reject(new Error(`Timed out while pulling "${modelName}"`))
    }, 45 * 60 * 1000)

    const started = pullModel(modelName, (progress) => {
      if (settled) return
      onProgress(progress)
      const status = (progress.status || '').toLowerCase()
      if (status === 'success') {
        settled = true
        clearTimeout(timeout)
        resolve()
        return
      }
      if (status === 'error') {
        settled = true
        clearTimeout(timeout)
        reject(new Error(progress.error || progress.message || `Failed to pull "${modelName}"`))
        return
      }
      const progressLabel = typeof progress.percent === 'number'
        ? `pulling ${modelName} (${progress.percent}%)`
        : `pulling ${modelName} (${progress.status || 'working'})`
      setCommandStatus?.('working', progressLabel)
    })

    if (!started) {
      settled = true
      clearTimeout(timeout)
      reject(new Error('Backend socket not connected'))
    }
  })
}

async function getMusicStatus(backendUrl: string): Promise<{ ready: boolean; downloading: boolean }> {
  try {
    const response = await fetch(`${backendUrl}/api/music/status`)
    if (!response.ok) {
      return { ready: false, downloading: false }
    }
    const status = await response.json() as MusicStatusResponse
    return {
      ready: status.model_ready === true,
      downloading: status.model_downloading === true,
    }
  } catch {
    return { ready: false, downloading: false }
  }
}

async function startMusicDownload(backendUrl: string): Promise<string> {
  const response = await fetch(`${backendUrl}/api/music/download-model`, { method: 'POST' })
  if (!response.ok) {
    throw new Error(`Music model setup request failed (${response.status})`)
  }
  const payload = await response.json() as { status?: string; message?: string }
  return payload.status || 'started'
}

export function handleModelBootstrapCommand(options: HandleModelBootstrapCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    backendUrl,
    connected,
    activeModel,
    imageGenModel,
    pullModel,
    fetchModels,
    setActiveModel,
    setImageGenModel,
    addSystemEntry,
    addErrorEntry,
    setCommandStatus,
    markCommandPending,
  } = options

  if (!['setup-models', 'bootstrap-models', 'bootstrap'].includes(cmd)) {
    return false
  }

  if (!connected) {
    addErrorEntry('Backend is not connected. Start backend first, then rerun /setup-models.', timestamp)
    setCommandStatus?.('failed', 'backend not connected')
    return true
  }

  if (args.includes('--help') || args.includes('-h')) {
    addSystemEntry(
      [
        'Usage: /setup-models',
        '',
        'Checks and sets up baseline models for:',
        '  - Tiny router model (tinyllama)',
        '  - Normal chat model (llama3.1:8b)',
        '  - Image generation model (x/flux2-klein)',
        '  - Music generation model (ACE-Step)',
        '',
        'Only missing categories are downloaded.',
      ].join('\n'),
      timestamp,
    )
    setCommandStatus?.('done', 'usage shown')
    return true
  }

  markCommandPending?.('checking installed models')

  void (async () => {
    const errors: string[] = []
    const pulledModels: string[] = []
    let startedMusicDownload = false

    try {
      const modelNames = await fetchModels()
      let hasAnyImageModel = false
      try {
        const imageModels = await fetchImageModels(backendUrl, { force: true })
        hasAnyImageModel = (imageModels.local || []).length > 0
      } catch {
        hasAnyImageModel = modelNames.some(isImageModel)
      }
      const musicStatus = await getMusicStatus(backendUrl)

      const readiness = assessBootstrapReadiness(modelNames, hasAnyImageModel, musicStatus.ready, musicStatus.downloading)
      const plan = buildBootstrapPlan(readiness)

      addSystemEntry(
        [
          'MODEL BOOTSTRAP CHECK:',
          `  Tiny router: ${readiness.hasTinyRouter ? 'ready' : 'missing'}`,
          `  Normal chat: ${readiness.hasNormalChat ? 'ready' : 'missing'}`,
          `  Image generation: ${readiness.hasImageModel ? 'ready' : 'missing'}`,
          `  Music generation: ${readiness.musicReady ? 'ready' : readiness.musicDownloading ? 'downloading' : 'missing'}`,
        ].join('\n'),
        timestamp,
      )

      if (plan.allReady) {
        addSystemEntry('All baseline models are already ready. Nothing to pull.', Date.now())
        setCommandStatus?.('done', 'all model categories already ready')
        return
      }

      for (const modelName of plan.missingLocalModels) {
        addSystemEntry(`Pulling missing model: ${modelName}`, Date.now())
        try {
          let lastLogAt = 0
          let lastPercentBucket = -1
          let lastStatus = ''
          let lastMessage = 'starting'
          const pullStartedAt = Date.now()
          let heartbeatLoggedAt = Date.now()

          await pullModelWithProgress(
            modelName,
            pullModel,
            (progress) => {
              const status = (progress.status || 'working').trim()
              const percent = typeof progress.percent === 'number' ? progress.percent : null
              const completed = typeof progress.completed === 'number' ? progress.completed : null
              const total = typeof progress.total === 'number' ? progress.total : null
              const now = Date.now()

              let detail = `${status}`
              if (percent !== null) {
                detail += ` ${percent}%`
              } else if (completed !== null && total !== null && total > 0) {
                const mbDone = (completed / (1024 * 1024)).toFixed(1)
                const mbTotal = (total / (1024 * 1024)).toFixed(1)
                detail += ` ${mbDone}MB/${mbTotal}MB`
              }
              lastMessage = detail

              const percentBucket = percent !== null ? Math.floor(percent / 5) : -1
              const shouldLog =
                status !== lastStatus
                || (percentBucket >= 0 && percentBucket !== lastPercentBucket)
                || (now - lastLogAt > 12000)

              if (shouldLog) {
                addSystemEntry(`↳ ${modelName}: ${detail}`, now)
                lastLogAt = now
                lastStatus = status
                lastPercentBucket = percentBucket
                heartbeatLoggedAt = now
                return
              }

              if ((now - heartbeatLoggedAt) > 20000) {
                const elapsedSeconds = Math.max(1, Math.floor((now - pullStartedAt) / 1000))
                addSystemEntry(`↳ ${modelName}: still working (${elapsedSeconds}s). Latest: ${lastMessage}`, now)
                heartbeatLoggedAt = now
              }
            },
            setCommandStatus,
          )
          pulledModels.push(modelName)
          addSystemEntry(`✓ Ready: ${modelName}`, Date.now())
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          errors.push(`${modelName}: ${message}`)
          addErrorEntry(`Failed pulling ${modelName}: ${message}`, Date.now())
        }
      }

      if (plan.needsMusicDownload) {
        setCommandStatus?.('working', 'starting music model download')
        try {
          const musicStartStatus = await startMusicDownload(backendUrl)
          if (musicStartStatus === 'already_ready') {
            addSystemEntry('✓ Music model already ready.', Date.now())
          } else if (musicStartStatus === 'already_downloading') {
            addSystemEntry('Music model download is already in progress.', Date.now())
          } else {
            startedMusicDownload = true
            addSystemEntry('Started music model download (ACE-Step). Open /music-setup to monitor progress.', Date.now())
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          errors.push(`music model: ${message}`)
          addErrorEntry(`Failed to start music model download: ${message}`, Date.now())
        }
      } else if (readiness.musicDownloading) {
        addSystemEntry('Music model is already downloading. Open /music-setup to monitor progress.', Date.now())
      }

      const refreshedModels = await fetchModels()
      if (!activeModel && refreshedModels.some(isLikelyChatModel)) {
        const defaultChatModel = refreshedModels.find(model => normalizeModelName(model) === DEFAULT_CHAT_MODEL) || refreshedModels.find(isLikelyChatModel)
        if (defaultChatModel) {
          setActiveModel(defaultChatModel)
        }
      }
      if (!imageGenModel && refreshedModels.some(isImageModel)) {
        const defaultImageModel = refreshedModels.find(model => normalizeModelName(model).includes('flux2-klein')) || refreshedModels.find(isImageModel)
        if (defaultImageModel) {
          setImageGenModel(defaultImageModel)
        }
      }

      const successSummary = [
        pulledModels.length > 0 ? `Pulled: ${pulledModels.join(', ')}` : 'Pulled: none',
        startedMusicDownload ? 'Music: download started' : 'Music: no new download started',
      ].join('\n')

      if (errors.length > 0) {
        setCommandStatus?.('failed', `${errors.length} setup step(s) failed`)
        addErrorEntry(`Model bootstrap completed with issues:\n- ${errors.join('\n- ')}`, Date.now())
      } else {
        setCommandStatus?.('done', 'model bootstrap complete')
        addSystemEntry(`Model bootstrap complete.\n${successSummary}`, Date.now())
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      addErrorEntry(`Model bootstrap failed: ${message}`, Date.now())
      setCommandStatus?.('failed', 'model bootstrap failed')
    }
  })()

  return true
}
