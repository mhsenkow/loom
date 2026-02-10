import { useState, useEffect } from 'react'
import { useSystemStatus } from '../../hooks/useSystemStatus'

export function ModelSelector() {
    const { status, models, setActiveModel } = useSystemStatus()
    const [isAuto, setIsAuto] = useState(false)

    // Initialize: check if current model is 'auto' (though activeModel usually holds resolved name)
    useEffect(() => {
        if (status.activeModel === 'auto') {
            setIsAuto(true)
        }
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
    }

    return (
        <div className="flex items-center gap-2 bg-slate/80 backdrop-blur border border-terminal-border rounded px-2 py-1 text-xs z-20">
            <span className="text-terminal-muted select-none">MODEL:</span>
            <div className="relative group">
                <select
                    value={isAuto ? 'auto' : status.activeModel || ''}
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

            {/* Auto badge if active */}
            {isAuto && status.activeModel && status.activeModel !== 'auto' && (
                <span className="flex items-center gap-1 text-[10px] text-cyan-400 bg-cyan-950/30 px-1.5 py-0.5 rounded border border-cyan-900/50 select-none animate-pulse-slow">
                    <span>⚡</span>
                    <span className="max-w-[80px] truncate" title={`Auto-selected: ${status.activeModel}`}>
                        {status.activeModel}
                    </span>
                </span>
            )}
        </div>
    )
}
