import {
  clearMaintenanceQueue,
  loadMaintenanceQueue,
  markMaintenanceTaskDone,
  upsertMaintenanceTask,
} from './maintenanceQueue'

describe('maintenanceQueue', () => {
  beforeEach(() => {
    let store: Record<string, string> = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => {
          store[key] = value
        },
        removeItem: (key: string) => {
          delete store[key]
        },
        clear: () => {
          store = {}
        },
      },
      configurable: true,
    })
  })

  it('upserts by title/source and marks done', () => {
    const first = upsertMaintenanceTask({
      title: 'Backend health',
      detail: 'Investigate reconnect errors',
      severity: 'high',
      source: 'watchdog',
    })
    const second = upsertMaintenanceTask({
      title: 'Backend health',
      detail: 'Investigate reconnect errors again',
      severity: 'medium',
      source: 'watchdog',
    })

    expect(first.id).toBe(second.id)
    const list = loadMaintenanceQueue()
    expect(list.length).toBe(1)
    expect(list[0].detail).toContain('again')

    const afterDone = markMaintenanceTaskDone(second.id)
    expect(afterDone[0].status).toBe('done')
  })

  it('clears open tasks only', () => {
    const one = upsertMaintenanceTask({
      title: 'Task A',
      detail: 'A',
      severity: 'low',
      source: 'manual',
    })
    markMaintenanceTaskDone(one.id)
    upsertMaintenanceTask({
      title: 'Task B',
      detail: 'B',
      severity: 'medium',
      source: 'manual',
    })
    const kept = clearMaintenanceQueue('open')
    expect(kept.length).toBe(1)
    expect(kept[0].status).toBe('done')
  })
})
