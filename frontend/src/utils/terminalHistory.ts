import type { LogEntry } from '../types/module'

function defaultEntries(): LogEntry[] {
  return [
    {
      id: '1',
      type: 'system',
      content: 'LOOM TERMINAL v0.1.0 INITIALIZED',
      timestamp: Date.now(),
    },
    {
      id: '2',
      type: 'system',
      content: 'Type /help for available commands. Shift+Enter runs; Enter adds a newline.',
      timestamp: Date.now(),
    },
  ]
}

export function loadEntriesFromLocalStorage(storageKey: string): LogEntry[] {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored) {
      const parsed = JSON.parse(stored)
      if (Array.isArray(parsed) && parsed.length > 0) return parsed
    }
  } catch (e) {
    console.warn('[LOOM] Failed to load terminal history:', e)
  }

  return defaultEntries()
}
