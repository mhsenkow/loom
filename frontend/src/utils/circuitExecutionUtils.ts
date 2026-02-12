import type { LogEntry } from '../types/module'
import type { TerminalHistoryQuery } from '../hooks/useTerminalOutput'

const VALID_HISTORY_TYPES: LogEntry['type'][] = ['user', 'ai', 'system', 'error', 'image', 'audio']

export interface TerminalHistoryCellConfig {
  terminalHistorySearch?: string
  terminalHistoryTypes?: LogEntry['type'][]
  terminalHistoryLimit?: number
  terminalHistorySince?: number
  terminalHistoryBefore?: number
  terminalHistorySession?: string
}

interface ParsedHistoryQuery {
  search?: string
  types?: LogEntry['type'][]
  limit?: number
  since?: number
  before?: number
  sessionName?: string
}

export interface VectorSearchResult {
  similarity?: number
  content?: string
  metadata?: {
    file_path?: string
    source?: string
  }
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

function asTypes(value: unknown): LogEntry['type'][] | undefined {
  if (!Array.isArray(value)) return undefined
  const normalized = value.filter((type): type is LogEntry['type'] =>
    typeof type === 'string' && VALID_HISTORY_TYPES.includes(type as LogEntry['type']),
  )
  return normalized.length > 0 ? normalized : undefined
}

function parseHistoryQueryFromContent(content: string): ParsedHistoryQuery {
  if (!content) return {}

  try {
    const parsed = JSON.parse(content) as Record<string, unknown>
    return {
      search: asString(parsed.search),
      types: asTypes(parsed.types),
      limit: asNumber(parsed.limit),
      since: asNumber(parsed.since),
      before: asNumber(parsed.before),
      sessionName: asString(parsed.sessionName),
    }
  } catch {
    return { search: content }
  }
}

export function buildTerminalHistoryQuery(
  content: string,
  cellConfig: TerminalHistoryCellConfig,
): TerminalHistoryQuery {
  const parsed = parseHistoryQueryFromContent(content.trim())
  return {
    search: parsed.search ?? cellConfig.terminalHistorySearch,
    types: parsed.types ?? cellConfig.terminalHistoryTypes,
    limit: parsed.limit ?? cellConfig.terminalHistoryLimit ?? 20,
    since: parsed.since ?? cellConfig.terminalHistorySince,
    before: parsed.before ?? cellConfig.terminalHistoryBefore,
    sessionName: parsed.sessionName ?? cellConfig.terminalHistorySession,
  }
}

export function formatTerminalHistoryEntries(entries: LogEntry[]): string {
  const outputLines = [`📜 Found ${entries.length} terminal history entries:\n`]

  entries.forEach((entry, index) => {
    const time = new Date(entry.timestamp).toLocaleString()
    const typeIcon: Record<LogEntry['type'], string> = {
      user: '👤',
      ai: '🤖',
      system: '⚙️',
      error: '❌',
      image: '🖼️',
      audio: '🎵',
    }

    const contentPreview = entry.content.length > 200
      ? `${entry.content.substring(0, 200)}...`
      : entry.content

    outputLines.push(`\n[${index + 1}] ${typeIcon[entry.type]} [${entry.type.toUpperCase()}] ${time}`)
    outputLines.push(contentPreview)
  })

  const fullContext = entries.map((entry, index) =>
    `[${index + 1}] [${entry.type}] ${new Date(entry.timestamp).toISOString()}\n${entry.content}`,
  ).join('\n\n---\n\n')

  return outputLines.join('\n') + '\n\n---\n\nFull Context:\n\n' + fullContext
}

export function formatNoTerminalHistoryResults(query: TerminalHistoryQuery): string {
  return `📜 No terminal history entries found matching query.\n\nQuery: ${JSON.stringify(query, null, 2)}`
}

export function formatVectorSearchResults(searchQuery: string, results: VectorSearchResult[]): string {
  const outputLines = [`🔍 Found ${results.length} results for: '${searchQuery}'\n`]

  results.forEach((result, index) => {
    const similarity = result.similarity || 0
    const contentPreview = (result.content || '').substring(0, 200)
    const source = result.metadata?.file_path || result.metadata?.source || 'unknown'

    outputLines.push(`\n[${index + 1}] Similarity: ${(similarity * 100).toFixed(1)}%`)
    outputLines.push(`📄 Source: ${source}`)
    outputLines.push(`💬 Preview: ${contentPreview}...`)
  })

  const fullContext = results.map((result, index) =>
    `[${index + 1}] ${result.content || ''}`,
  ).join('\n\n---\n\n')

  return outputLines.join('\n') + '\n\n---\n\n' + fullContext
}
