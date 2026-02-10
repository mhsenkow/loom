import { useEffect, useCallback } from 'react'
import { useSystemStore, CloudModelInfo } from '../store/systemStore'

const BACKEND_URL = 'http://localhost:8000'

// Re-export type for compatibility
export type { CloudModelInfo }

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
      const response = await fetch(`${BACKEND_URL}/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(5000),
      })
      if (response.ok) {
        const data = await response.json()
        setStatus((prev) => ({
          ...prev,
          connected: true,
          ramTotalGb: data.memory?.ram_total_gb,
          ramAvailableGb: data.memory?.ram_available_gb,
          ramSystemUsedGb: data.memory?.ram_system_used_gb,
          ramModelUsedGb: data.memory?.ram_model_used_gb,
          ramAvailableForModelsGb: data.memory?.ram_available_for_models_gb,
          ramUsedPercent: data.memory?.ram_used_percent,
          loadedModelName: data.memory?.loaded_model_name,
        }))
        return data
      } else {
        setStatus((prev) => ({
          ...prev,
          connected: false,
        }))
      }
    } catch (error) {
      // Only log if it's not a timeout or abort
      if (error instanceof Error && error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.debug('[LOOM] Health check failed:', error.message)
      }
      setStatus((prev) => ({
        ...prev,
        connected: false,
      }))
    }
    return null
  }, [setStatus])

  // Fetch available models
  const fetchModels = useCallback(async () => {
    // First check if backend is reachable
    // Skip health check here to avoid infinite loop or double check, relying on checkHealth in effects
    // But for direct calls, we might want it.

    try {
      const response = await fetch(`${BACKEND_URL}/api/models`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        // Add timeout
        signal: AbortSignal.timeout(10000),
      })

      if (!response.ok) {
        console.error('[LOOM] Failed to fetch models:', {
          status: response.status,
          statusText: response.statusText,
        })
        return []
      }

      const data = await response.json()
      console.log('[LOOM] Models API response:', data)

      // Handle different response formats
      let modelsList = []
      if (Array.isArray(data.models)) {
        modelsList = data.models
      } else if (Array.isArray(data)) {
        modelsList = data
      } else if (data.models && typeof data.models === 'object') {
        modelsList = Object.values(data.models)
      }

      const modelNames = modelsList
        .map((m: any) => {
          // Handle both object and string formats
          if (typeof m === 'string') return m
          if (typeof m === 'object' && m.name) return m.name
          return null
        })
        .filter((name: string | null): name is string => name !== null && name !== 'unknown')

      console.log('[LOOM] Parsed model names:', modelNames)
      setModels(modelNames)

      // Set first non-embedding model as active if not set
      if (modelNames.length > 0) {
        // Only set defaults if explicitly undefined, to respect user choice (even if 'auto' or empty string)
        useSystemStore.setState(state => {
          let updates: any = {}

          if (!state.status.activeModel) {
            // Find chat model (non-embedding, non-vision)
            const chatModel = modelNames.find((n: string) =>
              !n.includes('embed') &&
              !n.toLowerCase().includes('llava') &&
              !n.toLowerCase().includes('bakllava') &&
              !n.toLowerCase().includes('moondream') &&
              !n.toLowerCase().includes('vision') &&
              !n.toLowerCase().includes('flux') &&
              !n.toLowerCase().includes('stable-diffusion') &&
              !n.toLowerCase().includes('sd3')
            )
            if (chatModel) updates.activeModel = chatModel
          }

          if (!state.status.visionModel) {
            const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']
            const visionModel = modelNames.find((n: string) =>
              visionKeywords.some(keyword => n.toLowerCase().includes(keyword))
            )
            if (visionModel) updates.visionModel = visionModel
          }

          if (!state.status.imageGenModel) {
            const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']
            const imageGenModel = modelNames.find((n: string) =>
              imageGenKeywords.some(keyword => n.toLowerCase().includes(keyword))
            )
            if (imageGenModel) updates.imageGenModel = imageGenModel
          }

          if (Object.keys(updates).length > 0) {
            setStatus(prev => ({ ...prev, ...updates }))
          }
          return state // Return is ignored by setState here actually, but sticking to pattern
        })
      }

      return modelNames
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        console.debug('[LOOM] Backend not available yet (this is normal during startup)')
      } else if (error instanceof Error && error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.error('[LOOM] Failed to fetch models:', error)
      }
      return []
    }
  }, [setModels, setStatus])

  // Fetch unified cloud model list
  const fetchCloudModels = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/providers/models/all`, {
        signal: AbortSignal.timeout(10000),
      })
      if (response.ok) {
        const data = await response.json()
        setCloudModels(data.models || [])
      }
    } catch (e) {
      // Silently fail — cloud models are optional
    }
  }, [setCloudModels])

  // Poll health on mount and fetch models when backend is ready
  useEffect(() => {
    let retryCount = 0
    const maxRetries = 30 // Try for 30 seconds (30 * 1s)

    const init = async () => {
      // Try to connect with exponential backoff
      while (retryCount < maxRetries) {
        const health = await checkHealth()
        if (health) {
          // Backend is ready, fetch models
          const modelList = await fetchModels()
          if (modelList.length > 0) {
            console.log(`[LOOM] Successfully loaded ${modelList.length} models`)
            break
          }
        }

        retryCount++
        if (retryCount < maxRetries) {
          // Wait before retrying (exponential backoff, max 2s)
          const delay = Math.min(1000 * Math.pow(1.2, retryCount - 1), 2000)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }

      if (retryCount >= maxRetries) {
        console.warn('[LOOM] Backend connection timeout - make sure backend is running')
      }
    }

    init()

    // Continue polling every 10s for health and models
    const interval = setInterval(async () => {
      const health = await checkHealth()
      if (health && models.length === 0) {
        // Retry fetching models if we don't have any yet
        await fetchModels()
      }
    }, 5000) // Check every 5s for memory updates
    return () => clearInterval(interval)
  }, [checkHealth, fetchModels, models.length])

  // Fetch cloud models on mount and when providers change
  useEffect(() => {
    fetchCloudModels()
    const handler = () => fetchCloudModels()
    window.addEventListener('loom:providers_updated', handler)
    return () => window.removeEventListener('loom:providers_updated', handler)
  }, [fetchCloudModels])

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
