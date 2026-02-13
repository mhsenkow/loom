export interface ConversationProfile {
  goalsEnabled: boolean
  memoryEnabled: boolean
  userGoals: string[]
  assistantGoals: string[]
  memoryNotes: string[]
}

export interface ConversationProfileSettingsSnapshot {
  goalsEnabled?: unknown
  memoryEnabled?: unknown
  userGoals?: unknown
  assistantGoals?: unknown
  memoryNotes?: unknown
}

interface NormalizeLinesOptions {
  maxItems?: number
  maxCharsPerLine?: number
}

const DEFAULT_MAX_ITEMS = 24
const DEFAULT_MAX_CHARS_PER_LINE = 220

export function normalizeProfileLines(
  value: unknown,
  options: NormalizeLinesOptions = {},
): string[] {
  const {
    maxItems = DEFAULT_MAX_ITEMS,
    maxCharsPerLine = DEFAULT_MAX_CHARS_PER_LINE,
  } = options

  if (typeof value !== 'string' || !value.trim()) return []

  const deduped = new Set<string>()
  const lines: string[] = []

  for (const rawLine of value.split(/\r?\n/)) {
    const normalized = rawLine.replace(/\s+/g, ' ').trim()
    if (!normalized) continue
    if (deduped.has(normalized.toLowerCase())) continue
    deduped.add(normalized.toLowerCase())
    lines.push(normalized.slice(0, maxCharsPerLine))
    if (lines.length >= maxItems) break
  }

  return lines
}

export function toMultilineText(lines: string[]): string {
  return lines.map(line => line.trim()).filter(Boolean).join('\n')
}

export function buildConversationProfileFromSettings(
  settings: ConversationProfileSettingsSnapshot,
): ConversationProfile {
  const goalsEnabled = settings.goalsEnabled !== false
  const memoryEnabled = settings.memoryEnabled !== false

  return {
    goalsEnabled,
    memoryEnabled,
    userGoals: normalizeProfileLines(settings.userGoals),
    assistantGoals: normalizeProfileLines(settings.assistantGoals),
    memoryNotes: normalizeProfileLines(settings.memoryNotes, { maxItems: 40 }),
  }
}

export function buildConversationProfileStoragePreview(
  profile: ConversationProfile,
): Record<string, unknown> {
  return {
    goals: {
      enabled: profile.goalsEnabled,
      user: profile.userGoals,
      assistant: profile.assistantGoals,
    },
    memory: {
      enabled: profile.memoryEnabled,
      notes: profile.memoryNotes,
    },
  }
}
