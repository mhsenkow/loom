import type { LogEntry } from '../types/module'
import {
  buildTerminalHistoryQuery,
  formatNoTerminalHistoryResults,
  formatTerminalHistoryEntries,
  formatVectorSearchResults,
} from './circuitExecutionUtils'

describe('buildTerminalHistoryQuery', () => {
  it('parses JSON content and overrides cell config', () => {
    const query = buildTerminalHistoryQuery(
      JSON.stringify({
        search: 'deploy',
        types: ['user', 'ai', 'invalid'],
        limit: 5,
        since: 100,
      }),
      {
        terminalHistorySearch: 'fallback',
        terminalHistoryLimit: 99,
        terminalHistoryTypes: ['system'],
      },
    )

    expect(query).toEqual({
      search: 'deploy',
      types: ['user', 'ai'],
      limit: 5,
      since: 100,
      before: undefined,
      sessionName: undefined,
    })
  })

  it('falls back to plain text search and default limit', () => {
    const query = buildTerminalHistoryQuery('error in checkout', {})

    expect(query.search).toBe('error in checkout')
    expect(query.limit).toBe(20)
  })
})

describe('formatters', () => {
  it('formats terminal history entries with metadata and context block', () => {
    const entries: LogEntry[] = [
      {
        id: '1',
        type: 'user',
        content: 'hello',
        timestamp: 1700000000000,
      },
      {
        id: '2',
        type: 'ai',
        content: 'world',
        timestamp: 1700000001000,
      },
    ]

    const result = formatTerminalHistoryEntries(entries)
    expect(result).toContain('Found 2 terminal history entries')
    expect(result).toContain('[USER]')
    expect(result).toContain('[AI]')
    expect(result).toContain('Full Context:')
  })

  it('formats no-results message including query payload', () => {
    const result = formatNoTerminalHistoryResults({ search: 'x', limit: 3 })
    expect(result).toContain('No terminal history entries found')
    expect(result).toContain('"search": "x"')
  })

  it('formats vector search result list and context', () => {
    const result = formatVectorSearchResults('theme', [
      {
        similarity: 0.91,
        content: 'Theme details',
        metadata: { file_path: 'docs/a.md' },
      },
    ])

    expect(result).toContain("Found 1 results for: 'theme'")
    expect(result).toContain('Similarity: 91.0%')
    expect(result).toContain('docs/a.md')
    expect(result).toContain('Theme details')
  })
})
