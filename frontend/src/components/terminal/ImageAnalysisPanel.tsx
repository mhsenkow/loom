import { useEffect, useState } from 'react'

interface ImageAnalysis {
  imageUrl: string
  analysis: string
  model: string
  status: 'analyzing' | 'success' | 'error' | 'no-model'
  error?: string
  availableVisionModels?: string[]
  recommendedModels?: Array<{ name: string; description: string; size: string }>
}

interface ImageAnalysisPanelProps {
  analysis: ImageAnalysis | null
  onClose?: () => void
  onPullModel?: (modelName: string) => void
  onApproveToChat?: (imageUrl: string, analysis: string) => void
  onRetryAnalysis?: (imageUrl: string, modelName: string) => void
  allModels?: string[]
  downloadProgress?: {
    model: string
    status: string
    completed: number
    total: number
  } | null
}

// ASCII art for image analysis
const ASCII_FRAMES = [
  '◐', '◓', '◑', '◒',
]

// Recommended vision models
const RECOMMENDED_VISION_MODELS = [
  { name: 'llava:7b', description: 'LLaVA 7B - Best balance of quality and speed', size: '~4.3GB' },
  { name: 'llava:13b', description: 'LLaVA 13B - Higher quality, more accurate', size: '~7.3GB' },
  { name: 'bakllava', description: 'BakLLaVA - Fast and efficient vision model', size: '~3.8GB' },
  { name: 'moondream', description: 'Moondream - Lightweight vision model', size: '~1.6GB' },
]

