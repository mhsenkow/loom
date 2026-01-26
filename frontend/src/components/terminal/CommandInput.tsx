import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback, useEffect, useState, useRef } from 'react'

export type ExecContextMode = 'input' | 'key' | 'full'

interface CommandInputProps {
  onSubmit: (content: string, contextMode?: ExecContextMode) => void
  placeholder?: string
}

const CONTEXT_MODES: { mode: ExecContextMode; label: string; icon: string; title: string }[] = [
  { mode: 'input', label: 'This only', icon: '○', title: 'Send just this message' },
  { mode: 'key', label: 'Key context', icon: '◐', title: 'Recent questions + gist of answers' },
  { mode: 'full', label: 'Full context', icon: '●', title: 'Full conversation history' },
]

export function CommandInput({ onSubmit, placeholder }: CommandInputProps) {
  const defaultPlaceholder = 'Enter command or message... (try /help)'
  const [contextMode, setContextMode] = useState<ExecContextMode>('input')
  const [showContextMenu, setShowContextMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  
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

  // Close menu on outside click
  useEffect(() => {
    if (!showContextMenu) return
    const onOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false)
      }
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [showContextMenu])

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
      
      onSubmit(content, contextMode)
      editor.commands.clearContent()
    }
  }, [editor, onSubmit, contextMode])

  useEffect(() => {
    if (!editor) return

    const handleKeyDown = (event: KeyboardEvent) => {
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
      
      // Handle Enter
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSubmit()
      }
    }

    editor.view.dom.addEventListener('keydown', handleKeyDown)
    return () => {
      editor.view.dom.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor, handleSubmit, history, historyIndex])

  const isInputMode = placeholder !== undefined
  const currentModeConfig = CONTEXT_MODES.find(c => c.mode === contextMode) || CONTEXT_MODES[0]

  return (
    <div className={`flex items-start gap-3 bg-slate border p-3 ${
      isInputMode ? 'border-amber-500/50' : 'border-terminal-border'
    }`}>
      <div className={`flex items-center gap-1 font-bold shrink-0 pt-[2px] ${
        isInputMode ? 'text-amber-400' : 'text-phosphor'
      }`}>
        <span className={!isInputMode ? 'prompt-char' : undefined}>{isInputMode ? '?' : ''}</span>
        <span className="terminal-cursor"></span>
      </div>
      
      <div className="flex-1">
        <EditorContent 
          editor={editor} 
          className={isInputMode ? 'text-amber-400' : 'text-phosphor'}
        />
      </div>

      {/* Exec + context dropdown */}
      <div className="flex shrink-0 border border-terminal-border">
        <button
          onClick={handleSubmit}
          className={`text-xs px-3 py-1 border-r border-terminal-border ${
            isInputMode 
              ? 'border-amber-500 text-amber-400 hover:bg-amber-900/20' 
              : 'btn-terminal'
          }`}
          title="Submit (Enter)"
        >
          {isInputMode ? 'NEXT' : 'EXEC'}
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
              className="px-1.5 py-1 text-terminal-muted hover:text-phosphor border-0 border-l border-terminal-border"
              title={`Context: ${currentModeConfig.title}`}
            >
              <span className="text-[10px]">{currentModeConfig.icon}</span>
            </button>
            
            {showContextMenu && (
              <div className="absolute right-0 bottom-full mb-1 bg-slate border border-phosphor shadow-glow py-1 min-w-[140px] z-50">
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
  )
}
