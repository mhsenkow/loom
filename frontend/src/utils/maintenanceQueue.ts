export interface MaintenanceTask {
  id: string
  title: string
  detail: string
  severity: 'low' | 'medium' | 'high'
  source: 'watchdog' | 'feedback' | 'manual'
  createdAt: number
  updatedAt: number
  status: 'open' | 'done'
}

const QUEUE_KEY = 'loom-maintenance-queue-v1'
const MAX_TASKS = 180

function normalizeTask(input: MaintenanceTask): MaintenanceTask {
  return {
    ...input,
    title: input.title.trim(),
    detail: input.detail.trim(),
  }
}

export function loadMaintenanceQueue(): MaintenanceTask[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as MaintenanceTask[]
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(task => task && typeof task.id === 'string' && typeof task.title === 'string')
      .map(normalizeTask)
      .slice(0, MAX_TASKS)
  } catch {
    return []
  }
}

export function saveMaintenanceQueue(tasks: MaintenanceTask[]): void {
  const sorted = tasks
    .map(normalizeTask)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_TASKS)
  localStorage.setItem(QUEUE_KEY, JSON.stringify(sorted))
}

export function upsertMaintenanceTask(task: Omit<MaintenanceTask, 'id' | 'createdAt' | 'updatedAt' | 'status'>): MaintenanceTask {
  const queue = loadMaintenanceQueue()
  const now = Date.now()
  const key = `${task.source}:${task.title.trim().toLowerCase()}`
  const existing = queue.find(item => `${item.source}:${item.title.trim().toLowerCase()}` === key)

  if (existing) {
    const next: MaintenanceTask = {
      ...existing,
      detail: task.detail.trim(),
      severity: task.severity,
      updatedAt: now,
      status: 'open',
    }
    saveMaintenanceQueue([next, ...queue.filter(item => item.id !== existing.id)])
    return next
  }

  const created: MaintenanceTask = {
    id: `task-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title: task.title.trim(),
    detail: task.detail.trim(),
    severity: task.severity,
    source: task.source,
    createdAt: now,
    updatedAt: now,
    status: 'open',
  }
  saveMaintenanceQueue([created, ...queue])
  return created
}

export function markMaintenanceTaskDone(taskId: string): MaintenanceTask[] {
  const queue: MaintenanceTask[] = loadMaintenanceQueue().map(task => (
    task.id === taskId
      ? { ...task, status: 'done' as const, updatedAt: Date.now() }
      : task
  ))
  saveMaintenanceQueue(queue)
  return queue
}

export function clearMaintenanceQueue(mode: 'open' | 'all' = 'open'): MaintenanceTask[] {
  const queue = loadMaintenanceQueue()
  const next = mode === 'all' ? [] : queue.filter(task => task.status !== 'open')
  saveMaintenanceQueue(next)
  return next
}
