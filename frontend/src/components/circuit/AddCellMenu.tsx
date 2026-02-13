import { useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { CellTypeConfig } from './CellTypes'

interface AddCellMenuProps {
    isOpen: boolean
    results: CellTypeConfig[]
    selectedIndex: number
    onSelect: (type: CellTypeConfig['type']) => void
    anchorRect?: DOMRect | null // Kept for interface compatibility but unused in modal mode
    onHoverIndex: (index: number) => void
}

export function AddCellMenu({
    isOpen,
    results,
    selectedIndex,
    onSelect,
    onHoverIndex
}: AddCellMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)

    // Scroll selected into view
    useEffect(() => {
        if (isOpen && menuRef.current) {
            const selectedEl = menuRef.current.querySelector('[data-selected="true"]')
            if (selectedEl) {
                selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
            }
        }
    }, [selectedIndex, isOpen])

    // Group filtered types by category
    const groupedTypes = (results || []).reduce((acc, type) => {
        if (!acc[type.category]) acc[type.category] = []
        acc[type.category].push(type)
        return acc
    }, {} as Record<string, typeof results>)

    if (!isOpen) return null

    // Order of categories
    const categoryOrder = ['Input', 'Code', 'System', 'Logic', 'Data', 'Output', 'Text']

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { /* clicking backdrop handled by parent blur? or should we add close handler? Parent handles click-outside via onBlur usually */ }} />

            <div
                ref={menuRef}
                className="relative w-full max-w-4xl max-h-[85vh] bg-[#0c0c0c] border border-phosphor/30 shadow-2xl rounded-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200"
                style={{ boxShadow: '0 0 50px rgba(0,0,0,0.8), 0 0 20px rgba(51,255,0,0.1)' }}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-terminal-border/30 bg-black/40 flex items-center justify-between">
                    <h2 className="text-lg font-bold text-phosphor tracking-wider flex items-center gap-2">
                        <span className="text-xl">⚡</span> ADD COMPONENT
                    </h2>
                    <span className="text-xs text-terminal-muted">
                        {results.length} available
                    </span>
                </div>

                {/* Grid Content */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    {results.length === 0 ? (
                        <div className="p-12 text-center text-terminal-muted">
                            <div className="text-4xl mb-4 opacity-30">🔍</div>
                            <p>No components match your search.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {categoryOrder.map(category => {
                                const types = groupedTypes[category]
                                if (!types || types.length === 0) return null

                                return (
                                    <div key={category} className="space-y-3">
                                        <div className="flex items-center gap-2 pb-1 border-b border-white/10">
                                            <span className="text-xs font-bold text-phosphor/70 uppercase tracking-widest">{category}</span>
                                            <div className="h-px flex-1 bg-white/5" />
                                        </div>

                                        <div className="grid gap-2">
                                            {types.map((type) => {
                                                const globalIndex = results.findIndex(t => t.type === type.type)
                                                const isSelected = globalIndex === selectedIndex

                                                return (
                                                    <button
                                                        key={type.type}
                                                        data-selected={isSelected}
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            onSelect(type.type)
                                                        }}
                                                        onMouseEnter={() => onHoverIndex(globalIndex)}
                                                        className={`
                                                            group relative text-left p-3 rounded-lg border transition-all duration-200
                                                            flex items-start gap-3 hover:shadow-lg hover:-translate-y-0.5
                                                            ${isSelected
                                                                ? 'bg-phosphor/10 border-phosphor/50 shadow-glow-sm'
                                                                : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-phosphor/30'
                                                            }
                                                        `}
                                                    >
                                                        <div className={`
                                                            text-2xl p-2 rounded-md transition-colors
                                                            ${isSelected ? 'bg-phosphor/20' : 'bg-black/30 group-hover:bg-black/50'}
                                                        `}>
                                                            {type.icon}
                                                        </div>
                                                        <div className="flex-1 min-w-0 pt-0.5">
                                                            <div className={`font-bold text-sm mb-0.5 ${isSelected ? 'text-phosphor' : 'text-terminal-text group-hover:text-phosphor-dim'}`}>
                                                                {type.label}
                                                            </div>
                                                            <div className="text-[10px] text-terminal-muted leading-tight">
                                                                {type.description}
                                                            </div>
                                                        </div>

                                                        {isSelected && (
                                                            <div className="absolute top-2 right-2 text-[10px] text-phosphor opacity-50 font-mono">
                                                                ⏎
                                                            </div>
                                                        )}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}

                            {/* Render any remaining categories not in the explicit order */}
                            {Object.entries(groupedTypes).map(([category, types]) => {
                                if (categoryOrder.includes(category)) return null
                                return (
                                    <div key={category} className="space-y-3">
                                        <div className="flex items-center gap-2 pb-1 border-b border-white/10">
                                            <span className="text-xs font-bold text-terminal-muted uppercase tracking-widest">{category}</span>
                                        </div>
                                        <div className="grid gap-2">
                                            {types.map(type => {
                                                const globalIndex = results.findIndex(t => t.type === type.type)
                                                // globalIndex used for onHoverIndex below
                                                return (
                                                    <button key={type.type} style={{ display: 'none' }} onClick={() => onSelect(type.type)} onMouseEnter={() => onHoverIndex(globalIndex)}>
                                                        {type.label}
                                                    </button>
                                                )
                                            })}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-3 bg-black/60 border-t border-terminal-border/20 flex justify-between items-center text-[10px] text-terminal-muted">
                    <div className="flex gap-4">
                        <span className="flex items-center gap-1"><kbd className="bg-white/10 px-1 rounded">↑↓</kbd> Navigate</span>
                        <span className="flex items-center gap-1"><kbd className="bg-white/10 px-1 rounded">Enter</kbd> Select</span>
                        <span className="flex items-center gap-1"><kbd className="bg-white/10 px-1 rounded">Esc</kbd> Close</span>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    )
}
