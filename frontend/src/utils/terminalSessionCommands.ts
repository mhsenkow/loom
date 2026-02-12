import type { Dispatch, SetStateAction } from 'react'
import type { LogEntry } from '../types/module'
import {
  BEFORE_CLEAR_KEY,
  loadBeforeClear,
  loadSessionsIndexFromLocalStorage,
  stashBeforeClear,
} from './sessionPersistence'
import {
  deleteSessionAsync,
  loadSessionAsync,
  saveSessionAsync,
} from './terminalSessionApi'
import { showErrorToast, showInfoToast, showSuccessToast } from './uiNotifications'

interface HandleSessionCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  entries: LogEntry[]
  apiBase: string
  storageKey: string
  setEntries: Dispatch<SetStateAction<LogEntry[]>>
  clearCircuitInputState: () => void
  addSystemEntry: (content: string, timestamp: number) => void
  addErrorEntry: (content: string, timestamp: number) => void
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void
  markCommandPending?: (detail?: string) => void
}

export function handleSessionCommand(options: HandleSessionCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    entries,
    apiBase,
    storageKey,
    setEntries,
    clearCircuitInputState,
    addSystemEntry,
    addErrorEntry,
    setCommandStatus,
    markCommandPending,
  } = options

  switch (cmd) {
    case 'clear':
      stashBeforeClear(entries)
      clearCircuitInputState()
      setEntries([{
        id: `system-${timestamp}`,
        type: 'system',
        content: 'Display cleared. Use /restore to bring back.',
        timestamp,
      }])
      return true

    case 'restore': {
      const stashed = loadBeforeClear()
      if (stashed && stashed.length > 0) {
        setEntries(() => [{
          id: `system-${timestamp}`,
          type: 'system',
          content: 'Restored.',
          timestamp,
        }, ...stashed])
      } else {
        addErrorEntry('Nothing to restore. Use /clear first to stash the display.', timestamp)
      }
      return true
    }

    case 'reset':
      try {
        localStorage.removeItem(storageKey)
        localStorage.removeItem(BEFORE_CLEAR_KEY)
      } catch {
        // best effort
      }
      clearCircuitInputState()
      setEntries([{
        id: `system-${timestamp}`,
        type: 'system',
        content: 'TERMINAL RESET — All history and /restore stash deleted.',
        timestamp,
      }])
      return true

    case 'saveas': {
      const nameArg = args[0]
      if (!nameArg) {
        addErrorEntry('Usage: /saveas <name> [last:N]', timestamp)
        return true
      }

      const lastArg = args.find(a => a.startsWith('last:'))
      let entriesToSave = entries

      if (lastArg) {
        const count = parseInt(lastArg.split(':')[1], 10)
        if (!isNaN(count) && count > 0) {
          entriesToSave = entries.slice(-count)
        }
      }

      const filtered = entriesToSave.filter(e =>
        !(e.type === 'system' && (e.content.includes('INITIALIZED') || e.content.includes('BACKEND CONNECTED')))
      )

      if (filtered.length === 0) {
        addErrorEntry('No entries to save', timestamp)
        return true
      }

      saveSessionAsync(apiBase, nameArg, filtered).then(success => {
        if (success) {
          addSystemEntry(`Session saved as "${nameArg}" (${filtered.length} entries)`, Date.now())
          setCommandStatus?.('done', `saved "${nameArg}"`)
          showSuccessToast(`Saved session "${nameArg}".`, 'Session')
        } else {
          addErrorEntry('Failed to save session', Date.now())
          setCommandStatus?.('failed', 'save failed')
          showErrorToast(`Failed to save "${nameArg}".`, 'Session')
        }
      })
      markCommandPending?.(`saving "${nameArg}"`)
      return true
    }

    case 'sessions': {
      const index = loadSessionsIndexFromLocalStorage()
      const names = Object.keys(index)

      if (names.length === 0) {
        addSystemEntry('No saved sessions.\n\nUse /saveas <name> to save the current session.', timestamp)
      } else {
        const sessionList = names.map(name => {
          const info = index[name]
          const date = new Date(info.savedAt).toLocaleString()
          return `  ${name} (${info.entryCount} entries) - ${date}`
        }).join('\n')

        addSystemEntry(`SAVED SESSIONS:\n\n${sessionList}\n\n/load <name> opens (replaces current).`, timestamp)
      }
      return true
    }

    case 'load': {
      const sessionName = args.join(' ').trim()
      if (!sessionName) {
        addErrorEntry('Usage: /load <name>', timestamp)
        return true
      }

      loadSessionAsync(apiBase, sessionName).then(sessionEntries => {
        const nowTs = Date.now()
        if (sessionEntries) {
          setEntries([
            {
              id: `system-${nowTs}`,
              type: 'system',
              content: `Loaded: ${sessionName} (${sessionEntries.length} entries)`,
              timestamp: nowTs,
            },
            ...sessionEntries,
          ])
          setCommandStatus?.('done', `loaded "${sessionName}"`)
          showSuccessToast(`Loaded "${sessionName}".`, 'Session')
        } else {
          addErrorEntry(`Session "${sessionName}" not found. Use /sessions to list.`, nowTs)
          setCommandStatus?.('failed', `session "${sessionName}" not found`)
          showErrorToast(`Session "${sessionName}" not found.`, 'Session')
        }
      })
      markCommandPending?.(`loading "${sessionName}"`)
      return true
    }

    case 'delete': {
      const sessionToDelete = args.join(' ').trim()
      if (!sessionToDelete) {
        addErrorEntry('Usage: /delete <name>', timestamp)
        return true
      }

      deleteSessionAsync(apiBase, sessionToDelete).then(success => {
        const nowTs = Date.now()
        if (success) {
          addSystemEntry(`Session "${sessionToDelete}" deleted`, nowTs)
          setCommandStatus?.('done', `deleted "${sessionToDelete}"`)
          showInfoToast(`Deleted "${sessionToDelete}".`, 'Session')
        } else {
          addErrorEntry(`Failed to delete session "${sessionToDelete}"`, nowTs)
          setCommandStatus?.('failed', `delete failed for "${sessionToDelete}"`)
          showErrorToast(`Failed to delete "${sessionToDelete}".`, 'Session')
        }
      })
      markCommandPending?.(`deleting "${sessionToDelete}"`)
      return true
    }

    default:
      return false
  }
}
