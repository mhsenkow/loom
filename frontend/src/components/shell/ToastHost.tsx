import { useEffect, useState } from 'react'
import { LOOM_TOAST_EVENT, type LoomToastDetail, type ToastKind } from '../../utils/uiNotifications'

interface ToastItem {
  id: string
  kind: ToastKind
  title: string
  message: string
  durationMs: number
}

const KIND_STYLES: Record<ToastKind, string> = {
  info: 'border-terminal-border text-phosphor bg-slate/95',
  success: 'border-phosphor text-phosphor bg-void/95',
  error: 'border-red-500 text-red-300 bg-void/95',
}

const KIND_LED: Record<ToastKind, string> = {
  info: 'led-idle',
  success: 'led-success',
  error: 'led-error',
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  useEffect(() => {
    const handleToast = (event: Event) => {
      const custom = event as CustomEvent<LoomToastDetail>
      const detail = custom.detail
      if (!detail?.message) return

      const now = Date.now()
      const toast: ToastItem = {
        id: `toast-${now}-${Math.random().toString(36).slice(2, 8)}`,
        kind: detail.kind ?? 'info',
        title: detail.title ?? 'Notice',
        message: detail.message,
        durationMs: Math.max(1200, detail.durationMs ?? 2600),
      }

      setToasts(prev => {
        const next = [...prev, toast]
        return next.slice(-4)
      })

      window.setTimeout(() => {
        setToasts(prev => prev.filter(item => item.id !== toast.id))
      }, toast.durationMs)
    }

    window.addEventListener(LOOM_TOAST_EVENT, handleToast as EventListener)
    return () => {
      window.removeEventListener(LOOM_TOAST_EVENT, handleToast as EventListener)
    }
  }, [])

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-14 right-3 sm:right-6 z-[120] flex flex-col gap-2 w-[min(94vw,360px)]"
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`border px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ${KIND_STYLES[toast.kind]}`}
        >
          <div className="flex items-center gap-2">
            <span className={`led ${KIND_LED[toast.kind]}`} aria-hidden />
            <span className="text-[10px] uppercase tracking-widest">{toast.title}</span>
          </div>
          <div className="mt-1 text-xs leading-relaxed whitespace-pre-wrap">{toast.message}</div>
        </div>
      ))}
    </div>
  )
}
