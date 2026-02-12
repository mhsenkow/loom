import { handleSimpleCommand } from './terminalSimpleCommands'

describe('handleSimpleCommand', () => {
  it('handles /song by opening empty music generation state', () => {
    const setMusicGeneration = vi.fn()

    const handled = handleSimpleCommand({
      cmd: 'song',
      args: ['lofi', 'rain'],
      timestamp: 1,
      connected: true,
      status: { connected: true },
      modelsCount: 1,
      getCircuitCount: () => 0,
      setMusicSetupPanelOpen: vi.fn(),
      setMusicGeneration,
      handleAIRequest: vi.fn(),
      addSystemEntry: vi.fn(),
      addErrorEntry: vi.fn(),
    })

    expect(handled).toBe(true)
    expect(setMusicGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'lofi rain',
        status: 'empty',
      }),
    )
  })

  it('handles /ai with prompt', () => {
    const handleAIRequest = vi.fn()

    const handled = handleSimpleCommand({
      cmd: 'ai',
      args: ['summarize', 'this'],
      timestamp: 42,
      connected: true,
      status: { connected: true },
      modelsCount: 2,
      getCircuitCount: () => 3,
      setMusicSetupPanelOpen: vi.fn(),
      setMusicGeneration: vi.fn(),
      handleAIRequest,
      addSystemEntry: vi.fn(),
      addErrorEntry: vi.fn(),
    })

    expect(handled).toBe(true)
    expect(handleAIRequest).toHaveBeenCalledWith('summarize this', 42)
  })

  it('handles /ai missing prompt with usage error', () => {
    const addErrorEntry = vi.fn()

    const handled = handleSimpleCommand({
      cmd: 'ai',
      args: [],
      timestamp: 42,
      connected: true,
      status: { connected: true },
      modelsCount: 2,
      getCircuitCount: () => 3,
      setMusicSetupPanelOpen: vi.fn(),
      setMusicGeneration: vi.fn(),
      handleAIRequest: vi.fn(),
      addSystemEntry: vi.fn(),
      addErrorEntry,
    })

    expect(handled).toBe(true)
    expect(addErrorEntry).toHaveBeenCalledWith('Usage: /ai <your prompt>', 42)
  })

  it('handles /status with derived lines', () => {
    const addSystemEntry = vi.fn()

    const handled = handleSimpleCommand({
      cmd: 'status',
      args: [],
      timestamp: 99,
      connected: false,
      status: {
        connected: true,
        activeModel: 'llama3.1:8b',
        visionModel: 'llava',
        imageGenModel: 'flux',
      },
      modelsCount: 7,
      getCircuitCount: () => 5,
      setMusicSetupPanelOpen: vi.fn(),
      setMusicGeneration: vi.fn(),
      handleAIRequest: vi.fn(),
      addSystemEntry,
      addErrorEntry: vi.fn(),
    })

    expect(handled).toBe(true)
    const message = addSystemEntry.mock.calls[0][0] as string
    expect(message).toContain('Backend: DISCONNECTED')
    expect(message).toContain('Models:  7 available')
    expect(message).toContain('Circuits: 5 saved')
    expect(message).toContain('Chat Model: llama3.1:8b')
  })

  it('returns false for unknown command', () => {
    const handled = handleSimpleCommand({
      cmd: 'not-real',
      args: [],
      timestamp: 1,
      connected: true,
      status: {},
      modelsCount: 0,
      getCircuitCount: () => 0,
      setMusicSetupPanelOpen: vi.fn(),
      setMusicGeneration: vi.fn(),
      handleAIRequest: vi.fn(),
      addSystemEntry: vi.fn(),
      addErrorEntry: vi.fn(),
    })

    expect(handled).toBe(false)
  })
})
