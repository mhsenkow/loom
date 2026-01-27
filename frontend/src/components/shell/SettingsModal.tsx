import { useState, useEffect } from 'react'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export type ThemeId = 'phosphor' | 'ruby' | 'sapphire' | 'diamond' | 'ebony'

interface Settings {
  huggingfaceToken: string
  comfyuiUrl: string
  comfyuiEnabled: boolean
  dataFolderPath: string
  theme: ThemeId
}

const SETTINGS_KEY = 'loom-settings'

const THEMES: { id: ThemeId; name: string; subtitle: string; swatch: string }[] = [
  { id: 'phosphor', name: 'Phosphor', subtitle: 'DEC VT100, early PC', swatch: '#33ff00' },
  { id: 'ruby', name: 'Ruby', subtitle: 'Soviet, Eastern bloc amber', swatch: '#e85c20' },
  { id: 'sapphire', name: 'Sapphire', subtitle: 'IBM 3270, Fujitsu, NEC', swatch: '#3d8cff' },
  { id: 'diamond', name: 'Diamond', subtitle: 'Medical, SGI, precision', swatch: '#b8ccf0' },
  { id: 'ebony', name: 'Ebony', subtitle: 'Apple II, NeXT, ivory', swatch: '#d8d4c8' },
]

// Apply theme to document (call on load and when user changes)
export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme
}

// Load settings from localStorage
export function loadSettings(): Settings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed.theme && THEMES.some(t => t.id === parsed.theme)) {
        return { ...defaultSettings(), ...parsed }
      }
      return { ...defaultSettings(), ...parsed, theme: 'phosphor' }
    }
  } catch (e) {
    console.warn('[LOOM] Failed to load settings:', e)
  }
  return defaultSettings()
}

function defaultSettings(): Settings {
  return {
    huggingfaceToken: '',
    comfyuiUrl: 'http://localhost:8188',
    comfyuiEnabled: false,
    dataFolderPath: '',
    theme: 'phosphor',
  }
}

// Save settings to localStorage
function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
}

