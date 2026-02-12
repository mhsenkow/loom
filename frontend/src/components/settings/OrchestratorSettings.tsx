
import { useState, useEffect } from 'react'
import { API_BASE_URL } from '../../config/api'

interface OrchestratorSettingsProps {
    className?: string
}

interface OrchestratorConfig {
    weight_speed: number
    weight_cost: number
    weight_quality: number
    auto_run_circuits: boolean
    prefer_local: boolean
}

interface ScoredModel {
    name: string
    score: number
    details: {
        speed: number
        cost: number
        quality: number
    }
}

interface ModelCandidate {
    name: string
    details: ScoredModel['details']
}

export function OrchestratorSettings({ className = '' }: OrchestratorSettingsProps) {
    const [config, setConfig] = useState<OrchestratorConfig>({
        weight_speed: 0.5,
        weight_cost: 0.5,
        weight_quality: 0.5,
        auto_run_circuits: false,
        prefer_local: true
    })
    const [mockModels, setMockModels] = useState<ScoredModel[]>([])

    // Fetch settings on mount
    useEffect(() => {
        fetch(`${API_BASE_URL}/api/orchestrator/settings`)
            .then(res => res.json())
            .then(data => setConfig(data))
            .catch(err => console.error("Failed to load orchestrator settings", err))
    }, [])

    // Simulate scoring logic locally for immediate visual feedback
    // (In a real app, we might debounce and ask backend to score, but this is faster UI)
    useEffect(() => {
        const calculateScore = (m: ModelCandidate) => {
            return (
                (m.details.speed * config.weight_speed) +
                (m.details.cost * config.weight_cost) +
                (m.details.quality * config.weight_quality)
            )
        }

        // Mock data representing typical models
        const models: ModelCandidate[] = [
            { name: "llama3.1:8b (Local)", details: { speed: 0.9, cost: 1.0, quality: 0.7 } },
            { name: "mistral:7b (Local)", details: { speed: 0.85, cost: 1.0, quality: 0.65 } },
            { name: "gpt-4o (Cloud)", details: { speed: 0.95, cost: 0.0, quality: 0.95 } },
            { name: "claude-3.5 (Cloud)", details: { speed: 0.9, cost: 0.0, quality: 0.98 } },
            { name: "tinyllama (Local)", details: { speed: 1.0, cost: 1.0, quality: 0.3 } },
        ]

        const scored = models.map(m => ({
            ...m,
            score: calculateScore(m)
        })).sort((a, b) => b.score - a.score)

        setMockModels(scored)
    }, [config])

    const saveSettings = async (newConfig: OrchestratorConfig) => {
        setConfig(newConfig)
        try {
            await fetch(`${API_BASE_URL}/api/orchestrator/settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newConfig)
            })
        } catch (err) {
            console.error("Failed to save settings", err)
        }
    }

    const updateWeight = (key: keyof OrchestratorConfig, value: number) => {
        saveSettings({ ...config, [key]: value })
    }

    const toggleBool = (key: keyof OrchestratorConfig) => {
        // Safe cast because we know the key exists
        saveSettings({ ...config, [key]: !config[key as keyof OrchestratorConfig] })
    }

    return (
        <div className={`space-y-6 ${className}`}>
            <div className="bg-white/5 rounded-xl p-4 border border-terminal-border/30">
                <h3 className="text-phosphor font-bold mb-4 flex items-center gap-2">
                    <span>🧠</span> Orchestrator Priorities
                </h3>

                <div className="space-y-6">
                    {/* Speed Slider */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-terminal-muted">
                            <span>Speed</span>
                            <span>{(config.weight_speed * 100).toFixed(0)}%</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.1"
                            value={config.weight_speed}
                            onChange={(e) => updateWeight('weight_speed', parseFloat(e.target.value))}
                            className="w-full accent-phosphor"
                        />
                    </div>

                    {/* Cost Slider */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-terminal-muted">
                            <span>Cost Efficiency</span>
                            <span>{(config.weight_cost * 100).toFixed(0)}%</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.1"
                            value={config.weight_cost}
                            onChange={(e) => updateWeight('weight_cost', parseFloat(e.target.value))}
                            className="w-full accent-green-400"
                        />
                    </div>

                    {/* Quality Slider */}
                    <div className="space-y-2">
                        <div className="flex justify-between text-xs text-terminal-muted">
                            <span>Quality</span>
                            <span>{(config.weight_quality * 100).toFixed(0)}%</span>
                        </div>
                        <input
                            type="range" min="0" max="1" step="0.1"
                            value={config.weight_quality}
                            onChange={(e) => updateWeight('weight_quality', parseFloat(e.target.value))}
                            className="w-full accent-purple-400"
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div
                    onClick={() => toggleBool('prefer_local')}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${config.prefer_local ? 'bg-phosphor/10 border-phosphor text-phosphor' : 'bg-white/5 border-terminal-border/30 text-terminal-muted hover:border-terminal-border'}`}
                >
                    <div className="font-bold mb-1">Prefer Local</div>
                    <div className="text-[10px] opacity-70">Always try to use local models first</div>
                </div>

                <div
                    onClick={() => toggleBool('auto_run_circuits')}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${config.auto_run_circuits ? 'bg-cyan-400/10 border-cyan-400 text-cyan-400' : 'bg-white/5 border-terminal-border/30 text-terminal-muted hover:border-terminal-border'}`}
                >
                    <div className="font-bold mb-1">Auto-Run Circuits</div>
                    <div className="text-[10px] opacity-70">Execute circuits immediately when detected</div>
                </div>
            </div>

            {/* Live Preview */}
            <div className="bg-black/40 rounded-xl p-4 border border-terminal-border/30">
                <h4 className="text-xs font-bold text-terminal-muted mb-3 uppercase tracking-wider">Projected Model Ranking</h4>
                <div className="space-y-2">
                    {mockModels.slice(0, 3).map((m, i) => (
                        <div key={m.name} className="flex items-center gap-3">
                            <div className="text-[10px] w-6 text-terminal-muted font-mono">#{i + 1}</div>
                            <div className="flex-1">
                                <div className="flex justify-between text-xs mb-1">
                                    <span className={i === 0 ? 'text-phosphor font-bold' : 'text-terminal-muted'}>{m.name}</span>
                                    <span className="text-terminal-muted font-mono">{m.score.toFixed(2)}</span>
                                </div>
                                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                        className={`h-full transition-all duration-300 ${i === 0 ? 'bg-phosphor shadow-glow' : 'bg-terminal-muted/30'}`}
                                        style={{ width: `${(m.score / (mockModels[0].score || 1)) * 100}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
