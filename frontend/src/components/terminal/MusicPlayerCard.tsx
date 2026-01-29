import { useState, useRef, useEffect } from 'react'

interface MusicPlayerCardProps {
    audioUrl: string
    prompt: string
    duration?: number
    timestamp?: number
    onDownload?: () => void
}

export function MusicPlayerCard({ audioUrl, prompt, duration, timestamp, onDownload }: MusicPlayerCardProps) {
    const [isPlaying, setIsPlaying] = useState(false)
    const [progress, setProgress] = useState(0)
    const audioRef = useRef<HTMLAudioElement>(null)

    useEffect(() => {
        const audio = audioRef.current
        if (!audio) return

        const updateProgress = () => {
            if (audio.duration) {
                setProgress((audio.currentTime / audio.duration) * 100)
            }
        }

        const handleEnded = () => {
            setIsPlaying(false)
            setProgress(0)
        }

        audio.addEventListener('timeupdate', updateProgress)
        audio.addEventListener('ended', handleEnded)

        return () => {
            audio.removeEventListener('timeupdate', updateProgress)
            audio.removeEventListener('ended', handleEnded)
        }
    }, [audioUrl])

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

    const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
        const audio = audioRef.current
        if (!audio || !audio.duration) return

        const rect = e.currentTarget.getBoundingClientRect()
        const percent = (e.clientX - rect.left) / rect.width
        audio.currentTime = percent * audio.duration
    }

    return (
        <div className="mt-2 mb-1 max-w-sm border border-phosphor/30 bg-void/50 rounded overflow-hidden">
            <audio ref={audioRef} src={audioUrl} preload="metadata" />

            {/* Header with Prompt */}
            <div className="p-3 border-b border-terminal-border/30 bg-phosphor/5 flex items-start gap-3">
                <div className="h-8 w-8 flex-shrink-0 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded flex items-center justify-center border border-terminal-border/30">
                    <span className="text-sm">🎵</span>
                </div>
                <div className="flex-1 min-w-0">
                    <div className="text-xs text-phosphor font-medium line-clamp-1" title={prompt}>
                        {prompt}
                    </div>
                    <div className="text-[10px] text-terminal-muted mt-0.5 font-mono">
                        ACE-Step Generated • {new Date(timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                </div>
            </div>

            {/* Player visualization area */}
            <div className="p-3">
                <div className="h-12 bg-void/50 border border-terminal-border/30 rounded mb-3 flex items-center justify-center overflow-hidden relative">
                    {/* Animated waveform bars */}
                    <div className="flex items-end gap-0.5 h-8 absolute inset-0 justify-center items-center opacity-50">
                        {Array.from({ length: 30 }).map((_, i) => (
                            <div
                                key={i}
                                className={`w-1 bg-gradient-to-t from-purple-500 to-pink-500 transition-all duration-100 ${isPlaying ? 'animate-pulse' : ''
                                    }`}
                                style={{
                                    height: `${20 + Math.sin(i * 0.5) * 40 + (isPlaying ? Math.random() * 30 : 0)}%`,
                                    opacity: progress > (i / 30) * 100 ? 1 : 0.3
                                }}
                            />
                        ))}
                    </div>

                    {/* Play/Pause Overlay */}
                    <button
                        onClick={handlePlayPause}
                        className="z-10 w-8 h-8 flex items-center justify-center bg-phosphor text-void rounded-full shadow-lg hover:scale-105 transition-transform"
                    >
                        {isPlaying ? '⏸' : '▶'}
                    </button>
                </div>

                {/* Progress bar */}
                <div
                    className="h-1.5 bg-void border border-terminal-border/30 rounded-full overflow-hidden cursor-pointer"
                    onClick={handleSeek}
                >
                    <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                        style={{ width: `${progress}%` }}
                    />
                </div>

                {/* Footer actions */}
                <div className="flex justify-between mt-2">
                    {onDownload ? (
                        <button
                            onClick={onDownload}
                            className="text-[9px] text-terminal-muted hover:text-phosphor flex items-center gap-1"
                        >
                            ⬇ DOWNLOAD
                        </button>
                    ) : (
                        <a
                            href={audioUrl}
                            download
                            className="text-[9px] text-terminal-muted hover:text-phosphor flex items-center gap-1"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            ⬇ DOWNLOAD
                        </a>
                    )}
                    <div className="text-[9px] text-terminal-muted">
                        {duration ? `${duration}s` : 'AUDIO'}
                    </div>
                </div>
            </div>
        </div>
    )
}
