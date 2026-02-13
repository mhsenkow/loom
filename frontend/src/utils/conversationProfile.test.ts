import {
  buildConversationProfileFromSettings,
  buildConversationProfileStoragePreview,
  normalizeProfileLines,
  toMultilineText,
} from './conversationProfile'

describe('normalizeProfileLines', () => {
  it('removes empty lines and deduplicates case-insensitively', () => {
    const lines = normalizeProfileLines(' One goal \n\none goal\nSecond goal ')
    expect(lines).toEqual(['One goal', 'Second goal'])
  })
})

describe('buildConversationProfileFromSettings', () => {
  it('falls back to enabled defaults', () => {
    const profile = buildConversationProfileFromSettings({})
    expect(profile.goalsEnabled).toBe(true)
    expect(profile.memoryEnabled).toBe(true)
  })

  it('respects explicit disabled toggles and parses multiline values', () => {
    const profile = buildConversationProfileFromSettings({
      goalsEnabled: false,
      memoryEnabled: false,
      userGoals: 'Ship fast\nKeep quality high',
      assistantGoals: 'Be concise',
      memoryNotes: 'Codename Atlas',
    })
    expect(profile.goalsEnabled).toBe(false)
    expect(profile.memoryEnabled).toBe(false)
    expect(profile.userGoals).toEqual(['Ship fast', 'Keep quality high'])
    expect(profile.assistantGoals).toEqual(['Be concise'])
    expect(profile.memoryNotes).toEqual(['Codename Atlas'])
  })
})

describe('conversation profile storage preview helpers', () => {
  it('round-trips multiline text and preview shape', () => {
    const text = toMultilineText(['A', 'B'])
    expect(text).toBe('A\nB')

    const profile = buildConversationProfileFromSettings({
      userGoals: text,
      assistantGoals: 'C',
      memoryNotes: 'D',
    })
    const preview = buildConversationProfileStoragePreview(profile)
    expect(preview).toEqual({
      goals: {
        enabled: true,
        user: ['A', 'B'],
        assistant: ['C'],
      },
      memory: {
        enabled: true,
        notes: ['D'],
      },
    })
  })
})
