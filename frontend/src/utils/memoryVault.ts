import { normalizeProfileLines, toMultilineText } from './conversationProfile'

export type MemoryTier = 'session' | 'working' | 'long'

export interface MemoryEntry {
  id: string
  text: string
  tier: MemoryTier
  confidence: number
  createdAt: number
  lastUsedAt: number
  source: 'user' | 'system' | 'feedback' | 'legacy'
  expiresAt?: number
}

export interface RelevantMemory {
  entry: MemoryEntry
  score: number
  ageDays: number
}

const MEMORY_VAULT_KEY = 'loom-memory-vault-v1'
const MAX_ENTRIES = 240

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function normalizeTier(value: string): MemoryTier {
  const raw = value.trim().toLowerCase()
  if (raw === 'session' || raw === 'working' || raw === 'long') return raw
  return 'long'
}

function isMemoryEntry(value: unknown): value is MemoryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<MemoryEntry>
  return (
    typeof entry.id === 'string'
    && typeof entry.text === 'string'
    && typeof entry.tier === 'string'
    && typeof entry.confidence === 'number'
    && typeof entry.createdAt === 'number'
    && typeof entry.lastUsedAt === 'number'
  )
}

function ttlForTier(tier: MemoryTier): number | null {
  if (tier === 'session') return 24 * 60 * 60 * 1000
  if (tier === 'working') return 21 * 24 * 60 * 60 * 1000
  return null
}

function parseQueryTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(token => token.trim())
    .filter(token => token.length >= 3)
}

function decayWeight(tier: MemoryTier, ageDays: number): number {
  if (tier === 'session') return Math.max(0.15, 1 - (ageDays / 5))
  if (tier === 'working') return Math.max(0.2, 1 - (ageDays / 18))
  return Math.max(0.35, 1 - (ageDays / 90))
}

export function loadMemoryVault(): MemoryEntry[] {
  try {
    const raw = localStorage.getItem(MEMORY_VAULT_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(isMemoryEntry)
      .map(entry => ({
        ...entry,
        text: entry.text.trim(),
        tier: normalizeTier(entry.tier),
        confidence: clamp(entry.confidence, 0.1, 1),
      }))
      .filter(entry => !!entry.text)
      .slice(0, MAX_ENTRIES)
  } catch {
    return []
  }
}

export function saveMemoryVault(entries: MemoryEntry[]): void {
  const now = Date.now()
  const dedup = new Map<string, MemoryEntry>()
  for (const entry of entries) {
    if (!entry.text.trim()) continue
    if (entry.expiresAt && entry.expiresAt <= now) continue
    const key = `${entry.tier}:${entry.text.trim().toLowerCase()}`
    const existing = dedup.get(key)
    if (!existing || existing.lastUsedAt < entry.lastUsedAt) {
      dedup.set(key, { ...entry, text: entry.text.trim(), confidence: clamp(entry.confidence, 0.1, 1) })
    }
  }
  const normalized = [...dedup.values()]
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, MAX_ENTRIES)
  localStorage.setItem(MEMORY_VAULT_KEY, JSON.stringify(normalized))
}

export function addMemoryEntry(
  text: string,
  options?: { tier?: MemoryTier; confidence?: number; source?: MemoryEntry['source'] },
): MemoryEntry | null {
  const cleaned = text.replace(/\s+/g, ' ').trim()
  if (!cleaned) return null
  const now = Date.now()
  const tier = options?.tier || 'long'
  const ttl = ttlForTier(tier)
  const entry: MemoryEntry = {
    id: `mem-${now}-${Math.random().toString(36).slice(2, 8)}`,
    text: cleaned,
    tier,
    confidence: clamp(options?.confidence ?? 0.72, 0.1, 1),
    createdAt: now,
    lastUsedAt: now,
    source: options?.source || 'user',
    expiresAt: ttl ? now + ttl : undefined,
  }
  const next = [entry, ...loadMemoryVault()]
  saveMemoryVault(next)
  return entry
}

export function removeMemoryEntryById(id: string): MemoryEntry[] {
  const next = loadMemoryVault().filter(entry => entry.id !== id)
  saveMemoryVault(next)
  return next
}

export function pruneMemoryVault(): MemoryEntry[] {
  const now = Date.now()
  const next = loadMemoryVault().filter(entry => !entry.expiresAt || entry.expiresAt > now)
  saveMemoryVault(next)
  return next
}

export function selectRelevantMemory(
  query: string,
  entries: MemoryEntry[],
  limit = 8,
): RelevantMemory[] {
  const now = Date.now()
  const queryTokens = parseQueryTokens(query)
  const scored = entries
    .filter(entry => !entry.expiresAt || entry.expiresAt > now)
    .map(entry => {
      const entryText = entry.text.toLowerCase()
      const tokenHits = queryTokens.reduce((hits, token) => hits + (entryText.includes(token) ? 1 : 0), 0)
      const tokenScore = queryTokens.length > 0 ? tokenHits / queryTokens.length : 0.25
      const ageDays = Math.max(0, (now - entry.lastUsedAt) / (24 * 60 * 60 * 1000))
      const score = (
        (entry.confidence * 0.52)
        + (tokenScore * 0.38)
        + (decayWeight(entry.tier, ageDays) * 0.1)
      )
      return { entry, score, ageDays }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
  return scored
}

export function touchMemoryEntries(ids: string[]): void {
  if (ids.length === 0) return
  const idSet = new Set(ids)
  const now = Date.now()
  const next = loadMemoryVault().map(entry => (
    idSet.has(entry.id)
      ? { ...entry, lastUsedAt: now, confidence: clamp(entry.confidence + 0.01, 0.1, 1) }
      : entry
  ))
  saveMemoryVault(next)
}

export function syncLegacyMemoryNotes(memoryNotes: string): void {
  const existing = loadMemoryVault()
  const existingTexts = new Set(existing.map(entry => entry.text.toLowerCase()))
  const seeded = normalizeProfileLines(memoryNotes, { maxItems: 40 })
    .filter(line => !existingTexts.has(line.toLowerCase()))
    .map((line, index) => {
      const now = Date.now() - (index * 1000)
      return {
        id: `mem-legacy-${now}-${index}`,
        text: line,
        tier: 'long' as MemoryTier,
        confidence: 0.78,
        createdAt: now,
        lastUsedAt: now,
        source: 'legacy' as const,
      }
    })

  if (seeded.length === 0) return
  saveMemoryVault([...seeded, ...existing])
}

export function buildSettingsMemoryNotesFromVault(entries: MemoryEntry[], maxLines = 24): string {
  const longAndWorking = entries
    .filter(entry => entry.tier !== 'session')
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
    .slice(0, maxLines)
    .map(entry => entry.text)
  return toMultilineText(longAndWorking)
}
