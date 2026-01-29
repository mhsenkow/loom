import { useState, useCallback, useEffect } from 'react'
import { FolderPickerModal } from './FolderPickerModal'

interface CodeContextPanelProps {
  isOpen: boolean
  onClose: () => void
  onIndexFolder: (folderPath: string, options?: IndexOptions) => Promise<void>
  activeFolder?: string | null
  filesIndexed?: number
  isIndexing?: boolean
}

interface IndexOptions {
  file_patterns?: string[]
  exclude_patterns?: string[]
  chunk_size?: number
  chunk_overlap?: number
  chunking_strategy?: 'function' | 'sentence' | 'fixed'
  max_file_size?: number
}

export function CodeContextPanel({
  isOpen,
  onClose,
  onIndexFolder,
  activeFolder,
  filesIndexed = 0,
  isIndexing = false,
}: CodeContextPanelProps) {
  const [folderPath, setFolderPath] = useState<string>('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [indexingProgress, setIndexingProgress] = useState<string>('')
  const [showFolderPicker, setShowFolderPicker] = useState(false)

  useEffect(() => {
    if (activeFolder) {
      setFolderPath(activeFolder)
    }
  }, [activeFolder])

  const handleBrowse = useCallback(async () => {
    // Use Electron's dialog if available, otherwise show folder picker modal
    try {
      if (window.electron?.showOpenDialog) {
        const result = await window.electron.showOpenDialog({
          properties: ['openDirectory'],
        })
        if (result && !result.canceled && result.filePaths.length > 0) {
          setFolderPath(result.filePaths[0])
        }
      } else {
        // Show custom folder picker modal
        setShowFolderPicker(true)
      }
    } catch (error) {
      // Fallback: show folder picker modal
      setShowFolderPicker(true)
    }
  }, [])

  const handleFolderSelected = useCallback((path: string) => {
    setFolderPath(path)
    setShowFolderPicker(false)
  }, [])

  const handleIndex = useCallback(async () => {
    if (!folderPath.trim()) {
      alert('Please select a folder')
      return
    }

    setIndexingProgress('Indexing folder... This may take a minute for large folders.')
    try {
      await onIndexFolder(folderPath)
      setIndexingProgress('')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to index'
      setIndexingProgress(`Error: ${errorMsg}`)
      // Keep error visible for a bit, then clear
      setTimeout(() => {
        setIndexingProgress('')
      }, 10000)
    }
  }, [folderPath, onIndexFolder])

  const handleClear = useCallback(async () => {
    setFolderPath('')
    setIndexingProgress('')
    // Call backend to clear context
    try {
      const response = await fetch('http://localhost:8000/api/code-context/clear', {
        method: 'DELETE',
      })
      if (!response.ok) {
        console.warn('[LOOM] Failed to clear code context:', response.statusText)
      }
    } catch (error) {
      console.warn('[LOOM] Error clearing code context:', error)
    }
  }, [])

  if (!isOpen) return null

  return (
    <div className="fixed right-0 top-0 bottom-0 w-96 bg-slate border-l-2 border-phosphor z-40 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-terminal-border flex items-center justify-between bg-void/50">
        <div className="flex items-center gap-2">
          <span className="text-lg">📁</span>
          <h2 className="text-sm font-bold text-phosphor">FOLDER CONTEXT</h2>
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
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Folder Selection */}
        <div>
          <label className="block text-xs text-phosphor font-bold mb-2 uppercase tracking-wider">
            Project Folder
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              placeholder="/path/to/project"
              className="flex-1 bg-void border border-terminal-border text-phosphor text-xs px-2 py-1.5 focus:outline-none focus:border-phosphor placeholder:text-terminal-muted/50"
            />
            <button
              onClick={handleBrowse}
              className="px-3 py-1.5 border border-terminal-border text-phosphor text-xs hover:bg-void/50 transition-colors"
            >
              Browse
            </button>
          </div>
        </div>

        {/* Status */}
        {activeFolder && (
          <div className="border border-phosphor/30 bg-void/30 p-3">
            <div className="text-xs text-phosphor font-mono">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-2 h-2 bg-phosphor shadow-[0_0_6px_rgba(51,255,0,0.8)] animate-pulse" />
                <span className="font-bold">ACTIVE</span>
                <span className="text-[9px] text-phosphor/50 ml-auto">Code context enabled</span>
              </div>
              <div className="text-terminal-muted text-[10px] mt-1 break-all">
                {activeFolder}
              </div>
              {filesIndexed > 0 && (
                <div className="text-phosphor/70 text-[10px] mt-2">
                  {filesIndexed} files indexed • Code will be included in chat automatically
                </div>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={handleIndex}
            disabled={!folderPath.trim() || isIndexing}
            className="flex-1 bg-phosphor text-void px-4 py-2 text-xs font-bold hover:bg-phosphor/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isIndexing ? 'INDEXING...' : 'INDEX FOLDER'}
          </button>
          {activeFolder && (
            <button
              onClick={handleClear}
              className="px-4 py-2 border border-terminal-border text-phosphor text-xs hover:bg-void/50 transition-colors"
            >
              CLEAR
            </button>
          )}
        </div>

        {/* Progress */}
        {indexingProgress && (
          <div className="border border-terminal-border bg-void/30 p-2">
            <div className="text-xs text-phosphor font-mono">{indexingProgress}</div>
          </div>
        )}

        {/* Advanced Options */}
        <div className="border-t border-terminal-border pt-3">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full text-left text-xs text-terminal-muted hover:text-phosphor flex items-center justify-between"
          >
            <span>▼ Advanced Options</span>
            <span>{showAdvanced ? '−' : '+'}</span>
          </button>

          {showAdvanced && (
            <div className="mt-3 space-y-3 text-xs">
              <div>
                <label className="block text-phosphor/70 mb-1">File Patterns</label>
                <input
                  type="text"
                  defaultValue="*.py,*.ts,*.js,*.tsx,*.jsx"
                  className="w-full bg-void border border-terminal-border text-phosphor px-2 py-1 focus:outline-none focus:border-phosphor"
                />
              </div>
              <div>
                <label className="block text-phosphor/70 mb-1">Exclude Patterns</label>
                <input
                  type="text"
                  defaultValue="node_modules,.git,__pycache__"
                  className="w-full bg-void border border-terminal-border text-phosphor px-2 py-1 focus:outline-none focus:border-phosphor"
                />
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-phosphor/70 mb-1">Chunk Size</label>
                  <input
                    type="number"
                    defaultValue={1000}
                    className="w-full bg-void border border-terminal-border text-phosphor px-2 py-1 focus:outline-none focus:border-phosphor"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-phosphor/70 mb-1">Overlap</label>
                  <input
                    type="number"
                    defaultValue={200}
                    className="w-full bg-void border border-terminal-border text-phosphor px-2 py-1 focus:outline-none focus:border-phosphor"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="border-t border-terminal-border pt-3">
          <div className="text-[10px] text-terminal-muted leading-relaxed">
            Indexed code will be automatically included in chat context via semantic search.
            Only relevant files are retrieved per query.
          </div>
        </div>
      </div>

      {/* Folder Picker Modal */}
      <FolderPickerModal
        isOpen={showFolderPicker}
        onClose={() => setShowFolderPicker(false)}
        onSelect={handleFolderSelected}
      />
    </div>
  )
}
