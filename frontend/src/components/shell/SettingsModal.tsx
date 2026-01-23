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

  useEffect(() => {
    if (isOpen) {
      setSettings(loadSettings())
      setSaved(false)
      setDataFolderStatus('idle')
    }
  }, [isOpen])

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
              LOCAL IMAGE GENERATION
            </h3>
            <p className="text-terminal-muted text-xs mb-3">
              Runs on Apple Silicon (MPS). Models download on first use.
            </p>

            <div className="space-y-3 text-xs">
              <div className="bg-void p-3 border border-terminal-border">
                <div className="text-phosphor font-bold mb-2">Available Models:</div>
                <div className="grid grid-cols-2 gap-1 text-terminal-muted">
                  <p>• SDXL (8GB)</p>
                  <p>• SDXL Turbo (8GB)</p>
                  <p>• SD 3 (16GB)</p>
                  <p>• FLUX Schnell (32GB)</p>
                  <p>• FLUX Dev (32GB)</p>
                  <p>• SD 1.5 (4GB)</p>
                </div>
              </div>
              
              <div className="text-terminal-muted">
                <p>Models stored in: <code className="text-phosphor">backend/models/</code></p>
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
