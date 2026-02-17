import { useSystemStatus } from '../../hooks/useSystemStatus'

interface SystemStatusCardProps {
    timestamp: number
    onRunCommand: (command: string) => void
}

export function SystemStatusCard({ timestamp, onRunCommand }: SystemStatusCardProps) {
    const { status, models } = useSystemStatus()

    const dateStr = new Date(timestamp).toLocaleDateString('en-CA')
    const timeStr = new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })

    const activeModel = status.activeModel || 'Offline'
    const modelCount = models.length

    // Memory stats
    const memUsed = status.ramModelUsedGb ? status.ramModelUsedGb.toFixed(1) : '0.0'
    const memTotal = status.ramTotalGb ? status.ramTotalGb.toFixed(0) : '0'

    return (
        <div className="font-mono text-xs my-6 max-w-2xl animate-in fade-in duration-500">
            {/* Top Border / Header */}
            <div className="flex items-center text-terminal-muted/60 mb-1">
                <span className="text-phosphor/80 mr-2">╔════</span>
                <span className="text-phosphor font-bold tracking-wider">SYSTEM ONLINE</span>
                <div className="h-[1px] bg-terminal-muted/30 flex-1 ml-2 mr-2"></div>
                <span className="text-phosphor/80">════╗</span>
            </div>

            {/* Main Content Box */}
            <div className="border-l border-r border-terminal-muted/30 bg-slate/10 px-4 py-3 backdrop-blur-[2px]">

                {/* Row 1: Time & Model */}
                <div className="flex flex-wrap gap-6 mb-4">
                    <div className="flex items-center gap-2 min-w-[180px]">
                        <span className="text-lg leading-none">📅</span>
                        <div>
                            <div className="text-[10px] text-terminal-muted uppercase tracking-wider">Date</div>
                            <div className="text-phosphor-light">{dateStr}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 min-w-[140px]">
                        <span className="text-lg leading-none">🕒</span>
                        <div>
                            <div className="text-[10px] text-terminal-muted uppercase tracking-wider">Time</div>
                            <div className="text-phosphor-light">{timeStr}</div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-lg leading-none">🧠</span>
                        <div>
                            <div className="text-[10px] text-terminal-muted uppercase tracking-wider">Active Core</div>
                            <div className="text-phosphor font-bold">
                                {activeModel} <span className="font-normal text-terminal-muted opacity-75">({modelCount} avail)</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Separator */}
                <div className="flex items-center gap-2 my-3 opacity-40">
                    <span className="text-terminal-muted">╟</span>
                    <div className="h-[1px] bg-terminal-muted flex-1"></div>
                    <span className="text-terminal-muted">╢</span>
                </div>

                {/* Row 2: Stats & Memory */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {/* Memory Vault (Static for now, dynamic later) */}
                    <div>
                        <div className="text-[10px] text-terminal-muted uppercase tracking-wider mb-1">MEMORY VAULT</div>
                        <ul className="space-y-1 text-terminal-muted/90">
                            <li className="flex items-center gap-2 before:content-['•'] before:text-phosphor/50">
                                <span>System Integrity Check: <span className="text-green-500">OK</span></span>
                            </li>
                            <li className="flex items-center gap-2 before:content-['•'] before:text-phosphor/50">
                                <span>VRAM Usage: {memUsed}GB / {memTotal}GB</span>
                            </li>
                        </ul>
                    </div>

                    {/* Quick Actions */}
                    <div>
                        <div className="text-[10px] text-terminal-muted uppercase tracking-wider mb-1">QUICK LINKS</div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                onClick={() => onRunCommand('/run DailyBriefing')}
                                className="hover:bg-phosphor/10 hover:text-phosphor hover:border-phosphor border border-terminal-muted/40 text-terminal-muted px-2 py-1 transition-colors text-[11px]"
                            >
                                [Daily Briefing]
                            </button>
                            <button
                                onClick={() => onRunCommand('/run DebugAssistant')}
                                className="hover:bg-phosphor/10 hover:text-phosphor hover:border-phosphor border border-terminal-muted/40 text-terminal-muted px-2 py-1 transition-colors text-[11px]"
                            >
                                [Debug Mode]
                            </button>
                            <button
                                onClick={() => onRunCommand('/run CreativeStorm')}
                                className="hover:bg-phosphor/10 hover:text-phosphor hover:border-phosphor border border-terminal-muted/40 text-terminal-muted px-2 py-1 transition-colors text-[11px]"
                            >
                                [Creative Storm]
                            </button>
                        </div>
                    </div>
                </div>

            </div>

            {/* Bottom Border */}
            <div className="flex items-center text-terminal-muted/60 mt-0">
                <span className="text-phosphor/80 mr-2">╚════</span>
                <div className="h-[1px] bg-terminal-muted/30 flex-1 mr-2"></div>
                <span className="text-phosphor/80">════╝</span>
            </div>
        </div>
    )
}
