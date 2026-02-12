import type { Dispatch, SetStateAction } from 'react'

interface TerminalSystemStatus {
  imageGenModel?: string
}

interface ImageGenerationState {
  prompt: string
  imageUrl?: string
  model: string
  status: 'generating' | 'success' | 'error' | 'no-model' | 'empty'
  error?: string
  progress?: number
  message?: string
  availableModels?: string[]
  recommendedModels?: Array<{ name: string; description: string; size: string }>
}

interface HandleImageCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  backendUrl: string
  systemStatus: TerminalSystemStatus
  setImageGenModel: (model: string) => void
  setImageGeneration: Dispatch<SetStateAction<ImageGenerationState | null>>
  addSystemEntry: (content: string, timestamp: number) => void
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void
  markCommandPending?: (detail?: string) => void
}

interface GenerateResponse {
  status?: string
  image?: string
  model?: string
  error?: string
  message?: string
  detail?: string
}

async function tryGenerateImage(
  backendUrl: string,
  prompt: string,
  provider: 'ollama' | 'local',
  model?: string,
): Promise<GenerateResponse> {
  const res = await fetch(`${backendUrl}/api/images/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      provider,
      model,
    }),
  })
  return res.json()
}

export function handleImageCommand(options: HandleImageCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    backendUrl,
    systemStatus,
    setImageGenModel,
    setImageGeneration,
    addSystemEntry,
    setCommandStatus,
    markCommandPending,
  } = options

  if (cmd === 'image') {
    addSystemEntry('Click 📷 or paste an image (Cmd/Ctrl+V) in the input to analyze with the vision model.', timestamp)
    setTimeout(() => {
      const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement | null
      fileInput?.click()
    }, 100)
    setCommandStatus?.('done', 'opened image picker')
    return true
  }

  if (cmd !== 'imagine' && cmd !== 'dream') {
    return false
  }

  const imagePrompt = args.join(' ')
  if (!imagePrompt) {
    setImageGeneration({
      prompt: '',
      model: systemStatus.imageGenModel || 'auto-detecting',
      status: 'empty',
      availableModels: [],
    })
    return true
  }

  addSystemEntry('⏳ Generating image... Opening panel. This may take 1-2 minutes.', timestamp)
  setImageGeneration({
    prompt: imagePrompt,
    model: systemStatus.imageGenModel || 'auto-detecting',
    status: 'generating',
    progress: 0,
    message: 'Starting...',
  })

  const runGeneration = async () => {
    try {
      const ollamaData = await tryGenerateImage(
        backendUrl,
        imagePrompt,
        'ollama',
        systemStatus.imageGenModel || undefined,
      )
      if (ollamaData.status === 'success' && ollamaData.image) {
        if (ollamaData.model && ollamaData.model !== systemStatus.imageGenModel) {
          setImageGenModel(ollamaData.model)
        }
        setImageGeneration({
          prompt: imagePrompt,
          imageUrl: ollamaData.image,
          model: ollamaData.model || 'Ollama',
          status: 'success',
        })
        setCommandStatus?.('done', `generated with ${ollamaData.model || 'ollama'}`)
        return
      }
      throw new Error(ollamaData.error || ollamaData.message || ollamaData.detail || 'Ollama generation failed')
    } catch {
      try {
        const localData = await tryGenerateImage(backendUrl, imagePrompt, 'local', 'sdxl')
        if (localData.status === 'success' && localData.image) {
          setImageGeneration({
            prompt: imagePrompt,
            imageUrl: localData.image,
            model: 'local SDXL',
            status: 'success',
          })
          setCommandStatus?.('done', 'generated with local SDXL')
          return
        }
        throw new Error(localData.error || localData.message || localData.detail || 'Image generation failed')
      } catch (localErr) {
        setImageGeneration({
          prompt: imagePrompt,
          model: systemStatus.imageGenModel || 'unknown',
          status: 'error',
          error: localErr instanceof Error ? localErr.message : String(localErr),
        })
        setCommandStatus?.('failed', 'image generation failed')
      }
    }
  }

  fetch(`${backendUrl}/api/images/check-image-gen-models`)
    .then(res => res.json())
    .then(async (checkData) => {
      const available = checkData.available || []
      if (available.length === 0 && !systemStatus.imageGenModel) {
        setImageGeneration({
          prompt: imagePrompt,
          model: 'none',
          status: 'no-model',
          availableModels: available,
          recommendedModels: checkData.recommendations || [],
        })
        setCommandStatus?.('failed', 'no image generation model available')
        return
      }

      setImageGeneration(prev => prev ? { ...prev, message: 'Rendering...' } : null)
      await runGeneration()
    })
    .catch(async () => {
      setImageGeneration(prev => prev ? { ...prev, model: 'checking...', status: 'generating', progress: 0 } : null)
      await runGeneration()
    })

  markCommandPending?.(`generating image for "${imagePrompt.slice(0, 40)}${imagePrompt.length > 40 ? '…' : ''}"`)

  return true
}
