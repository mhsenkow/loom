import { useEditor, EditorContent } from '@tiptap/react'
import type { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { DialogModal } from '../shell/DialogModal'

export type ExecContextMode = 'input' | 'key' | 'full'

interface CommandInputProps {
  onSubmit: (command: string, contextMode?: ExecContextMode) => void
  placeholder?: string
  onImageUpload?: (imageBase64: string) => void
  onEditorReady?: (editor: Editor) => void
  codeContextActive?: boolean
  runtimeTelemetry?: {
    active: boolean
    phase: string
    signal: number
    charsPerSec: number
    transportConnected?: boolean
    engineReady?: boolean
    modelName?: string
    ramUsedPercent?: number
  }
}

const CONTEXT_MODES: { mode: ExecContextMode; label: string; icon: string; title: string }[] = [
  { mode: 'input', label: 'This only', icon: '○', title: 'Send just this message' },
  { mode: 'key', label: 'Key context', icon: '◐', title: 'Recent questions + gist of answers' },
  { mode: 'full', label: 'Full context', icon: '●', title: 'Full conversation history' },
]

interface SlashCommandSuggestion {
  command: string
  description: string
}

const SLASH_COMMAND_SUGGESTIONS: SlashCommandSuggestion[] = [
  { command: 'help', description: 'Show all commands' },
  { command: 'crt', description: 'CRT: on/off/subtle/medium/full/insane/burst' },
  { command: 'glitch', description: 'Trigger a one-shot CRT glitch burst' },
  { command: 'status', description: 'Show backend/model status' },
  { command: 'model', description: 'Set chat model' },
  { command: 'vision', description: 'Set vision model' },
  { command: 'gen', description: 'Set image generation model' },
  { command: 'models', description: 'List available models' },
  { command: 'pull', description: 'Download a model' },
  { command: 'setup-models', description: 'Install baseline model stack' },
  { command: 'quick', description: 'Low-priority question on free/cheap cloud lane' },
  { command: 'qdc', description: 'QDC remote jobs: status|jobs|run' },
  { command: 'suggest', description: 'Get model suggestions' },
  { command: 'image', description: 'Open image upload' },
  { command: 'imagine', description: 'Generate image' },
  { command: 'dream', description: 'Alias for imagine' },
  { command: 'image-models', description: 'List image models' },
  { command: 'pull-image', description: 'Prepare image model' },
  { command: 'set-hf-token', description: 'Save HuggingFace token' },
  { command: 'circuits', description: 'List circuits' },
  { command: 'run', description: 'Run a circuit by name' },
  { command: 'saveas', description: 'Save current session' },
  { command: 'sessions', description: 'List saved sessions' },
  { command: 'load', description: 'Load a session' },
  { command: 'delete', description: 'Delete a session' },
  { command: 'clear', description: 'Clear terminal display' },
  { command: 'restore', description: 'Restore after clear' },
  { command: 'reset', description: 'Hard reset terminal history' },
  { command: 'ai', description: 'Send prompt directly to AI' },
  { command: 'song', description: 'Open quick music generation' },
  { command: 'compose', description: 'Show compose guidance' },
  { command: 'music-setup', description: 'Open music setup panel' },
  { command: 'visit', description: 'Open and inspect webpage' },
  { command: 'research', description: 'Run deep web research' },
  { command: 'click', description: 'Click element on webpage' },
  { command: 'type', description: 'Type into webpage element' },
  { command: 'scroll', description: 'Scroll webpage' },
  { command: 'back', description: 'Navigate webpage back' },
]

const MAX_COMMAND_SUGGESTIONS = 8

export function CommandInput({
  onSubmit,
  placeholder,
  onImageUpload,
  onEditorReady,
  codeContextActive = false,
  runtimeTelemetry,
}: CommandInputProps) {
  const defaultPlaceholder = 'Enter command or message... (try /help)'
  const isInputMode = placeholder !== undefined
  const [contextMode, setContextMode] = useState<ExecContextMode>('full')
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [showContextTooltip, setShowContextTooltip] = useState(false)
  const [commandQuery, setCommandQuery] = useState('')
  const [showCommandMenu, setShowCommandMenu] = useState(false)
  const [selectedCommandIndex, setSelectedCommandIndex] = useState(0)
  const [dialogMessage, setDialogMessage] = useState<string | null>(null)
  const [showMetaTooltip, setShowMetaTooltip] = useState(false)
  const [isEditorFocused, setIsEditorFocused] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const commandMenuRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const didInitialFocusRef = useRef(false)
  
  // Terminal history
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const currentInputRef = useRef<string>('')
  
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: placeholder || defaultPlaceholder,
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[24px] max-h-[200px] overflow-y-auto',
      },
    },
  }, [placeholder])

  // Expose editor to parent when ready
  useEffect(() => {
    if (editor && onEditorReady) {
      onEditorReady(editor)
    }
  }, [editor, onEditorReady])

  useEffect(() => {
    if (!editor || isInputMode || didInitialFocusRef.current) return
    didInitialFocusRef.current = true
    requestAnimationFrame(() => {
      editor.commands.focus('end')
    })
  }, [editor, isInputMode])

  useEffect(() => {
    if (!editor) return
    const handleUpdate = () => {
      setCommandQuery(editor.getText())
    }
    handleUpdate()
    editor.on('update', handleUpdate)
    return () => {
      editor.off('update', handleUpdate)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) return
    const syncFocusState = () => {
      setIsEditorFocused(editor.isFocused)
    }

    syncFocusState()
    editor.on('focus', syncFocusState)
    editor.on('blur', syncFocusState)
    return () => {
      editor.off('focus', syncFocusState)
      editor.off('blur', syncFocusState)
    }
  }, [editor])

  const filteredCommandSuggestions = useMemo(() => {
    if (isInputMode) return []
    const trimmed = commandQuery.trimStart()
    if (!trimmed.startsWith('/')) return []
    const afterSlash = trimmed.slice(1)
    if (afterSlash.includes(' ')) return []
    const query = afterSlash.toLowerCase()
    return SLASH_COMMAND_SUGGESTIONS
      .filter(item => item.command.startsWith(query))
      .slice(0, MAX_COMMAND_SUGGESTIONS)
  }, [commandQuery, isInputMode])

  useEffect(() => {
    if (filteredCommandSuggestions.length === 0 || isInputMode) {
      setShowCommandMenu(false)
      setSelectedCommandIndex(0)
      return
    }
    setShowCommandMenu(true)
    setSelectedCommandIndex(0)
  }, [filteredCommandSuggestions, isInputMode])

  // Close menu on outside click
  useEffect(() => {
    if (!showContextMenu && !showCommandMenu) return
    const onOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const isContextMenuClick = menuRef.current?.contains(target) ?? false
      const isCommandMenuClick = commandMenuRef.current?.contains(target) ?? false
      if (!isContextMenuClick && !isCommandMenuClick) {
        setShowContextMenu(false)
        setShowCommandMenu(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [showContextMenu, showCommandMenu])

  const applyCommandSuggestion = useCallback((suggestion: SlashCommandSuggestion) => {
    if (!editor) return
    const nextValue = `/${suggestion.command} `
    editor.commands.setContent(nextValue)
    editor.commands.focus('end')
    setCommandQuery(nextValue)
    setShowCommandMenu(false)
    setSelectedCommandIndex(0)
  }, [editor])

  const handleSubmit = useCallback(() => {
    if (!editor) return
    
    const content = editor.getText().trim()
    if (content) {
      // Add to history (avoid duplicates, keep last 100)
      setHistory(prev => {
        const newHistory = [content, ...prev.filter(h => h !== content)].slice(0, 100)
        return newHistory
      })
      setHistoryIndex(-1)
      currentInputRef.current = ''
      setShowCommandMenu(false)
      setSelectedCommandIndex(0)
      
      onSubmit(content, contextMode)
      editor.commands.clearContent()
    }
  }, [editor, onSubmit, contextMode])

  useEffect(() => {
    if (!editor) return

    const handleKeyDown = (event: KeyboardEvent) => {
      const hasCommandSuggestions = !isInputMode && showCommandMenu && filteredCommandSuggestions.length > 0

      if (hasCommandSuggestions) {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelectedCommandIndex(prev => Math.min(prev + 1, filteredCommandSuggestions.length - 1))
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelectedCommandIndex(prev => Math.max(prev - 1, 0))
          return
        }
        if (event.key === 'Tab') {
          event.preventDefault()
          const suggestion = filteredCommandSuggestions[selectedCommandIndex]
          if (suggestion) {
            applyCommandSuggestion(suggestion)
          }
          return
        }
      }

      // Handle history navigation
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (history.length === 0) return
        
        event.preventDefault()
        
        let newIndex = historyIndex
        
        if (event.key === 'ArrowUp') {
          // Save current input if we're at the bottom
          if (historyIndex === -1) {
            currentInputRef.current = editor.getText()
          }
          // Move up in history
          newIndex = historyIndex === -1 
            ? 0 
            : Math.min(historyIndex + 1, history.length - 1)
        } else if (event.key === 'ArrowDown') {
          // Move down in history
          if (historyIndex === -1) return // Already at bottom
          newIndex = historyIndex - 1
          if (newIndex < 0) {
            // Restore original input
            newIndex = -1
            editor.commands.setContent(currentInputRef.current)
            setHistoryIndex(-1)
            return
          }
        }
        
        setHistoryIndex(newIndex)
        if (newIndex >= 0) {
          editor.commands.setContent(history[newIndex])
        }
        return
      }
      
      // Reset history index when user types (but not for navigation keys)
      if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', 'Escape'].includes(event.key)) {
        if (historyIndex !== -1) {
          setHistoryIndex(-1)
          currentInputRef.current = editor.getText()
        }
      }
      
      // Submit on Shift+Enter; plain Enter inserts a newline
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault()
        handleSubmit()
      }
    }

    // Capture phase ensures Shift+Enter is handled before TipTap/ProseMirror keymaps consume it.
    const listenerOptions: AddEventListenerOptions = { capture: true }
    editor.view.dom.addEventListener('keydown', handleKeyDown, listenerOptions)
    return () => {
      editor.view.dom.removeEventListener('keydown', handleKeyDown, listenerOptions)
    }
  }, [editor, handleSubmit, history, historyIndex, filteredCommandSuggestions, selectedCommandIndex, showCommandMenu, applyCommandSuggestion, isInputMode])

  const processImageFile = useCallback((file: File, source: 'upload' | 'paste') => {
    if (!file.type.startsWith('image/')) {
      setDialogMessage(source === 'paste' ? 'Clipboard content is not an image.' : 'Please select an image file.')
      return
    }

    const reader = new FileReader()
    reader.onload = (e) => {
      const base64 = e.target?.result as string
      if (base64 && onImageUpload) {
        onImageUpload(base64)
      } else {
        setDialogMessage('Image pipeline is unavailable right now.')
      }
    }
    reader.onerror = () => {
      setDialogMessage(source === 'paste'
        ? 'Failed to read pasted image. Try copying it again.'
        : 'Failed to read image file. Try a different image or re-open the picker.')
    }
    reader.readAsDataURL(file)
  }, [onImageUpload])

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    processImageFile(file, 'upload')

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [processImageFile])

  useEffect(() => {
    if (!editor || !onImageUpload || isInputMode) return

    const handlePaste = (event: ClipboardEvent) => {
      const clipboard = event.clipboardData
      if (!clipboard) return

      const imageFromItems = Array.from(clipboard.items || [])
        .find(item => item.type.startsWith('image/'))
      const imageFile = imageFromItems?.getAsFile()
        || Array.from(clipboard.files || []).find(file => file.type.startsWith('image/'))

      if (!imageFile) return

      event.preventDefault()
      processImageFile(imageFile, 'paste')
    }

    editor.view.dom.addEventListener('paste', handlePaste)
    return () => {
      editor.view.dom.removeEventListener('paste', handlePaste)
    }
  }, [editor, onImageUpload, isInputMode, processImageFile])

  const handleImageButtonClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const currentModeConfig = CONTEXT_MODES.find(c => c.mode === contextMode) || CONTEXT_MODES[0]
  const runtimeActive = !!runtimeTelemetry?.active
  const runtimePhase = (runtimeTelemetry?.phase || 'Idle').trim()
  const runtimeCharsPerSec = Math.max(0, Math.round(runtimeTelemetry?.charsPerSec ?? 0))
  const runtimeTransportConnected = runtimeTelemetry?.transportConnected ?? false
  const runtimeEngineReady = runtimeTelemetry?.engineReady ?? false
  const runtimeModelName = (runtimeTelemetry?.modelName || '').trim()
  const runtimeRamUsedPercent = typeof runtimeTelemetry?.ramUsedPercent === 'number'
    ? Math.max(0, Math.min(100, runtimeTelemetry.ramUsedPercent))
    : null
  const contextDotTone = contextMode === 'full' ? 'text-phosphor' : contextMode === 'key' ? 'text-amber-300' : 'text-terminal-muted'
  const contextModeDescription = currentModeConfig.title

  return (
    <div className={`command-input-shell flex flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-3 p-3 ${
      isInputMode ? 'border-amber-500/50' : 'border-terminal-border'
    }`}>
      {!isInputMode && onImageUpload && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={handleImageButtonClick}
            tabIndex={-1}
            className="command-input-tool min-h-11 min-w-11 text-terminal-muted hover:text-phosphor text-xs px-2 py-1 border border-terminal-border focus:outline-none focus:border-phosphor"
            title="Upload image for analysis"
            aria-label="Upload image for analysis"
          >
            📷
          </button>
        </>
      )}

      <div className={`flex items-center gap-1 font-bold shrink-0 pt-[2px] ${
        isInputMode ? 'text-amber-400' : 'text-phosphor'
      }`}>
        <span className={!isInputMode ? 'prompt-char' : undefined}>{isInputMode ? '?' : ''}</span>
        <span className={`terminal-cursor ${isEditorFocused ? 'is-active' : 'is-idle'}`}></span>
      </div>
      
      <div className="command-input-editor-pane flex-1 min-w-0 relative">
        <EditorContent 
          editor={editor} 
          className={isInputMode ? 'text-amber-400' : 'text-phosphor'}
        />
        {codeContextActive && !isInputMode && (
          <div className="absolute top-0 right-2 text-[8px] text-phosphor/50 font-mono pointer-events-none">
            [CODE CONTEXT]
          </div>
        )}
        {showCommandMenu && !isInputMode && filteredCommandSuggestions.length > 0 && (
          <div ref={commandMenuRef} className="absolute left-0 right-0 top-full mt-2 bg-slate border border-terminal-border shadow-glow z-40">
            <div className="px-2 py-1 text-[9px] text-terminal-muted border-b border-terminal-border">
              Commands (Tab to complete)
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filteredCommandSuggestions.map((item, idx) => (
                <button
                  key={item.command}
                  type="button"
                  onClick={() => applyCommandSuggestion(item)}
                  className={`w-full text-left px-2 py-1.5 font-mono text-[10px] transition-colors ${
                    idx === selectedCommandIndex
                      ? 'bg-phosphor/15 text-phosphor'
                      : 'text-terminal-muted hover:text-phosphor hover:bg-void/60'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-phosphor">/{item.command}</span>
                    <span className="text-terminal-muted text-[9px]">{item.description}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="ml-auto flex w-full sm:w-auto flex-col items-end gap-1.5">
        <div className="flex items-center justify-end gap-2 w-full sm:w-auto">
          {/* Exec + context dropdown */}
          <div className="command-input-controls flex shrink-0 border border-terminal-border">
            <button
              onClick={handleSubmit}
              className={`command-input-run text-xs min-h-11 px-3 py-1 border-r border-terminal-border ${
                isInputMode
                  ? 'border-amber-500 text-amber-400 hover:bg-amber-900/20'
                  : 'btn-terminal'
              }`}
              title="Submit (Shift+Enter)"
              aria-label={isInputMode ? 'Submit input' : 'Run command'}
            >
              {isInputMode ? 'Next' : 'Run'}
            </button>

            {/* Context mode dropdown - only when not in circuit input mode */}
            {!isInputMode && (
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowContextMenu(v => !v)
                  }}
                  className="command-input-context-dot min-h-11 px-3 py-1 text-terminal-muted hover:text-phosphor border-0 border-l border-terminal-border focus:outline-none focus:text-phosphor flex items-center justify-center"
                  title={`Context mode: ${contextModeDescription}`}
                  aria-label={`Context mode ${currentModeConfig.label}`}
                  onMouseEnter={() => setShowContextTooltip(true)}
                  onMouseLeave={() => setShowContextTooltip(false)}
                  onFocus={() => setShowContextTooltip(true)}
                  onBlur={() => setShowContextTooltip(false)}
                >
                  <span
                    className={`text-[11px] ${contextDotTone}`}
                    aria-hidden
                    style={runtimeActive ? { textShadow: '0 0 6px var(--theme-phosphor)' } : undefined}
                  >
                    ●
                  </span>
                </button>
                {showContextTooltip && (
                  <div className="absolute right-0 bottom-full mb-2 w-56 border border-terminal-border bg-void/95 backdrop-blur px-3 py-2 text-[9px] font-mono text-terminal-muted z-50 shadow-glow">
                    <div className="text-phosphor uppercase tracking-widest mb-1">Context</div>
                    <div className="text-phosphor/85">{currentModeConfig.label}</div>
                    <div className="mt-1">{contextModeDescription}</div>
                    <div className="mt-2 text-terminal-muted/80">Click the dot to change mode.</div>
                  </div>
                )}

                {showContextMenu && (
                  <div className="absolute right-0 bottom-full mb-1 bg-slate border border-phosphor shadow-glow py-1 min-w-[152px] z-50">
                    {CONTEXT_MODES.map(({ mode, label, icon, title }) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setContextMode(mode)
                          setShowContextMenu(false)
                        }}
                        className={`w-full text-left px-3 py-1.5 text-[10px] flex items-center gap-2 ${
                          contextMode === mode ? 'text-phosphor bg-void' : 'text-terminal-muted hover:text-phosphor'
                        }`}
                        title={title}
                      >
                        <span>{icon}</span>
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {!isInputMode && (
          <div className="w-full sm:w-auto flex justify-end">
            <div
              className="relative"
              onMouseEnter={() => setShowMetaTooltip(true)}
              onMouseLeave={() => setShowMetaTooltip(false)}
            >
              <button
                type="button"
                className="command-input-runtime text-[9px] font-mono tracking-wide text-terminal-muted hover:text-phosphor border border-terminal-border px-2 py-1 flex items-center justify-center"
                title="Runtime + keybind help"
                aria-label="Show runtime details and keyboard hints"
                onFocus={() => setShowMetaTooltip(true)}
                onBlur={() => setShowMetaTooltip(false)}
              >
                <span className={runtimeActive ? 'text-phosphor' : 'text-terminal-muted'}>◉</span>
              </button>
              {showMetaTooltip && (
                <div className="absolute right-0 bottom-full mb-2 w-64 border border-terminal-border bg-void/95 backdrop-blur px-3 py-2 text-[9px] font-mono text-terminal-muted z-50 shadow-glow">
                  <div className="text-phosphor uppercase tracking-widest mb-1">Runtime</div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Link</span>
                    <span className={runtimeTransportConnected ? 'text-phosphor' : 'text-terminal-muted'}>
                      {runtimeTransportConnected ? 'UP' : 'DOWN'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Engine</span>
                    <span className={runtimeEngineReady ? 'text-phosphor' : 'text-terminal-muted'}>
                      {runtimeEngineReady ? 'READY' : 'STANDBY'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Phase</span>
                    <span className="text-phosphor/80 truncate max-w-[10rem]" title={runtimePhase}>{runtimePhase}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>Rate</span>
                    <span>{runtimeCharsPerSec > 0 ? `${runtimeCharsPerSec} c/s` : '0 c/s'}</span>
                  </div>
                  {runtimeModelName && (
                    <div className="flex items-center justify-between gap-2">
                      <span>Model</span>
                      <span className="text-phosphor/75 truncate max-w-[10rem]" title={runtimeModelName}>
                        {runtimeModelName}
                      </span>
                    </div>
                  )}
                  {runtimeRamUsedPercent !== null && (
                    <div className="flex items-center justify-between gap-2">
                      <span>RAM</span>
                      <span>{Math.round(runtimeRamUsedPercent)}%</span>
                    </div>
                  )}
                  <div className="border-t border-terminal-border/70 mt-2 pt-2">
                    <div className="text-phosphor uppercase tracking-widest mb-1">Keys</div>
                    <div>Shift+Enter run</div>
                    <div>Enter newline</div>
                    <div>Tab complete command</div>
                    <div>Cmd/Ctrl+V paste image</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <DialogModal
        isOpen={!!dialogMessage}
        title="Image Upload"
        message={dialogMessage || ''}
        confirmLabel="OK"
        hideCancel
        onConfirm={() => setDialogMessage(null)}
        onCancel={() => setDialogMessage(null)}
      />
    </div>
  )
}
