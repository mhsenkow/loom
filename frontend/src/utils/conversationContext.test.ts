import type { LogEntry } from '../types/module'
import { buildConversationContext, buildEnhancedPrompt } from './conversationContext'
import type { ConversationProfile } from './conversationProfile'

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

    expect(result).toContain('[User Message]')
    expect(result).toContain('Question?')
    expect(result).toContain(`[Assistant Reply]\n${'a'.repeat(120)}...`)
    expect(result).not.toContain(`[Assistant Reply]\n${assistantText}`)
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
    const result = buildEnhancedPrompt('What now?', '[User Message]\nHi\n\n[Assistant Reply]\nHello')
    expect(result).toContain('Conversation Context (oldest to newest):')
    expect(result).toContain('Latest User Message:')
    expect(result).toContain('What now?')
    expect(result).toContain('Assistant Reply:')
  })

  it('prepends circuit context when provided', () => {
    const result = buildEnhancedPrompt('Ship it', '[User Message]\ntest', '[Circuit Context]')
    expect(result.startsWith('[Circuit Context]')).toBe(true)
    expect(result).toContain('---')
    expect(result).toContain('Conversation Context (oldest to newest):')
  })

  it('includes goals and memory profile when present', () => {
    const profile: ConversationProfile = {
      goalsEnabled: true,
      memoryEnabled: true,
      userGoals: ['Ship quickly'],
      assistantGoals: ['Be concise'],
      memoryNotes: ['Project codename is Atlas'],
    }
    const result = buildEnhancedPrompt('What should we do next?', null, null, profile)
    expect(result).toContain('Conversation Profile (apply only when relevant):')
    expect(result).toContain('User Goals:')
    expect(result).toContain('- Ship quickly')
    expect(result).toContain('Assistant Goals:')
    expect(result).toContain('- Be concise')
    expect(result).toContain('Long-Term Memory Notes:')
    expect(result).toContain('- Project codename is Atlas')
  })
})
