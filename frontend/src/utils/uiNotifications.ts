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

// ─── Desktop Notifications (OS-level) ───────────────────────────

/**
 * Request permission for desktop notifications.
 * Call once on app startup — the browser will prompt the user.
 * Safe to call multiple times; subsequent calls are no-ops if already granted/denied.
 */
export function requestDesktopNotificationPermission(): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission === 'default') {
    Notification.requestPermission()
  }
}

/**
 * Send a desktop notification (only shows when the tab is hidden/backgrounded).
 * Silently no-ops if permission was not granted or the tab is focused.
 */
export function sendDesktopNotification(title: string, body?: string): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  // Only notify when the user isn't looking at the tab
  if (document.visibilityState === 'visible') return
  try {
    new Notification(title, {
      body,
      icon: '/icon.png',    // will gracefully fall back if missing
      silent: false,
    })
  } catch {
    // Mobile Safari and some browsers throw on `new Notification`
  }
}
