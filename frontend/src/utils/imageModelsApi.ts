export interface ImageModelInfo {
  name: string
  type?: string
  vram?: string
  repo?: string
  path?: string
}

export interface ImageModelsResponse {
  local: ImageModelInfo[]
  ollama?: unknown[]
  diffusers?: unknown[]
  huggingface?: string[]
  hf_models?: string[]
  device?: string
  current_model?: string | null
}

export const IMAGE_MODELS_UPDATED_EVENT = 'loom:image_models_updated'
const IMAGE_MODELS_CACHE_TTL_MS = 5000

let cachedImageModels: ImageModelsResponse | null = null
let cachedImageModelsAt = 0
let inflightImageModelsRequest: Promise<ImageModelsResponse> | null = null

function normalizeImageModelsPayload(payload: unknown): ImageModelsResponse {
  const data = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {}
  const localRaw = Array.isArray(data.local) ? data.local : []

  const local: ImageModelInfo[] = localRaw
    .map((item): ImageModelInfo | null => {
      if (typeof item === 'string') {
        return { name: item, type: 'unknown', vram: 'unknown' }
      }
      if (!item || typeof item !== 'object') return null
      const record = item as Record<string, unknown>
      const name = typeof record.name === 'string' ? record.name : ''
      if (!name) return null
      return {
        name,
        type: typeof record.type === 'string' ? record.type : 'unknown',
        vram: typeof record.vram === 'string' ? record.vram : 'unknown',
        repo: typeof record.repo === 'string' ? record.repo : undefined,
        path: typeof record.path === 'string' ? record.path : undefined,
      }
    })
    .filter((item): item is ImageModelInfo => item !== null)

  return {
    local,
    ollama: Array.isArray(data.ollama) ? data.ollama : [],
    diffusers: Array.isArray(data.diffusers) ? data.diffusers : [],
    huggingface: Array.isArray(data.huggingface) ? data.huggingface as string[] : [],
    hf_models: Array.isArray(data.hf_models) ? data.hf_models as string[] : [],
    device: typeof data.device === 'string' ? data.device : undefined,
    current_model: typeof data.current_model === 'string' ? data.current_model : null,
  }
}

export function invalidateImageModelsCache() {
  cachedImageModels = null
  cachedImageModelsAt = 0
  inflightImageModelsRequest = null
}

export function notifyImageModelsUpdated() {
  window.dispatchEvent(new CustomEvent(IMAGE_MODELS_UPDATED_EVENT))
}

export async function fetchImageModels(
  apiBaseUrl: string,
  options?: { force?: boolean },
): Promise<ImageModelsResponse> {
  const force = options?.force === true
  const now = Date.now()

  if (inflightImageModelsRequest) {
    return inflightImageModelsRequest
  }

  if (!force && cachedImageModels && (now - cachedImageModelsAt) < IMAGE_MODELS_CACHE_TTL_MS) {
    return cachedImageModels
  }

  inflightImageModelsRequest = fetch(`${apiBaseUrl}/api/images/models`)
    .then(async response => {
      if (!response.ok) {
        throw new Error(`Failed to fetch image models: ${response.status}`)
      }
      const payload = await response.json()
      const normalized = normalizeImageModelsPayload(payload)
      cachedImageModels = normalized
      cachedImageModelsAt = Date.now()
      return normalized
    })
    .finally(() => {
      inflightImageModelsRequest = null
    })

  return inflightImageModelsRequest
}
