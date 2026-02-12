import type { Dispatch, SetStateAction } from 'react'
import type { LogEntry } from '../types/module'
import type { SavedCircuit } from '../hooks/useCircuitRunner'
import type { NotebookTemplate } from '../components/circuit/TemplatesSidebar'

interface CircuitInputState {
  circuitName: string
  requiredInputs: string[]
  collectedInputs: Record<string, string>
  currentInputIndex: number
}

interface HandleCircuitCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  templates: NotebookTemplate[]
  getCircuitNames: () => string[]
  loadSavedCircuits: () => Record<string, SavedCircuit>
  saveCircuit: (circuit: SavedCircuit) => boolean
  getRequiredInputs: (name: string) => string[]
  runCircuit: (name: string, inputs: Record<string, string>) => Promise<string>
  setCircuitInputState: Dispatch<SetStateAction<CircuitInputState | null>>
  setEntries: Dispatch<SetStateAction<LogEntry[]>>
  addSystemEntry: (content: string, timestamp: number) => void
  addErrorEntry: (content: string, timestamp: number) => void
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void
  markCommandPending?: (detail?: string) => void
}

function executeCircuit(
  name: string,
  promptPrefix: string,
  timestamp: number,
  templates: NotebookTemplate[],
  getCircuitNames: () => string[],
  saveCircuit: (circuit: SavedCircuit) => boolean,
  getRequiredInputs: (name: string) => string[],
  runCircuit: (name: string, inputs: Record<string, string>) => Promise<string>,
  setCircuitInputState: Dispatch<SetStateAction<CircuitInputState | null>>,
  setEntries: Dispatch<SetStateAction<LogEntry[]>>,
  addSystemEntry: (content: string, timestamp: number) => void,
  addErrorEntry: (content: string, timestamp: number) => void,
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void,
  markCommandPending?: (detail?: string) => void,
): boolean {
  const circuitNames = getCircuitNames()
  const template = templates.find(t => t.id === name)

  if (!circuitNames.includes(name) && !template) {
    addErrorEntry(`Circuit "${name}" not found.\nUse /circuits to see available circuits.`, timestamp)
    setCommandStatus?.('failed', `circuit "${name}" not found`)
    return true
  }

  if (template && !circuitNames.includes(name)) {
    const savedCircuit: SavedCircuit = {
      name: template.id,
      cells: template.cells.map((cell, idx) => {
        const { output: _output, ...cellWithoutOutput } = cell
        return {
          ...cellWithoutOutput,
          id: `cell-${Date.now()}-${idx}`,
        }
      }) as SavedCircuit['cells'],
      modelSlots: { A: '', B: '', C: '', IMAGE: '' },
      savedAt: Date.now(),
    }
    saveCircuit(savedCircuit)
  }

  const requiredInputs = getRequiredInputs(name)
  if (requiredInputs.length > 0) {
    setCircuitInputState({
      circuitName: name,
      requiredInputs,
      collectedInputs: {},
      currentInputIndex: 0,
    })

    addSystemEntry(
      `Running circuit: ${name}\n\n${promptPrefix}\n\n[${requiredInputs[0]}]:`,
      timestamp,
    )
    setCommandStatus?.('done', `awaiting inputs for "${name}"`)
    return true
  }

  addSystemEntry(`Running circuit: ${name}...`, timestamp)
  runCircuit(name, {}).then(output => {
    setEntries(prev => [...prev, {
      id: `circuit-output-${Date.now()}`,
      type: 'ai',
      content: output,
      timestamp: Date.now(),
      status: 'success',
    }])
    setCommandStatus?.('done', `circuit "${name}" completed`)
  }).catch(err => {
    addErrorEntry(`Circuit failed: ${err.message}`, Date.now())
    setCommandStatus?.('failed', `circuit "${name}" failed`)
  })
  markCommandPending?.(`running circuit "${name}"`)
  return true
}

export function handleCircuitCommand(options: HandleCircuitCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    templates,
    getCircuitNames,
    loadSavedCircuits,
    saveCircuit,
    getRequiredInputs,
    runCircuit,
    setCircuitInputState,
    setEntries,
    addSystemEntry,
    addErrorEntry,
    setCommandStatus,
    markCommandPending,
  } = options

  if (cmd === 'circuits') {
    const circuitNames = getCircuitNames()
    const circuits = loadSavedCircuits()

    const savedList = circuitNames.length > 0
      ? circuitNames.map(name => {
        const circuit = circuits[name]
        const inputCount = circuit.cells.filter(c => c.type === 'data_input').length
        const cellCount = circuit.cells.length
        return `  /${name} (${cellCount} cells${inputCount > 0 ? `, ${inputCount} inputs` : ''})`
      }).join('\n')
      : '  (none yet)'

    const categories = ['thinking', 'writing', 'music', 'data', 'code', 'scripts'] as const
    const categoryLabels: Record<string, string> = {
      thinking: 'THINK',
      writing: 'WRITE',
      music: 'MUSIC',
      data: 'DATA',
      code: 'CODE',
      scripts: 'SCRIPTS',
    }

    const templatesByCategory = categories.map(cat => {
      const templatesInCategory = templates.filter(t => t.category === cat)
      if (templatesInCategory.length === 0) return ''

      const list = templatesInCategory.map(t => {
        const inputCount = t.cells.filter(c => c.type === 'data_input').length
        return `    /${t.id} - ${t.name}${inputCount > 0 ? ` (${inputCount} inputs)` : ''}`
      }).join('\n')

      return `  ${categoryLabels[cat]}:\n${list}`
    }).filter(Boolean).join('\n\n')

    addSystemEntry(
      `CIRCUITS:\n\n` +
      `YOUR SAVED:\n${savedList}\n\n` +
      `TEMPLATES:\n${templatesByCategory}\n\n` +
      `Run with: /<name>`,
      timestamp,
    )
    return true
  }

  if (cmd === 'run') {
    const circuitName = args.join('-').trim()
    if (!circuitName) {
      addErrorEntry('Usage: /run <circuit-name>', timestamp)
      setCommandStatus?.('failed', 'missing circuit name')
      return true
    }
    return executeCircuit(
      circuitName,
      'Please provide inputs:',
      timestamp,
      templates,
      getCircuitNames,
      saveCircuit,
      getRequiredInputs,
      runCircuit,
      setCircuitInputState,
      setEntries,
      addSystemEntry,
      addErrorEntry,
      setCommandStatus,
      markCommandPending,
    )
  }

  const circuitNames = getCircuitNames()
  const template = templates.find(t => t.id === cmd)
  if (circuitNames.includes(cmd) || template) {
    return executeCircuit(
      cmd,
      'Provide inputs:',
      timestamp,
      templates,
      getCircuitNames,
      saveCircuit,
      getRequiredInputs,
      runCircuit,
      setCircuitInputState,
      setEntries,
      addSystemEntry,
      addErrorEntry,
      setCommandStatus,
      markCommandPending,
    )
  }

  return false
}
