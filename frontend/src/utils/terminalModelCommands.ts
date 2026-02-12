interface TerminalModelStatus {
  activeModel?: string
  visionModel?: string
  imageGenModel?: string
}

interface SuggestedModel {
  model?: string
  description?: string
  reason?: string
}

interface SuggestedModelsResponse {
  error?: string
  system?: {
    platform?: string
    architecture?: string
    ram_gb?: number
    ram_available_gb?: number
    cpu_cores?: number
    cpu_count?: number
    gpu_available?: boolean
    gpu_type?: string
    gpu_memory_gb?: number
  }
  suggestions?: SuggestedModel[]
}

interface HandleModelCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  backendUrl: string
  status: TerminalModelStatus
  models: string[]
  fetchModels: () => Promise<string[]>
  setActiveModel: (model: string) => void
  setVisionModel: (model: string) => void
  setImageGenModel: (model: string) => void
  addSystemEntry: (content: string, timestamp: number) => void
  addErrorEntry: (content: string, timestamp: number) => void
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void
  markCommandPending?: (detail?: string) => void
}

function resolveModelMatch(requested: string, models: string[]): string | null {
  if (models.includes(requested)) return requested
  return models.find(m => m.toLowerCase().includes(requested.toLowerCase())) || null
}

export function handleModelCommand(options: HandleModelCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    backendUrl,
    status,
    models,
    fetchModels,
    setActiveModel,
    setVisionModel,
    setImageGenModel,
    addSystemEntry,
    addErrorEntry,
    setCommandStatus,
    markCommandPending,
  } = options

  switch (cmd) {
    case 'model': {
      const modelName = args.join(' ').trim()
      if (!modelName) {
        const modelInfo = [
          `Current chat model: ${status.activeModel || 'not set'}`,
          `Current vision model: ${status.visionModel || 'not set'}`,
          `Current image gen model: ${status.imageGenModel || 'not set'}`,
          '',
          'Usage: /model <name> - Set chat model',
          '       /vision <name> - Set vision model',
          '       /gen <name> - Set image generation model',
          'Example: /model llama3.1:8b',
          'Example: /model auto',
          'Example: /vision llava:7b',
        ].join('\n')
        addSystemEntry(modelInfo, timestamp)
        return true
      }

      if (modelName.toLowerCase() === 'auto') {
        setActiveModel('auto')
        addSystemEntry('Chat model set to: Auto (Orchestrator)', timestamp)
        setCommandStatus?.('done', 'chat model set to auto')
        return true
      }

      const match = resolveModelMatch(modelName, models)
      if (match) {
        setActiveModel(match)
        addSystemEntry(`Chat model switched to: ${match}`, timestamp)
        setCommandStatus?.('done', `chat model set to ${match}`)
        return true
      }

      if (models.length === 0) {
        addSystemEntry('No models loaded. Fetching from backend...', timestamp)
        fetchModels().then((fetchedModels) => {
          const fetchedMatch = resolveModelMatch(modelName, fetchedModels)
          if (fetchedMatch) {
            setActiveModel(fetchedMatch)
            addSystemEntry(`Chat model switched to: ${fetchedMatch}`, Date.now())
            setCommandStatus?.('done', `chat model set to ${fetchedMatch}`)
          } else if (fetchedModels.length > 0) {
            addErrorEntry(`Model "${modelName}" not found.\nAvailable: ${fetchedModels.slice(0, 10).join(', ')}${fetchedModels.length > 10 ? '...' : ''}\n\nDirect fix: Try /pull llama3.1:8b`, Date.now())
            setCommandStatus?.('failed', `model "${modelName}" not found`)
          } else {
            addErrorEntry(`Model "${modelName}" not found.\nNo models available. Is Ollama running?\n\nDirect fix: Try /pull llama3.1:8b`, Date.now())
            setCommandStatus?.('failed', 'no models available')
          }
        })
        markCommandPending?.(`resolving model "${modelName}"`)
      } else {
        addErrorEntry(`Model "${modelName}" not found.\nAvailable: ${models.slice(0, 10).join(', ')}${models.length > 10 ? '...' : ''}\n\nDirect fix: Try /pull llama3.1:8b`, timestamp)
        setCommandStatus?.('failed', `model "${modelName}" not found`)
      }
      return true
    }

    case 'vision': {
      const visionModelName = args.join(' ').trim()
      if (!visionModelName) {
        addSystemEntry(`Current vision model: ${status.visionModel || 'not set'}\n\nUsage: /vision <name>\nExample: /vision llava:7b`, timestamp)
        return true
      }

      const match = resolveModelMatch(visionModelName, models)
      if (match) {
        setVisionModel(match)
        addSystemEntry(`Vision model switched to: ${match}`, timestamp)
        setCommandStatus?.('done', `vision model set to ${match}`)
        return true
      }

      if (models.length === 0) {
        addSystemEntry('No models loaded. Fetching from backend...', timestamp)
        fetchModels().then((fetchedModels) => {
          const fetchedMatch = resolveModelMatch(visionModelName, fetchedModels)
          if (fetchedMatch) {
            setVisionModel(fetchedMatch)
            addSystemEntry(`Vision model switched to: ${fetchedMatch}`, Date.now())
            setCommandStatus?.('done', `vision model set to ${fetchedMatch}`)
          } else if (fetchedModels.length > 0) {
            addErrorEntry(`Vision model "${visionModelName}" not found.\nAvailable: ${fetchedModels.slice(0, 10).join(', ')}${fetchedModels.length > 10 ? '...' : ''}`, Date.now())
            setCommandStatus?.('failed', `vision model "${visionModelName}" not found`)
          } else {
            addErrorEntry('No models available. Is Ollama running?\n\nDirect fix: Try /pull llama3.1:8b', Date.now())
            setCommandStatus?.('failed', 'no models available')
          }
        })
        markCommandPending?.(`resolving vision model "${visionModelName}"`)
      } else {
        addErrorEntry(`Vision model "${visionModelName}" not found.\nAvailable: ${models.slice(0, 10).join(', ')}${models.length > 10 ? '...' : ''}\n\nDirect fix: Try /pull llava:7b`, timestamp)
        setCommandStatus?.('failed', `vision model "${visionModelName}" not found`)
      }
      return true
    }

    case 'gen':
    case 'image-gen': {
      const imageGenModelName = args.join(' ').trim()
      if (!imageGenModelName) {
        addSystemEntry(`Current image generation model: ${status.imageGenModel || 'not set'}\n\nUsage: /gen <name> or /image-gen <name>\nExample: /gen x/flux2-klein`, timestamp)
        return true
      }

      const match = resolveModelMatch(imageGenModelName, models)
      if (match) {
        setImageGenModel(match)
        addSystemEntry(`Image generation model switched to: ${match}`, timestamp)
        setCommandStatus?.('done', `image model set to ${match}`)
        return true
      }

      if (models.length === 0) {
        addSystemEntry('No models loaded. Fetching from backend...', timestamp)
        fetchModels().then((fetchedModels) => {
          const fetchedMatch = resolveModelMatch(imageGenModelName, fetchedModels)
          if (fetchedMatch) {
            setImageGenModel(fetchedMatch)
            addSystemEntry(`Image generation model switched to: ${fetchedMatch}`, Date.now())
            setCommandStatus?.('done', `image model set to ${fetchedMatch}`)
          } else if (fetchedModels.length > 0) {
            addErrorEntry(`Image generation model "${imageGenModelName}" not found.\nAvailable: ${fetchedModels.slice(0, 10).join(', ')}${fetchedModels.length > 10 ? '...' : ''}\n\nInstall with: /pull ${imageGenModelName}`, Date.now())
            setCommandStatus?.('failed', `image model "${imageGenModelName}" not found`)
          } else {
            addErrorEntry('No models available. Is Ollama running?\n\nDirect fix: Try /pull x/flux2-klein', Date.now())
            setCommandStatus?.('failed', 'no models available')
          }
        })
        markCommandPending?.(`resolving image model "${imageGenModelName}"`)
      } else {
        addErrorEntry(`Image generation model "${imageGenModelName}" not found.\nAvailable: ${models.slice(0, 10).join(', ')}${models.length > 10 ? '...' : ''}\n\nInstall with: /pull ${imageGenModelName}\nDirect fix: Try /pull x/flux2-klein`, timestamp)
        setCommandStatus?.('failed', `image model "${imageGenModelName}" not found`)
      }
      return true
    }

    case 'models':
      addSystemEntry('Fetching models from Ollama...', timestamp)
      fetchModels().then((modelList) => {
        if (modelList.length === 0) {
          addSystemEntry(
            'No models found.\n\nFirst run steps:\n1. Start Ollama\n2. Pull a model (e.g. /pull llama3.1:8b)\n3. Run /models again',
            Date.now(),
          )
          setCommandStatus?.('done', 'no models found')
          return
        }

        const activeModel = status.activeModel
        const visionModel = status.visionModel
        const imageGenModel = status.imageGenModel
        const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']
        const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']

        const currentMarker = (model: string): string => {
          if (model === activeModel) return ' ← chat'
          if (model === visionModel) return ' ← vision'
          if (model === imageGenModel) return ' ← image-gen'
          return ''
        }

        const typeMarker = (model: string): string => {
          const lower = model.toLowerCase()
          if (visionKeywords.some(k => lower.includes(k))) return ' [vision]'
          if (imageGenKeywords.some(k => lower.includes(k))) return ' [image-gen]'
          return ' [chat]'
        }

        addSystemEntry(`Available models (${modelList.length}):\n  ${modelList.map(model => model + typeMarker(model) + currentMarker(model)).join('\n  ')}`, Date.now())
        setCommandStatus?.('done', `${modelList.length} models listed`)
      }).catch((error) => {
        addErrorEntry(`Failed to fetch models: ${error.message}`, Date.now())
        setCommandStatus?.('failed', 'failed to fetch models')
      })
      markCommandPending?.('fetching models')
      return true

    case 'suggest':
      addSystemEntry('Analyzing your system and fetching model suggestions...', timestamp)
      fetch(`${backendUrl}/api/suggest-models`)
        .then(res => res.json() as Promise<SuggestedModelsResponse>)
        .then(data => {
          if (data.error) {
            addErrorEntry(`Failed to get suggestions: ${data.error}`, Date.now())
            setCommandStatus?.('failed', 'failed to fetch suggestions')
            return
          }

          const system = data.system || {}
          const suggestions = data.suggestions || []
          let message = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
          message += '  MODEL SUGGESTIONS FOR YOUR SYSTEM\n'
          message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n'
          message += 'SYSTEM SPECS:\n'
          message += `  Platform: ${system.platform || 'Unknown'} ${system.architecture || ''}\n`
          message += `  RAM: ${system.ram_gb || '?'}GB total, ${system.ram_available_gb || '?'}GB available\n`
          message += `  CPU: ${system.cpu_cores || '?'} cores (${system.cpu_count || '?'} threads)\n`
          if (system.gpu_available) {
            message += `  GPU: ${system.gpu_type || 'Available'}\n`
            if (system.gpu_memory_gb) {
              message += `  GPU Memory: ${system.gpu_memory_gb}GB\n`
            }
          } else {
            message += '  GPU: Not available (CPU-only mode)\n'
          }
          message += '\n'

          if (suggestions.length > 0) {
            message += 'RECOMMENDED MODELS:\n\n'
            suggestions.forEach((sug, idx) => {
              message += `  ${idx + 1}. ${sug.model || 'unknown-model'}\n`
              message += `     ${sug.description || 'No description'}\n`
              message += `     → ${sug.reason || 'No reason provided'}\n\n`
            })
            message += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
            message += 'To download a model, use: /pull <model-name>\n'
            message += 'Example: /pull llama3.1:8b'
          } else {
            message += 'No suitable models found for your system specs.\n\n'
            message += 'You may want to try lightweight models:\n'
            message += '  /pull tinyllama\n'
            message += '  /pull phi3:mini\n'
            message += '  /pull gemma:2b'
          }

          addSystemEntry(message, Date.now())
          setCommandStatus?.('done', 'suggestions ready')
        })
        .catch((err: unknown) => {
          const message = err instanceof Error ? err.message : String(err)
          addErrorEntry(`Failed to fetch suggestions: ${message}`, Date.now())
          setCommandStatus?.('failed', 'failed to fetch suggestions')
        })
      markCommandPending?.('fetching system suggestions')
      return true

    default:
      return false
  }
}
