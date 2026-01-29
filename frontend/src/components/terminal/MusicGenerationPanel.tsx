import { useEffect, useState, useRef } from 'react'

interface MusicGeneration {
    prompt: string
    lyrics?: string
    audioUrl?: string
    duration: number
    status: 'empty' | 'generating' | 'success' | 'error'
    error?: string
    progress?: number
    message?: string
}

interface MusicGenerationPanelProps {
    generation: MusicGeneration | null
    onClose?: () => void
    onGenerate?: (prompt: string, lyrics: string, duration: number) => void
    onApproveToChat?: (audioUrl: string, prompt: string, duration: number) => void
}

// ASCII art for music generation
const ASCII_FRAMES = ['♪', '♫', '♬', '♩']

const STYLE_SUGGESTIONS = [
    'rock', 'pop', 'jazz', 'classical', 'electronic',
    'hip-hop', 'lo-fi', 'ambient', 'funk', 'blues'
]

export function MusicGenerationPanel({
    generation,
    onClose,
    onGenerate,
    onApproveToChat,
}: MusicGenerationPanelProps) {
    const [frameIndex, setFrameIndex] = useState(0)
    const [promptInput, setPromptInput] = useState('')
    const [lyricsInput, setLyricsInput] = useState('')
    const [durationInput, setDurationInput] = useState(30)
    const [isPlaying, setIsPlaying] = useState(false)
    const [audioProgress, setAudioProgress] = useState(0)
    const audioRef = useRef<HTMLAudioElement>(null)

    // Animate spinner while generating
    useEffect(() => {
        if (generation?.status !== 'generating') return

        const interval = setInterval(() => {
            setFrameIndex(prev => (prev + 1) % ASCII_FRAMES.length)
        }, 200)

        return () => clearInterval(interval)
    }, [generation?.status])

    // Update audio progress
    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const updateProgress = () => {
            if (audio.duration) {
                setAudioProgress((audio.currentTime / audio.duration) * 100)
            }
        }

        const handleEnded = () => {
            setIsPlaying(false)
            setAudioProgress(0)
        }

        audio.addEventListener('timeupdate', updateProgress)
        audio.addEventListener('ended', handleEnded)

        return () => {
            audio.removeEventListener('timeupdate', updateProgress)
            audio.removeEventListener('ended', handleEnded)
        }
    }, [generation?.audioUrl])

    const handlePlayPause = () => {
        const audio = audioRef.current
        if (!audio) return

        if (isPlaying) {
            audio.pause()
        } else {
            audio.play()
        }
        setIsPlaying(!isPlaying)
    }

    const handleGenerate = () => {
        if (promptInput.trim() && onGenerate) {
            onGenerate(promptInput.trim(), lyricsInput.trim(), durationInput)
        }
    }

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current
        if (!audio || !audio.duration) return

        const rect = e.currentTarget.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        audio.currentTime = percent * audio.duration
    }

    // If generation is null but panel is open, show empty state
    const status = generation?.status || 'empty'

    return (
        <div className="fixed right-0 top-0 bottom-0 w-96 bg-slate border-l-2 border-phosphor z-40 flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-4 border-b border-terminal-border flex items-center justify-between bg-void/50">
                <div className="flex items-center gap-2">
                    <span className="text-lg">🎵</span>
                    <div>
                        <h2 className="text-sm font-bold text-phosphor">MUSIC GENERATION</h2>
                        <p className="text-[10px] text-terminal-muted mt-0.5">ACE-Step Foundation Model</p>
                    </div>
                </div>
                {onClose && (
                    <button
                        onClick={onClose}
                        className="text-terminal-muted hover:text-phosphor text-lg px-2"
                        title="Close panel"
                    >
                        ×
                    </button>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Empty State / Input Form */}
                {(status === 'empty' || status === 'error') && (
                    <div className="space-y-4">
                        {/* Error Message */}
                        {status === 'error' && generation?.error && (
                            <div className="border-l-2 border-red-500 pl-3 mb-4">
                                <div className="text-xs text-red-400 font-bold">ERROR</div>
                                <div className="text-[10px] text-red-400/80 mt-1 font-mono">
                                    {generation.error}
                                </div>
                            </div>
                        )}

                        {/* Style/Prompt Input */}
                        <div>
                            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">STYLE / PROMPT</div>
                            <input
                                type="text"
                                value={promptInput}
                                onChange={(e) => setPromptInput(e.target.value)}
                                placeholder="e.g., upbeat rock song with electric guitar"
                                className="w-full bg-void border border-terminal-border text-phosphor text-xs px-3 py-2 focus:outline-none focus:border-phosphor placeholder:text-terminal-muted/50 font-mono"
                            />
                            <div className="flex flex-wrap gap-1 mt-2">
                                {STYLE_SUGGESTIONS.map(style => (
                                    <button
                                        key={style}
                                        onClick={() => setPromptInput(prev => prev ? `${prev}, ${style}` : style)}
                                        className="px-2 py-0.5 text-[9px] border border-terminal-border/50 text-terminal-muted hover:text-phosphor hover:border-phosphor/50 transition-colors"
                                    >
                                        {style}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Lyrics Input */}
                        <div>
                            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">
                                LYRICS <span className="text-terminal-muted/50">(optional)</span>
                            </div>
                            <textarea
                                value={lyricsInput}
                                onChange={(e) => setLyricsInput(e.target.value)}
                                placeholder="Enter lyrics here...&#10;Use [Verse], [Chorus], [Bridge] tags&#10;to structure your song"
                                className="w-full bg-void border border-terminal-border text-phosphor text-xs px-3 py-2 resize-none focus:outline-none focus:border-phosphor placeholder:text-terminal-muted/50 font-mono"
                                rows={5}
                            />
                        </div>

                        {/* Duration Slider */}
                        <div>
                            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">
                                DURATION: <span className="text-phosphor">{durationInput}s</span>
                            </div>
                            <input
                                type="range"
                                min={10}
                                max={180}
                                step={10}
                                value={durationInput}
                                onChange={(e) => setDurationInput(Number(e.target.value))}
                                className="w-full accent-phosphor"
                            />
                            <div className="flex justify-between text-[9px] text-terminal-muted/50 mt-1">
                                <span>10s</span>
                                <span>60s</span>
                                <span>120s</span>
                                <span>180s</span>
                            </div>
                        </div>

                        {/* Generate Button */}
                        <button
                            onClick={handleGenerate}
                            disabled={!promptInput.trim()}
                            className="w-full bg-gradient-to-r from-purple-600 to-pink-500 text-white px-4 py-3 text-sm font-bold hover:from-purple-500 hover:to-pink-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            🎵 Generate Music
                        </button>

                        {/* Tips */}
                        <div className="border-l-2 border-phosphor/30 pl-3 space-y-2">
                            <div className="text-[9px] text-terminal-muted">
                                <span className="text-phosphor/70">TIP:</span> Be specific about instruments, mood, tempo, and genre.
                            </div>
                            <div className="text-[9px] text-terminal-muted">
                                <span className="text-phosphor/70">TIP:</span> First generation downloads the model (~13GB).
                            </div>
                        </div>
                    </div>
                )}

                {/* Generating State */}
                {status === 'generating' && (
                    <div className="space-y-4">
                        {/* Current Prompt */}
                        <div>
                            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">GENERATING</div>
                            <div className="text-xs text-phosphor font-mono bg-void/30 p-2 border border-terminal-border/30">
                                {generation?.prompt || promptInput}
                            </div>
                        </div>

                        {/* Progress Indicator */}
                        <div className="flex items-center gap-3 p-4 border border-phosphor/30 bg-phosphor/5">
                            <span className="text-3xl text-phosphor animate-pulse">{ASCII_FRAMES[frameIndex]}</span>
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-phosphor">Composing your track…</div>
                                <div className="text-[10px] text-terminal-muted mt-1">
                                    {generation?.message || 'This may take 30-60 seconds'}
                                </div>
                                {generation?.progress !== undefined && generation.progress > 0 && (
                                    <div className="mt-2">
                                        <div className="h-2 bg-void border border-terminal-border/30 overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                                                style={{ width: `${generation.progress}%` }}
                                            />
                                        </div>
                                        <div className="text-[9px] text-terminal-muted mt-1">{generation.progress.toFixed(0)}%</div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Success State */}
                {status === 'success' && generation?.audioUrl && (
                    <div className="space-y-4">
                        {/* Prompt */}
                        <div>
                            <div className="text-[10px] text-terminal-muted tracking-widest mb-2">GENERATED TRACK</div>
                            <div className="text-xs text-phosphor font-mono bg-void/30 p-2 border border-terminal-border/30">
                                {generation.prompt}
                            </div>
                        </div>

                        {/* Audio Player */}
                        <div className="border border-phosphor/30 bg-void/50 p-4 space-y-3">
                            <audio ref={audioRef} src={generation.audioUrl} preload="metadata" />

                            {/* Waveform Visualization (simplified) */}
                            <div className="h-16 bg-void/50 border border-terminal-border/30 flex items-center justify-center">
                                <div className="flex items-end gap-0.5 h-12">
                                    {Array.from({ length: 40 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className={`w-1.5 bg-gradient-to-t from-purple-500 to-pink-500 transition-all duration-100 ${isPlaying ? 'animate-pulse' : ''
                                                }`}
                                            style={{
                                                height: `${20 + Math.sin(i * 0.5) * 30 + (isPlaying ? Math.random() * 20 : 0)}%`,
                                                opacity: audioProgress > (i / 40) * 100 ? 1 : 0.3
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* Progress Bar */}
                            <div
                                className="h-2 bg-void border border-terminal-border/30 cursor-pointer"
                                onClick={handleSeek}
                            >
                                <div
                                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                                    style={{ width: `${audioProgress}%` }}
                                />
                            </div>

                            {/* Controls */}
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    onClick={handlePlayPause}
                                    className="w-12 h-12 flex items-center justify-center bg-gradient-to-r from-purple-600 to-pink-500 text-white text-xl rounded-full hover:from-purple-500 hover:to-pink-400 transition-all"
                                >
                                    {isPlaying ? '⏸' : '▶'}
                                </button>
                            </div>
                        </div>

                        {/* Duration Info */}
                        <div className="text-[9px] text-terminal-muted">
                            Duration: {generation.duration}s • ACE-Step v1
                        </div>

                        {/* Action Buttons */}
                        {onApproveToChat && (
                            <button
                                onClick={() => onApproveToChat(generation.audioUrl!, generation.prompt, generation.duration)}
                                className="w-full bg-phosphor text-void px-4 py-2 text-xs font-bold hover:bg-phosphor/90 transition-colors"
                            >
                                ✓ APPROVE & ADD TO CHAT
                            </button>
                        )}

                        <button
                            onClick={() => {
                                // Reset to allow new generation
                                setIsPlaying(false)
                                setAudioProgress(0)
                                if (audioRef.current) {
                                    audioRef.current.pause()
                                    audioRef.current.currentTime = 0
                                }
                            }}
                            className="w-full border border-terminal-border text-phosphor px-4 py-2 text-xs hover:bg-void/50 transition-colors"
                        >
                            🔄 GENERATE NEW TRACK
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
