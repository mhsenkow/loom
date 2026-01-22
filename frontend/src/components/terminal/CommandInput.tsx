import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { useCallback, useEffect } from 'react'

interface CommandInputProps {
  onSubmit: (content: string) => void
}

export function CommandInput({ onSubmit }: CommandInputProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features we don't need
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Placeholder.configure({
        placeholder: 'Enter command or message... (try /help)',
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[24px] max-h-[200px] overflow-y-auto',
      },
    },
  })

  const handleSubmit = useCallback(() => {
    if (!editor) return
    
    const content = editor.getText().trim()
    if (content) {
      onSubmit(content)
      editor.commands.clearContent()
    }
  }, [editor, onSubmit])

  // Handle Enter key
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

  return (
    <div className="flex items-start gap-3 bg-slate border border-terminal-border p-3">
      {/* Prompt Symbol */}
      <div className="flex items-center gap-1 text-phosphor font-bold shrink-0 pt-[2px]">
        <span>&gt;</span>
        <span className="terminal-cursor"></span>
      </div>
      
      {/* Editor */}
      <div className="flex-1">
        <EditorContent 
          editor={editor} 
          className="text-phosphor"
        />
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        className="btn-terminal text-xs px-3 py-1 shrink-0"
        title="Submit (Enter)"
      >
        EXEC
      </button>
    </div>
  )
}
