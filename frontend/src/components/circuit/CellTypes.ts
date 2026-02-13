import { ModuleType } from '../../types/module'

export interface CellTypeConfig {
    type: ModuleType
    label: string
    icon: string
    description: string
    category: 'Code' | 'Text' | 'Input' | 'Output' | 'Logic' | 'Data' | 'System'
}

export const CELL_TYPES: CellTypeConfig[] = [
    // Logic & Flow
    {
        type: 'conditional',
        label: 'Gate / Condition',
        icon: '⚖️',
        description: 'Logic gate and conditional routing',
        category: 'Logic'
    },
    {
        type: 'delay',
        label: 'Delay',
        icon: '⏳',
        description: 'Pause execution for N seconds',
        category: 'Logic'
    },
    {
        type: 'human_approval',
        label: 'Human Approval',
        icon: '🛑',
        description: 'Wait for user approval',
        category: 'Logic'
    },

    // System / Agent
    {
        type: 'shell_exec',
        label: 'Shell Command',
        icon: '💻',
        description: 'Execute local shell command',
        category: 'System'
    },
    {
        type: 'file_write',
        label: 'File Write',
        icon: '💾',
        description: 'Write text to file',
        category: 'System'
    },
    {
        type: 'notification',
        label: 'Notification',
        icon: '🔔',
        description: 'Send desktop notification',
        category: 'System'
    },
    {
        type: 'cron_trigger',
        label: 'Cron Schedule',
        icon: '⏰',
        description: 'Trigger circuit on schedule',
        category: 'System'
    },

    // Input
    {
        type: 'data_input',
        label: 'Manual Input',
        icon: '⌨️',
        description: 'Manual text input block',
        category: 'Input'
    },
    {
        type: 'data_loader',
        label: 'File / Data',
        icon: '📁',
        description: 'Load data from files or paths',
        category: 'Input'
    },
    {
        type: 'web_fetch',
        label: 'Web Fetch',
        icon: '🌐',
        description: 'Fetch content from URL',
        category: 'Input'
    },

    // Code / Logic
    {
        type: 'ai_processor',
        label: 'AI Processor',
        icon: '🤖',
        description: 'Process text with LLMs',
        category: 'Code'
    },
    {
        type: 'script_execution',
        label: 'Python / Code',
        icon: '🐍',
        description: 'Execute Python or JavaScript',
        category: 'Code'
    },

    // Data / Visual
    {
        type: 'image_gen',
        label: 'Image Gen',
        icon: '🎨',
        description: 'Generate images from text',
        category: 'Output'
    },
    {
        type: 'music_gen',
        label: 'Music Gen',
        icon: '🎵',
        description: 'Generate music and audio',
        category: 'Output'
    },
    {
        type: 'qdc_upload',
        label: 'QDC Upload',
        icon: '📡',
        description: 'Upload artifact to QDC lane',
        category: 'Data'
    },
    {
        type: 'qdc_run',
        label: 'QDC Run',
        icon: '🚀',
        description: 'Start async QDC remote job',
        category: 'Code'
    },
    {
        type: 'qdc_status',
        label: 'QDC Status',
        icon: '🛰️',
        description: 'Check remote QDC job status',
        category: 'Data'
    },
    {
        type: 'qdc_results',
        label: 'QDC Results',
        icon: '📥',
        description: 'Fetch QDC job results',
        category: 'Output'
    },

    // Knowledge
    {
        type: 'vector_search',
        label: 'Vector Search',
        icon: '🔍',
        description: 'Semantic search in knowledge base',
        category: 'Data'
    },
    {
        type: 'vector_index',
        label: 'Vector Index',
        icon: '📚',
        description: 'Index content for searching',
        category: 'Data'
    },
    {
        type: 'terminal_history',
        label: 'History',
        icon: '🕘',
        description: 'Access terminal history',
        category: 'Data'
    },

    // Text / Note
    {
        type: 'markdown',
        label: 'Note / Markdown',
        icon: '📝',
        description: 'Rich text notes',
        category: 'Text'
    },

    // Output
    {
        type: 'log_entry',
        label: 'Output',
        icon: '📤',
        description: 'Display output or log entry',
        category: 'Output'
    }
]
