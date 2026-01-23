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
      onSubmit(content, contextMode)
      editor.commands.clearContent()
    }
  }, [editor, onSubmit, contextMode])

  useEffect(() => {
    if (!editor) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handleSubmit()
      }
    }

    editor.view.dom.addEventListener('keydown', handleKeyDown)
    return () => {
      editor.view.dom.removeEventListener('keydown', handleKeyDown)
    }
  }, [editor, handleSubmit])

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
