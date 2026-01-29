import { useState, useEffect, useCallback } from 'react'

const BACKEND_URL = 'http://localhost:8000'

interface MusicModelStatus {
    model_ready: boolean
    model_downloading: boolean
    download_progress: number
    download_message: string
    has_ace_step: boolean
    device: string
    model_name: string
    model_size_gb: number
    setup_required: boolean
}

interface MusicSetupPanelProps {
    onClose: () => void
    onModelReady?: () => void
}

export function MusicSetupPanel({ onClose, onModelReady }: MusicSetupPanelProps) {
    const [status, setStatus] = useState<MusicModelStatus | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/music/status`, {
                signal: AbortSignal.timeout(5000), // 5 second timeout
            })
            if (!res.ok) throw new Error('Failed to fetch status')
            const data = await res.json()
            setStatus(data)
            setError(null)
            setIsLoading(false)

            // If model is ready, notify parent
            if (data.model_ready && onModelReady) {
                onModelReady()
            }
        } catch (e) {
            // Only show error if we don't have any status yet
            if (!status) {
                setError(e instanceof Error ? e.message : 'Connection error')
                setIsLoading(false)
            }
            // If we already have status, silently ignore transient errors
        }
    }, [onModelReady, status])

    useEffect(() => {
        fetchStatus()
        // Poll for updates while downloading - slower polling to reduce load
        const interval = setInterval(fetchStatus, 3000)
        return () => clearInterval(interval)
    }, [fetchStatus])

    const handleDownload = async () => {
        try {
            const res = await fetch(`${BACKEND_URL}/api/music/download-model`, {
                method: 'POST',
            })
            const data = await res.json()
            if (data.status === 'started') {
                // Will pick up progress via polling
                fetchStatus()
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to start download')
        }
    }

    if (isLoading) {
        return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-violet-500/30 rounded-lg p-6 max-w-md w-full mx-4">
                    <div className="flex items-center gap-3">
                        <div className="animate-spin w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full" />
                        <span className="text-phosphor">Checking music model status...</span>
                    </div>
                </div>
            </div>
        )
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-red-500/30 rounded-lg p-6 max-w-md w-full mx-4">
                    <h2 className="text-lg font-bold text-red-400 mb-2">Connection Error</h2>
                    <p className="text-terminal-muted mb-4">{error}</p>
                    <div className="flex gap-2">
                        <button
                            onClick={fetchStatus}
                            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded"
                        >
                            Retry
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-terminal-muted rounded"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    if (!status) return null

    // Model is ready
    if (status.model_ready) {
        return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-green-500/30 rounded-lg p-6 max-w-md w-full mx-4">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">✓</span>
                        <h2 className="text-lg font-bold text-green-400">Music Model Ready</h2>
                    </div>
                    <p className="text-terminal-muted mb-4">
                        ACE-Step is loaded on <span className="text-violet-400">{status.device.toUpperCase()}</span> and ready to generate music!
                    </p>
                    <button
                        onClick={onClose}
                        className="w-full px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded font-bold"
                    >
                        Start Creating
                    </button>
                </div>
            </div>
        )
    }

    // Currently downloading
    if (status.model_downloading) {
        return (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
                <div className="bg-slate-900 border border-violet-500/30 rounded-lg p-6 max-w-lg w-full mx-4">
                    <div className="flex items-center gap-3 mb-4">
                        <span className="text-2xl">🎵</span>
                        <h2 className="text-lg font-bold text-violet-400">Downloading Music Model</h2>
                    </div>

                    <div className="mb-4">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-terminal-muted">{status.download_message}</span>
                            <span className="text-violet-400">{status.download_progress.toFixed(1)}%</span>
                        </div>
                        <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-violet-600 to-pink-500 transition-all duration-300"
                                style={{ width: `${status.download_progress}%` }}
                            />
                        </div>
                    </div>

                    <p className="text-terminal-muted text-sm">
                        Downloading {status.model_name} (~{status.model_size_gb}GB). This may take a while depending on your connection.
                    </p>
                </div>
            </div>
        )
    }

    // Setup required
    return (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
            <div className="bg-slate-900 border border-violet-500/30 rounded-lg p-6 max-w-lg w-full mx-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🎵</span>
                        <h2 className="text-lg font-bold text-violet-400">Music Generation Setup</h2>
                    </div>
                    <button onClick={onClose} className="text-terminal-muted hover:text-white text-xl">&times;</button>
                </div>

                <div className="space-y-4">
                    <div className="bg-black/30 rounded p-4 border border-terminal-border">
                        <h3 className="font-bold text-phosphor mb-2">ACE-Step Music Model</h3>
                        <p className="text-terminal-muted text-sm mb-3">
                            Generate high-quality music with lyrics support using the ACE-Step foundation model.
                            Optimized for <span className="text-violet-400">{status.device.toUpperCase()}</span> acceleration.
                        </p>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="text-terminal-muted">Size:</span>
                            <span className="text-phosphor">~{status.model_size_gb}GB</span>
                        </div>
                    </div>

                    {!status.has_ace_step && (
                        <div className="bg-amber-900/20 border border-amber-500/30 rounded p-3">
                            <p className="text-amber-400 text-sm">
                                ⚠️ <code className="bg-black/30 px-1 rounded">ACE-Step</code> not installed.
                                Run this in your backend terminal:
                            </p>
                            <pre className="mt-2 p-2 bg-black/40 rounded text-xs text-phosphor overflow-x-auto">
                                pip install git+https://github.com/ace-step/ACE-Step.git
                            </pre>
                        </div>
                    )}

                    <button
                        onClick={handleDownload}
                        className="w-full px-4 py-3 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white rounded font-bold flex items-center justify-center gap-2"
                    >
                        <span>⬇️</span>
                        Download Model
                    </button>

                    <p className="text-terminal-muted text-xs text-center">
                        Models auto-download to <code className="bg-black/30 px-1 rounded">~/.cache/ace-step/checkpoints/</code>
                    </p>
                </div>
            </div>
        </div>
    )
}
