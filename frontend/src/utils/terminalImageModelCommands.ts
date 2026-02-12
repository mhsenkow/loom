import {
  fetchImageModels,
  invalidateImageModelsCache,
  notifyImageModelsUpdated,
} from './imageModelsApi'
import { getSocketInstance, PullStatus } from '../hooks/useSocket'

interface HandleImageModelCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  backendUrl: string
  connected: boolean
  addSystemEntry: (content: string, timestamp: number) => void
  addErrorEntry: (content: string, timestamp: number) => void
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void
  markCommandPending?: (detail?: string) => void
}

export function handleImageModelCommand(options: HandleImageModelCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    backendUrl,
    connected,
    addSystemEntry,
    addErrorEntry,
    setCommandStatus,
    markCommandPending,
  } = options

  switch (cmd) {
    case 'image-models':
      addSystemEntry('Fetching image generation models...', timestamp)
      fetchImageModels(backendUrl, { force: true })
        .then(data => {
          const localModels = data.local || []
          const hfModels = data.hf_models || data.huggingface || []
          const device = data.device || 'unknown'
          const current = data.current_model || 'none'

          let message = 'IMAGE GENERATION MODELS:\n\n'
          message += `Device: ${device.toUpperCase()}\n`
          message += `Current: ${current}\n\n`

          if (localModels.length > 0) {
            message += 'LOCAL MODELS:\n'
            localModels.forEach((m) => {
              const name = m.name || 'unknown'
              const vram = m.vram || '?'
              const repo = m.repo || ''
              message += `  ${name} (${vram} VRAM)`
              if (repo) message += `\n    → ${repo}`
              message += '\n'
            })
            message += '\n'
          }

          if (hfModels.length > 0) {
            message += 'HUGGINGFACE API MODELS:\n'
            hfModels.forEach((name: string) => {
              message += `  ${name}\n`
            })
            message += '\n'
          }

          message += 'To download a model:\n'
          message += '  /pull-image <name>\n'
          message += 'Examples:\n'
          message += '  /pull-image flux-schnell  (fast, requires HF token)\n'
          message += '  /pull-image sdxl          (good quality, no token needed)\n'
          message += '  /pull-image sd-1.5        (small, fast, no token needed)\n\n'
          message += 'Note: Flux models require HuggingFace token.\n'
          message += 'Get token: https://huggingface.co/settings/tokens\n'
          message += 'Set it: /set-hf-token <your-token>'

          addSystemEntry(message, Date.now())
          setCommandStatus?.('done', `${localModels.length} local image models`)
        })
        .catch(err => {
          addErrorEntry(`Failed to fetch image models: ${err.message}`, Date.now())
          setCommandStatus?.('failed', 'failed to fetch image models')
        })
      markCommandPending?.('fetching image models')
      return true

    case 'pull-image': {
      const imageModelToPull = args.join(' ').trim()
      if (!imageModelToPull) {
        addSystemEntry('Usage: /pull-image <model-name>\n\nAvailable models:\n  flux-schnell (fast, needs HF token)\n  flux-dev (best quality, needs HF token)\n  sdxl (good quality, no token)\n  sdxl-turbo (very fast, no token)\n  sd-1.5 (small, fast, no token)\n\nGet HF token: https://huggingface.co/settings/tokens', timestamp)
        return true
      }

      addSystemEntry(`Preparing image model "${imageModelToPull}"...\nThis will download the model on first use.`, timestamp)
      if (!connected) {
        addErrorEntry('Not connected to backend. Please wait for connection.', timestamp)
        setCommandStatus?.('failed', 'backend not connected')
        return true
      }

      const socket = getSocketInstance()
      if (!socket) {
        addErrorEntry('Not connected to backend. Please wait for connection.', timestamp)
        setCommandStatus?.('failed', 'backend socket unavailable')
        return true
      }

      socket.emit('pull_image_model', { model: imageModelToPull })
      const handler = (data: PullStatus) => {
        if (data.model !== imageModelToPull) return

        const status = data.status || 'unknown'
        const message = data.message || status

        if (status === 'success') {
          addSystemEntry(`✓ Image model "${imageModelToPull}" is ready!`, Date.now())
          invalidateImageModelsCache()
          notifyImageModelsUpdated()
          setCommandStatus?.('done', `image model "${imageModelToPull}" ready`)
          socket.off('pull_image_status', handler)
        } else if (status === 'error') {
          const errorMsg = data.error || data.message || 'Unknown error'
          let errorText = `✗ Failed to prepare model "${imageModelToPull}"\n\nError: ${errorMsg}`

          if (errorMsg.includes('token') || errorMsg.includes('authentication')) {
            errorText += '\n\nThis model requires a HuggingFace token.\n'
            errorText += 'Get one at: https://huggingface.co/settings/tokens\n'
            errorText += 'Then set it with: /set-hf-token <your-token>'
          }

          addErrorEntry(errorText, Date.now())
          setCommandStatus?.('failed', `failed to prepare "${imageModelToPull}"`)
          socket.off('pull_image_status', handler)
        } else {
          setCommandStatus?.('working', message)
        }
      }

      socket.on('pull_image_status', handler)
      setTimeout(() => {
        socket.off('pull_image_status', handler)
      }, 300000)
      markCommandPending?.(`preparing "${imageModelToPull}"`)
      return true
    }

    case 'set-hf-token': {
      const token = args.join(' ').trim()
      if (!token) {
        addSystemEntry('Usage: /set-hf-token <your-huggingface-token>\n\nGet a token from: https://huggingface.co/settings/tokens\n\nThis token is needed for Flux models and other gated models.', timestamp)
        return true
      }

      fetch(`${backendUrl}/api/images/config/huggingface`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then(res => res.json())
        .then(data => {
          if (data.status === 'ok') {
            addSystemEntry('✓ HuggingFace token set! You can now use Flux models.\n\nTry: /pull-image flux-schnell', Date.now())
            setCommandStatus?.('done', 'huggingface token saved')
          } else {
            addErrorEntry(`Failed to set token: ${data.message || 'Unknown error'}`, Date.now())
            setCommandStatus?.('failed', 'failed to save token')
          }
        })
        .catch(err => {
          addErrorEntry(`Failed to set token: ${err.message}`, Date.now())
          setCommandStatus?.('failed', 'failed to save token')
        })
      markCommandPending?.('saving huggingface token')
      return true
    }

    default:
      return false
  }
}
