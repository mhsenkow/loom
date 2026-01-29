import { useEffect, useState } from 'react'
import { ImageModal } from './ImageModal'

interface ImageGeneration {
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

interface ImageGenerationPanelProps {
  generation: ImageGeneration | null
  onClose?: () => void
  onPullModel?: (modelName: string) => void
  onApproveToChat?: (imageUrl: string, prompt: string) => void
  onRetryGeneration?: (prompt: string, modelName: string) => void
  onEditImage?: (imageUrl: string, editPrompt: string) => void
  allModels?: string[]
  downloadProgress?: {
    model: string
    status: string
    completed: number
    total: number
  } | null
}

// ASCII art for image generation
const ASCII_FRAMES = [
  '◐', '◓', '◑', '◒',
]

// Recommended image generation models
const RECOMMENDED_IMAGE_GEN_MODELS = [
  { name: 'x/flux2-klein', description: 'FLUX.2 Klein - Fast, great text rendering, macOS only', size: '~5.7GB (4B) or ~12GB (9B)' },
  { name: 'x/flux2-klein:4b', description: 'FLUX.2 Klein 4B - Smaller, faster version', size: '~5.7GB' },
  { name: 'x/flux2-klein:9b', description: 'FLUX.2 Klein 9B - Higher quality version', size: '~12GB' },
]

export function ImageGenerationPanel({ 
  generation, 
  onClose, 
  onPullModel, 
  onApproveToChat, 
  onRetryGeneration,
  onEditImage,
  allModels = [], 
  downloadProgress 
}: ImageGenerationPanelProps) {
  const [showImageModal, setShowImageModal] = useState(false)
  const [frameIndex, setFrameIndex] = useState(0)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [showModelSelector, setShowModelSelector] = useState(false)
  const [promptInput, setPromptInput] = useState<string>('')

  // Filter to only image generation models
  const imageGenKeywords = ['flux', 'flux2', 'stable-diffusion']
  const imageGenModels = allModels.filter(m => 
    imageGenKeywords.some(keyword => m.toLowerCase().includes(keyword))
  )
  
  // Combine available and recommended models
  const allImageGenOptions = [
    ...(generation?.availableModels || []),
    ...imageGenModels.filter(m => !generation?.availableModels?.includes(m))
  ]
  
  // Add recommended models that aren't installed
  const recommendedNotInstalled = RECOMMENDED_IMAGE_GEN_MODELS.filter(
    rec => !allImageGenOptions.some(installed => installed.toLowerCase().includes(rec.name.toLowerCase().split(':')[0]))
  )

  // Animate spinner while generating or downloading
  useEffect(() => {
    const isActive = generation && (
      generation.status === 'generating' || 
      generation.status === 'no-model' ||
      (downloadProgress && downloadProgress.status !== 'success' && downloadProgress.status !== 'error')
    )
    
    if (!isActive) return

    const interval = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % ASCII_FRAMES.length)
    }, 150)

