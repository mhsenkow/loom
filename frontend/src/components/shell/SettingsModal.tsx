import { useState, useEffect } from 'react'
import { OrchestratorSettings } from '../settings/OrchestratorSettings'
import { API_BASE_URL } from '../../config/api'
import {
  fetchImageModels as fetchImageModelsApi,
  invalidateImageModelsCache,
  notifyImageModelsUpdated,
} from '../../utils/imageModelsApi'
import { getSocketInstance, type PullStatus } from '../../hooks/useSocket'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export type ThemeId = 'phosphor' | 'ruby' | 'sapphire' | 'diamond' | 'ebony'
export type CrtIntensityPreset = 'subtle' | 'medium' | 'full' | 'insane'

export interface Settings {
  huggingfaceToken: string
  comfyuiUrl: string
  comfyuiEnabled: boolean
  dataFolderPath: string
  theme: ThemeId
  crtEnabled: boolean
  crtIntensity: CrtIntensityPreset
  crtBurstsEnabled: boolean
}

const SETTINGS_KEY = 'loom-settings'

const THEMES: { id: ThemeId; name: string; subtitle: string; swatch: string }[] = [
  { id: 'phosphor', name: 'Phosphor', subtitle: 'DEC VT100, early PC', swatch: '#33ff00' },
  { id: 'ruby', name: 'Ruby', subtitle: 'Soviet, Eastern bloc amber', swatch: '#e85c20' },
  { id: 'sapphire', name: 'Sapphire', subtitle: 'IBM 3270, Fujitsu, NEC', swatch: '#3d8cff' },
  { id: 'diamond', name: 'Diamond', subtitle: 'Medical, SGI, precision', swatch: '#b8ccf0' },
  { id: 'ebony', name: 'Ebony', subtitle: 'Apple II, NeXT, ivory', swatch: '#d8d4c8' },
]

const CRT_INTENSITY_PRESETS: { id: CrtIntensityPreset; label: string; subtitle: string }[] = [
  { id: 'subtle', label: 'SUBTLE', subtitle: 'Low scanlines, easy on eyes' },
  { id: 'medium', label: 'MEDIUM', subtitle: 'Balanced retro look' },
  { id: 'full', label: 'FULL', subtitle: 'Strong tube + glitch feel' },
  { id: 'insane', label: 'INSANE', subtitle: 'Arcade chaos mode' },
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
      const merged = { ...defaultSettings(), ...parsed }
      if (!THEMES.some(t => t.id === merged.theme)) {
        merged.theme = 'phosphor'
      }
      if (!CRT_INTENSITY_PRESETS.some(preset => preset.id === merged.crtIntensity)) {
        merged.crtIntensity = 'medium'
      }
      if (typeof merged.crtBurstsEnabled !== 'boolean') {
        merged.crtBurstsEnabled = true
      }
      return merged
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
    crtEnabled: true,
    crtIntensity: 'medium',
    crtBurstsEnabled: true,
  }
}

// Save settings to localStorage
export function saveSettings(settings: Settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('loom:settings-updated', { detail: settings }))
  }
}

