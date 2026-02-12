import type { LogEntry } from '../types/module'
import { handleSessionCommand } from './terminalSessionCommands'

const stashBeforeClearMock = vi.fn()
const loadBeforeClearMock = vi.fn()
const saveSessionAsyncMock = vi.fn()
const loadSessionAsyncMock = vi.fn()
const deleteSessionAsyncMock = vi.fn()
const loadSessionsIndexFromLocalStorageMock = vi.fn()

vi.mock('./sessionPersistence', () => ({
  BEFORE_CLEAR_KEY: 'before-clear',
  stashBeforeClear: (...args: unknown[]) => stashBeforeClearMock(...args),
  loadBeforeClear: (...args: unknown[]) => loadBeforeClearMock(...args),
  loadSessionsIndexFromLocalStorage: (...args: unknown[]) => loadSessionsIndexFromLocalStorageMock(...args),
}))

vi.mock('./terminalSessionApi', () => ({
  saveSessionAsync: (...args: unknown[]) => saveSessionAsyncMock(...args),
  loadSessionAsync: (...args: unknown[]) => loadSessionAsyncMock(...args),
  deleteSessionAsync: (...args: unknown[]) => deleteSessionAsyncMock(...args),
}))

vi.mock('./uiNotifications', () => ({
  showErrorToast: vi.fn(),
  showInfoToast: vi.fn(),
  showSuccessToast: vi.fn(),
}))

function createOptions(overrides?: Partial<Parameters<typeof handleSessionCommand>[0]>) {
  const entries: LogEntry[] = [
    { id: '1', type: 'user', content: 'hello', timestamp: 1 },
    { id: '2', type: 'ai', content: 'world', timestamp: 2 },
  ]

  return {
    cmd: '',
    args: [],
    timestamp: 100,
    entries,
    apiBase: 'http://localhost:8000',
    storageKey: 'loom-history',
    setEntries: vi.fn(),
    clearCircuitInputState: vi.fn(),
    addSystemEntry: vi.fn(),
    addErrorEntry: vi.fn(),
    setCommandStatus: vi.fn(),
    markCommandPending: vi.fn(),
    ...overrides,
  }
}

describe('handleSessionCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    loadBeforeClearMock.mockReturnValue(null)
    loadSessionsIndexFromLocalStorageMock.mockReturnValue({})
    saveSessionAsyncMock.mockResolvedValue(true)
    loadSessionAsyncMock.mockResolvedValue(null)
    deleteSessionAsyncMock.mockResolvedValue(true)
  })

  it('handles /clear by stashing and replacing entries', () => {
    const options = createOptions({ cmd: 'clear' })
    const handled = handleSessionCommand(options)

    expect(handled).toBe(true)
    expect(stashBeforeClearMock).toHaveBeenCalledWith(options.entries)
    expect(options.clearCircuitInputState).toHaveBeenCalled()
    expect(options.setEntries).toHaveBeenCalled()
  })

  it('handles /restore with stashed entries', () => {
    loadBeforeClearMock.mockReturnValue([{ id: 'x', type: 'user', content: 'restored', timestamp: 3 }])
    const options = createOptions({ cmd: 'restore' })

    const handled = handleSessionCommand(options)

    expect(handled).toBe(true)
    expect(options.setEntries).toHaveBeenCalled()
    expect(options.addErrorEntry).not.toHaveBeenCalled()
  })

  it('handles /restore without stash as error', () => {
    loadBeforeClearMock.mockReturnValue([])
    const options = createOptions({ cmd: 'restore' })

    const handled = handleSessionCommand(options)

    expect(handled).toBe(true)
    expect(options.addErrorEntry).toHaveBeenCalledWith(
      'Nothing to restore. Use /clear first to stash the display.',
      100,
    )
  })

  it('handles /saveas missing name', () => {
    const options = createOptions({ cmd: 'saveas', args: [] })

    const handled = handleSessionCommand(options)

    expect(handled).toBe(true)
    expect(options.addErrorEntry).toHaveBeenCalledWith('Usage: /saveas <name> [last:N]', 100)
  })

  it('returns false for unknown session command', () => {
    const handled = handleSessionCommand(createOptions({ cmd: 'noop' }))
    expect(handled).toBe(false)
  })
})
