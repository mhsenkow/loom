import { useState, useEffect, useCallback } from 'react'

export type ReadMode = 'raw' | 'preview' | 'structure' | 'summarize' | 'stats' | 'extract'

interface FileInfo {
  name: string
  path: string
  is_dir: boolean
  size: number
  type: string
  mime: string | null
  modified: number
}

interface FilePickerProps {
  isOpen: boolean
  onClose: () => void
  onSelect: (filePath: string, readMode: ReadMode) => void
}

const READ_MODES: Record<ReadMode, { label: string; desc: string; icon: string; fileTypes?: string[] }> = {
  raw: { 
    label: 'Raw Content', 
    desc: 'Full file as text',
    icon: '📄',
  },
  preview: { 
    label: 'Preview', 
    desc: 'First 50 lines',
    icon: '👁️',
  },
  structure: { 
    label: 'Structure', 
    desc: 'AI describes schema/format',
    icon: '🏗️',
    fileTypes: ['json', 'csv', 'code'],
  },
  summarize: { 
    label: 'Summarize', 
    desc: 'AI summary of content',
    icon: '📝',
    fileTypes: ['text', 'markdown', 'pdf'],
  },
  stats: { 
    label: 'Statistics', 
    desc: 'Compute averages, counts',
    icon: '📊',
    fileTypes: ['csv'],
  },
  extract: { 
    label: 'Extract Fields', 
    desc: 'Pull specific data points',
    icon: '🎯',
    fileTypes: ['json', 'csv'],
  },
}

const FILE_TYPE_ICONS: Record<string, string> = {
  folder: '📁',
  text: '📄',
  markdown: '📝',
  json: '📋',
  csv: '📊',
  pdf: '📕',
  code: '💻',
  image: '🖼️',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString()
}

