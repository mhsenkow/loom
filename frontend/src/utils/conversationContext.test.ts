import type { LogEntry } from '../types/module'
import { buildConversationContext, buildEnhancedPrompt } from './conversationContext'

function makeEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: overrides.id || 'id',
    type: overrides.type || 'user',
    content: overrides.content || '',
    timestamp: overrides.timestamp || Date.now(),
    ...overrides,
  }
}

describe('buildConversationContext', () => {
  it('returns null in input mode', () => {
    const result = buildConversationContext(
      [makeEntry({ type: 'user', content: 'hello' })],
      { contextMode: 'input' },
    )
    expect(result).toBeNull()
  })

  it('builds key mode with assistant truncation', () => {
    const assistantText = 'a'.repeat(150)
    const result = buildConversationContext(
      [
        makeEntry({ id: 'u1', type: 'user', content: 'Question?' }),
        makeEntry({ id: 'a1', type: 'ai', content: assistantText }),
      ],
      { contextMode: 'key' },
    )

    expect(result).toContain('User: Question?')
    expect(result).toContain(`Assistant: ${'a'.repeat(120)}...`)
    expect(result).not.toContain(`Assistant: ${assistantText}`)
  })

  it('includes image entries and excludes system entries by default', () => {
    const result = buildConversationContext(
      [
        makeEntry({ id: 'img', type: 'image', content: 'image', imageAnalysis: 'A city skyline' }),
        makeEntry({ id: 'sys', type: 'system', content: 'BACKEND CONNECTED' }),
      ],
      { contextMode: 'full' },
    )

    expect(result).toContain('[Image Context]')
    expect(result).toContain('A city skyline')
    expect(result).not.toContain('[System Event]: BACKEND CONNECTED')
  })

  it('includes system entries when explicitly requested', () => {
    const result = buildConversationContext(
      [
        makeEntry({ id: 'img', type: 'image', content: 'image', imageAnalysis: 'A city skyline' }),
        makeEntry({ id: 'sys', type: 'system', content: 'BACKEND CONNECTED' }),
      ],
      { contextMode: 'full', includeTypes: ['system', 'image'] },
    )

    expect(result).toContain('[Image Context]')
    expect(result).toContain('[System Event]: BACKEND CONNECTED')
  })

  it('respects maxTurns limit', () => {
    const entries = [
      makeEntry({ id: '1', type: 'user', content: 'oldest', timestamp: 1 }),
      makeEntry({ id: '2', type: 'user', content: 'newer', timestamp: 2 }),
      makeEntry({ id: '3', type: 'user', content: 'newest', timestamp: 3 }),
    ]

    const result = buildConversationContext(entries, { contextMode: 'full', maxTurns: 2 })

    expect(result).not.toContain('oldest')
    expect(result).toContain('newer')
    expect(result).toContain('newest')
  })
})

describe('buildEnhancedPrompt', () => {
  it('adds conversation block when available', () => {
    const result = buildEnhancedPrompt('What now?', 'User: Hi\n\nAssistant: Hello')
    expect(result).toContain('Previous conversation:')
    expect(result).toContain('User: What now?')
  })

  it('prepends circuit context when provided', () => {
    const result = buildEnhancedPrompt('Ship it', 'User: test', '[Circuit Context]')
    expect(result.startsWith('[Circuit Context]')).toBe(true)
    expect(result).toContain('---')
    expect(result).toContain('Previous conversation:')
  })
})
