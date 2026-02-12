import { useEffect, useCallback } from 'react'
import { useSystemStore, CloudModelInfo } from '../store/systemStore'
import { API_BASE_URL } from '../config/api'
import { requestJson } from '../utils/apiClient'

const BACKEND_URL = API_BASE_URL
const HEALTH_POLL_INTERVAL_MS = 5000
const MAX_INIT_RETRIES = 30
const CHAT_MODEL_EXCLUDE_KEYWORDS = ['embed', 'llava', 'bakllava', 'moondream', 'vision', 'flux', 'stable-diffusion', 'sd3']
const VISION_MODEL_KEYWORDS = ['llava', 'bakllava', 'moondream', 'vision']
const IMAGE_GEN_MODEL_KEYWORDS = ['flux', 'flux2', 'stable-diffusion']

let statusConsumerCount = 0
let healthPollInterval: ReturnType<typeof setInterval> | null = null
let providerUpdateHandler: (() => void) | null = null
let visibilityChangeHandler: (() => void) | null = null
let initInProgress = false
let currentCheckHealth: (() => Promise<unknown>) | null = null
let currentFetchModels: (() => Promise<string[]>) | null = null
let currentFetchCloudModels: (() => Promise<void>) | null = null

// Re-export type for compatibility
export type { CloudModelInfo }

interface HealthResponse {
  ollama?: {
    connected?: boolean
    models_available?: number
  }
  memory?: {
    ram_total_gb?: number
    ram_available_gb?: number
    ram_system_used_gb?: number
    ram_model_used_gb?: number
    ram_model_used_source?: string
    ram_available_for_models_gb?: number
    ram_used_percent?: number
    loaded_model_name?: string | null
    default_model?: string
    model_status?: string
    ollama_process_rss_gb?: number | null
  }
}

interface ModelRecord {
  name?: string
}

interface ModelsResponse {
  models?: unknown[] | Record<string, unknown>
}

function isOllamaReady(health: unknown): boolean {
  if (!health || typeof health !== 'object') return false
  const ollama = (health as HealthResponse).ollama
  return Boolean(ollama?.connected)
}

function normalizeModelName(entry: unknown): string | null {
  if (typeof entry === 'string') {
    return entry
  }
  if (entry && typeof entry === 'object' && 'name' in entry) {
    const modelName = (entry as ModelRecord).name
    return typeof modelName === 'string' ? modelName : null
  }
  return null
}

function extractModelNames(payload: unknown): string[] {
  const raw = payload as ModelsResponse | unknown[]
  let modelsList: unknown[] = []

  if (Array.isArray(raw)) {
    modelsList = raw
  } else if (raw && typeof raw === 'object' && 'models' in raw) {
    const models = (raw as ModelsResponse).models
    if (Array.isArray(models)) {
      modelsList = models
    } else if (models && typeof models === 'object') {
      modelsList = Object.values(models)
    }
  }

  return modelsList
    .map(normalizeModelName)
    .filter((name): name is string => Boolean(name && name !== 'unknown'))
}

function pickChatModel(modelNames: string[]): string | undefined {
  return modelNames.find(modelName => {
    const lowerName = modelName.toLowerCase()
    return !CHAT_MODEL_EXCLUDE_KEYWORDS.some(keyword => lowerName.includes(keyword))
  })
}

function pickVisionModel(modelNames: string[]): string | undefined {
  return modelNames.find(modelName =>
    VISION_MODEL_KEYWORDS.some(keyword => modelName.toLowerCase().includes(keyword)),
  )
}

function pickImageGenModel(modelNames: string[]): string | undefined {
  return modelNames.find(modelName =>
    IMAGE_GEN_MODEL_KEYWORDS.some(keyword => modelName.toLowerCase().includes(keyword)),
  )
}

