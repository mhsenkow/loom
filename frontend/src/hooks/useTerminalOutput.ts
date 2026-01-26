import { useCallback, useRef } from 'react'
import type { LogEntry } from '../types/module'

// Structured context from Circuit runs
export interface CircuitContext {
  question: string
  answer: string
  model?: string
  timestamp: number
}

// Simple event-based communication between Circuit and Terminal
type OutputListener = (entry: LogEntry) => void

class TerminalOutputBus {
  private listeners: Set<OutputListener> = new Set()
  
  // Store recent circuit contexts for Terminal AI to reference
  private recentContexts: CircuitContext[] = []
  private readonly maxContexts = 10

  subscribe(listener: OutputListener) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emit(entry: LogEntry) {
    this.listeners.forEach((listener) => listener(entry))
  }

  addContext(context: CircuitContext) {
    this.recentContexts.push(context)
    // Keep only recent contexts
    if (this.recentContexts.length > this.maxContexts) {
      this.recentContexts.shift()
    }
  }

  getRecentContexts(): CircuitContext[] {
    return [...this.recentContexts]
  }

  getContextSummary(): string {
    if (this.recentContexts.length === 0) {
      return ''
    }
    
    const contextLines = this.recentContexts.map((ctx) => {
      const time = new Date(ctx.timestamp).toLocaleTimeString()
      return `[${time}] Q: ${ctx.question}\nA: ${ctx.answer}`
    }).join('\n\n')
    
    return `Recent Circuit Notebook results:\n\n${contextLines}`
  }

  clearContexts() {
    this.recentContexts = []
  }
}

// Singleton instance
export const terminalOutputBus = new TerminalOutputBus()

// Hook for sending to terminal (used by Circuit)
export function useSendToTerminal() {
  const sendToTerminal = useCallback((
    content: string, 
    source: string = 'Circuit',
    context?: { question: string; model?: string }
  ) => {
    // Store context for future AI reference
    if (context?.question) {
      terminalOutputBus.addContext({
        question: context.question,
        answer: content,
        model: context.model,
        timestamp: Date.now(),
      })
    }

    // Format the entry with full context
    const formattedContent = context?.question
      ? `[FROM ${source.toUpperCase()}]\n\nQ: ${context.question}\nA: ${content}`
      : `[FROM ${source.toUpperCase()}]\n${content}`

    const entry: LogEntry = {
      id: `circuit-${Date.now()}`,
      type: 'ai', // Mark as AI type so it renders distinctly
      content: formattedContent,
      timestamp: Date.now(),
      status: 'success',
    }
    terminalOutputBus.emit(entry)
  }, [])

  return sendToTerminal
}

// Hook for receiving from circuit (used by Terminal)
export function useTerminalOutputListener(onReceive: (entry: LogEntry) => void) {
  const callbackRef = useRef(onReceive)
  callbackRef.current = onReceive

  // Subscribe on mount
  const subscribe = useCallback(() => {
    return terminalOutputBus.subscribe((entry) => {
      callbackRef.current(entry)
    })
  }, [])

  return subscribe
}

// Get context summary for AI calls
export function getCircuitContext(): string {
  return terminalOutputBus.getContextSummary()
}

// Query terminal history for circuits
export interface TerminalHistoryQuery {
  types?: LogEntry['type'][]  // Filter by entry types
  search?: string              // Text search in content
  limit?: number               // Max entries to return
  since?: number               // Timestamp: only entries after this
  before?: number              // Timestamp: only entries before this
  sessionName?: string         // Query specific session
}

export function queryTerminalHistory(query: TerminalHistoryQuery = {}): LogEntry[] {
  const STORAGE_KEY = 'loom-terminal-history'
  const SESSIONS_KEY = 'loom-terminal-sessions'
  
  try {
    let entries: LogEntry[] = []
    
    // Load from current session or specific session
    if (query.sessionName) {
      const sessionData = localStorage.getItem(`${SESSIONS_KEY}:${query.sessionName}`)
      if (sessionData) {
        entries = JSON.parse(sessionData)
      }
    } else {
      // Load current session
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        entries = JSON.parse(stored)
      }
    }
    
    // Apply filters
    let filtered = entries
    
    // Filter by type
    if (query.types && query.types.length > 0) {
      filtered = filtered.filter(e => query.types!.includes(e.type))
    }
    
    // Filter by timestamp range
    if (query.since !== undefined) {
      filtered = filtered.filter(e => e.timestamp >= query.since!)
    }
    if (query.before !== undefined) {
      filtered = filtered.filter(e => e.timestamp <= query.before!)
    }
    
    // Text search
    if (query.search) {
      const searchLower = query.search.toLowerCase()
      filtered = filtered.filter(e => 
        e.content.toLowerCase().includes(searchLower)
      )
    }
    
    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp)
    
    // Apply limit
    if (query.limit !== undefined && query.limit > 0) {
      filtered = filtered.slice(0, query.limit)
    }
    
    return filtered
  } catch (e) {
    console.warn('[LOOM] Failed to query terminal history:', e)
    return []
  }
}
