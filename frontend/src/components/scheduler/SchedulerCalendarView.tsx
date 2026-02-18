import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../config/api'

interface SchedulerJob {
  id: string
  name: string
  next_run_time: string | null
  trigger: string
}

interface EnrichedJob extends SchedulerJob {
  nextRunAt: Date | null
}

interface CircuitCell {
  id: string
  type: string
  label?: string
  content?: string
}

interface CircuitRecord {
  name: string
  description?: string | null
  cells: CircuitCell[]
  modelSlots?: Record<string, string>
}

interface SchedulerRun {
  runId: string
  circuitName: string
  jobId: string | null
  trigger: string
  status: 'running' | 'success' | 'failed' | string
  startedAt: number
  finishedAt: number | null
  durationMs: number | null
  error: string | null
}

interface OutputBadge {
  key: string
  label: string
}

interface StarterExample {
  name: string
  cron: string
  description: string
}

const POLL_INTERVAL_MS = 30000
const SCHEDULER_RUNS_UPDATED_EVENT = 'loom:scheduler-runs-updated'
const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const STARTER_EXAMPLES: StarterExample[] = [
  {
    name: 'sample-hourly-pulse',
    cron: '0 * * * *',
    description: 'Ultra-simple starter circuit that runs hourly.',
  },
  {
    name: 'weekly-creative',
    cron: '0 9 * * 0',
    description: 'Weekly creative nudge (from built-in templates).',
  },
  {
    name: 'automated-news',
    cron: '0 8 * * *',
    description: 'Daily fetch + summarize + save report template.',
  },
  {
    name: 'annoy-mode',
    cron: '(off) set * * * * * * to enable',
    description: 'Off by default. If enabled, triggers every second with notification spam.',
  },
  {
    name: 'site-research-email-draft',
    cron: '(off) e.g. 0 9 * * 1-5',
    description: 'Website research + email draft to outbox + notification.',
  },
  {
    name: 'status-watch-telegram',
    cron: '(off) e.g. 0 */2 * * *',
    description: 'Status page summary sent to Telegram (if connector is configured).',
  },
  {
    name: 'competitor-brief-notify',
    cron: '(off) e.g. 0 10 * * 1-5',
    description: 'Competitor page brief saved to report + desktop notification.',
  },
]

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

function toMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function toTimeLabel(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function toDateTimeLabel(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function fromUnixSeconds(value: number | null | undefined): Date | null {
  if (!value || Number.isNaN(value)) return null
  return new Date(value * 1000)
}

function parseJobIdentity(job: EnrichedJob): { circuitName: string | null; cronCellId: string | null } {
  const idMatch = job.id.match(/^circuit:([^:]+):(.+)$/)
  if (idMatch) {
    return { circuitName: idMatch[1] || null, cronCellId: idMatch[2] || null }
  }
  const fromName = job.name.replace(/^Circuit:\s*/i, '').trim()
  return { circuitName: fromName || null, cronCellId: null }
}

function isLikelyCronExpression(value: string): boolean {
  const fields = value.trim().split(/\s+/).filter(Boolean).length
  return fields === 5 || fields === 6
}

function normalizeModelSlots(modelSlots?: Record<string, string>): Record<string, string> {
  return {
    A: '',
    B: '',
    C: '',
    IMAGE: '',
    ...(modelSlots || {}),
  }
}

function getOutputBadges(cells: CircuitCell[]): OutputBadge[] {
  const set = new Set<string>()
  for (const cell of cells) {
    switch (cell.type) {
      case 'notification':
        set.add('notify')
        break
      case 'file_write':
        set.add('file')
        break
      case 'telegram_send':
        set.add('telegram')
        break
      case 'log_entry':
        set.add('terminal')
        break
      case 'shell_exec':
        set.add('shell')
        break
      default:
        break
    }
  }
  const badges: OutputBadge[] = []
  if (set.has('notify')) badges.push({ key: 'notify', label: 'NOTIFY' })
  if (set.has('file')) badges.push({ key: 'file', label: 'FILE' })
  if (set.has('telegram')) badges.push({ key: 'telegram', label: 'TELEGRAM' })
  if (set.has('terminal')) badges.push({ key: 'terminal', label: 'TERMINAL' })
  if (set.has('shell')) badges.push({ key: 'shell', label: 'SHELL' })
  return badges
}

export function SchedulerCalendarView() {
  const [jobs, setJobs] = useState<EnrichedJob[]>([])
  const [runs, setRuns] = useState<SchedulerRun[]>([])
  const [loading, setLoading] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const [runningNow, setRunningNow] = useState(false)
  const [savingCron, setSavingCron] = useState(false)
  const [inspectorLoading, setInspectorLoading] = useState(false)
  const [inspectorError, setInspectorError] = useState<string | null>(null)
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null)
  const [selectedCircuit, setSelectedCircuit] = useState<CircuitRecord | null>(null)
  const [selectedCronCellId, setSelectedCronCellId] = useState<string | null>(null)
  const [cronDraft, setCronDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null)
  const [monthCursor, setMonthCursor] = useState<Date>(() => startOfMonth(new Date()))
  const [selectedDate, setSelectedDate] = useState<Date>(() => startOfDay(new Date()))

  const fetchJobs = useCallback(async () => {
    const endpoints = [apiUrl('/api/scheduler/jobs')]

    let payload: SchedulerJob[] | null = null
    let lastFetchError: string | null = null

    for (const url of endpoints) {
      try {
        const response = await fetch(url)
        if (!response.ok) {
          lastFetchError = `HTTP ${response.status}`
          continue
        }
        const data = await response.json()
        if (!Array.isArray(data)) {
          lastFetchError = 'Invalid scheduler payload'
          continue
        }
        payload = data as SchedulerJob[]
        break
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        lastFetchError = msg.toLowerCase() === 'failed to fetch'
          ? 'Scheduler API unavailable. Backend may be offline.'
          : msg
      }
    }

    if (!payload) {
      setError(lastFetchError || 'Failed to load scheduler jobs.')
      setLoading(false)
      return
    }

    const enriched = payload
      .map((job) => ({
        ...job,
        nextRunAt: toDateOrNull(job.next_run_time),
      }))
      .sort((a, b) => {
        if (!a.nextRunAt && !b.nextRunAt) return a.name.localeCompare(b.name)
        if (!a.nextRunAt) return 1
        if (!b.nextRunAt) return -1
        return a.nextRunAt.getTime() - b.nextRunAt.getTime()
      })

    setJobs(enriched)
    setError(null)
    setLoading(false)
    setLastUpdatedAt(new Date())
  }, [])

  const fetchRuns = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/api/scheduler/runs?limit=300'))
      if (!response.ok) return
      const payload = await response.json()
      if (Array.isArray(payload)) {
        setRuns(payload as SchedulerRun[])
      }
    } catch {
      // Keep UI usable without history if endpoint is unavailable.
    }
  }, [])

  useEffect(() => {
    void fetchJobs()
    void fetchRuns()
    const timer = window.setInterval(() => {
      void fetchJobs()
      void fetchRuns()
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [fetchJobs, fetchRuns])

  useEffect(() => {
    const onRunsUpdated = () => { void fetchRuns() }
    window.addEventListener(SCHEDULER_RUNS_UPDATED_EVENT, onRunsUpdated as EventListener)
    return () => window.removeEventListener(SCHEDULER_RUNS_UPDATED_EVENT, onRunsUpdated as EventListener)
  }, [fetchRuns])

  const jobsByDay = useMemo(() => {
    const map = new Map<string, EnrichedJob[]>()
    for (const job of jobs) {
      if (!job.nextRunAt) continue
      const key = toDateKey(job.nextRunAt)
      const existing = map.get(key)
      if (existing) existing.push(job)
      else map.set(key, [job])
    }
    return map
  }, [jobs])

  const calendarDays = useMemo(() => {
    const firstOfMonth = startOfMonth(monthCursor)
    const firstWeekday = firstOfMonth.getDay()
    const gridStart = addDays(firstOfMonth, -firstWeekday)
    const days: Date[] = []
    for (let i = 0; i < 42; i += 1) {
      days.push(addDays(gridStart, i))
    }
    return days
  }, [monthCursor])

  const selectedJobs = useMemo(() => {
    const key = toDateKey(selectedDate)
    const dayJobs = jobsByDay.get(key) || []
    return dayJobs.slice().sort((a, b) => {
      if (!a.nextRunAt || !b.nextRunAt) return 0
      return a.nextRunAt.getTime() - b.nextRunAt.getTime()
    })
  }, [jobsByDay, selectedDate])

  const upcomingJobs = useMemo(() => {
    return jobs.filter((job) => job.nextRunAt).slice(0, 8)
  }, [jobs])

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedJobId) || null, [jobs, selectedJobId])
  const selectedIdentity = useMemo(
    () => (selectedJob ? parseJobIdentity(selectedJob) : { circuitName: null, cronCellId: null }),
    [selectedJob],
  )
  const selectedCircuitName = selectedCircuit?.name || selectedIdentity.circuitName
  const selectedCronCell = useMemo(() => {
    if (!selectedCircuit || !selectedCronCellId) return null
    return selectedCircuit.cells.find((cell) => cell.id === selectedCronCellId) || null
  }, [selectedCircuit, selectedCronCellId])
  const selectedNotificationCount = useMemo(() => {
    if (!selectedCircuit) return 0
    return selectedCircuit.cells.filter((cell) => cell.type === 'notification').length
  }, [selectedCircuit])
  const selectedCellTypeSummary = useMemo(() => {
    if (!selectedCircuit) return ''
    const counts = new Map<string, number>()
    for (const cell of selectedCircuit.cells) {
      const key = cell.type || 'unknown'
      counts.set(key, (counts.get(key) || 0) + 1)
    }
    return Array.from(counts.entries())
      .map(([type, count]) => `${type}×${count}`)
      .join(' • ')
  }, [selectedCircuit])
  const selectedOutputBadges = useMemo(() => {
    if (!selectedCircuit) return []
    return getOutputBadges(selectedCircuit.cells)
  }, [selectedCircuit])
  const selectedJobRuns = useMemo(() => {
    if (!selectedJob || !selectedCircuitName) return []
    return runs.filter((run) => run.jobId === selectedJob.id || run.circuitName === selectedCircuitName)
  }, [runs, selectedCircuitName, selectedJob])
  const selectedDayRuns = useMemo(() => {
    const selectedKey = toDateKey(selectedDate)
    return selectedJobRuns.filter((run) => {
      const started = fromUnixSeconds(run.startedAt)
      return started ? toDateKey(started) === selectedKey : false
    })
  }, [selectedDate, selectedJobRuns])

  const monthLabel = toMonthLabel(monthCursor)
  const today = startOfDay(new Date())

  const inspectJob = useCallback(async (job: EnrichedJob) => {
    setSelectedJobId(job.id)
    setInspectorError(null)
    setInspectorLoading(true)

    const { circuitName, cronCellId } = parseJobIdentity(job)
    if (!circuitName) {
      setInspectorLoading(false)
      setInspectorError('Could not determine circuit name for this schedule.')
      setSelectedCircuit(null)
      setSelectedCronCellId(null)
      setCronDraft('')
      return
    }

    try {
      const response = await fetch(apiUrl(`/api/circuits/${encodeURIComponent(circuitName)}`))
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json() as CircuitRecord
      const cells = Array.isArray(data.cells) ? data.cells : []
      const cronCell = (
        cells.find((cell) => cronCellId && cell.id === cronCellId)
        || cells.find((cell) => cell.type === 'cron_trigger')
        || null
      )

      setSelectedCircuit({ ...data, cells })
      setSelectedCronCellId(cronCell?.id || null)
      setCronDraft((cronCell?.content || '').trim())
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setInspectorError(`Failed to load circuit details (${msg}).`)
      setSelectedCircuit(null)
      setSelectedCronCellId(null)
      setCronDraft('')
    } finally {
      setInspectorLoading(false)
    }
  }, [])

  const saveCronSchedule = useCallback(async (cronOverride?: string) => {
    if (!selectedCircuit || !selectedCronCellId) {
      setInspectorError('No cron cell selected for editing.')
      return
    }
    const nextCron = (cronOverride ?? cronDraft).trim()
    if (nextCron && !isLikelyCronExpression(nextCron)) {
      setInspectorError('Invalid cron expression. Use 5 fields (0 8 * * *) or 6 fields with seconds (* * * * * *).')
      return
    }

    const updatedCells = selectedCircuit.cells.map((cell) => (
      cell.id === selectedCronCellId
        ? { ...cell, content: nextCron }
        : cell
    ))

    setSavingCron(true)
    setInspectorError(null)
    try {
      const response = await fetch(apiUrl('/api/circuits/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: selectedCircuit.name,
          description: selectedCircuit.description || '',
          cells: updatedCells,
          modelSlots: normalizeModelSlots(selectedCircuit.modelSlots),
        }),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      setSelectedCircuit((prev) => (prev ? { ...prev, cells: updatedCells } : prev))
      await fetchJobs()
      await fetchRuns()
      if (nextCron && selectedJob) {
        await inspectJob(selectedJob)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setInspectorError(`Failed to update schedule (${msg}).`)
    } finally {
      setSavingCron(false)
    }
  }, [cronDraft, fetchJobs, fetchRuns, inspectJob, selectedCircuit, selectedCronCellId, selectedJob])

  const runNow = useCallback(async () => {
    const circuitName = (selectedCircuitName || '').trim()
    if (!circuitName) {
      setInspectorError('Circuit name not found for this schedule.')
      return
    }
    setRunningNow(true)
    setInspectorError(null)
    try {
      const response = await fetch(apiUrl('/api/scheduler/run-now'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circuit_name: circuitName }),
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      window.setTimeout(() => { void fetchRuns() }, 700)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setInspectorError(`Failed to trigger run (${msg}).`)
    } finally {
      setRunningNow(false)
    }
  }, [fetchRuns, selectedCircuitName])

  const openSelectedCircuit = useCallback(() => {
    const circuitName = (selectedCircuitName || '').trim()
    if (!circuitName) {
      setInspectorError('Circuit name not found for this schedule.')
      return
    }
    window.dispatchEvent(new CustomEvent('loom:open-circuit', { detail: { name: circuitName } }))
  }, [selectedCircuitName])

  const seedStarterSchedule = useCallback(async () => {
    setSeeding(true)
    const endpoints = [apiUrl('/api/scheduler/seed-sample')]

    let ok = false
    let err: string | null = null

    for (const url of endpoints) {
      try {
        const response = await fetch(url, { method: 'POST' })
        if (!response.ok) {
          err = `HTTP ${response.status}`
          continue
        }
        ok = true
        break
      } catch (e) {
        err = e instanceof Error ? e.message : String(e)
      }
    }

    setSeeding(false)
    if (!ok) {
      setError(err || 'Could not seed starter schedule.')
      return
    }
    await fetchJobs()
  }, [fetchJobs])

  return (
    <div className="h-full overflow-hidden bg-void text-phosphor">
      <div className="h-full flex flex-col">
        <div className="border-b border-terminal-border px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] tracking-widest text-terminal-muted">SCHEDULE</div>
            <div className="text-sm font-bold tracking-wide">Calendar</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
              className="px-2 py-1 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
              aria-label="Previous month"
            >
              ◀
            </button>
            <button
              type="button"
              onClick={() => {
                setMonthCursor(startOfMonth(new Date()))
                setSelectedDate(startOfDay(new Date()))
              }}
              className="px-2 py-1 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
              className="px-2 py-1 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
              aria-label="Next month"
            >
              ▶
            </button>
            <button
              type="button"
              onClick={() => { void fetchJobs() }}
              className="px-2 py-1 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-terminal-border text-xs text-terminal-muted flex items-center justify-between gap-3">
          <span>{monthLabel}</span>
          <span>{lastUpdatedAt ? `Updated ${toTimeLabel(lastUpdatedAt)}` : 'Not loaded yet'}</span>
        </div>

        <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1.4fr,1fr]">
          <div className="border-b xl:border-b-0 xl:border-r border-terminal-border min-h-0 flex flex-col">
            <div className="grid grid-cols-7 border-b border-terminal-border">
              {WEEKDAY_LABELS.map((day) => (
                <div key={day} className="px-2 py-2 text-[10px] text-terminal-muted tracking-wider uppercase text-center">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 auto-rows-fr flex-1 min-h-0">
              {calendarDays.map((day) => {
                const dayKey = toDateKey(day)
                const dayJobs = jobsByDay.get(dayKey) || []
                const isCurrentMonth = day.getMonth() === monthCursor.getMonth()
                const isSelected = toDateKey(day) === toDateKey(selectedDate)
                const isToday = toDateKey(day) === toDateKey(today)

                return (
                  <button
                    type="button"
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(startOfDay(day))}
                    className={`relative border-r border-b border-terminal-border p-2 text-left align-top min-h-[86px] focus:outline-none ${
                      isSelected ? 'bg-phosphor/10' : 'hover:bg-void/60'
                    } ${isCurrentMonth ? 'text-phosphor' : 'text-terminal-muted/70'}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs ${isToday ? 'text-cyan-300 font-bold' : ''}`}>
                        {day.getDate()}
                      </span>
                      {dayJobs.length > 0 && (
                        <span className="text-[10px] text-cyan-300">{dayJobs.length}</span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {dayJobs.slice(0, 2).map((job) => (
                        <div key={job.id} className="text-[10px] truncate text-phosphor/85">
                          • {job.name.replace(/^Circuit:\s*/i, '')}
                        </div>
                      ))}
                      {dayJobs.length > 2 && (
                        <div className="text-[10px] text-terminal-muted">+{dayJobs.length - 2} more</div>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="min-h-0 flex flex-col">
            <div className="border-b border-terminal-border px-4 py-3">
              <div className="text-[10px] tracking-wider text-terminal-muted uppercase">Selected Day</div>
              <div className="text-sm font-semibold">
                {selectedDate.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
              {loading && (
                <div className="text-xs text-terminal-muted">Loading scheduler jobs...</div>
              )}

              {!loading && error && (
                <div className="text-xs text-red-400 border border-red-500/40 bg-red-900/20 px-3 py-2">
                  {error}
                </div>
              )}

              {!loading && !error && selectedJobs.length === 0 && (
                <div className="text-xs text-terminal-muted border border-terminal-border px-3 py-2">
                  No scheduled runs on this day.
                </div>
              )}

              {!loading && !error && selectedJobs.map((job) => {
                const active = selectedJobId === job.id
                return (
                  <button
                    type="button"
                    key={job.id}
                    onClick={() => { void inspectJob(job) }}
                    className={`w-full text-left border px-3 py-2 transition-colors ${
                      active
                        ? 'border-phosphor bg-phosphor/10'
                        : 'border-terminal-border bg-void/50 hover:border-phosphor/60'
                    }`}
                  >
                    <div className="text-xs text-phosphor font-semibold truncate">
                      {job.name.replace(/^Circuit:\s*/i, '')}
                    </div>
                    <div className="text-[10px] text-terminal-muted mt-1">
                      {job.nextRunAt ? toDateTimeLabel(job.nextRunAt) : 'No next run'}
                    </div>
                    <div className="text-[10px] text-terminal-muted/90 mt-1 truncate">
                      {job.trigger}
                    </div>
                  </button>
                )
              })}

              {!loading && !error && (
                <>
                  <div className="text-[10px] text-terminal-muted">
                    Click a scheduled run to inspect and edit its cron expression.
                  </div>
                  {(selectedJobId || inspectorLoading || inspectorError) && (
                    <div className="border border-terminal-border bg-void/50 px-3 py-2 space-y-2">
                      <div className="text-[10px] tracking-wider uppercase text-terminal-muted">Schedule Inspector</div>

                      {inspectorLoading && (
                        <div className="text-xs text-terminal-muted">Loading circuit details...</div>
                      )}

                      {!inspectorLoading && inspectorError && (
                        <div className="text-xs text-red-400">{inspectorError}</div>
                      )}

                      {!inspectorLoading && !inspectorError && selectedJob && (
                        <>
                          <div className="text-xs text-phosphor font-semibold">
                            {selectedJob.name.replace(/^Circuit:\s*/i, '')}
                          </div>
                          <div className="text-[10px] text-terminal-muted">
                            {selectedCircuit?.cells.length || 0} cells
                            {selectedCellTypeSummary ? ` • ${selectedCellTypeSummary}` : ''}
                          </div>
                          <div className="text-[10px] text-terminal-muted">
                            {selectedNotificationCount > 0
                              ? `Notification: yes (${selectedNotificationCount} notification cell${selectedNotificationCount > 1 ? 's' : ''})`
                              : 'Notification: no notification cell in this circuit'}
                          </div>
                          {selectedOutputBadges.length > 0 && (
                            <div className="flex items-center gap-1 flex-wrap">
                              {selectedOutputBadges.map((badge) => (
                                <span key={badge.key} className="px-1.5 py-0.5 text-[9px] border border-terminal-border text-cyan-300">
                                  {badge.label}
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => { void runNow() }}
                              disabled={runningNow}
                              className="px-3 py-2 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor disabled:opacity-60"
                            >
                              {runningNow ? 'Running...' : 'Run now'}
                            </button>
                            <button
                              type="button"
                              onClick={openSelectedCircuit}
                              className="px-3 py-2 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor"
                            >
                              Open circuit
                            </button>
                          </div>

                          <label className="block text-[10px] text-terminal-muted tracking-wider uppercase">
                            Cron
                          </label>
                          <input
                            value={cronDraft}
                            onChange={(event) => setCronDraft(event.target.value)}
                            placeholder="0 8 * * *"
                            className="w-full bg-void border border-terminal-border px-2 py-1 text-xs text-phosphor focus:outline-none focus:border-phosphor"
                          />
                          <div className="text-[10px] text-terminal-muted">
                            Format: `m h dom mon dow` or `s m h dom mon dow`. Leave blank to pause.
                          </div>
                          {selectedCronCell?.label && (
                            <div className="text-[10px] text-terminal-muted">
                              Cell: {selectedCronCell.label}
                            </div>
                          )}

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setCronDraft('* * * * * *')
                                void saveCronSchedule('* * * * * *')
                              }}
                              disabled={savingCron}
                              className="px-3 py-2 text-xs border border-terminal-border text-terminal-muted hover:text-amber-300 hover:border-amber-400/60 disabled:opacity-60"
                            >
                              Every second
                            </button>
                            <button
                              type="button"
                              onClick={() => { void saveCronSchedule() }}
                              disabled={savingCron}
                              className="flex-1 px-3 py-2 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor disabled:opacity-60"
                            >
                              {savingCron ? 'Saving schedule...' : 'Save schedule'}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCronDraft('')
                                void saveCronSchedule('')
                              }}
                              disabled={savingCron}
                              className="px-3 py-2 text-xs border border-terminal-border text-terminal-muted hover:text-red-400 hover:border-red-500/60 disabled:opacity-60"
                            >
                              Pause
                            </button>
                          </div>

                          <div className="pt-2 border-t border-terminal-border">
                            <div className="text-[10px] tracking-wider uppercase text-terminal-muted">Run History (Selected Day)</div>
                            {selectedDayRuns.length === 0 ? (
                              <div className="text-[10px] text-terminal-muted mt-1">No runs recorded for this day yet.</div>
                            ) : (
                              <div className="mt-1 space-y-1">
                                {selectedDayRuns.slice(0, 8).map((run) => {
                                  const started = fromUnixSeconds(run.startedAt)
                                  const statusColor = run.status === 'success'
                                    ? 'text-green-400'
                                    : run.status === 'failed'
                                      ? 'text-red-400'
                                      : 'text-amber-300'
                                  return (
                                    <div key={run.runId} className="text-[10px] flex items-start justify-between gap-2">
                                      <span className={`uppercase ${statusColor}`}>{run.status}</span>
                                      <span className="text-terminal-muted">
                                        {started ? started.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '--'}
                                      </span>
                                      <span className="text-terminal-muted">
                                        {run.durationMs != null ? `${run.durationMs}ms` : ''}
                                      </span>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                            {selectedJobRuns[0]?.error && (
                              <div className="text-[10px] text-red-400 mt-1 truncate">
                                Last error: {selectedJobRuns[0].error}
                              </div>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <div className="pt-3 border-t border-terminal-border text-[10px] tracking-wider uppercase text-terminal-muted">
                    Upcoming
                  </div>
                  {upcomingJobs.length === 0 ? (
                    <div className="text-xs text-terminal-muted">No jobs scheduled yet.</div>
                  ) : (
                    upcomingJobs.map((job) => (
                      <button
                        type="button"
                        key={`up-${job.id}`}
                        onClick={() => { void inspectJob(job) }}
                        className={`w-full text-left text-xs flex items-start justify-between gap-3 ${
                          selectedJobId === job.id ? 'text-phosphor' : 'text-terminal-muted hover:text-phosphor'
                        }`}
                      >
                        <span className="truncate">{job.name.replace(/^Circuit:\s*/i, '')}</span>
                        <span className="whitespace-nowrap text-[10px] text-cyan-300">
                          {job.nextRunAt ? toDateTimeLabel(job.nextRunAt) : '--'}
                        </span>
                      </button>
                    ))
                  )}
                </>
              )}

              {!loading && (jobs.length === 0 || Boolean(error)) && (
                <>
                  <div className="pt-3 border-t border-terminal-border text-[10px] tracking-wider uppercase text-terminal-muted">
                    Starter Schedules
                  </div>
                  <div className="space-y-2">
                    {STARTER_EXAMPLES.map((example) => (
                      <div key={example.name} className="border border-terminal-border bg-void/40 px-3 py-2">
                        <div className="text-xs text-phosphor">{example.name}</div>
                        <div className="text-[10px] text-terminal-muted mt-1">{example.description}</div>
                        <div className="text-[10px] text-cyan-300 mt-1">cron: {example.cron}</div>
                      </div>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => { void seedStarterSchedule() }}
                    disabled={seeding}
                    className="w-full mt-2 px-3 py-2 text-xs border border-terminal-border text-terminal-muted hover:text-phosphor hover:border-phosphor disabled:opacity-60"
                  >
                    {seeding ? 'Seeding starter schedule...' : 'Seed starter schedule'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