// Configure data folder on backend
async function configureDataFolder(path: string): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/files/folder`, {
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
  const [openFolderStatus, setOpenFolderStatus] = useState<string | null>(null)

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
      const data = await fetchImageModelsApi(API_BASE_URL)
      setImageModels(data.local.map(m => ({
        name: m.name,
        type: m.type || 'unknown',
        vram: m.vram,
      })))
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
        // Use shared app socket to pull via backend.
        const socket = getSocketInstance()
        const handler = (data: PullStatus) => {
          if (data.model !== modelName) return

          setDownloadProgress({
            model: modelName,
            status: data.status,
            message: data.message,
          })

          if (data.status === 'success' || data.status === 'error') {
            socket.off('pull_image_status', handler)
            setDownloadingModel(null)
            setTimeout(() => {
              setDownloadProgress(null)
              invalidateImageModelsCache()
              fetchImageModels() // Refresh list
              notifyImageModelsUpdated()
            }, 2000)
          }
        }

        socket.on('pull_image_status', handler)

        socket.emit('pull_image_model', { model: modelName })
      } else {
        // Local diffusers model - trigger download by loading
        setDownloadProgress({ model: modelName, status: 'downloading', message: 'Downloading model files...' })
        const response = await fetch(`${API_BASE_URL}/api/images/models/load?model=${encodeURIComponent(modelName)}`, {
          method: 'POST',
        })

        if (response.ok) {
          setDownloadProgress({ model: modelName, status: 'success', message: 'Model downloaded!' })
          setTimeout(() => {
            setDownloadingModel(null)
            setDownloadProgress(null)
            invalidateImageModelsCache()
            fetchImageModels()
            notifyImageModelsUpdated()
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

  const openModelFolder = async (target: 'ollama' | 'diffusion' | 'music') => {
    try {
      setOpenFolderStatus(`Opening ${target} folder...`)
      const response = await fetch(`${API_BASE_URL}/api/sessions/open-model-folder?target=${encodeURIComponent(target)}`, {
        method: 'POST',
      })
      if (!response.ok) {
        const text = await response.text()
        throw new Error(text || `Request failed (${response.status})`)
      }
      const payload = await response.json() as { path?: string }
      const openedPath = payload.path || target
      setOpenFolderStatus(`Opened: ${openedPath}`)
      setTimeout(() => setOpenFolderStatus(null), 4000)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setOpenFolderStatus(`Failed to open folder: ${message}`)
    }
  }

  const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value }
      if (key === 'crtEnabled' || key === 'crtIntensity' || key === 'crtBurstsEnabled') {
        window.dispatchEvent(new CustomEvent('loom:settings-updated', { detail: next }))
      }
      return next
    })
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
            <div className="space-y-3 mb-4">
              <div className="flex items-center justify-between gap-3 p-2 border border-terminal-border bg-void">
                <div>
                  <div className="text-[10px] text-phosphor font-bold tracking-wider">EFFECT</div>
                  <div className="text-[10px] text-terminal-muted">Global CRT overlay across terminal + circuit</div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('crtEnabled', !settings.crtEnabled)}
                  className={`px-3 py-1 text-[10px] border font-bold tracking-wider ${
                    settings.crtEnabled
                      ? 'border-phosphor bg-phosphor text-void'
                      : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                  }`}
                >
                  {settings.crtEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="flex items-center justify-between gap-3 p-2 border border-terminal-border bg-void">
                <div>
                  <div className="text-[10px] text-phosphor font-bold tracking-wider">GLITCH BURSTS</div>
                  <div className="text-[10px] text-terminal-muted">Pulse on model switches, AI responses, and failures</div>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('crtBurstsEnabled', !settings.crtBurstsEnabled)}
                  className={`px-3 py-1 text-[10px] border font-bold tracking-wider ${
                    settings.crtBurstsEnabled
                      ? 'border-phosphor bg-phosphor text-void'
                      : 'border-terminal-border text-terminal-muted hover:border-phosphor hover:text-phosphor'
                  }`}
                >
                  {settings.crtBurstsEnabled ? 'ON' : 'OFF'}
                </button>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {CRT_INTENSITY_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updateSetting('crtIntensity', preset.id)}
                    className={`p-2 border text-left ${
                      settings.crtIntensity === preset.id
                        ? 'border-phosphor bg-void'
                        : 'border-terminal-border hover:border-phosphor/50'
                    }`}
                  >
                    <div className="text-[10px] text-phosphor font-bold tracking-wider">{preset.label}</div>
                    <div className="text-[9px] text-terminal-muted mt-1 leading-tight">{preset.subtitle}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateSetting('theme', t.id)}
                  className={`flex flex-col items-center p-3 border transition-colors ${settings.theme === t.id
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


          {/* Orchestration Section */}
          <section>
            <OrchestratorSettings />
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

          {/* Voice & Avatar Section */}
          <section>
            <h3 className="text-phosphor font-bold text-sm tracking-wider mb-3">
              VOICE & AVATAR
            </h3>
            <p className="text-terminal-muted text-xs mb-2">
              Use the <strong className="text-phosphor">✦</strong> button on the right sidebar to open the Voice & Avatar panel.
            </p>
            <ul className="text-terminal-muted text-[10px] list-disc list-inside space-y-1">
              <li><strong className="text-phosphor">Response to read</strong> – Pick any AI reply and read it aloud (TTS)</li>
              <li><strong className="text-phosphor">Voice (TTS)</strong> – Voice, rate, and pitch for read-aloud</li>
              <li><strong className="text-phosphor">Avatar</strong> – Pick a style (Data Nebula, Plasma Orb, etc.)</li>
              <li><strong className="text-phosphor">Voice chat</strong> – Opens a modal to talk back and forth (hold to talk, AI replies aloud)</li>
            </ul>
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
                  <div className="text-terminal-muted text-center py-2 space-y-1">
                    <div className="text-phosphor text-[11px]">No models downloaded yet</div>
                    <div className="text-[10px]">First run: start Ollama, then download one model below.</div>
                    <div className="text-[10px]">You can also run: <code className="text-phosphor">/pull x/flux2-klein</code></div>
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
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => { void openModelFolder('ollama') }}
                    className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
                    title="Open Ollama models folder"
                  >
                    Open Ollama Folder
                  </button>
                  <button
                    onClick={() => { void openModelFolder('diffusion') }}
                    className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
                    title="Open local diffusion models folder"
                  >
                    Open Diffusion Folder
                  </button>
                  <button
                    onClick={() => { void openModelFolder('music') }}
                    className="px-2 py-1 text-[10px] border border-terminal-border hover:border-phosphor hover:text-phosphor"
                    title="Open music model cache folder"
                  >
                    Open Music Cache
                  </button>
                </div>
                {openFolderStatus && (
                  <p className="mt-2 text-[10px] text-phosphor">{openFolderStatus}</p>
                )}
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
