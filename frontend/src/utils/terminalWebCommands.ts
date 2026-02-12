import type { Dispatch, SetStateAction } from 'react'
import type { LogEntry } from '../types/module'

interface WebInteractionResponse {
  status: string
  error?: string
  title?: string
  text_content?: string
  vision_analysis?: string
  screenshot_url?: string
  url?: string
}

interface ResearchSource {
  title?: string
  url?: string
  text_content?: string
}

interface WebResearchResponse {
  status: string
  error?: string
  source_count?: number
  sources?: ResearchSource[]
}

interface HandleWebCommandOptions {
  cmd: string
  args: string[]
  timestamp: number
  apiBase: string
  setEntries: Dispatch<SetStateAction<LogEntry[]>>
  addSystemEntry: (content: string, timestamp: number) => void
  addErrorEntry: (content: string, timestamp: number) => void
  handleAIRequest: (prompt: string, timestamp: number, contextMode?: 'input' | 'key' | 'full') => void
  setCommandStatus?: (state: 'working' | 'done' | 'failed', detail?: string) => void
  markCommandPending?: (detail?: string) => void
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message
  return String(error)
}

function handleWebInteractionResponse(
  data: WebInteractionResponse,
  ts: number,
  setEntries: Dispatch<SetStateAction<LogEntry[]>>,
  addErrorEntry: (content: string, timestamp: number) => void,
  handleAIRequest: (prompt: string, timestamp: number, contextMode?: 'input' | 'key' | 'full') => void,
) {
  if (data.status !== 'success') {
    addErrorEntry(`Interaction failed: ${data.error || 'Unknown error'}`, ts)
    return false
  }

  const title = data.title || 'Untitled page'
  const pageText = data.text_content || ''
  const pageUrl = data.url || 'unknown-url'
  let displayContent = `WEB INTERACTION: ${title}\n\n${pageText}`
  if (data.vision_analysis) {
    displayContent += `\n\n---\n🖼️ VISUAL ANALYSIS:\n${data.vision_analysis}`
  }

  setEntries(prev => [...prev, {
    id: `web-${ts}`,
    type: 'system',
    content: displayContent,
    imageUrl: data.screenshot_url,
    timestamp: ts,
  }])

  let aiContext = `Here is the current state of the page "${title}" (${pageUrl}):\n\n${pageText}`
  if (data.vision_analysis) {
    aiContext += `\n\nVisual observations:\n${data.vision_analysis}`
  }
  aiContext += '\n\nPlease summarize the result of the interaction.'
  handleAIRequest(aiContext, ts + 1)
  return true
}

