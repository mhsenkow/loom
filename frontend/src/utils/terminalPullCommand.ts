import type { Dispatch, SetStateAction } from 'react'
import type { LogEntry } from '../types/module'

interface PullProgress {
  status?: string
  message?: string
  percent?: number
  completed?: number
  total?: number
  error?: string
}

interface DownloadProgressState {
  model: string
  status: string
  completed: number
  total: number
  percent?: number
  message?: string
  error?: string
}

interface TerminalSystemStatus {
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
    ram_gb?: number
    gpu_available?: boolean
    gpu_type?: string
  }
  suggestions?: SuggestedModel[]
}

interface HandlePullCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  backendUrl: string
  systemStatus: TerminalSystemStatus
  pullModel: (model: string, onProgress: (progress: PullProgress) => void) => void
  fetchModels: () => Promise<string[]>
  setVisionModel: (model: string) => void
  setImageGenModel: (model: string) => void
  setDownloadProgress: Dispatch<SetStateAction<DownloadProgressState | null>>
  setEntries: Dispatch<SetStateAction<LogEntry[]>>
  addSystemEntry: (content: string, timestamp: number) => void
  addErrorEntry: (content: string, timestamp: number) => void
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void
  markCommandPending?: (detail?: string) => void
}

export function handlePullCommand(options: HandlePullCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    backendUrl,
    systemStatus,
    pullModel,
    fetchModels,
    setVisionModel,
    setImageGenModel,
    setDownloadProgress,
    setEntries,
    addSystemEntry,
    addErrorEntry,
    setCommandStatus,
    markCommandPending,
  } = options

  if (cmd !== 'pull') return false

  const modelToPull = args.join(' ').trim()
  if (!modelToPull) {
    addSystemEntry('Analyzing your system and fetching model suggestions...', timestamp)
    fetch(`${backendUrl}/api/suggest-models`)
      .then(res => res.json() as Promise<SuggestedModelsResponse>)
      .then(data => {
        if (data.error) {
          addErrorEntry(`Failed to get suggestions: ${data.error}`, Date.now())
          addSystemEntry('Usage: /pull <model-name>\nExample: /pull llama3.1:8b', Date.now())
          setCommandStatus?.('failed', 'failed to fetch suggestions')
          return
        }

        const system = data.system || {}
        const suggestions = data.suggestions || []
        let message = 'MODEL SUGGESTIONS FOR YOUR SYSTEM:\n\n'
        message += `System: ${system.platform || 'Unknown'} | ${system.ram_gb || '?'}GB RAM`
        if (system.gpu_available) {
          message += ` | ${system.gpu_type || 'GPU'}`
        }
        message += '\n\n'

        if (suggestions.length > 0) {
          message += 'Recommended models:\n'
          suggestions.slice(0, 8).forEach((sug, idx) => {
            message += `  ${idx + 1}. ${sug.model || 'unknown-model'}\n`
            message += `     ${sug.description || 'No description'}\n`
            message += `     → ${sug.reason || 'No reason provided'}\n\n`
          })
          message += 'Usage: /pull <model-name>\nExample: /pull llama3.1:8b'
        } else {
          message += 'No suitable models found for your system specs.\n'
          message += 'Popular models to try:\n'
          message += '  llama3.1:8b\n  mistral\n  phi3:mini\n  tinyllama'
        }
        addSystemEntry(message, Date.now())
        setCommandStatus?.('done', 'suggestions ready')
      })
      .catch(() => {
        addSystemEntry('Usage: /pull <model-name>\nExample: /pull llama3.1:8b\n\nPopular models:\n  llama3.1:8b\n  llama3.1:70b\n  mistral\n  codellama\n  phi3\n\nDirect fix: Try /pull llama3.1:8b', Date.now())
        setCommandStatus?.('failed', 'failed to fetch suggestions')
      })
    markCommandPending?.('fetching system suggestions')
    return true
  }

  addSystemEntry(`Pulling model "${modelToPull}"...\nThis may take a while depending on model size.`, timestamp)
  setDownloadProgress({
    model: modelToPull,
    status: 'starting',
    completed: 0,
    total: 0,
    message: 'Initializing download...',
  })

  let progressEntryId: string | null = null
  pullModel(modelToPull, (progress) => {
    const progressTimestamp = Date.now()
    const progressStatus = progress.status || 'unknown'
    const message = progress.message || progressStatus
    const percent = progress.percent
    const completed = progress.completed || 0
    const total = progress.total || 0

    setDownloadProgress({
      model: modelToPull,
      status: progressStatus,
      completed,
      total,
      percent,
      message,
      error: progress.error,
    })

    if (progressStatus === 'success') {
      addSystemEntry(`✓ Model "${modelToPull}" downloaded successfully!`, progressTimestamp)
      fetchModels().then(() => {
        const visionKeywords = ['llava', 'bakllava', 'moondream', 'vision']
        const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']
        const isVisionModel = visionKeywords.some(keyword => modelToPull.toLowerCase().includes(keyword))
        const isImageGenModel = imageGenKeywords.some(keyword => modelToPull.toLowerCase().includes(keyword))

        if (isVisionModel && !systemStatus.visionModel) {
          setVisionModel(modelToPull)
        }
        if (isImageGenModel && !systemStatus.imageGenModel) {
          setImageGenModel(modelToPull)
        }
      })
      setTimeout(() => {
        setDownloadProgress(null)
      }, 5000)
      setCommandStatus?.('done', `model "${modelToPull}" ready`)
      return
    }

    if (progressStatus === 'error') {
      const errorMsg = progress.error || progress.message || 'Unknown error occurred'
      let errorText = `✗ Failed to download model "${modelToPull}"\n\nError: ${errorMsg}`
      if (errorMsg.includes('connection') || errorMsg.includes('refused')) {
        errorText += '\n\nTip: Make sure Ollama is running. Try: ollama list'
      } else if (errorMsg.includes('not found') || errorMsg.includes('404')) {
        errorText += '\n\nTip: Check the model name. Try: /suggest to see available models'
        errorText += '\nDirect fix: Try /pull llama3.1:8b'
      } else if (errorMsg.includes('permission') || errorMsg.includes('denied')) {
        errorText += '\n\nTip: Check file permissions for Ollama model storage'
      }
      addErrorEntry(errorText, progressTimestamp)
      setCommandStatus?.('failed', `failed to pull "${modelToPull}"`)
      return
    }

    let progressText = `${progressStatus}...`
    if (percent !== null && percent !== undefined) {
      progressText += ` ${percent}%`
    } else if (total > 0) {
      const mbCompleted = (completed / 1024 / 1024).toFixed(1)
      const mbTotal = (total / 1024 / 1024).toFixed(1)
      progressText += ` ${mbCompleted}MB / ${mbTotal}MB`
    }

    if (progressEntryId) {
      setEntries(prev => prev.map(entry =>
        entry.id === progressEntryId
          ? { ...entry, content: `Downloading "${modelToPull}": ${progressText}` }
          : entry
      ))
    } else {
      const newEntry: LogEntry = {
        id: `pull-${progressTimestamp}`,
        type: 'system',
        content: `Downloading "${modelToPull}": ${progressText}`,
        timestamp: progressTimestamp,
      }
      progressEntryId = newEntry.id
      setEntries(prev => [...prev, newEntry])
    }
  })

  markCommandPending?.(`pulling "${modelToPull}"`)

  return true
}
