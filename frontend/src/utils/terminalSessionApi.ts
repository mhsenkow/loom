import type { LogEntry } from '../types/module'
import {
  deleteSessionFromLocalStorage,
  loadSessionFromLocalStorage,
  saveSessionToLocalStorage,
} from './sessionPersistence'

export function extractMediaFiles(entries: LogEntry[]): string[] {
  const mediaFiles: string[] = []

  for (const entry of entries) {
    if (entry.imageUrl?.includes('/api/images/files/')) mediaFiles.push(entry.imageUrl)
    if (entry.audioUrl?.includes('/api/music/files/')) mediaFiles.push(entry.audioUrl)

    if (entry.content?.includes('/api/images/files/')) {
      const matches = entry.content.match(/\/api\/images\/files\/[^\s"')]+/g)
      if (matches) mediaFiles.push(...matches)
    }
    if (entry.content?.includes('/api/music/files/')) {
      const matches = entry.content.match(/\/api\/music\/files\/[^\s"')]+/g)
      if (matches) mediaFiles.push(...matches)
    }
  }

  return [...new Set(mediaFiles)]
}

export function generateSessionName(entries: LogEntry[]): string {
  const firstUserEntry = entries.find((e) => e.type === 'user')
  if (firstUserEntry?.content) {
    const clean = firstUserEntry.content
      .replace(/^\/\w+\s*/, '')
      .replace(/[^\w\s]/g, ' ')
      .trim()
      .split(/\s+/)
      .slice(0, 5)
      .join(' ')

    if (clean.length > 0) return clean.slice(0, 30).trim()
  }
  return `session-${Date.now()}`
}

export async function saveSessionAsync(apiBase: string, name: string, entries: LogEntry[]): Promise<boolean> {
  const mediaFiles = extractMediaFiles(entries)

  try {
    const res = await fetch(`${apiBase}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, entries, mediaFiles }),
    })
    if (res.ok) {
      window.dispatchEvent(new CustomEvent('loom:session-saved', { detail: { name } }))
      return true
    }
  } catch (e) {
    console.warn('[LOOM] Backend save failed, trying localStorage:', e)
  }

  return saveSessionToLocalStorage(name, entries)
}

export async function loadSessionAsync(apiBase: string, name: string): Promise<LogEntry[] | null> {
  try {
    const res = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(name)}`)
    if (res.ok) {
      const data = await res.json()
      return data.entries || null
    }
  } catch (e) {
    console.warn('[LOOM] Backend load failed, using localStorage:', e)
  }
  return loadSessionFromLocalStorage(name)
}

export async function deleteSessionAsync(apiBase: string, name: string): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/api/sessions/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
    if (res.ok) return deleteSessionFromLocalStorage(name)
  } catch (e) {
    console.warn('[LOOM] Backend delete failed, using localStorage:', e)
  }
  return deleteSessionFromLocalStorage(name)
}

export async function saveSessionSilent(
  apiBase: string,
  name: string,
  entries: LogEntry[],
  maxStoredEntries: number,
): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        entries: entries.slice(-maxStoredEntries),
        mediaFiles: extractMediaFiles(entries),
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
