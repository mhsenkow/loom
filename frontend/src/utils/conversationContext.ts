/**
 * Conversation manager: builds LLM prompt context from chat history.
 * Tracks turns (user/ai/image/system), caps length, and formats "Previous conversation" for the model.
 */

import type { LogEntry } from '../types/module'

export type ConversationContextMode = 'input' | 'key' | 'full'

const DEFAULT_MAX_TURNS = 16
const KEY_MODE_TRUNCATE_CHARS = 120

export interface BuildConversationContextOptions {
  /** 'input' = no history; 'key' = truncated assistant replies; 'full' = full text */
  contextMode: ConversationContextMode
  /** Max number of turns (user/ai/image/system) to include. Default 16 */
  maxTurns?: number
  /** Entry types to include. Default: user, ai, image, system */
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
  const { contextMode, maxTurns = DEFAULT_MAX_TURNS, includeTypes = ['user', 'ai', 'image', 'system'] } = options
  if (contextMode === 'input') return null

  const relevant = entries.filter((e) => includeTypes.includes(e.type as 'user' | 'ai' | 'image' | 'system')).slice(-maxTurns)
  if (relevant.length === 0) return null

  const historyBlock = relevant
    .map((e) => {
      if (e.type === 'user') return `User: ${e.content}`
      if (e.type === 'image') return `[Image Context]\n${e.imageAnalysis ?? 'Image added to conversation'}`
      if (e.type === 'system') return `[System Event]: ${e.content}`
      const text = e.content ?? ''
      if (contextMode === 'key') return `Assistant: ${text.slice(0, KEY_MODE_TRUNCATE_CHARS)}${text.length > KEY_MODE_TRUNCATE_CHARS ? '...' : ''}`
      return `Assistant: ${text}`
    })
    .join('\n\n')

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
