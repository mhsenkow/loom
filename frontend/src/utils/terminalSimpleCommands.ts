interface TerminalSystemStatus {
  connected?: boolean
  activeModel?: string
  visionModel?: string
  imageGenModel?: string
  loadedModelName?: string
  ramTotalGb?: number
  ramAvailableGb?: number
  ramSystemUsedGb?: number
  ramModelUsedGb?: number
  ramUsedPercent?: number
  ollamaProcessRssGb?: number
}

interface MusicGenerationState {
  prompt: string
  lyrics?: string
  audioUrl?: string
  duration: number
  status: 'empty' | 'generating' | 'success' | 'error'
  error?: string
  progress?: number
  message?: string
  seed?: number
}

interface HandleSimpleCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  connected: boolean
  status: TerminalSystemStatus
  modelsCount: number
  getCircuitCount: () => number
  setMusicSetupPanelOpen: (open: boolean) => void
  setMusicGeneration: (next: MusicGenerationState) => void
  handleAIRequest: (prompt: string, timestamp: number, contextMode?: 'input' | 'key' | 'full') => void
  addSystemEntry: (content: string, timestamp: number) => void
  addErrorEntry: (content: string, timestamp: number) => void
}

export function handleSimpleCommand(options: HandleSimpleCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    connected,
    status,
    modelsCount,
    getCircuitCount,
    setMusicSetupPanelOpen,
    setMusicGeneration,
    handleAIRequest,
    addSystemEntry,
    addErrorEntry,
  } = options

  switch (cmd) {
    case 'help':
      addSystemEntry([
        'AVAILABLE COMMANDS:',
        '',
        'CHAT:',
        '  /ai <prompt>   - Send prompt to AI processor',
        '  /model <name>  - Switch chat model',
        '  /vision <name> - Switch vision/image analysis model',
        '  /gen <name>    - Switch image generation model',
        '  /models        - List available Ollama models',
        '  /pull <name>   - Download a new Ollama model',
        '  /setup-models  - Pull baseline stack (tiny/chat/image/music) if missing',
        '  /quick <ask>   - Use fast free/cheap cloud lane when available',
        '  /qdc status    - Show QDC connector and job status',
        '  /qdc run <ask> - Start an async QDC remote job',
        '  /qdc package <path> - Build a QDC-ready .zip package from file/folder',
        '  /qdc package-model <path> - Build a QDC model .zip for AI Model upload type',
        '  /qdc ship <path> :: <task> - Package + upload + run in one step',
        '  /qdc ship-model <path> :: <task> - Package model + upload + run',
        '  /qdc relay <ask> - Ask follow-up with latest QDC cloud result as context',
        '',
        'IMAGES:',
        '  /image-models  - List available image generation models',
        '  /pull-image <name> - Download image model (Flux, SDXL, etc.)',
        '  /set-hf-token <token> - Set HuggingFace token (needed for Flux)',
        '',
        'IMAGES:',
        '  /image          - Upload and analyze an image (or use 📷 button)',
        '  /imagine <prompt> - Generate an image using Ollama (flux2-klein)',
        '  /dream <prompt>   - Alias for /imagine',
        '  Click 📷 button - Upload image for vision analysis',
        '',
        'CIRCUITS:',
        '  /circuits           - List saved circuits',
        '  /run <name>         - Run a saved circuit',
        '  /<circuit-name>     - Shorthand to run a circuit',
        '',
        'SESSION:',
        '  /clear              - Clear display; /restore to bring back',
        '  /restore            - Restore content from before /clear',
        '  /reset              - Wipe everything (no restore)',
        '  /goals              - Show active user/assistant goals',
        '  /goal ...           - Update goals (/goal user ..., /goal assistant ...)',
        '  /memory             - Show memory notes',
        '  /remember [tier] <fact> [@0-1] - Add memory with tier/confidence',
        '  /forget <index>     - Remove one memory note',
        '  /mission ...        - Session objective/next/blocker tracker',
        '  /improve ...        - Maintenance queue (list/add/done/clear)',
        '  /eval               - Agent quality snapshot from live telemetry',
        '  /crt [mode]         - CRT effect: on|off|subtle|medium|full|insane|burst|status',
        '  /glitch             - Trigger CRT glitch burst',
        '  /saveas <name>      - Save current session to a named slot',
        '  /saveas <name> last:N - Save only last N entries',
        '  /sessions           - List saved sessions',
        '  /load <name>        - Load a saved session (replaces current)',
        '  /delete <name>      - Delete a saved session',
        '',
        '  /status        - Show system status',
        '  /suggest       - Get model suggestions for your system',
        '  /setup-models  - Pull baseline stack if missing',
        '  /quick <ask>   - Use fast free/cheap cloud lane',
        '  /qdc status    - Show QDC connector and job status',
        '  /qdc jobs      - List recent QDC jobs',
        '  /qdc package <path> - Build a QDC-ready .zip package',
        '  /qdc package-model <path> - Build QDC model upload package',
        '  /qdc ship <path> :: <task> - Package + upload + run',
        '  /qdc ship-model <path> :: <task> - Package model + upload + run',
        '  /qdc relay <ask> - Continue with latest QDC result context',
        '  /crt [mode]    - CRT effect: on|off|subtle|medium|full|insane|burst|status',
        '  /glitch        - Trigger CRT glitch burst',
        '  /image         - Upload and analyze an image (or click 📷 button)',
        '  /imagine <prompt> - Generate an image (uses Ollama flux2-klein)',
        '  /dream <prompt>   - Alias for /imagine',
        '  /song <style>     - Generate a quick music track',
        '  /compose          - Info on advanced composition',
        '  /music-setup      - Setup/download music generation model',
        '  /help          - Show this message',
        '',
        'Current session auto-saves. Use SAVE in the Sessions panel or /saveas to name it.',
      ].join('\n'), timestamp)
      return true

    case 'song':
      setMusicGeneration({
        prompt: args.join(' ') || '',
        lyrics: '',
        duration: 30,
        status: 'empty',
      })
      return true

    case 'compose':
      addSystemEntry('🎹 To compose music with advanced controls (lyrics, duration, etc.), please switch to the Circuit Board view and add a Music Gen module.', timestamp)
      return true

    case 'music-setup':
      setMusicSetupPanelOpen(true)
      return true

    case 'ai': {
      const prompt = args.join(' ')
      if (prompt) {
        handleAIRequest(prompt, timestamp)
      } else {
        addErrorEntry('Usage: /ai <your prompt>', timestamp)
      }
      return true
    }

    case 'status': {
      const statusLines = [
        'SYSTEM STATUS:',
        `  Backend: ${connected ? 'CONNECTED' : 'DISCONNECTED'}`,
        `  Ollama:  ${status.connected ? 'ONLINE' : 'STANDBY'}`,
        `  Models:  ${modelsCount} available`,
        `  Circuits: ${getCircuitCount()} saved`,
      ]
      if (status.activeModel) statusLines.push(`  Chat Model: ${status.activeModel}`)
      if (status.loadedModelName) statusLines.push(`  Loaded Model: ${status.loadedModelName}`)
      if (status.visionModel) statusLines.push(`  Vision Model: ${status.visionModel}`)
      if (status.imageGenModel) statusLines.push(`  Image Gen Model: ${status.imageGenModel}`)
      if (status.ramTotalGb !== undefined) {
        const used = status.ramSystemUsedGb
          ?? (status.ramAvailableGb !== undefined ? Math.max(0, status.ramTotalGb - status.ramAvailableGb) : undefined)
        const percent = status.ramUsedPercent !== undefined ? `${Math.round(status.ramUsedPercent)}%` : 'unknown'
        if (used !== undefined) {
          statusLines.push(`  RAM: ${used.toFixed(1)}GB / ${status.ramTotalGb.toFixed(1)}GB (${percent})`)
        } else {
          statusLines.push(`  RAM: ${status.ramTotalGb.toFixed(1)}GB total`)
        }
        if (status.ramAvailableGb !== undefined) {
          statusLines.push(`  RAM Free: ${status.ramAvailableGb.toFixed(1)}GB`)
        }
        if (status.ramModelUsedGb && status.ramModelUsedGb > 0) {
          statusLines.push(`  Model Footprint (est): ~${status.ramModelUsedGb.toFixed(1)}GB`)
        }
        if (status.ollamaProcessRssGb && status.ollamaProcessRssGb > 0) {
          statusLines.push(`  Ollama Process RSS: ~${status.ollamaProcessRssGb.toFixed(1)}GB`)
        }
      }
      addSystemEntry(statusLines.join('\n'), timestamp)
      return true
    }

    default:
      return false
  }
}