// Configure data folder on backend
async function configureDataFolder(path: string): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:8000/api/files/folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    })
    return response.ok
  } catch (e) {
    console.error('[LOOM] Failed to configure data folder:', e)
    return false
  }
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [saved, setSaved] = useState(false)
  const [dataFolderStatus, setDataFolderStatus] = useState<'idle' | 'checking' | 'valid' | 'invalid'>('idle')
  const [imageModels, setImageModels] = useState<Array<{ name: string; type: string; vram?: string }>>([])
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{ model: string; status: string; message?: string } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setSettings(loadSettings())
      setSaved(false)
      setDataFolderStatus('idle')
      fetchImageModels()
    }
  }, [isOpen])

  const fetchImageModels = async () => {
    try {
      const response = await fetch('http://localhost:8000/api/images/models')
      if (response.ok) {
        const data = await response.json()
        const availableModels = data.local || []
        setImageModels(availableModels.map((m: any) => ({
          name: typeof m === 'string' ? m : (m.name || m),
          type: m.type || 'unknown',
          vram: m.vram,
        })))
      }
    } catch (error) {
      console.error('[LOOM] Failed to fetch image models:', error)
    }
  }

  const handleDownloadModel = async (modelName: string) => {
    setDownloadingModel(modelName)
    setDownloadProgress({ model: modelName, status: 'starting', message: 'Preparing download...' })
    
    try {
      // Check if it's an Ollama model
      if (modelName.includes('flux') || modelName.includes('flux2') || modelName.startsWith('x/')) {
        // Use socket to pull via Ollama
        const { io } = await import('socket.io-client')
        const socket = io('http://localhost:8000')
        
        socket.on('pull_image_status', (data: any) => {
          if (data.model === modelName) {
            setDownloadProgress({
              model: modelName,
              status: data.status,
              message: data.message,
            })
            
            if (data.status === 'success' || data.status === 'error') {
              setDownloadingModel(null)
              setTimeout(() => {
                setDownloadProgress(null)
                fetchImageModels() // Refresh list
                socket.disconnect()
              }, 2000)
            }
          }
        })
        
        socket.emit('pull_image_model', { model: modelName })
      } else {
        // Local diffusers model - trigger download by loading
        setDownloadProgress({ model: modelName, status: 'downloading', message: 'Downloading model files...' })
        const response = await fetch(`http://localhost:8000/api/images/models/load?model=${encodeURIComponent(modelName)}`, {
          method: 'POST',
        })
        
        if (response.ok) {
          setDownloadProgress({ model: modelName, status: 'success', message: 'Model downloaded!' })
          setTimeout(() => {
            setDownloadingModel(null)
            setDownloadProgress(null)
            fetchImageModels()
          }, 2000)
        } else {
          throw new Error('Failed to download model')
        }
      }
    } catch (error) {
      setDownloadProgress({ 
        model: modelName, 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Download failed' 
      })
      setTimeout(() => {
        setDownloadingModel(null)
        setDownloadProgress(null)
      }, 3000)
    }
  }

  const handleSave = async () => {
    // Configure data folder on backend if set
    if (settings.dataFolderPath) {
      setDataFolderStatus('checking')
      const success = await configureDataFolder(settings.dataFolderPath)
      setDataFolderStatus(success ? 'valid' : 'invalid')
      if (!success) {
        return // Don't save if data folder is invalid
      }
    }
    
    saveSettings(settings)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    if (key === 'dataFolderPath') {
      setDataFolderStatus('idle')
    }
    if (key === 'theme') {
      applyTheme(value as ThemeId)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-void/90"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-slate border border-phosphor w-full max-w-lg mx-4 shadow-glow max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-phosphor text-void px-4 py-2 flex items-center justify-between sticky top-0">
          <span className="font-bold text-sm tracking-wider">SETTINGS</span>
          <button 
            onClick={onClose}
            className="text-void hover:bg-void/20 px-2"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Theme Section */}
          <section>
            <h3 className="text-phosphor font-bold text-sm tracking-wider mb-3">
              CRT THEME
            </h3>
            <p className="text-terminal-muted text-xs mb-3">
              Retro phosphor vibes. Scanlines and vignette vary by theme.
            </p>
            <div className="grid grid-cols-5 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateSetting('theme', t.id)}
                  className={`flex flex-col items-center p-3 border transition-colors ${
                    settings.theme === t.id
                      ? 'border-phosphor bg-void'
                      : 'border-terminal-border hover:border-phosphor/50'
                  }`}
                  title={t.subtitle}
                >
                  <span
                    className="w-8 h-8 mb-2 border-2"
                    style={{
                      backgroundColor: t.swatch,
                      borderColor: 'currentColor',
                      boxShadow: `0 0 12px ${t.swatch}80`,
                    }}
                  />
                  <span className="text-[10px] font-bold text-phosphor">{t.name}</span>
                  <span className="text-[9px] text-terminal-muted mt-0.5 text-center leading-tight">
                    {t.subtitle}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* Data Folder Section */}
          <section>
            <h3 className="text-cyan-400 font-bold text-sm tracking-wider mb-3">
              DATA FOLDER
            </h3>
            <p className="text-terminal-muted text-xs mb-3">
              Set the folder where Loom looks for files. DATA cells will load from this folder.
            </p>
            
            <div className="space-y-2">
              <label className="text-xs text-terminal-muted">Folder Path</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.dataFolderPath}
                  onChange={(e) => updateSetting('dataFolderPath', e.target.value)}
                  placeholder="~/Documents/loom-data or /Users/you/data"
                  className="flex-1 bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
                {dataFolderStatus === 'valid' && (
                  <span className="text-phosphor self-center">✓</span>
                )}
                {dataFolderStatus === 'invalid' && (
                  <span className="text-red-400 self-center">✗</span>
                )}
              </div>
              <p className="text-[10px] text-terminal-muted">
                Use absolute path or ~ for home. Folder must exist.
              </p>
              {dataFolderStatus === 'invalid' && (
                <p className="text-[10px] text-red-400">
                  Folder not found or not accessible.
                </p>
              )}
            </div>
          </section>

          {/* Hugging Face Section */}
          <section>
            <h3 className="text-phosphor font-bold text-sm tracking-wider mb-3">
              HUGGING FACE
            </h3>
            <p className="text-terminal-muted text-xs mb-3">
              Required for gated models (FLUX, SD3). Also used for cloud API fallback.
            </p>
            
            <div className="space-y-2">
              <label className="text-xs text-terminal-muted">API Token</label>
              <input
                type="password"
                value={settings.huggingfaceToken}
                onChange={(e) => updateSetting('huggingfaceToken', e.target.value)}
                placeholder="hf_..."
                className="w-full bg-void border border-terminal-border p-2 text-phosphor font-mono text-sm focus:outline-none focus:border-phosphor"
              />
              <a
                href="https://huggingface.co/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs text-phosphor hover:underline"
              >
                → Get token at huggingface.co/settings/tokens
              </a>
            </div>
          </section>

          {/* Local Image Generation Section */}
          <section>
            <h3 className="text-pink-400 font-bold text-sm tracking-wider mb-3">
              IMAGE GENERATION MODELS
            </h3>
            <p className="text-terminal-muted text-xs mb-3">
              {imageModels.length > 0 
                ? `${imageModels.length} model${imageModels.length !== 1 ? 's' : ''} downloaded`
                : 'No models downloaded yet'}
            </p>

            <div className="space-y-3 text-xs">
              {/* Downloaded Models */}
              {imageModels.length > 0 ? (
                <div className="bg-void p-3 border border-terminal-border">
                  <div className="text-phosphor font-bold mb-2">Downloaded Models:</div>
                  <div className="space-y-1">
                    {imageModels.map((model) => (
                      <div key={model.name} className="flex items-center justify-between py-1 border-b border-terminal-border/30 last:border-0">
                        <div>
                          <span className="text-phosphor">{model.name}</span>
                          {model.vram && model.vram !== 'varies' && (
                            <span className="text-terminal-muted ml-2">({model.vram})</span>
                          )}
                          <span className="text-terminal-muted ml-2 text-[10px]">
                            [{model.type === 'ollama' ? 'Ollama' : 'Local'}]
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-void p-3 border border-terminal-border">
                  <div className="text-terminal-muted text-center py-2">
                    No models downloaded. Use download buttons below or download via Ollama.
                  </div>
                </div>
              )}

              {/* Downloadable Models - Only Ollama models */}
              <div className="bg-void p-3 border border-terminal-border">
                <div className="text-phosphor font-bold mb-2">Download from Ollama:</div>
                <div className="space-y-2">
                  <div className="text-[10px] text-terminal-muted mb-2">
                    Available image generation models from Ollama:
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {['x/flux2-klein:9b', 'x/flux2-klein:4b', 'x/flux2-klein'].map((modelName) => {
                      const isDownloaded = imageModels.some(m => m.name.includes('flux2-klein'))
                      const isDownloading = downloadingModel === modelName
                      const shortName = modelName.includes(':9b') ? 'FLUX.2 Klein 9B' : 
                                      modelName.includes(':4b') ? 'FLUX.2 Klein 4B' : 
                                      'FLUX.2 Klein'
                      return (
                        <button
                          key={modelName}
                          onClick={() => handleDownloadModel(modelName)}
                          disabled={downloadingModel !== null || isDownloaded}
                          className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isDownloading ? 'Downloading...' : isDownloaded ? `${shortName} ✓` : shortName}
                        </button>
                      )
                    })}
                  </div>
                  <div className="text-[9px] text-terminal-muted mt-2">
                    Note: Only Ollama image models are shown. Local diffusers models (SDXL, etc.) are not available via Ollama.
                  </div>
                </div>
              </div>

              {/* Download Progress */}
              {downloadProgress && (
                <div className="bg-void p-2 border border-phosphor/50">
                  <div className="text-[10px] text-phosphor">
                    {downloadProgress.status === 'downloading' && '⬇ '}
                    {downloadProgress.status === 'success' && '✓ '}
                    {downloadProgress.status === 'error' && '✗ '}
                    {downloadProgress.message || downloadProgress.status}
                  </div>
                </div>
              )}
              
              <div className="text-terminal-muted text-[10px]">
                <p>Ollama models stored in: <code className="text-phosphor">~/.ollama/models/</code></p>
                <p className="mt-1">Download via: <code className="text-phosphor">ollama pull x/flux2-klein:9b</code></p>
              </div>
            </div>
          </section>

          {/* Save Button */}
          <div className="flex items-center justify-between pt-4 border-t border-terminal-border">
            <span className={`text-xs ${saved ? 'text-phosphor' : 'text-transparent'}`}>
              ✓ Settings saved
            </span>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-terminal-muted border border-terminal-border hover:text-phosphor hover:border-phosphor"
              >
                CANCEL
              </button>
              <button
                onClick={handleSave}
                disabled={dataFolderStatus === 'checking'}
                className="btn-terminal text-sm disabled:opacity-50"
              >
                {dataFolderStatus === 'checking' ? 'CHECKING...' : 'SAVE'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
