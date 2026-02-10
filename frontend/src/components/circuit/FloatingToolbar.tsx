import { useState, useRef, useEffect, useMemo } from 'react'
import { AddCellMenu } from './AddCellMenu'
import { CELL_TYPES } from './CellTypes'

interface FloatingToolbarProps {
    onAddCell: (type: any) => void
    onRunAll: () => void
    onRunActive: () => void
    onStop: () => void
    onClearBoard: () => void
    isRunning: boolean
    activeCellId: string | null
}

export function FloatingToolbar({
    onAddCell,
    onRunAll,
    onRunActive,
    onStop,
    onClearBoard,
    isRunning,
    activeCellId
}: FloatingToolbarProps) {
    const [showAddMenu, setShowAddMenu] = useState(false)
    const [addMenuSearch, setAddMenuSearch] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null)
    const inputRef = useRef<HTMLInputElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)

    // Filter results
    const filteredResults = useMemo(() => {
        if (!addMenuSearch) return CELL_TYPES
        const query = addMenuSearch.toLowerCase()
        return CELL_TYPES.filter(t =>
            t.label.toLowerCase().includes(query) ||
            t.description.toLowerCase().includes(query) ||
            t.category.toLowerCase().includes(query)
        )
    }, [addMenuSearch])

    // Update anchor when menu opens
    useEffect(() => {
        if (showAddMenu && containerRef.current) {
            setMenuAnchor(containerRef.current.getBoundingClientRect())
        }
    }, [showAddMenu])

    // Reset selection when search changes
    useEffect(() => {
        setSelectedIndex(0)
    }, [addMenuSearch])

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (filteredResults.length === 0) return

        if (e.key === 'ArrowDown') {
            e.preventDefault()
            setSelectedIndex(prev => Math.min(prev + 1, filteredResults.length - 1))
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setSelectedIndex(prev => Math.max(prev - 1, 0))
        } else if (e.key === 'Enter') {
            e.preventDefault()
            const selected = filteredResults[selectedIndex]
            if (selected) {
                onAddCell(selected.type)
                setAddMenuSearch('')
                setShowAddMenu(false)
            }
        } else if (e.key === 'Escape') {
            setShowAddMenu(false)
            inputRef.current?.blur()
        }
    }

    return (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-50 flex items-center justify-center w-full max-w-3xl px-4 pointer-events-none">
            {/* Main Toolbar Container */}
            <div
                ref={containerRef}
                className="flex items-center bg-black/80 backdrop-blur-xl border border-terminal-border/50 rounded-2xl shadow-2xl px-3 py-2 gap-3 pointer-events-auto transition-all duration-300 hover:bg-black/90 hover:border-phosphor/30 hover:shadow-[0_0_30px_rgba(51,255,0,0.15)]"
                style={{ boxShadow: '0 0 40px rgba(0,0,0,0.6), 0 0 10px rgba(0,0,0,0.5)' }}
            >
                {/* Run Active Cell (Single Play) */}
                <button
                    onClick={onRunActive}
                    disabled={isRunning || !activeCellId}
                    className={`
                        flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-300
                        ${!activeCellId || isRunning
                            ? 'opacity-30 cursor-not-allowed text-terminal-muted'
                            : 'bg-phosphor/5 text-phosphor hover:bg-phosphor hover:text-black hover:shadow-glow'
                        }
                    `}
                    title="Run active cell"
                >
                    <span className="text-lg font-bold">▶</span>
                </button>

                {/* Run All Button (Double Arrow) */}
                <button
                    onClick={onRunAll}
                    disabled={isRunning}
                    className={`
                        group relative flex items-center justify-center w-12 h-10 rounded-xl transition-all duration-300
                        ${isRunning
                            ? 'bg-yellow-400/10 text-yellow-400 cursor-wait'
                            : 'bg-phosphor/10 text-phosphor hover:bg-phosphor hover:text-black hover:shadow-glow'
                        }
                    `}
                    title="Run all cells"
                >
                    <span className="text-xl font-bold tracking-tighter">»</span>
                </button>

                {/* Divider */}
                <div className="w-px h-8 bg-terminal-border/30" />

                {/* Quick Adds */}
                <div className="flex items-center gap-1.5">
                    <button onClick={() => onAddCell('data_input')} className="px-3 py-2 text-xs font-semibold text-phosphor border border-phosphor/20 hover:bg-phosphor/10 hover:border-phosphor/40 rounded-lg transition-all">
                        + Input
                    </button>
                    <button onClick={() => onAddCell('ai_processor')} className="px-3 py-2 text-xs font-semibold text-cyan-400 border border-cyan-400/20 hover:bg-cyan-400/10 hover:border-cyan-400/40 rounded-lg transition-all">
                        + AI
                    </button>
                    <button onClick={() => onAddCell('image_gen')} className="px-3 py-2 text-xs font-semibold text-pink-400 border border-pink-400/20 hover:bg-pink-400/10 hover:border-pink-400/40 rounded-lg transition-all">
                        + Image
                    </button>
                    <button onClick={() => onAddCell('script_execution')} className="px-3 py-2 text-xs font-semibold text-yellow-400 border border-yellow-400/20 hover:bg-yellow-400/10 hover:border-yellow-400/40 rounded-lg transition-all">
                        + Code
                    </button>
                </div>

                {/* Divider */}
                <div className="w-px h-8 bg-terminal-border/30" />

                {/* Unified Search / More Input */}
                <div className="relative group flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-auto cursor-pointer z-10" onClick={() => setShowAddMenu(!showAddMenu)}>
                        <span className={`text-lg transition-colors hover:scale-110 ${showAddMenu ? 'text-phosphor' : 'text-terminal-muted group-hover:text-phosphor'}`}>+</span>
                    </div>
                    <input
                        ref={inputRef}
                        type="text"
                        value={addMenuSearch}
                        onChange={(e) => {
                            setAddMenuSearch(e.target.value)
                            if (!showAddMenu) setShowAddMenu(true)
                        }}
                        onFocus={() => setShowAddMenu(true)}
                        onBlur={() => {
                            // Delay hiding to allow selection
                            setTimeout(() => {
                                if (!addMenuSearch) setShowAddMenu(false)
                            }, 200)
                        }}
                        onKeyDown={handleKeyDown}
                        placeholder="Add anything..."
                        className="w-48 bg-white/5 border border-transparent hover:border-terminal-border/50 focus:border-phosphor/50 rounded-xl py-2 pl-9 pr-4 text-sm text-phosphor placeholder-terminal-muted/40 focus:outline-none transition-all focus:w-64 focus:bg-black"
                    />
                </div>

                {/* Right Actions: Stop / Clear */}
                <div className="pl-2 border-l border-terminal-border/30 ml-1">
                    {isRunning ? (
                        <button
                            onClick={onStop}
                            className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors animate-pulse"
                            title="Stop execution"
                        >
                            <span className="text-lg">⏹</span>
                        </button>
                    ) : (
                        <button
                            onClick={onClearBoard}
                            className="p-2 text-terminal-muted hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title="Clear notebook (Remove all cells)"
                        >
                            <span className="text-lg">🗑️</span>
                        </button>
                    )}
                </div>
            </div>

            <AddCellMenu
                isOpen={showAddMenu && filteredResults.length > 0}
                results={filteredResults}
                selectedIndex={selectedIndex}
                onSelect={(type) => {
                    onAddCell(type)
                    setAddMenuSearch('')
                    setShowAddMenu(false)
                }}
                anchorRect={menuAnchor}
                onHoverIndex={setSelectedIndex}
            />
        </div>
    )
}