export function FilePicker({ isOpen, onClose, onSelect }: FilePickerProps) {
  const [dataFolder, setDataFolder] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [files, setFiles] = useState<FileInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<FileInfo | null>(null)
  const [readMode, setReadMode] = useState<ReadMode>('raw')
  const [manualPath, setManualPath] = useState('')
  const [showManualInput, setShowManualInput] = useState(false)
  const [creatingFolder, setCreatingFolder] = useState(false)

  // Check if data folder is configured
  const checkDataFolder = useCallback(async () => {
    try {
      const response = await fetch('http://localhost:8000/api/files/folder')
      const data = await response.json()
      setDataFolder(data.path)
      return data.path
    } catch (e) {
      setError('Backend not connected')
      return null
    }
  }, [])

  // Load files from current path
  const loadFiles = useCallback(async (subfolder: string = '') => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`http://localhost:8000/api/files/list?subfolder=${encodeURIComponent(subfolder)}`)
      if (!response.ok) {
        const err = await response.json()
        throw new Error(err.detail || 'Failed to load files')
      }
      const data = await response.json()
      setFiles(data.files || [])
      setCurrentPath(subfolder)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load files')
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [])

  // Create data folder
  const createDataFolder = useCallback(async () => {
    setCreatingFolder(true)
    const defaultPath = '~/Documents/loom-data'
    try {
      // First try to create by setting the path (backend will validate/create)
      const response = await fetch('http://localhost:8000/api/files/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: defaultPath, create: true }),
      })
      
      if (response.ok) {
        const data = await response.json()
        setDataFolder(data.path)
        loadFiles('')
      } else {
        setError('Could not create data folder')
      }
    } catch (e) {
      setError('Failed to create data folder')
    } finally {
      setCreatingFolder(false)
    }
  }, [loadFiles])

  // Initial load
  useEffect(() => {
    if (isOpen) {
      checkDataFolder().then(folder => {
        if (folder) {
          loadFiles('')
        }
      })
      setSelectedFile(null)
      setManualPath('')
      setShowManualInput(false)
    }
  }, [isOpen, checkDataFolder, loadFiles])

  // Handle file/folder click
  const handleItemClick = (item: FileInfo) => {
    if (item.is_dir) {
      const newPath = currentPath ? `${currentPath}/${item.name}` : item.name
      loadFiles(newPath)
    } else {
      setSelectedFile(item)
      // Auto-select appropriate read mode based on file type
      if (item.type === 'csv') {
        setReadMode('stats')
      } else if (item.type === 'json') {
        setReadMode('structure')
      } else if (item.type === 'pdf' || item.type === 'markdown' || item.type === 'text') {
        setReadMode('summarize')
      } else {
        setReadMode('raw')
      }
    }
  }

  // Navigate up
  const goUp = () => {
    if (currentPath) {
      const parts = currentPath.split('/')
      parts.pop()
      loadFiles(parts.join('/'))
    }
  }

  // Confirm selection
  const handleSelect = () => {
    const path = showManualInput ? manualPath : selectedFile?.path
    if (path) {
      onSelect(path, readMode)
      onClose()
    }
  }

  // Get available modes for selected file type
  const getAvailableModes = (): ReadMode[] => {
    if (!selectedFile && !showManualInput) return ['raw', 'preview']
    
    const fileType = selectedFile?.type || 'text'
    return (Object.entries(READ_MODES) as [ReadMode, typeof READ_MODES[ReadMode]][])
      .filter(([_, config]) => !config.fileTypes || config.fileTypes.includes(fileType))
      .map(([mode]) => mode)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-void/90" onClick={onClose} />
      
      {/* Modal */}
      <div className="relative bg-slate border border-cyan-500 w-full max-w-2xl mx-4 shadow-glow max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="bg-cyan-600 text-white px-4 py-2 flex items-center justify-between">
          <span className="font-bold text-sm tracking-wider">📁 SELECT FILE</span>
          <button onClick={onClose} className="hover:bg-white/20 px-2">×</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col p-4">
          {/* No data folder configured */}
          {!dataFolder && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <div className="text-4xl mb-4">📁</div>
              <h3 className="text-phosphor font-bold mb-2">No Data Folder Configured</h3>
              <p className="text-terminal-muted text-sm mb-4">
                Set up a folder where Loom will look for your data files.
              </p>
              <button
                onClick={createDataFolder}
                disabled={creatingFolder}
                className="btn-terminal"
              >
                {creatingFolder ? 'Creating...' : 'Create ~/Documents/loom-data'}
              </button>
              <p className="text-[10px] text-terminal-muted mt-3">
                Or configure a custom path in Settings
              </p>
            </div>
          )}

          {/* File browser */}
          {dataFolder && (
            <>
              {/* Path bar */}
              <div className="flex items-center gap-2 mb-3 pb-3 border-b border-terminal-border">
                <span className="text-[10px] text-terminal-muted">PATH:</span>
                <div className="flex-1 font-mono text-xs text-cyan-400 truncate">
                  {dataFolder}/{currentPath || ''}
                </div>
                {currentPath && (
                  <button
                    onClick={goUp}
                    className="text-xs text-terminal-muted hover:text-phosphor px-2"
                  >
                    ↑ UP
                  </button>
                )}
                <button
                  onClick={() => loadFiles(currentPath)}
                  className="text-xs text-terminal-muted hover:text-phosphor px-2"
                >
                  ↻
                </button>
              </div>

              {/* Toggle manual input */}
              <div className="flex items-center gap-2 mb-3">
                <button
                  onClick={() => setShowManualInput(false)}
                  className={`text-xs px-2 py-1 border ${!showManualInput ? 'border-cyan-500 text-cyan-400' : 'border-terminal-border text-terminal-muted'}`}
                >
                  Browse
                </button>
                <button
                  onClick={() => setShowManualInput(true)}
                  className={`text-xs px-2 py-1 border ${showManualInput ? 'border-cyan-500 text-cyan-400' : 'border-terminal-border text-terminal-muted'}`}
                >
                  Type Path
                </button>
              </div>

              {/* Manual input */}
              {showManualInput && (
                <div className="mb-3">
                  <input
                    type="text"
                    value={manualPath}
                    onChange={(e) => setManualPath(e.target.value)}
                    placeholder="Enter file path (e.g., data.csv or reports/q4.pdf)"
                    className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm focus:outline-none focus:border-cyan-500"
                  />
                </div>
              )}

              {/* File list */}
              {!showManualInput && (
                <div className="flex-1 overflow-y-auto border border-terminal-border bg-void">
                  {loading && (
                    <div className="p-4 text-center text-terminal-muted">Loading...</div>
                  )}
                  
                  {error && (
                    <div className="p-4 text-center text-red-400">{error}</div>
                  )}
                  
                  {!loading && !error && files.length === 0 && (
                    <div className="p-4 text-center text-terminal-muted">
                      <p>No files found</p>
                      <p className="text-[10px] mt-2">Add files to your data folder to see them here</p>
                    </div>
                  )}
                  
                  {!loading && files.map((file) => (
                    <div
                      key={file.path}
                      onClick={() => handleItemClick(file)}
                      className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-b border-terminal-border/50 hover:bg-slate ${
                        selectedFile?.path === file.path ? 'bg-cyan-900/30 border-l-2 border-l-cyan-500' : ''
                      }`}
                    >
                      <span className="text-lg">{FILE_TYPE_ICONS[file.type] || '📄'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-phosphor truncate">{file.name}</div>
                        {!file.is_dir && (
                          <div className="text-[10px] text-terminal-muted">
                            {formatSize(file.size)} • {formatDate(file.modified)}
                          </div>
                        )}
                      </div>
                      {file.is_dir && (
                        <span className="text-terminal-muted">→</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Read mode selector */}
              {(selectedFile || (showManualInput && manualPath)) && (
                <div className="mt-3 pt-3 border-t border-terminal-border">
                  <div className="text-[10px] text-terminal-muted uppercase tracking-widest mb-2">
                    How should AI read this file?
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {getAvailableModes().map((mode) => (
                      <button
                        key={mode}
                        onClick={() => setReadMode(mode)}
                        className={`p-2 text-left border ${
                          readMode === mode 
                            ? 'border-cyan-500 bg-cyan-900/30' 
                            : 'border-terminal-border hover:border-cyan-500/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span>{READ_MODES[mode].icon}</span>
                          <span className="text-xs text-phosphor">{READ_MODES[mode].label}</span>
                        </div>
                        <div className="text-[9px] text-terminal-muted mt-1">
                          {READ_MODES[mode].desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-terminal-border flex items-center justify-between">
          <div className="text-xs text-terminal-muted">
            {selectedFile && (
              <span>Selected: <span className="text-cyan-400">{selectedFile.name}</span></span>
            )}
            {showManualInput && manualPath && (
              <span>Path: <span className="text-cyan-400">{manualPath}</span></span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-terminal-muted border border-terminal-border hover:text-phosphor hover:border-phosphor"
            >
              CANCEL
            </button>
            <button
              onClick={handleSelect}
              disabled={!selectedFile && !manualPath}
              className="btn-terminal text-sm disabled:opacity-50"
              style={{ borderColor: '#00bfff', color: '#00bfff' }}
            >
              SELECT
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
