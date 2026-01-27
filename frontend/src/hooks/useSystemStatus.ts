import { useState, useEffect, useCallback } from 'react'
import type { SystemStatus } from '../types/module'

const BACKEND_URL = 'http://localhost:8000'

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>({
    connected: false,
    memoryUsage: 0,
    tokenSpeed: 0,
    activeModel: undefined,
    visionModel: undefined,
  })

  const [models, setModels] = useState<string[]>([])

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
  }, [])

  // Fetch available models
  const fetchModels = useCallback(async () => {
    // First check if backend is reachable
    const health = await checkHealth()
    if (!health) {
      console.debug('[LOOM] Backend not reachable, skipping model fetch')
      return []
    }

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
        // Find chat model (non-embedding, non-vision)
        const chatModel = modelNames.find((n: string) => 
          !n.includes('embed') && 
          !n.toLowerCase().includes('llava') && 
          !n.toLowerCase().includes('bakllava') && 
          !n.toLowerCase().includes('moondream') &&
          !n.toLowerCase().includes('vision')
        )
        if (chatModel) {
          setStatus((prev) => ({
            ...prev,
            activeModel: prev.activeModel || chatModel,
          }))
        }
        
        // Find vision model (llava, bakllava, moondream, etc.)
        const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']
        const visionModel = modelNames.find((n: string) => 
          visionKeywords.some(keyword => n.toLowerCase().includes(keyword))
        )
        if (visionModel) {
          setStatus((prev) => ({
            ...prev,
            visionModel: prev.visionModel || visionModel,
          }))
        }
        
        // Find image generation model (flux, flux2, stable-diffusion)
        const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']
        const imageGenModel = modelNames.find((n: string) => 
          imageGenKeywords.some(keyword => n.toLowerCase().includes(keyword))
        )
        if (imageGenModel) {
          setStatus((prev) => ({
            ...prev,
            imageGenModel: prev.imageGenModel || imageGenModel,
          }))
        }
      }
      
      return modelNames
    } catch (error) {
      // Only log errors that aren't expected (like network timeouts during startup)
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        // This is expected if backend isn't running yet - don't spam console
        console.debug('[LOOM] Backend not available yet (this is normal during startup)')
      } else if (error instanceof Error && error.name !== 'AbortError' && error.name !== 'TimeoutError') {
        console.error('[LOOM] Failed to fetch models:', error)
      }
      return []
    }
  }, [checkHealth])

  // Set active model (chat)
  const setActiveModel = useCallback((model: string) => {
    setStatus((prev) => ({
      ...prev,
      activeModel: model,
    }))
  }, [])

  // Set vision model
  const setVisionModel = useCallback((model: string) => {
    setStatus((prev) => ({
      ...prev,
      visionModel: model,
    }))
  }, [])

  // Set image generation model
  const setImageGenModel = useCallback((model: string) => {
    setStatus((prev) => ({
      ...prev,
      imageGenModel: model,
    }))
  }, [])

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

  return {
    status,
    models,
    checkHealth,
    fetchModels,
    setActiveModel,
    setVisionModel,
    setImageGenModel,
  }
}
