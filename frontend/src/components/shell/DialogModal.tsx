import { useEffect, useRef } from 'react'

interface DialogModalProps {
  isOpen: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  hideCancel?: boolean
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function DialogModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  hideCancel = false,
  danger = false,
  onConfirm,
  onCancel,
}: DialogModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!isOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
        return
      }
      if (event.key === 'Tab') {
        const container = dialogRef.current
        if (!container) return
        const focusable = Array.from(
          container.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
        if (focusable.length === 0) return

        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        const active = document.activeElement as HTMLElement | null

        if (event.shiftKey) {
          if (active === first || !container.contains(active)) {
            event.preventDefault()
            last.focus()
          }
          return
        }

        if (active === last || !container.contains(active)) {
          event.preventDefault()
          first.focus()
        }
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        onConfirm()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onCancel, onConfirm])

  useEffect(() => {
    if (!isOpen) return
    confirmButtonRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <button
        type="button"
        className="absolute inset-0 bg-void/80 cursor-default"
        aria-label="Close dialog"
        onClick={onCancel}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-md mx-4 border border-terminal-border bg-slate shadow-glow"
      >
        <div className="px-4 py-3 border-b border-terminal-border">
          <div className={`text-xs font-bold tracking-widest ${danger ? 'text-red-400' : 'text-phosphor'}`}>
            {title}
          </div>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-terminal-muted whitespace-pre-line">{message}</p>
        </div>
        <div className="px-4 py-3 border-t border-terminal-border flex items-center justify-end gap-2">
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor focus:outline-none focus-visible:ring-1 focus-visible:ring-phosphor"
            >
              {cancelLabel}
            </button>
          )}
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            className={`px-3 py-1.5 text-xs border focus:outline-none focus-visible:ring-1 ${
              danger
                ? 'border-red-500 text-red-300 hover:bg-red-500 hover:text-void focus-visible:ring-red-400'
                : 'border-phosphor text-phosphor hover:bg-phosphor hover:text-void focus-visible:ring-phosphor'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
