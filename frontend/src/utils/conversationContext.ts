/**
 * Conversation manager: builds LLM prompt context from chat history.
 * Tracks turns (user/ai/image/system), caps length, and formats "Previous conversation" for the model.
 */

import type { LogEntry } from '../types/module'

export type ConversationContextMode = 'input' | 'key' | 'full'

const DEFAULT_MAX_TURNS = 20
const FULL_MODE_DEFAULT_MAX_TURNS = 80
const KEY_MODE_TRUNCATE_CHARS = 120
const KEY_MODE_MAX_CHARS = 7000
const FULL_MODE_MAX_CHARS = 24000

export interface BuildConversationContextOptions {
  /** 'input' = no history; 'key' = truncated assistant replies; 'full' = full text */
  contextMode: ConversationContextMode
  /** Max number of turns (user/ai/image/system) to include. Defaults vary by mode */
  maxTurns?: number
  /** Entry types to include. Default: user, ai, image */
  includeTypes?: Array<'user' | 'ai' | 'image' | 'system'>
}

/**
 * Build the "Previous conversation" block for the LLM prompt.
 * Returns null if no history; otherwise "User: ...\n\nAssistant: ...\n\n..."
 */
export function buildConversationContext(
  entries: LogEntry[],
  options: BuildConversationContextOptions
): string | null {
  const {
    contextMode,
    maxTurns = contextMode === 'full' ? FULL_MODE_DEFAULT_MAX_TURNS : DEFAULT_MAX_TURNS,
    includeTypes = ['user', 'ai', 'image'],
  } = options
  if (contextMode === 'input') return null

  const relevant = entries.filter((e) => includeTypes.includes(e.type as 'user' | 'ai' | 'image' | 'system')).slice(-maxTurns)
  if (relevant.length === 0) return null

  const segments = relevant
    .map((e) => {
      if (e.type === 'user') return `User: ${e.content}`
      if (e.type === 'image') return `[Image Context]\n${e.imageAnalysis ?? 'Image added to conversation'}`
      if (e.type === 'system') return `[System Event]: ${e.content}`
      const text = e.content ?? ''
      if (contextMode === 'key') return `Assistant: ${text.slice(0, KEY_MODE_TRUNCATE_CHARS)}${text.length > KEY_MODE_TRUNCATE_CHARS ? '...' : ''}`
      return `Assistant: ${text}`
    })
    .filter(Boolean)

  if (segments.length === 0) return null

  const maxChars = contextMode === 'full' ? FULL_MODE_MAX_CHARS : KEY_MODE_MAX_CHARS
  const selected: string[] = []
  let totalChars = 0

  for (let idx = segments.length - 1; idx >= 0; idx -= 1) {
    const segment = segments[idx]
    const separatorChars = selected.length > 0 ? 2 : 0
    const nextLength = totalChars + segment.length + separatorChars
    if (nextLength > maxChars) {
      if (selected.length === 0) {
        selected.unshift(segment.slice(Math.max(0, segment.length - maxChars)))
      }
      break
    }
    selected.unshift(segment)
    totalChars = nextLength
  }

  const historyBlock = selected.join('\n\n')

  return historyBlock
}

/**
 * Build the full enhanced prompt: optional circuit context + conversation + "User: {prompt}"
 */
export function buildEnhancedPrompt(
  prompt: string,
  conversationBlock: string | null,
  circuitContext?: string | null
): string {
  const withHistory = conversationBlock
    ? `Previous conversation:\n\n${conversationBlock}\n\nUser: ${prompt}`
    : `User: ${prompt}`
  if (circuitContext?.trim()) return `${circuitContext}\n\n---\n\n${withHistory}`
  return withHistory
}
