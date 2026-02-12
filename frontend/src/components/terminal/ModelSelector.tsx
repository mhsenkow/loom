import { useState, useEffect } from 'react'
import { useSystemStatus } from '../../hooks/useSystemStatus'
import { API_BASE_URL } from '../../config/api'

const ACTIVE_MODEL_STORAGE_KEY = 'loom-active-model'

export function ModelSelector() {
    const { status, models, setActiveModel } = useSystemStatus()
    const [isAuto, setIsAuto] = useState(status.activeModel === 'auto')

    // Initialize from persisted selection (or default to auto)
    useEffect(() => {
        try {
            const saved = localStorage.getItem(ACTIVE_MODEL_STORAGE_KEY)
            if (saved && saved.trim()) {
                setActiveModel(saved)
                setIsAuto(saved === 'auto')
                return
            }
        } catch {
            // ignore storage errors
        }
        if (!status.activeModel) {
            setActiveModel('auto')
            setIsAuto(true)
        }
    }, [setActiveModel, status.activeModel])

    // Keep toggle state synced to selected model
    useEffect(() => {
        setIsAuto(status.activeModel === 'auto')
    }, [status.activeModel])

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const value = e.target.value
        if (value === 'auto') {
            setIsAuto(true)
            setActiveModel('auto')
        } else {
            setIsAuto(false)
            setActiveModel(value)
        }
        try {
            localStorage.setItem(ACTIVE_MODEL_STORAGE_KEY, value)
        } catch {
            // ignore storage errors
        }
        window.dispatchEvent(new CustomEvent('loom:crt-burst', {
            detail: { kind: 'model-select', strength: 1.1, durationMs: 160 }
        }))
    }

    const openModelsFolder = async () => {
        try {
            await fetch(`${API_BASE_URL}/api/sessions/open-model-folder?target=ollama`, {
                method: 'POST',
            })
        } catch (error) {
            console.error('Failed to open models folder:', error)
        }
    }

    return (
        <div className="flex items-center gap-2 bg-slate/80 backdrop-blur border border-terminal-border rounded px-2 py-1 text-xs z-20">
            <span className="text-terminal-muted select-none">MODEL:</span>
            <div className="relative group">
                <select
                    value={isAuto ? 'auto' : (status.activeModel || models[0] || 'auto')}
                    onChange={handleChange}
                    className="appearance-none bg-transparent border-none text-phosphor outline-none cursor-pointer pr-4 font-mono w-full max-w-[150px] truncate"
                >
                    <option value="auto" className="bg-slate text-phosphor">
                        ◆ Auto (Orchestrator)
                    </option>
                    <option disabled>──────────</option>
                    {models.map(model => (
                        <option key={model} value={model} className="bg-slate text-phosphor">
                            {model}
                        </option>
                    ))}
                </select>
                {/* Custom dropdown arrow */}
                <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-terminal-muted text-[8px]">
                    ▼
                </div>
            </div>

            {/* Auto badge if active with currently routed/loaded model */}
            {isAuto && status.loadedModelName && status.loadedModelName !== 'unknown' && (
                <span className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-900/50 select-none animate-pulse-slow">
                    <span>⚡</span>
                    <span className="max-w-[80px] truncate" title={`Auto-selected: ${status.loadedModelName}`}>
                        {status.loadedModelName}
                    </span>
                </span>
            )}

            <button
                onClick={() => { void openModelsFolder() }}
                className="text-terminal-muted hover:text-phosphor border border-terminal-border hover:border-phosphor px-1.5 py-0.5 rounded text-[10px]"
                title="Open Ollama models folder"
                aria-label="Open Ollama models folder"
            >
                📁
            </button>
        </div>
    )
}
