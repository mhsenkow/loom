import type { Edge, Node } from 'reactflow'

export interface LayoutCell {
  id: string
  type: string
  label: string
  content: string
  status: string
  loopBackTo?: number
}

const LAYOUT = { BASE_X: 180, BASE_Y: 60, STEP_X: 420, STEP_Y: 280, BRANCH_OFFSET: 100 }

// Shared edge defaults for forward flow and manual link creation.
export const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: '#33ff00', strokeWidth: 2 },
}

export function getNodePosition(index: number, cells: LayoutCell[]): { x: number; y: number } {
  const prevIsConditional = index > 0 && cells[index - 1].type === 'conditional'
  const col = index % 2
  const x = LAYOUT.BASE_X + col * LAYOUT.STEP_X + (prevIsConditional ? LAYOUT.BRANCH_OFFSET : 0)
  const y = LAYOUT.BASE_Y + index * LAYOUT.STEP_Y
  return { x, y }
}

export function cellsToNodes(cells: LayoutCell[]): Node[] {
  return cells.map((cell, index) => ({
    id: cell.id,
    type: 'module',
    position: getNodePosition(index, cells),
    data: {
      label: cell.label,
      moduleType: cell.type,
      status: cell.status,
      content: cell.content,
    },
  }))
}

export function generateEdges(cells: LayoutCell[]): Edge[] {
  const edges: Edge[] = []

  // Forward edges (sequential flow)
  for (let i = 0; i < cells.length - 1; i++) {
    edges.push({
      id: `e-${cells[i].id}-${cells[i + 1].id}`,
      source: cells[i].id,
      target: cells[i + 1].id,
      ...defaultEdgeOptions,
    })
  }

  // Loop-back edges (from conditional cells with loopBackTo)
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]
    if (cell.type === 'conditional' && cell.loopBackTo && cell.loopBackTo > 0 && cell.loopBackTo <= i + 1) {
      const targetIndex = cell.loopBackTo - 1
      const targetCell = cells[targetIndex]
      if (targetCell) {
        edges.push({
          id: `loopback-${cell.id}-${targetCell.id}`,
          source: cell.id,
          target: targetCell.id,
          type: 'loopback',
          animated: true,
          updatable: true,
          style: { stroke: '#a855f7', strokeWidth: 2, strokeDasharray: '8,4' },
          data: { cellId: cell.id, loopBackTo: cell.loopBackTo },
        })
      }
    }
  }

  return edges
}
