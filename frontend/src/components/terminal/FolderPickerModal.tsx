import { useRef, useCallback, useState, type InputHTMLAttributes } from 'react'

interface FolderPickerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (folderPath: string) => void
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && (error as { name?: string }).name === 'AbortError'
}

export function FolderPickerModal({ isOpen, onClose, onSelect }: FolderPickerModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [manualPath, setManualPath] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const directoryInputProps = {
    webkitdirectory: '',
    directory: '',
  } as unknown as InputHTMLAttributes<HTMLInputElement>

  const handleFileInputClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  // Try File System Access API (modern browsers)
  const handleFileSystemAPI = useCallback(async () => {
    try {
      // @ts-ignore - File System Access API
      if ('showDirectoryPicker' in window) {
        // @ts-ignore
        const directoryHandle = await window.showDirectoryPicker()
        const folderName = directoryHandle.name
        
        // Browser security: We can't get the full absolute path
        // Clear the input and let user enter the correct path
        // Show the folder name as a hint
        setManualPath('')
        setError(null)
        
        // Focus the input field and show helpful message
        setTimeout(() => {
          const input = document.querySelector('input[type="text"][placeholder*="projects"]') as HTMLInputElement
          if (input) {
            input.focus()
          }
          setError(`Selected folder: "${folderName}"\n\n⚠️ Browser security: Please enter the FULL absolute path manually.\n\nExample: /Users/powerox/Notebooks/loom/frontend/src\n\n(Not: ~/Documents/${folderName})`)
        }, 100)
      } else {
        throw new Error('File System Access API not supported')
      }
    } catch (err: unknown) {
      if (isAbortError(err)) {
        // User cancelled - do nothing
        return
      }
      // Fallback to file input
      handleFileInputClick()
    }
  }, [handleFileInputClick])

  const handleFolderSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (files && files.length > 0) {
      // Get folder name from first file's webkitRelativePath
      const firstFile = files[0]
      const folderName = firstFile.webkitRelativePath.split('/')[0]
      
      // Browser security: We can't get absolute paths
      // Clear input and ask user to enter full path
      setManualPath('')
      setError(`Selected folder: "${folderName}"\n\n⚠️ Browser security: Please enter the FULL absolute path manually.\n\nExample: /Users/powerox/Notebooks/loom/frontend/src`)
      
      // Focus the input field
      setTimeout(() => {
        const input = document.querySelector('input[type="text"][placeholder*="projects"]') as HTMLInputElement
        if (input) {
          input.focus()
        }
      }, 100)
    }
    
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const handleManualSubmit = useCallback(() => {
    if (manualPath.trim()) {
      onSelect(manualPath.trim())
      setManualPath('')
      setError(null)
      onClose()
    }
  }, [manualPath, onSelect, onClose])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-void/80 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-slate border-2 border-phosphor shadow-[0_0_20px_rgba(51,255,0,0.3)] w-full max-w-lg mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-phosphor text-void px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider">SELECT FOLDER</h2>
          <button
            onClick={onClose}
            className="text-void hover:bg-void/20 px-2 text-lg"
            title="Close"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <div className="text-xs text-phosphor font-mono">
            {/* Error/Info Message */}
            {error && (
              <div className="mb-3 border-l-2 border-amber-500 pl-3 py-2 bg-void/30">
                <div className="text-[10px] text-amber-400 whitespace-pre-line">
                  {error}
                </div>
              </div>
            )}

            {/* Option 1: File System Access API (modern browsers) */}
            {'showDirectoryPicker' in window && (
              <div className="mb-4">
                <button
                  onClick={handleFileSystemAPI}
                  className="w-full bg-phosphor text-void border-2 border-phosphor px-4 py-3 text-xs font-bold hover:bg-phosphor/90 transition-colors mb-2"
                >
                  📁 SELECT FOLDER
                </button>
                <div className="text-[10px] text-terminal-muted">
                  Opens native picker (you'll need to enter full path manually)
                </div>
              </div>
            )}

            {/* Option 2: File input fallback */}
            <div className="mb-4">
              <button
                onClick={handleFileInputClick}
                className="w-full bg-void border-2 border-phosphor text-phosphor px-4 py-3 text-xs font-bold hover:bg-phosphor hover:text-void transition-colors mb-2"
              >
                📂 SELECT FROM FOLDER
              </button>
              <div className="text-[10px] text-terminal-muted">
                Select any file (you'll need to enter full path manually)
              </div>
            </div>

            {/* Option 3: Manual input - Primary interface */}
            <div className="border-t-2 border-phosphor/50 pt-4">
              <div className="text-[10px] text-phosphor mb-2 uppercase tracking-wider font-bold flex items-center gap-2">
                <span>📁</span>
                <span>ENTER FOLDER PATH:</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualPath}
                  onChange={(e) => {
                    setManualPath(e.target.value)
                    setError(null)
                  }}
                  placeholder="/Users/username/projects/my-project"
                  className="flex-1 bg-void border-2 border-phosphor/50 text-phosphor text-xs px-3 py-2 font-mono focus:outline-none focus:border-phosphor placeholder:text-terminal-muted/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && manualPath.trim()) {
                      handleManualSubmit()
                    }
                  }}
                  autoFocus
                  ref={(input) => {
                    // Auto-focus when modal opens
                    if (input && isOpen) {
                      setTimeout(() => input.focus(), 100)
                    }
                  }}
                />
                <button
                  onClick={handleManualSubmit}
                  disabled={!manualPath.trim()}
                  className="px-4 py-2 bg-phosphor text-void text-xs font-bold hover:bg-phosphor/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed border-2 border-phosphor"
                >
                  SET
                </button>
              </div>
              <div className="text-[9px] text-phosphor/70 mt-2 font-mono">
                Enter full absolute path (e.g., /Users/powerox/Notebooks/loom/frontend/src)
              </div>
              <div className="text-[9px] text-terminal-muted mt-1">
                Press Enter to set folder context
              </div>
            </div>
          </div>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          {...directoryInputProps}
          multiple
          style={{ display: 'none' }}
          onChange={handleFolderSelect}
        />

        {/* Footer */}
        <div className="border-t border-terminal-border p-3 bg-void/30">
          <div className="text-[9px] text-terminal-muted text-center">
            Selected folder will be indexed for code context in chat
          </div>
        </div>
      </div>
    </div>
  )
}
