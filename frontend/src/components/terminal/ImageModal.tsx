import { useState, useEffect } from 'react'

interface ImageMetadata {
  prompt?: string
  model?: string
  timestamp?: number
  dimensions?: { width: number; height: number }
  provider?: string
  analysis?: string
  [key: string]: unknown
}

interface ImageModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  metadata?: ImageMetadata
  onEdit?: (imageUrl: string, editPrompt: string) => void
  canEdit?: boolean
}

export function ImageModal({
  isOpen,
  onClose,
  imageUrl,
  metadata = {},
  onEdit,
  canEdit = false,
}: ImageModalProps) {
  const [editPrompt, setEditPrompt] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (isOpen && imageUrl) {
      // Load image to get dimensions
      const img = new Image()
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight })
      }
      img.src = imageUrl
    }
  }, [isOpen, imageUrl])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
      // Handle Escape key at document level
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose()
        }
      }
      document.addEventListener('keydown', handleEscape)
      return () => {
        document.body.style.overflow = ''
        document.removeEventListener('keydown', handleEscape)
      }
    } else {
      document.body.style.overflow = ''
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  const handleEdit = () => {
    if (editPrompt.trim() && onEdit) {
      setIsEditing(true)
      onEdit(imageUrl, editPrompt)
      // Reset after a delay (the parent will handle the result)
      setTimeout(() => {
        setIsEditing(false)
        setEditPrompt('')
      }, 1000)
    }
  }

  const formatTimestamp = (ts?: number) => {
    if (!ts) return 'Unknown'
    return new Date(ts).toLocaleString()
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 text-phosphor hover:text-phosphor/80 text-2xl font-bold z-10 bg-void/80 px-3 py-1 border border-terminal-border"
        title="Close (ESC)"
      >
        ✕
      </button>

      {/* Modal content */}
      <div
        className="relative max-w-[95vw] max-h-[95vh] flex flex-col bg-slate border-2 border-phosphor shadow-glow-lg z-10"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        style={{ pointerEvents: 'auto' }}
      >
        {/* Image display */}
        <div className="flex-1 flex items-center justify-center p-4 overflow-auto bg-void/30">
          <img
            src={imageUrl}
            alt={metadata.prompt || 'Image'}
            className="max-w-full max-h-[70vh] object-contain"
          />
        </div>

        {/* Metadata panel */}
        <div className="border-t-2 border-terminal-border bg-slate p-4 max-h-[30vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-4 text-xs">
            {/* Left column */}
            <div className="space-y-2">
              <div>
                <div className="text-[10px] text-terminal-muted tracking-widest mb-1">PROMPT</div>
                <div className="text-phosphor font-mono text-[11px] break-words">
                  {metadata.prompt || 'N/A'}
                </div>
              </div>

              {metadata.analysis && (
                <div>
                  <div className="text-[10px] text-terminal-muted tracking-widest mb-1">ANALYSIS</div>
                  <div className="text-phosphor/80 text-[10px] break-words max-h-20 overflow-y-auto">
                    {metadata.analysis}
                  </div>
                </div>
              )}

              <div>
                <div className="text-[10px] text-terminal-muted tracking-widest mb-1">MODEL</div>
                <div className="text-phosphor font-mono text-[11px]">
                  {metadata.model || 'Unknown'}
                </div>
              </div>

              {metadata.provider && (
                <div>
                  <div className="text-[10px] text-terminal-muted tracking-widest mb-1">PROVIDER</div>
                  <div className="text-phosphor font-mono text-[11px]">
                    {metadata.provider}
                  </div>
                </div>
              )}
            </div>

            {/* Right column */}
            <div className="space-y-2">
              {imageDimensions && (
                <div>
                  <div className="text-[10px] text-terminal-muted tracking-widest mb-1">DIMENSIONS</div>
                  <div className="text-phosphor font-mono text-[11px]">
                    {imageDimensions.width} × {imageDimensions.height}px
                  </div>
                </div>
              )}

              {metadata.timestamp && (
                <div>
                  <div className="text-[10px] text-terminal-muted tracking-widest mb-1">TIMESTAMP</div>
                  <div className="text-phosphor font-mono text-[11px]">
                    {formatTimestamp(metadata.timestamp)}
                  </div>
                </div>
              )}

              {/* Image-to-image editing */}
              {canEdit && onEdit && (
                <div 
                  className="border-t border-terminal-border pt-2 mt-2"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div className="text-[10px] text-terminal-muted tracking-widest mb-2">EDIT IMAGE</div>
                  <div className="space-y-2">
                    <textarea
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                      onFocus={(e) => e.stopPropagation()}
                      placeholder="Describe how to edit this image... (e.g., 'add a sunset in the background', 'make it more colorful')"
                      className="w-full bg-void border border-terminal-border text-phosphor text-[10px] px-2 py-1.5 resize-none focus:outline-none focus:border-phosphor placeholder:text-terminal-muted/50"
                      rows={3}
                      disabled={isEditing}
                    />
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEdit()
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      disabled={!editPrompt.trim() || isEditing}
                      className="w-full bg-phosphor text-void px-3 py-2 text-xs font-bold hover:bg-phosphor/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isEditing ? 'EDITING...' : '✨ EDIT WITH FLUX'}
                    </button>
                    <div className="text-[9px] text-terminal-muted">
                      Uses image-to-image editing to modify the image based on your prompt
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
