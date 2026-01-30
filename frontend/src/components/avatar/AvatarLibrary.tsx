import { useState, useRef, useEffect } from 'react'
import { AVATAR_LIBRARY, type AvatarConfig } from '../../types/avatar'

export interface AvatarLibraryProps {
  selected: AvatarConfig
  onSelect: (config: AvatarConfig) => void
  className?: string
}

export function AvatarLibrary({ selected, onSelect, className = '' }: AvatarLibraryProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [open])

  return (
    <div className={`relative ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-3 py-2 border border-terminal-border bg-void text-phosphor text-xs font-mono flex items-center justify-between"
      >
        <span>{selected.name}</span>
        <span className="text-terminal-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 border border-phosphor bg-slate shadow-[0_0_12px_var(--theme-phosphor-glow)] z-10 max-h-48 overflow-y-auto">
          {AVATAR_LIBRARY.map((config) => (
            <button
              key={config.id}
              type="button"
              onClick={() => {
                onSelect(config)
                setOpen(false)
              }}
              className={`w-full text-left px-3 py-2 text-xs font-mono block border-b border-terminal-border last:border-b-0 ${
                selected.id === config.id ? 'bg-phosphor/20 text-phosphor' : 'text-terminal-muted hover:text-phosphor hover:bg-void'
              }`}
            >
              <span className="font-bold">{config.name}</span>
              <span className="block text-[10px] opacity-80">{config.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
