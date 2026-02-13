/**
 * Conversation manager: builds LLM prompt context from chat history.
 * Tracks turns (user/ai/image/system), caps length, and formats structured context for the model.
 */

import type { LogEntry } from '../types/module'
import type { ConversationProfile } from './conversationProfile'

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
 * Build the conversation context block for the LLM prompt.
 * Returns null if no history; otherwise structured role-tagged blocks.
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
      if (e.type === 'user') return `[User Message]\n${e.content}`
      if (e.type === 'image') return `[Image Context]\n${e.imageAnalysis ?? 'Image added to conversation'}`
      if (e.type === 'system') return `[System Event]: ${e.content}`
      const text = e.content ?? ''
      if (contextMode === 'key') return `[Assistant Reply]\n${text.slice(0, KEY_MODE_TRUNCATE_CHARS)}${text.length > KEY_MODE_TRUNCATE_CHARS ? '...' : ''}`
      return `[Assistant Reply]\n${text}`
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
 * Build the full enhanced prompt: optional circuit context + conversation + latest user message.
 */
export function buildEnhancedPrompt(
  prompt: string,
  conversationBlock: string | null,
  circuitContext?: string | null,
  conversationProfile?: ConversationProfile | null,
): string {
  const profileBlock = buildConversationProfileBlock(conversationProfile)
  const responsePolicy = [
    'Respond to the latest user message with one direct assistant reply.',
    'Do not simulate multi-speaker dialogue.',
    'Do not write lines for "User:", "Assistant:", "AI:", or named personas unless explicitly requested.',
  ].join('\n')

  const withHistory = conversationBlock
    ? `${responsePolicy}${profileBlock ? `\n\n${profileBlock}` : ''}\n\nConversation Context (oldest to newest):\n\n${conversationBlock}\n\nLatest User Message:\n${prompt}\n\nAssistant Reply:`
    : `${responsePolicy}${profileBlock ? `\n\n${profileBlock}` : ''}\n\nLatest User Message:\n${prompt}\n\nAssistant Reply:`
  if (circuitContext?.trim()) return `${circuitContext}\n\n---\n\n${withHistory}`
  return withHistory
}

function buildConversationProfileBlock(profile?: ConversationProfile | null): string | null {
  if (!profile) return null

  const sections: string[] = []

  if (profile.goalsEnabled) {
    const goalLines: string[] = []
    if (profile.userGoals.length > 0) {
      goalLines.push('User Goals:')
      goalLines.push(...profile.userGoals.map(goal => `- ${goal}`))
    }
    if (profile.assistantGoals.length > 0) {
      goalLines.push('Assistant Goals:')
      goalLines.push(...profile.assistantGoals.map(goal => `- ${goal}`))
    }
    if (goalLines.length > 0) {
      sections.push(`Goals:\n${goalLines.join('\n')}`)
    }
  }

  if (profile.memoryEnabled && profile.memoryNotes.length > 0) {
    sections.push(`Long-Term Memory Notes:\n${profile.memoryNotes.map(note => `- ${note}`).join('\n')}`)
  }

  if (sections.length === 0) return null

  return [
    'Conversation Profile (apply only when relevant):',
    ...sections,
    'Never invent memory or goals not listed above.',
  ].join('\n')
}
