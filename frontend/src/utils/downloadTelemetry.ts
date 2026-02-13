export type DownloadTelemetryScope = 'ollama' | 'image' | 'diffusers' | 'unknown'

export interface DownloadTelemetryDetail {
  scope: DownloadTelemetryScope
  model: string
  status: string
  message?: string
  completed?: number
  total?: number
  percent?: number
  error?: string
  speedBps?: number
  etaSeconds?: number
  fileName?: string
  filesCompleted?: number
  filesTotal?: number
  timestamp: number
}

export interface DownloadTelemetryInput {
  scope?: DownloadTelemetryScope
  model?: string
  status?: string
  message?: string
  completed?: number
  total?: number
  percent?: number
  error?: string
  speedBps?: number
  etaSeconds?: number
  fileName?: string
  filesCompleted?: number
  filesTotal?: number
}

export const DOWNLOAD_TELEMETRY_EVENT = 'loom:download_telemetry'

function finiteNumberOrUndefined(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

export function buildDownloadTelemetry(detail: DownloadTelemetryInput): DownloadTelemetryDetail {
  return {
    scope: detail.scope || 'unknown',
    model: String(detail.model || 'unknown').trim() || 'unknown',
    status: String(detail.status || 'unknown').trim() || 'unknown',
    message: typeof detail.message === 'string' ? detail.message : undefined,
    completed: finiteNumberOrUndefined(detail.completed),
    total: finiteNumberOrUndefined(detail.total),
    percent: finiteNumberOrUndefined(detail.percent),
    error: typeof detail.error === 'string' ? detail.error : undefined,
    speedBps: finiteNumberOrUndefined(detail.speedBps),
    etaSeconds: finiteNumberOrUndefined(detail.etaSeconds),
    fileName: typeof detail.fileName === 'string' ? detail.fileName : undefined,
    filesCompleted: finiteNumberOrUndefined(detail.filesCompleted),
    filesTotal: finiteNumberOrUndefined(detail.filesTotal),
    timestamp: Date.now(),
  }
}

export function dispatchDownloadTelemetry(detail: DownloadTelemetryInput): void {
  if (typeof window === 'undefined') return
  const normalized = buildDownloadTelemetry(detail)
  window.dispatchEvent(new CustomEvent<DownloadTelemetryDetail>(DOWNLOAD_TELEMETRY_EVENT, { detail: normalized }))
}
