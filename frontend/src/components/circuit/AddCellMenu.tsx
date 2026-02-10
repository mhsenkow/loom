import { useRef } from 'react'
import { CellTypeConfig } from './CellTypes'

interface AddCellMenuProps {
    isOpen: boolean
    results: CellTypeConfig[]
    selectedIndex: number
    onSelect: (type: string) => void
    anchorRect?: DOMRect | null
    onHoverIndex: (index: number) => void
}

export function AddCellMenu({
    isOpen,
    results,
    selectedIndex,
    onSelect,
    anchorRect,
    onHoverIndex
}: AddCellMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null)

    // Group filtered types by category
    const groupedTypes = (results || []).reduce((acc, type) => {
        if (!acc[type.category]) acc[type.category] = []
        acc[type.category].push(type)
        return acc
    }, {} as Record<string, typeof results>)

    if (!isOpen) return null

    // Calculate position
    const style: React.CSSProperties = {
        position: 'fixed',
        zIndex: 100,
        width: '320px',
        maxHeight: '400px',
    }

    if (anchorRect) {
        // ALWAYS ABOVE the input since toolbar is at bottom
        style.bottom = `${window.innerHeight - anchorRect.top + 8}px`
        style.left = `${anchorRect.left}px`
    } else {
        // Center if no anchor
        style.top = '20%'
        style.left = '50%'
        style.transform = 'translate(-50%, 0)'
    }

    return (
        <div
            ref={menuRef}
            style={style}
            className="bg-black/95 border border-phosphor/20 shadow-glow backdrop-blur-xl rounded-xl overflow-hidden flex flex-col pointer-events-auto"
        >
            <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                {results.length === 0 ? (
                    <div className="p-4 text-center text-terminal-muted text-xs">
                        No components match "{/* We don't have search term here, but that's fine */}"
                    </div>
                ) : (
                    Object.entries(groupedTypes).map(([category, types]) => (
                        <div key={category} className="mb-2 last:mb-0">
                            <div className="px-2 py-1 text-[10px] text-terminal-muted uppercase tracking-wider font-bold">
                                {category}
                            </div>
                            <div className="space-y-0.5">
                                {types.map((type) => {
                                    // Find global index for this item
                                    const globalIndex = results.findIndex(t => t.type === type.type)
                                    const isSelected = globalIndex === selectedIndex

                                    return (
                                        <button
                                            key={type.type}
                                            onClick={() => onSelect(type.type)}
                                            onMouseEnter={() => onHoverIndex(globalIndex)}
                                            className={`
                        w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-all duration-200
                        ${isSelected
                                                    ? 'bg-phosphor/20 text-phosphor translate-x-1'
                                                    : 'text-terminal-muted hover:bg-white/5 hover:text-phosphor-dim'
                                                }
                      `}
                                        >
                                            <span className="text-xl w-8 text-center">{type.icon}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="text-sm font-medium truncate">{type.label}</div>
                                                <div className="text-[10px] opacity-70 truncate">{type.description}</div>
                                            </div>
                                            {isSelected && <span className="text-[10px] opacity-50">⏎</span>}
                                        </button>
                                    )
                                })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-2 border-t border-terminal-border/30 bg-white/5 text-[10px] text-terminal-muted flex justify-between rounded-b-xl">
                <span>↑↓ to navigate</span>
                <span>Enter to select</span>
            </div>
        </div>
    )
}