export function useSystemStatus() {
  const {
    status,
    models,
    cloudModels,
    setStatus,
    setModels,
    setCloudModels,
    setActiveModel,
    setVisionModel,
    setImageGenModel
  } = useSystemStore()

  // Check backend health
  const checkHealth = useCallback(async () => {
    try {
      const data = await requestJson<HealthResponse>(`${BACKEND_URL}/health`, {
        method: 'GET',
        timeoutMs: 5000,
      })
      setStatus((prev) => ({
        ...prev,
        connected: Boolean(data.ollama?.connected),
        ollamaModelsAvailable: data.ollama?.models_available,
        ramTotalGb: data.memory?.ram_total_gb,
        ramAvailableGb: data.memory?.ram_available_gb,
        ramSystemUsedGb: data.memory?.ram_system_used_gb,
        ramModelUsedGb: data.memory?.ram_model_used_gb,
        ramModelUsedSource: data.memory?.ram_model_used_source,
        ramAvailableForModelsGb: data.memory?.ram_available_for_models_gb,
        ramUsedPercent: data.memory?.ram_used_percent,
        ollamaProcessRssGb: data.memory?.ollama_process_rss_gb ?? undefined,
        loadedModelName: data.memory?.loaded_model_name ?? undefined,
        defaultModelName: data.memory?.default_model ?? undefined,
        modelStatus: data.memory?.model_status ?? undefined,
      }))
      return data
    } catch {
      setStatus(prev => ({ ...prev, connected: false }))
    }
    return null
  }, [setStatus])

  // Fetch available models
  const fetchModels = useCallback(async () => {
    try {
      const payload = await requestJson<ModelsResponse | unknown[]>(`${BACKEND_URL}/api/models`, {
        method: 'GET',
        timeoutMs: 10000,
      })
      const modelNames = extractModelNames(payload)
      setModels(modelNames)

      // Set first non-embedding model as active if not set
      if (modelNames.length > 0) {
        useSystemStore.setState(state => {
          const updates: Partial<typeof state.status> = {}

          if (!state.status.activeModel) {
            const chatModel = pickChatModel(modelNames)
            if (chatModel) updates.activeModel = chatModel
          }

          if (!state.status.visionModel) {
            const visionModel = pickVisionModel(modelNames)
            if (visionModel) updates.visionModel = visionModel
          }

          if (!state.status.imageGenModel) {
            const imageGenModel = pickImageGenModel(modelNames)
            if (imageGenModel) updates.imageGenModel = imageGenModel
          }

          if (Object.keys(updates).length > 0) {
            setStatus(prev => ({ ...prev, ...updates }))
          }
          return state
        })
      }

      return modelNames
    } catch {
      return []
    }
  }, [setModels, setStatus])

  // Fetch unified cloud model list
  const fetchCloudModels = useCallback(async () => {
    try {
      const data = await requestJson<{ models?: CloudModelInfo[] }>(`${BACKEND_URL}/api/providers/models/all`, {
        timeoutMs: 10000,
      })
      setCloudModels(data.models || [])
    } catch {
      // Silently fail — cloud models are optional
    }
  }, [setCloudModels])

  // Keep background polling singleton-safe even if multiple components call this hook.
  useEffect(() => {
    currentCheckHealth = checkHealth
    currentFetchModels = fetchModels
    currentFetchCloudModels = fetchCloudModels
    statusConsumerCount += 1

    const runInitialBootstrap = async () => {
      if (initInProgress) return
      initInProgress = true
      let retryCount = 0

      try {
        while (retryCount < MAX_INIT_RETRIES) {
          const check = currentCheckHealth
          const fetchModelList = currentFetchModels
          if (!check || !fetchModelList) break

          const health = await check()
          if (isOllamaReady(health)) {
            const modelList = await fetchModelList()
            if (modelList.length > 0) {
              return
            }
          }

          retryCount += 1
          if (retryCount < MAX_INIT_RETRIES) {
            const delay = Math.min(1000 * Math.pow(1.2, retryCount - 1), 2000)
            await new Promise(resolve => setTimeout(resolve, delay))
          }
        }

        if (retryCount >= MAX_INIT_RETRIES) {
          console.warn('[LOOM] Backend connection timeout - make sure backend is running')
        }
      } finally {
        initInProgress = false
      }
    }

    void runInitialBootstrap()

    if (healthPollInterval === null) {
      healthPollInterval = setInterval(async () => {
        if (document.visibilityState !== 'visible') {
          return
        }
        const check = currentCheckHealth
        if (!check) return

        const health = await check()
        if (isOllamaReady(health) && useSystemStore.getState().models.length === 0) {
          await currentFetchModels?.()
        }
      }, HEALTH_POLL_INTERVAL_MS)
    }

    if (providerUpdateHandler === null) {
      providerUpdateHandler = () => {
        void currentFetchCloudModels?.()
      }
      window.addEventListener('loom:providers_updated', providerUpdateHandler)
    }
    if (visibilityChangeHandler === null) {
      visibilityChangeHandler = () => {
        if (document.visibilityState !== 'visible') return
        void currentCheckHealth?.().then(health => {
          if (isOllamaReady(health) && useSystemStore.getState().models.length === 0) {
            void currentFetchModels?.()
          }
        })
      }
      window.addEventListener('visibilitychange', visibilityChangeHandler)
    }
    void currentFetchCloudModels?.()

    return () => {
      statusConsumerCount = Math.max(0, statusConsumerCount - 1)

      if (statusConsumerCount === 0) {
        if (healthPollInterval !== null) {
          clearInterval(healthPollInterval)
          healthPollInterval = null
        }
        if (providerUpdateHandler) {
          window.removeEventListener('loom:providers_updated', providerUpdateHandler)
          providerUpdateHandler = null
        }
        if (visibilityChangeHandler) {
          window.removeEventListener('visibilitychange', visibilityChangeHandler)
          visibilityChangeHandler = null
        }
      }
    }
  }, [checkHealth, fetchModels, fetchCloudModels])

  return {
    status,
    models,
    cloudModels,
    checkHealth,
    fetchModels,
    fetchCloudModels,
    setActiveModel,
    setVisionModel,
    setImageGenModel,
  }
}
