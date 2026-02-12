export type ToastKind = 'info' | 'success' | 'error'

export interface LoomToastDetail {
  kind?: ToastKind
  title?: string
  message: string
  durationMs?: number
}

export const LOOM_TOAST_EVENT = 'loom:toast'

export function showToast(detail: LoomToastDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<LoomToastDetail>(LOOM_TOAST_EVENT, { detail }))
}

export function showInfoToast(message: string, title = 'Notice', durationMs = 2600): void {
  showToast({ kind: 'info', title, message, durationMs })
}

export function showSuccessToast(message: string, title = 'Done', durationMs = 2600): void {
  showToast({ kind: 'success', title, message, durationMs })
}

export function showErrorToast(message: string, title = 'Error', durationMs = 3600): void {
  showToast({ kind: 'error', title, message, durationMs })
}
