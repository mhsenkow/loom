
import React, { useState, useEffect } from 'react'
import cronstrue from 'cronstrue'
import { CellData } from '../CircuitBoard'

interface CronCellProps {
    module: CellData
    updateModule: (id: string, updates: Partial<CellData>) => void
    isReadOnly?: boolean
}

export const CronCell: React.FC<CronCellProps> = ({ module, updateModule, isReadOnly }) => {
    const [expression, setExpression] = useState(module.content || '')
    const [description, setDescription] = useState('')
    const [error, setError] = useState('')

    useEffect(() => {
        if (!expression) {
            setDescription('Enter a cron expression (e.g. "0 12 * * *")')
            setError('')
            return
        }

        try {
            const desc = cronstrue.toString(expression)
            setDescription(desc)
            setError('')
        } catch (e: any) {
            setDescription('')
            setError('Invalid cron expression')
        }
    }, [expression])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value
        setExpression(newVal)
        updateModule(module.id, { content: newVal })
    }

    return (
        <div className="flex flex-col space-y-2 p-2">
            <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Schedule Trigger
            </div>

            <input
                type="text"
                value={expression}
                onChange={handleChange}
                placeholder="* * * * *"
                className={`bg-zinc-900 border ${error ? 'border-red-500' : 'border-zinc-700'} 
                   text-gray-100 text-sm rounded px-2 py-1 focus:outline-none focus:border-blue-500 font-mono`}
                disabled={isReadOnly}
            />

            <div className={`text-xs ${error ? 'text-red-400' : 'text-blue-400'} h-4`}>
                {error || (description && `Run: ${description}`)}
            </div>

            <div className="text-[10px] text-zinc-500">
                Format: min hour day month day-of-week
            </div>
        </div>
    )
}