    return () => clearInterval(interval)
  }, [generation?.status, downloadProgress?.status])

  if (!generation) {
    console.log('[ImageGenerationPanel] No generation data, not rendering')
    return null
  }
  
  console.log('[ImageGenerationPanel] Rendering with status:', generation.status)

  const isDownloading = Boolean(
    downloadProgress && 
    downloadProgress.model && 
    downloadProgress.status !== 'success' && 
    downloadProgress.status !== 'error'
  )

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-slate border-l-2 border-phosphor z-40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-terminal-border flex items-center justify-between bg-void/50">
        <div>
          <h2 className="text-sm font-bold text-phosphor">IMAGE GENERATION</h2>
          <p className="text-[10px] text-terminal-muted mt-0.5">Creating from prompt</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-terminal-muted hover:text-phosphor text-lg px-2"
            title="Close panel"
          >
            ×
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Empty State */}
        {generation.status === 'empty' && (
          <div className="space-y-4">
            {/* Placeholder Image - Retro Terminal ASCII Art */}
            <div className="border border-phosphor/30 bg-void/50 p-6 flex items-center justify-center min-h-[240px] font-mono">
              <div className="text-center space-y-2 text-phosphor/40 text-[10px] leading-tight">
                <div className="whitespace-pre">
{`╔═══════════════════════════════════╗
║  LOOM IMAGE GENERATION        ║
╠═══════════════════════════════════╣
║                                   ║
║   ██████╗ ██╗   ██╗███████╗      ║
║   ██╔══██╗██║   ██║██╔════╝      ║
║   ██████╔╝██║   ██║█████╗        ║
║   ██╔══██╗██║   ██║██╔══╝        ║
║   ██║  ██║╚██████╔╝███████╗      ║
║   ╚═╝  ╚═╝ ╚═════╝ ╚══════╝      ║
║                                   ║
║   [RETRO TERMINAL AESTHETIC]      ║
║                                   ║
║   Type /dream in chat to begin    ║
╚═══════════════════════════════════╝`}
                </div>
              </div>
            </div>

            {/* Prompting Advice */}
            <div className="border-l-2 border-phosphor/50 pl-3 space-y-3">
              <div className="text-xs text-phosphor font-bold">PROMPTING GUIDE</div>
              
              <div className="space-y-2 text-[10px] text-terminal-muted">
                <div>
                  <span className="text-phosphor/70 font-bold">✓ Be Specific:</span>
                  <div className="mt-1 ml-4 font-mono text-[9px]">
                    "a retro terminal with green phosphor text on black background, 1980s computer aesthetic"
                  </div>
                </div>
                
                <div>
                  <span className="text-phosphor/70 font-bold">✓ Include Style:</span>
                  <div className="mt-1 ml-4 font-mono text-[9px]">
                    "cassette futurism", "cyberpunk", "vaporwave", "brutalist"
                  </div>
                </div>
                
                <div>
                  <span className="text-phosphor/70 font-bold">✓ Add Details:</span>
                  <div className="mt-1 ml-4 font-mono text-[9px]">
                    lighting, colors, mood, composition, era
                  </div>
                </div>
                
                <div>
                  <span className="text-phosphor/70 font-bold">✓ Use Negative Prompts:</span>
                  <div className="mt-1 ml-4 font-mono text-[9px]">
                    "blurry, low quality, distorted, watermark"
                  </div>
                </div>
              </div>

              <div className="border-t border-terminal-border/30 pt-2 mt-3">
                <div className="text-[9px] text-terminal-muted">
                  Example: <span className="text-phosphor font-mono">/dream a retro terminal with green phosphor text, 1980s aesthetic</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Prompt */}
        {generation.status !== 'empty' && (
          <div>
            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">PROMPT</div>
            {!generation.prompt && generation.status === 'generating' ? (
              <div className="space-y-2">
                <textarea
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Enter image generation prompt..."
                  className="w-full bg-void border border-terminal-border text-phosphor text-xs px-2 py-1.5 resize-none focus:outline-none focus:border-phosphor placeholder:text-terminal-muted/50 font-mono"
                  rows={3}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey && promptInput.trim()) {
                      e.preventDefault()
                      onRetryGeneration?.(promptInput.trim(), generation.model)
                    }
                  }}
                />
                {onRetryGeneration && (
                  <button
                    onClick={() => promptInput.trim() && onRetryGeneration(promptInput.trim(), generation.model)}
                    disabled={!promptInput.trim()}
                    className="w-full bg-phosphor text-void px-4 py-2 text-xs font-bold hover:bg-phosphor/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    GENERATE
                  </button>
                )}
              </div>
            ) : (
              <div className="text-xs text-phosphor font-mono bg-void/30 p-2 border border-terminal-border/30">
                {generation.prompt || '(No prompt)'}
              </div>
            )}
          </div>
        )}

        {/* Generating State */}
        {generation.status === 'generating' && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 border border-phosphor/30 bg-phosphor/5 rounded">
              <span className="text-2xl text-phosphor animate-pulse" aria-hidden>{ASCII_FRAMES[frameIndex]}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-phosphor">Generating image…</div>
                <div className="text-[10px] text-terminal-muted mt-1">
                  This may take 1–2 minutes. The panel shows progress.
                </div>
                {generation.progress !== undefined && generation.progress > 0 && (
                  <div className="mt-2">
                    <div className="h-1.5 bg-void border border-terminal-border/30 overflow-hidden rounded-full">
                      <div 
                        className="h-full bg-phosphor transition-all duration-300 rounded-full"
                        style={{ width: `${generation.progress}%` }}
                      />
                    </div>
                    <div className="text-[9px] text-terminal-muted mt-1">{generation.progress.toFixed(0)}%</div>
                  </div>
                )}
                {(!generation.progress || generation.progress === 0) && (
                  <div className="mt-2 h-1.5 bg-void/50 border border-terminal-border/20 rounded-full overflow-hidden">
                    <div 
                      className="h-full w-full bg-phosphor/30 rounded-full animate-pulse"
                    />
                  </div>
                )}
                {generation.message && (
                  <div className="text-[9px] text-terminal-muted mt-1">{generation.message}</div>
                )}
              </div>
            </div>
            <div className="text-[9px] text-terminal-muted">
              Model: {generation.model || 'auto-detecting…'}
            </div>
          </div>
        )}

        {/* Success State */}
        {generation.status === 'success' && generation.imageUrl && (
          <div className="space-y-3">
            <div>
              <div className="text-[10px] text-terminal-muted tracking-widest mb-2">GENERATED IMAGE</div>
              <div className="border border-terminal-border bg-void/30 p-2">
                <img 
                  src={generation.imageUrl} 
                  alt={generation.prompt}
                  className="w-full h-auto max-h-96 object-contain cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setShowImageModal(true)}
                  title="Click to view full screen"
                />
              </div>
            </div>
            <div className="text-[9px] text-terminal-muted">
              Generated using: {generation.model}
            </div>
            {onApproveToChat && (
              <button
                onClick={() => onApproveToChat(generation.imageUrl!, generation.prompt)}
                className="w-full bg-phosphor text-void px-4 py-2 text-xs font-bold hover:bg-phosphor/90 transition-colors"
              >
                ✓ APPROVE & ADD TO CHAT
              </button>
            )}
            {onRetryGeneration && (
              <button
                onClick={() => {
                  setShowModelSelector(true)
                }}
                className="w-full border border-terminal-border text-phosphor px-4 py-2 text-xs hover:bg-void/50 transition-colors"
              >
                🔄 TRY DIFFERENT MODEL
              </button>
            )}
          </div>
        )}

        {/* Error State */}
        {generation.status === 'error' && (
          <div className="space-y-3">
            <div className="border-l-2 border-red-500 pl-3">
              <div className="text-xs text-red-400 font-bold">ERROR</div>
              <div className="text-[10px] text-red-400/80 mt-1 font-mono">
                {generation.error || 'Image generation failed'}
              </div>
            </div>
            {onRetryGeneration && (
              <button
                onClick={() => onRetryGeneration(generation.prompt, generation.model)}
                className="w-full border border-terminal-border text-phosphor px-4 py-2 text-xs hover:bg-void/50 transition-colors"
              >
                🔄 RETRY
              </button>
            )}
          </div>
        )}

        {/* No Model State */}
        {generation.status === 'no-model' && (
          <div className="space-y-3">
            <div className="border-l-2 border-amber-500 pl-3">
              <div className="text-xs text-amber-400 font-bold">NO IMAGE GENERATION MODEL</div>
              <div className="text-[10px] text-amber-400/80 mt-1">
                Install a model to generate images.
              </div>
            </div>

            {/* Recommended Models */}
            {generation.recommendedModels && generation.recommendedModels.length > 0 && (
              <div>
                <div className="text-[10px] text-terminal-muted tracking-widest mb-2">RECOMMENDED</div>
                <div className="space-y-2">
                  {generation.recommendedModels.map((model) => (
                    <div key={model.name} className="border border-terminal-border/30 p-2 bg-void/20">
                      <div className="text-xs text-phosphor font-mono">{model.name}</div>
                      <div className="text-[9px] text-terminal-muted mt-1">{model.description}</div>
                      <div className="text-[8px] text-terminal-muted mt-1">Size: {model.size}</div>
                      {onPullModel && (
                        <button
                          onClick={() => onPullModel(model.name)}
                          disabled={isDownloading && downloadProgress?.model === model.name}
                          className="mt-2 w-full bg-phosphor/20 text-phosphor px-2 py-1 text-[10px] hover:bg-phosphor/30 transition-colors disabled:opacity-50"
                        >
                          {isDownloading && downloadProgress?.model === model.name ? 'Installing...' : 'Install'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Available Models (if any) */}
            {generation.availableModels && generation.availableModels.length > 0 && (
              <div>
                <div className="text-[10px] text-terminal-muted tracking-widest mb-2">AVAILABLE</div>
                <div className="space-y-1">
                  {generation.availableModels.map((model) => (
                    <button
                      key={model}
                      onClick={() => onRetryGeneration?.(generation.prompt, model)}
                      className="w-full text-left px-2 py-1 text-xs text-phosphor hover:bg-void/30 border border-terminal-border/30"
                    >
                      {model}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Model Selector */}
        {showModelSelector && (
          <div className="border-t border-terminal-border pt-3 mt-3">
            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">SELECT MODEL</div>
            <div className="space-y-1">
              {allImageGenOptions.map((model) => (
                <button
                  key={model}
                  onClick={() => {
                    setSelectedModel(model)
                    onRetryGeneration?.(generation.prompt, model)
                    setShowModelSelector(false)
                  }}
                  className="w-full text-left px-2 py-1 text-xs text-phosphor hover:bg-void/30 border border-terminal-border/30"
                >
                  {model}
                </button>
              ))}
              {recommendedNotInstalled.map((model) => (
                <div key={model.name} className="border border-terminal-border/30 p-2 bg-void/20">
                  <div className="text-xs text-phosphor/70 font-mono">{model.name}</div>
                  <div className="text-[9px] text-terminal-muted mt-1">{model.description}</div>
                  {onPullModel && (
                    <button
                      onClick={() => onPullModel(model.name)}
                      className="mt-1 text-[9px] text-phosphor hover:underline"
                    >
                      Install
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Download Progress */}
        {isDownloading && downloadProgress && (
          <div className="border-t border-terminal-border pt-3 mt-3">
            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">DOWNLOADING</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-lg text-phosphor">{ASCII_FRAMES[frameIndex]}</span>
                <div className="flex-1">
                  <div className="text-xs text-phosphor">{downloadProgress.model}</div>
                  {downloadProgress.total > 0 && (
                    <div className="mt-1">
                      <div className="h-1 bg-void border border-terminal-border/30 overflow-hidden">
                        <div 
                          className="h-full bg-phosphor transition-all duration-300"
                          style={{ 
                            width: downloadProgress.total > 0 
                              ? `${(downloadProgress.completed / downloadProgress.total) * 100}%` 
                              : '0%' 
                          }}
                        />
                      </div>
                      <div className="text-[9px] text-terminal-muted mt-1">
                        {downloadProgress.completed > 0 && downloadProgress.total > 0
                          ? `${((downloadProgress.completed / downloadProgress.total) * 100).toFixed(0)}%`
                          : 'Starting...'}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Image Modal */}
      {generation.status === 'success' && generation.imageUrl && (
        <ImageModal
          isOpen={showImageModal}
          onClose={() => setShowImageModal(false)}
          imageUrl={generation.imageUrl}
          metadata={{
            prompt: generation.prompt,
            model: generation.model,
            timestamp: Date.now(),
            provider: 'ollama',
          }}
          onEdit={onEditImage}
          canEdit={true}
        />
      )}
    </div>
  )
}
