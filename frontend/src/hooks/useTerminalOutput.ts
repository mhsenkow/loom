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
