import { useState, useEffect, useCallback } from 'react'
import type { SystemStatus } from '../types/module'

const BACKEND_URL = 'http://localhost:8000'

export function useSystemStatus() {
  const [status, setStatus] = useState<SystemStatus>({
    connected: false,
    memoryUsage: 0,
    tokenSpeed: 0,
    activeModel: undefined,
  })

  const [models, setModels] = useState<string[]>([])

  // Check backend health
  const checkHealth = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`)
      if (response.ok) {
        const data = await response.json()
        setStatus((prev) => ({
          ...prev,
          connected: true,
        }))
        return data
      }
    } catch {
      setStatus((prev) => ({
        ...prev,
        connected: false,
      }))
    }
    return null
  }, [])

  // Fetch available models
  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/models`)
      if (response.ok) {
        const data = await response.json()
        const modelNames = data.models
          ?.map((m: { name: string }) => m.name)
          .filter((name: string) => name && name !== 'unknown') || []
        
        setModels(modelNames)
        
        // Set first non-embedding model as active if not set
        if (modelNames.length > 0) {
          const chatModel = modelNames.find((n: string) => !n.includes('embed'))
          if (chatModel) {
            setStatus((prev) => ({
              ...prev,
              activeModel: prev.activeModel || chatModel,
            }))
          }
        }
        
        return modelNames
      }
    } catch (error) {
      console.error('[LOOM] Failed to fetch models:', error)
    }
    return []
  }, [])

  // Set active model
  const setActiveModel = useCallback((model: string) => {
    setStatus((prev) => ({
      ...prev,
      activeModel: model,
    }))
  }, [])

  // Poll health on mount
  useEffect(() => {
    checkHealth()
    fetchModels()

    const interval = setInterval(checkHealth, 10000) // Check every 10s
    return () => clearInterval(interval)
  }, [checkHealth, fetchModels])

  return {
    status,
    models,
    checkHealth,
    fetchModels,
    setActiveModel,
  }
}
