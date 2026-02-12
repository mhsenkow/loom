import type { LogEntry } from '../types/module'

export const SESSIONS_KEY = 'loom-terminal-sessions'
export const BEFORE_CLEAR_KEY = 'loom-terminal-before-clear'

export interface SessionIndexInfo {
  savedAt: number
  entryCount: number
  mediaFiles?: string[]
}

function emitSessionEvent(name: string, type: 'saved' | 'deleted') {
  window.dispatchEvent(new CustomEvent(`loom:session-${type}`, { detail: { name } }))
}

export function loadSessionsIndexFromLocalStorage(): Record<string, SessionIndexInfo> {
  try {
    const stored = localStorage.getItem(SESSIONS_KEY)
    if (stored) return JSON.parse(stored)
  } catch (e) {
    console.warn('[LOOM] Failed to load sessions index:', e)
  }
  return {}
}

export function saveSessionToLocalStorage(name: string, entries: LogEntry[], mediaFiles?: string[]): boolean {
  try {
    localStorage.setItem(`${SESSIONS_KEY}:${name}`, JSON.stringify(entries))
    const index = loadSessionsIndexFromLocalStorage()
    index[name] = { savedAt: Date.now(), entryCount: entries.length, mediaFiles }
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(index))
    emitSessionEvent(name, 'saved')
    return true
  } catch (e) {
    console.warn('[LOOM] Failed to save session:', e)
    return false
  }
}

export function loadSessionFromLocalStorage(name: string): LogEntry[] | null {
  try {
    const stored = localStorage.getItem(`${SESSIONS_KEY}:${name}`)
    if (stored) return JSON.parse(stored)
  } catch (e) {
    console.warn('[LOOM] Failed to load session:', e)
  }
  return null
}

export function deleteSessionFromLocalStorage(name: string): boolean {
  try {
    localStorage.removeItem(`${SESSIONS_KEY}:${name}`)
    const index = loadSessionsIndexFromLocalStorage()
    delete index[name]
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(index))
    emitSessionEvent(name, 'deleted')
    return true
  } catch (e) {
    console.warn('[LOOM] Failed to delete session:', e)
    return false
  }
}

export function stashBeforeClear(entries: LogEntry[]): void {
  const isAlreadyCleared = entries.length === 1 &&
    entries[0].type === 'system' &&
    entries[0].content?.includes('Display cleared')

  if (entries.length === 0 || isAlreadyCleared) return

  try {
    localStorage.setItem(BEFORE_CLEAR_KEY, JSON.stringify(entries))
  } catch (e) {
    console.warn('[LOOM] Failed to stash before clear:', e)
  }
}

export function loadBeforeClear(): LogEntry[] | null {
  try {
    const stored = localStorage.getItem(BEFORE_CLEAR_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch (e) {
    console.warn('[LOOM] Failed to load before-clear stash:', e)
    return null
  }
}