export function ImageAnalysisPanel({ analysis, onClose, onPullModel, onApproveToChat, onRetryAnalysis, allModels = [], downloadProgress }: ImageAnalysisPanelProps) {
  const [frameIndex, setFrameIndex] = useState(0)
  const [checkingModels, setCheckingModels] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [showModelSelector, setShowModelSelector] = useState(false)

  // Filter to only vision models
  const visionKeywords = ['llava', 'bakllava', 'moondream', 'llama-vision']
  const visionModels = allModels.filter(m => 
    visionKeywords.some(keyword => m.toLowerCase().includes(keyword))
  )
  
  // Combine available and recommended models
  const allVisionOptions = [
    ...(analysis?.availableVisionModels || []),
    ...visionModels.filter(m => !analysis?.availableVisionModels?.includes(m))
  ]
  
  // Add recommended models that aren't installed
  const recommendedNotInstalled = RECOMMENDED_VISION_MODELS.filter(
    rec => !allVisionOptions.some(installed => installed.toLowerCase().includes(rec.name.toLowerCase().split(':')[0]))
  )

  // Animate spinner while analyzing or downloading
  useEffect(() => {
    const isActive = analysis && (
      analysis.status === 'analyzing' || 
      analysis.status === 'no-model' ||
      (downloadProgress && downloadProgress.status !== 'success' && downloadProgress.status !== 'error')
    )
    
    if (!isActive) return

    const interval = setInterval(() => {
      setFrameIndex(prev => (prev + 1) % ASCII_FRAMES.length)
    }, 150)

    return () => clearInterval(interval)
  }, [analysis?.status, downloadProgress?.status])

  // Check for vision models when panel opens with no-model status
  useEffect(() => {
    if (analysis?.status === 'no-model' && !analysis.recommendedModels) {
      setCheckingModels(true)
      fetch('http://localhost:8000/api/images/check-vision-models')
        .then(res => res.json())
        .then(data => {
          // Update analysis with recommendations
          if (onClose) {
            // We can't directly update analysis state here, but we can trigger a re-check
            // The parent component should handle this
          }
        })
        .catch(err => {
          console.warn('[LOOM] Failed to check vision models:', err)
        })
        .finally(() => {
          setCheckingModels(false)
        })
    }
  }, [analysis?.status])

  if (!analysis) return null

  const isDownloading = downloadProgress && downloadProgress.model && 
    downloadProgress.status !== 'success' && downloadProgress.status !== 'error'

  return (
    <div 
      className="fixed inset-0 bg-void/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate border-2 border-phosphor max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-b border-terminal-border p-4 flex items-center justify-between bg-void/50">
          <div className="flex items-center gap-3">
            <span className="text-phosphor font-bold text-sm">IMAGE ANALYSIS</span>
            {analysis.status === 'analyzing' && (
              <span className="text-phosphor text-xs animate-pulse">
                {ASCII_FRAMES[frameIndex]} Analyzing...
              </span>
            )}
            {analysis.status === 'success' && (
              <span className="text-green-400 text-xs">✓ Complete</span>
            )}
            {analysis.status === 'error' && (
              <span className="text-red-400 text-xs">✗ Error</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-terminal-muted hover:text-phosphor text-lg px-2"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Image Display */}
          <div className="border border-terminal-border bg-void p-4">
            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">IMAGE</div>
            <img 
              src={analysis.imageUrl} 
              alt="Analysis target"
              className="max-w-full h-auto border border-terminal-border"
            />
          </div>

          {/* Analysis Results */}
          {analysis.status === 'analyzing' && (
            <div className="border border-terminal-border bg-void p-4">
              <div className="text-[10px] text-terminal-muted tracking-widest mb-2">ANALYSIS</div>
              <div className="text-phosphor text-sm space-y-2">
                <div className="flex items-center gap-2">
                  <span>{ASCII_FRAMES[frameIndex]}</span>
                  <span>Processing image with vision model...</span>
                </div>
                <div className="text-terminal-muted text-xs mt-2">
                  Model: {analysis.model || 'Auto-detecting...'}
                </div>
              </div>
            </div>
          )}

          {analysis.status === 'success' && (
            <div className="border border-terminal-border bg-void p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-terminal-muted tracking-widest">ANALYSIS</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowModelSelector(!showModelSelector)}
                    className="text-[10px] text-terminal-muted hover:text-phosphor border border-terminal-border px-2 py-1"
                    title="Try different vision model"
                  >
                    {showModelSelector ? '▼' : '▶'} Try Different Model
                  </button>
                </div>
              </div>
              
              {showModelSelector && (
                <div className="mb-3 p-3 bg-slate border border-terminal-border space-y-2">
                  <div className="text-[10px] text-terminal-muted tracking-widest mb-2">SELECT VISION MODEL</div>
                  
                  {/* Installed Vision Models */}
                  {allVisionOptions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] text-terminal-muted">Installed:</div>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full bg-void border border-terminal-border text-phosphor text-xs px-2 py-1 focus:outline-none focus:border-phosphor"
                      >
                        <option value="">Select a model...</option>
                        {allVisionOptions.map(model => (
                          <option key={model} value={model}>
                            {model} {model === analysis.model ? '(current)' : ''}
                          </option>
                        ))}
                      </select>
                      {selectedModel && selectedModel !== analysis.model && (
                        <button
                          onClick={() => {
                            if (onRetryAnalysis && analysis.imageUrl) {
                              setShowModelSelector(false)
                              onRetryAnalysis(analysis.imageUrl, selectedModel)
                            }
                          }}
                          className="w-full px-3 py-1.5 text-xs border border-phosphor text-phosphor hover:bg-phosphor hover:text-void transition-colors"
                        >
                          Retry with {selectedModel}
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Recommended (Not Installed) */}
                  {recommendedNotInstalled.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-terminal-border space-y-2">
                      <div className="text-[10px] text-terminal-muted">Not Installed:</div>
                      {recommendedNotInstalled.map((model) => (
                        <div 
                          key={model.name}
                          className="border border-terminal-border bg-void p-2 flex items-start justify-between gap-2"
                        >
                          <div className="flex-1">
                            <div className="text-phosphor text-xs font-bold">{model.name}</div>
                            <div className="text-terminal-muted text-[10px]">{model.description}</div>
                            <div className="text-terminal-muted text-[9px]">Size: {model.size}</div>
                          </div>
                          <button
                            onClick={() => onPullModel?.(model.name)}
                            disabled={isDownloading}
                            className="px-2 py-1 text-[10px] border border-phosphor text-phosphor hover:bg-phosphor hover:text-void disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Install
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {allVisionOptions.length === 0 && recommendedNotInstalled.length === 0 && (
                    <div className="text-terminal-muted text-xs">No vision models available</div>
                  )}
                </div>
              )}
              
              <div className="text-phosphor text-sm whitespace-pre-wrap leading-relaxed">
                {analysis.analysis}
              </div>
              <div className="text-terminal-muted text-xs mt-3 pt-3 border-t border-terminal-border">
                Model: {analysis.model}
              </div>
            </div>
          )}

          {analysis.status === 'no-model' && (
            <div className="border border-amber-500/50 bg-void/50 p-4">
              <div className="text-[10px] text-amber-400 tracking-widest mb-3">VISION MODEL REQUIRED</div>
              <div className="text-phosphor text-sm mb-4">
                No vision models detected. Install one to analyze images.
              </div>
              
              {isDownloading && downloadProgress && (
                <div className="mb-4 p-3 bg-void border border-terminal-border">
                  <div className="text-[10px] text-terminal-muted mb-2">DOWNLOADING</div>
                  <div className="text-phosphor text-xs">
                    {ASCII_FRAMES[frameIndex]} Installing {downloadProgress.model}...
                  </div>
                  {downloadProgress.total > 0 && (
                    <div className="text-terminal-muted text-[10px] mt-1">
                      {Math.round((downloadProgress.completed / downloadProgress.total) * 100)}% complete
                    </div>
                  )}
                </div>
              )}
              
              <div className="space-y-2">
                <div className="text-[10px] text-terminal-muted tracking-widest mb-2">RECOMMENDED MODELS</div>
                {(analysis.recommendedModels || RECOMMENDED_VISION_MODELS).map((model) => (
                  <div 
                    key={model.name}
                    className="border border-terminal-border bg-void p-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1">
                      <div className="text-phosphor text-xs font-bold mb-1">{model.name}</div>
                      <div className="text-terminal-muted text-[10px] mb-1">{model.description}</div>
                      <div className="text-terminal-muted text-[9px]">Size: {model.size}</div>
                    </div>
                    <button
                      onClick={() => onPullModel?.(model.name)}
                      disabled={isDownloading}
                      className="px-3 py-1.5 text-xs border border-phosphor text-phosphor hover:bg-phosphor hover:text-void disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isDownloading && downloadProgress?.model === model.name ? 'Installing...' : 'Install'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.status === 'error' && (
            <div className="border border-red-500/50 bg-void/50 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] text-red-400 tracking-widest">ERROR</div>
                {(allVisionOptions.length > 0 || recommendedNotInstalled.length > 0) && (
                  <button
                    onClick={() => setShowModelSelector(!showModelSelector)}
                    className="text-[10px] text-terminal-muted hover:text-phosphor border border-terminal-border px-2 py-1"
                    title="Try different vision model"
                  >
                    {showModelSelector ? '▼' : '▶'} Try Different Model
                  </button>
                )}
              </div>
              
              <div className="text-red-400 text-sm mb-3">
                {analysis.error || 'Failed to analyze image'}
              </div>
              
              {showModelSelector && (
                <div className="mb-3 p-3 bg-slate border border-terminal-border space-y-2">
                  <div className="text-[10px] text-terminal-muted tracking-widest mb-2">SELECT VISION MODEL</div>
                  
                  {/* Installed Vision Models */}
                  {allVisionOptions.length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] text-terminal-muted">Installed:</div>
                      <select
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="w-full bg-void border border-terminal-border text-phosphor text-xs px-2 py-1 focus:outline-none focus:border-phosphor"
                      >
                        <option value="">Select a model...</option>
                        {allVisionOptions.map(model => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                      </select>
                      {selectedModel && (
                        <button
                          onClick={() => {
                            if (onRetryAnalysis && analysis.imageUrl) {
                              setShowModelSelector(false)
                              onRetryAnalysis(analysis.imageUrl, selectedModel)
                            }
                          }}
                          className="w-full px-3 py-1.5 text-xs border border-phosphor text-phosphor hover:bg-phosphor hover:text-void transition-colors"
                        >
                          Retry with {selectedModel}
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Recommended (Not Installed) */}
                  {recommendedNotInstalled.length > 0 && (
                    <div className={`${allVisionOptions.length > 0 ? 'mt-3 pt-3 border-t border-terminal-border' : ''} space-y-2`}>
                      <div className="text-[10px] text-terminal-muted">Not Installed:</div>
                      {recommendedNotInstalled.map((model) => (
                        <div 
                          key={model.name}
                          className="border border-terminal-border bg-void p-2 flex items-start justify-between gap-2"
                        >
                          <div className="flex-1">
                            <div className="text-phosphor text-xs font-bold">{model.name}</div>
                            <div className="text-terminal-muted text-[10px]">{model.description}</div>
                            <div className="text-terminal-muted text-[9px]">Size: {model.size}</div>
                          </div>
                          <button
                            onClick={() => onPullModel?.(model.name)}
                            disabled={isDownloading}
                            className="px-2 py-1 text-[10px] border border-phosphor text-phosphor hover:bg-phosphor hover:text-void disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            Install
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              
              <div className="text-terminal-muted text-xs mt-3 space-y-1">
                <div>Tip: Make sure you have a vision model installed.</div>
                {!showModelSelector && (
                  <>
                    <div>Install one with: <span className="text-phosphor">/pull llava:7b</span></div>
                    <div>Other options: <span className="text-phosphor">bakllava</span>, <span className="text-phosphor">moondream</span></div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Approve and Pass to Chat Button */}
          {analysis.status === 'success' && (
            <div className="border border-phosphor bg-void p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="text-[10px] text-terminal-muted tracking-widest mb-1">READY FOR CHAT</div>
                  <div className="text-phosphor text-xs">
                    Approve this analysis to add the image and tokens to your chat context
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (onApproveToChat && analysis.imageUrl && analysis.analysis) {
                      onApproveToChat(analysis.imageUrl, analysis.analysis)
                      onClose?.()
                    }
                  }}
                  className="px-4 py-2 text-sm font-bold border-2 border-phosphor text-phosphor hover:bg-phosphor hover:text-void transition-colors"
                >
                  ✓ APPROVE & PASS TO CHAT
                </button>
              </div>
            </div>
          )}

          {/* Suggested Actions */}
          {analysis.status === 'success' && (
            <div className="border border-terminal-border bg-void/30 p-4">
              <div className="text-[10px] text-terminal-muted tracking-widest mb-2">SUGGESTED ACTIONS</div>
              <div className="text-phosphor text-xs space-y-1">
                <div>• Click "APPROVE & PASS TO CHAT" to add image to conversation</div>
                <div>• Ask questions about the image in the terminal</div>
                <div>• Use /image to analyze another image</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
