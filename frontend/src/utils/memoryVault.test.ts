import {
  addMemoryEntry,
  pruneMemoryVault,
  removeMemoryEntryById,
  selectRelevantMemory,
  syncLegacyMemoryNotes,
} from './memoryVault'

describe('memoryVault', () => {
  beforeEach(() => {
    let store: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          store = {}
        },
      },
      configurable: true,
    })
  })

  it('adds and ranks relevant memory entries', () => {
    addMemoryEntry('Project codename is Atlas', { tier: 'long', confidence: 0.9 })
    addMemoryEntry('Use strict TypeScript in frontend', { tier: 'working', confidence: 0.8 })
    const ranked = selectRelevantMemory('typescript frontend task', pruneMemoryVault(), 5)
    expect(ranked.length).toBeGreaterThan(0)
    expect(ranked[0].entry.text.toLowerCase()).toContain('typescript')
  })

  it('removes memory by id', () => {
    const created = addMemoryEntry('Temporary note', { tier: 'session', confidence: 0.6 })
    expect(created).not.toBeNull()
    const before = pruneMemoryVault()
    expect(before.length).toBe(1)
    removeMemoryEntryById(created!.id)
    const after = pruneMemoryVault()
    expect(after.length).toBe(0)
  })

  it('seeds legacy notes only once', () => {
    syncLegacyMemoryNotes('One\nTwo')
    const once = pruneMemoryVault()
    expect(once.length).toBe(2)
    syncLegacyMemoryNotes('One\nTwo')
    const twice = pruneMemoryVault()
    expect(twice.length).toBe(2)
  })
})