export function handleWebCommand(options: HandleWebCommandOptions): boolean {
  const {
    cmd,
    args,
    timestamp,
    apiBase,
    setEntries,
    addSystemEntry,
    addErrorEntry,
    handleAIRequest,
    setCommandStatus,
    markCommandPending,
  } = options

  switch (cmd) {
    case 'visit': {
      const fullArg = args.join(' ').trim()
      if (!fullArg) {
        addErrorEntry('Usage: /visit <url>', timestamp)
        return true
      }

      let targetUrl = ''
      const urlMatch = fullArg.match(/(https?:\/\/[^\s]+)/)
      if (urlMatch) {
        targetUrl = urlMatch[0]
      } else {
        targetUrl = args[0]
        if (!targetUrl.startsWith('http')) {
          targetUrl = `https://${targetUrl}`
        }
      }

      const visitId = `visit-${timestamp}`
      setEntries(prev => [...prev, {
        id: visitId,
        type: 'system',
        content: `Visiting ${targetUrl} (headless)...`,
        timestamp,
        status: 'running',
      }])

      fetch(`${apiBase}/api/web/visit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      })
        .then(res => res.json() as Promise<WebInteractionResponse>)
        .then(data => {
          setEntries(prev => prev.map(e => e.id === visitId ? { ...e, status: 'success' } : e))
          const success = handleWebInteractionResponse(data, Date.now(), setEntries, addErrorEntry, handleAIRequest)
          if (success) {
            setCommandStatus?.('done', `visited ${targetUrl}`)
          } else {
            setCommandStatus?.('failed', `visit failed for ${targetUrl}`)
          }
        })
        .catch((e: unknown) => {
          setEntries(prev => prev.map(entry => entry.id === visitId ? { ...entry, status: 'error' } : entry))
          addErrorEntry(`Visit failed: ${getErrorMessage(e)}`, Date.now())
          setCommandStatus?.('failed', 'visit request failed')
        })
      markCommandPending?.(`visiting ${targetUrl}`)
      return true
    }

    case 'research': {
      const query = args.join(' ').trim()
      if (!query) {
        addErrorEntry('Usage: /research <query>', timestamp)
        return true
      }

      const researchId = `research-${timestamp}`
      setEntries(prev => [...prev, {
        id: researchId,
        type: 'system',
        content: `🔍 Deep searching: "${query}"...`,
        timestamp,
        status: 'running',
      }])

      fetch(`${apiBase}/api/web/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, max_results: 3 }),
      })
        .then(res => res.json() as Promise<WebResearchResponse>)
        .then(data => {
          setEntries(prev => prev.map(e => e.id === researchId ? { ...e, status: 'success' } : e))
          const nowTs = Date.now()
          if (data.status === 'success' && data.sources && data.sources.length > 0) {
            const sourceContents = data.sources.map((s, i) =>
              `[Source ${i + 1}: ${s.title}](${s.url})\n${(s.text_content || '').slice(0, 1500)}`
            )
            const sourceCount = data.source_count ?? data.sources.length

            setEntries(prev => [...prev, {
              id: `research-${nowTs}`,
              type: 'system',
              content: `RESEARCH COMPLETE: ${sourceCount} sources found.\n\nSynthesizing answer...`,
              timestamp: nowTs,
            }])

            const synthesisPrompt = `You have been given research from ${sourceCount} sources about "${query}". Please synthesize a comprehensive answer based on these sources:\n\n${sourceContents.join('\n\n---\n\n')}\n\nProvide a well-structured synthesis that answers the query, citing sources where appropriate.`
            handleAIRequest(synthesisPrompt, nowTs + 1)
            setCommandStatus?.('done', `researched "${query}"`)
          } else {
            addErrorEntry(`Research failed: ${data.error || 'Unknown error'}`, nowTs)
            setCommandStatus?.('failed', `research failed for "${query}"`)
          }
        })
        .catch((e: unknown) => {
          setEntries(prev => prev.map(entry => entry.id === researchId ? { ...entry, status: 'error' } : entry))
          addErrorEntry(`Research request failed: ${getErrorMessage(e)}`, Date.now())
          setCommandStatus?.('failed', 'research request failed')
        })
      markCommandPending?.(`researching "${query}"`)
      return true
    }

    case 'click': {
      const query = args.join(' ').trim()
      if (!query) {
        addErrorEntry('Usage: /click <text or button name>', timestamp)
        return true
      }

      const clickId = `click-${timestamp}`
      setEntries(prev => [...prev, {
        id: clickId,
        type: 'system',
        content: `🖱️ Clicking "${query}"...`,
        timestamp,
        status: 'running',
      }])

      fetch(`${apiBase}/api/web/click`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
        .then(res => res.json() as Promise<WebInteractionResponse>)
        .then(data => {
          setEntries(prev => prev.map(e => e.id === clickId ? { ...e, status: 'success' } : e))
          const success = handleWebInteractionResponse(data, timestamp, setEntries, addErrorEntry, handleAIRequest)
          if (success) {
            setCommandStatus?.('done', `clicked "${query}"`)
          } else {
            setCommandStatus?.('failed', `click failed for "${query}"`)
          }
        })
        .catch((e: unknown) => {
          setEntries(prev => prev.map(entry => entry.id === clickId ? { ...entry, status: 'error' } : entry))
          addErrorEntry(`Click failed: ${getErrorMessage(e)}`, Date.now())
          setCommandStatus?.('failed', 'click request failed')
        })
      markCommandPending?.(`clicking "${query}"`)
      return true
    }

    case 'type': {
      if (args.length < 2) {
        addErrorEntry('Usage: /type <element> <text>', timestamp)
        return true
      }
      const query = args[0]
      const text = args.slice(1).join(' ')

      addSystemEntry(`⌨️ Typing "${text}" into "${query}"...`, timestamp)
      fetch(`${apiBase}/api/web/type`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, text }),
      })
        .then(res => res.json() as Promise<WebInteractionResponse>)
        .then(data => {
          const success = handleWebInteractionResponse(data, timestamp, setEntries, addErrorEntry, handleAIRequest)
          if (success) {
            setCommandStatus?.('done', `typed into "${query}"`)
          } else {
            setCommandStatus?.('failed', `type failed for "${query}"`)
          }
        })
        .catch((e: unknown) => {
          addErrorEntry(`Type failed: ${getErrorMessage(e)}`, Date.now())
          setCommandStatus?.('failed', 'type request failed')
        })
      markCommandPending?.(`typing into "${query}"`)
      return true
    }

    case 'scroll': {
      const direction = args[0] === 'up' ? 'up' : 'down'
      addSystemEntry(`📜 Scrolling ${direction}...`, timestamp)
      fetch(`${apiBase}/api/web/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction }),
      })
        .then(res => res.json() as Promise<WebInteractionResponse>)
        .then(data => {
          const success = handleWebInteractionResponse(data, timestamp, setEntries, addErrorEntry, handleAIRequest)
          if (success) {
            setCommandStatus?.('done', `scrolled ${direction}`)
          } else {
            setCommandStatus?.('failed', `scroll ${direction} failed`)
          }
        })
        .catch((e: unknown) => {
          addErrorEntry(`Scroll failed: ${getErrorMessage(e)}`, Date.now())
          setCommandStatus?.('failed', 'scroll request failed')
        })
      markCommandPending?.(`scrolling ${direction}`)
      return true
    }

    case 'back':
      addSystemEntry('🔙 Going back...', timestamp)
      fetch(`${apiBase}/api/web/back`, { method: 'POST' })
        .then(res => res.json() as Promise<WebInteractionResponse>)
        .then(data => {
          const success = handleWebInteractionResponse(data, timestamp, setEntries, addErrorEntry, handleAIRequest)
          if (success) {
            setCommandStatus?.('done', 'navigated back')
          } else {
            setCommandStatus?.('failed', 'back navigation failed')
          }
        })
        .catch((e: unknown) => {
          addErrorEntry(`Back failed: ${getErrorMessage(e)}`, Date.now())
          setCommandStatus?.('failed', 'back request failed')
        })
      markCommandPending?.('navigating back')
      return true

    default:
      return false
  }
}
