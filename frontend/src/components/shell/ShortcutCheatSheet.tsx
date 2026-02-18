interface ShortcutCheatSheetProps {
  isOpen: boolean
  onClose: () => void
}

interface ShortcutItem {
  keys: string
  action: string
}

const GLOBAL_SHORTCUTS: ShortcutItem[] = [
  { keys: 'Ctrl/Cmd + 1', action: 'Switch to Terminal' },
  { keys: 'Ctrl/Cmd + 2', action: 'Switch to Circuit' },
  { keys: 'Ctrl/Cmd + 3', action: 'Switch to Calendar' },
  { keys: 'Ctrl/Cmd + ,', action: 'Open Settings' },
  { keys: 'Ctrl/Cmd + /', action: 'Open shortcut help' },
  { keys: '?', action: 'Open shortcut help' },
  { keys: 'Esc', action: 'Close active dialog/panel' },
]

const TERMINAL_SHORTCUTS: ShortcutItem[] = [
  { keys: 'Enter', action: 'Run command/message' },
  { keys: 'Shift + Enter', action: 'New line in input' },
  { keys: 'Tab', action: 'Autocomplete slash command' },
  { keys: '↑ / ↓', action: 'Command history or suggestion list' },
]

const CIRCUIT_SHORTCUTS: ShortcutItem[] = [
  { keys: 'Ctrl/Cmd + Enter', action: 'Run selected cell' },
  { keys: 'Ctrl/Cmd + Shift + Enter', action: 'Run all cells' },
  { keys: 'Ctrl/Cmd + S', action: 'Save circuit' },
  { keys: 'Ctrl/Cmd + N', action: 'New circuit' },
  { keys: 'Esc', action: 'Stop circuit execution' },
]

function ShortcutGroup({ title, items }: { title: string; items: ShortcutItem[] }) {
  return (
    <div className="space-y-2">
      <h3 className="text-[11px] tracking-widest text-phosphor">{title}</h3>
      <div className="space-y-1">
        {items.map(item => (
          <div key={`${title}-${item.keys}-${item.action}`} className="flex items-center justify-between gap-4 text-xs">
            <span className="text-terminal-muted">{item.action}</span>
            <kbd className="border border-terminal-border bg-void px-2 py-1 text-phosphor text-[10px] whitespace-nowrap">
              {item.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ShortcutCheatSheet({ isOpen, onClose }: ShortcutCheatSheetProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-2xl border border-phosphor bg-slate shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-terminal-border px-4 py-3 bg-void/60">
          <div className="text-sm tracking-wider text-phosphor font-bold">KEYBOARD SHORTCUTS</div>
          <button
            onClick={onClose}
            className="px-2 py-1 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
            aria-label="Close keyboard shortcuts"
          >
            ESC
          </button>
        </div>
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-5">
          <ShortcutGroup title="GLOBAL" items={GLOBAL_SHORTCUTS} />
          <ShortcutGroup title="TERMINAL" items={TERMINAL_SHORTCUTS} />
          <ShortcutGroup title="CIRCUIT" items={CIRCUIT_SHORTCUTS} />
        </div>
        <div className="px-4 pb-4">
          <div className="border border-terminal-border bg-void/50 p-3 text-[10px] text-terminal-muted">
            <span className="text-phosphor">CRT controls:</span> use the titlebar `CRT` toggle or terminal commands ` /crt on|off|subtle|medium|full|insane|burst|status ` and ` /glitch `.
          </div>
        </div>
      </div>
    </div>
  )
}
