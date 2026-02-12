import { apiUrl } from '../config/api'

export class ApiClientError extends Error {
  status?: number
  statusText?: string
  url: string
  body?: unknown

  constructor(message: string, options: { url: string; status?: number; statusText?: string; body?: unknown }) {
    super(message)
    this.name = 'ApiClientError'
    this.url = options.url
    this.status = options.status
    this.statusText = options.statusText
    this.body = options.body
  }
}

interface RequestJsonOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  timeoutMs?: number
}

function toAbsoluteUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return pathOrUrl
  }
  return apiUrl(pathOrUrl)
}

export async function requestJson<T>(pathOrUrl: string, options: RequestJsonOptions = {}): Promise<T> {
  const { timeoutMs = 10000, headers, body, signal, ...rest } = options
  const url = toAbsoluteUrl(pathOrUrl)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  const onAbort = () => controller.abort()

  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const mergedHeaders: Record<string, string> = {
      Accept: 'application/json',
      ...(headers as Record<string, string> | undefined),
    }

    let requestBody: BodyInit | undefined
    if (body !== undefined) {
      if (typeof body === 'string' || body instanceof FormData || body instanceof Blob) {
        requestBody = body
      } else {
        requestBody = JSON.stringify(body)
        if (!mergedHeaders['Content-Type']) {
          mergedHeaders['Content-Type'] = 'application/json'
        }
      }
    }

    const response = await fetch(url, {
      ...rest,
      headers: mergedHeaders,
      body: requestBody,
      signal: controller.signal,
    })

    const text = await response.text()
    const payload = text ? safeParseJson(text) : null

    if (!response.ok) {
      throw new ApiClientError(
        `Request failed (${response.status} ${response.statusText})`,
        {
          url,
          status: response.status,
          statusText: response.statusText,
          body: payload,
        },
      )
    }

    return payload as T
  } catch (error) {
    if (error instanceof ApiClientError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ApiClientError('Request timed out', { url })
    }
    throw new ApiClientError(
      error instanceof Error ? error.message : 'Request failed',
      { url },
    )
  } finally {
    clearTimeout(timeoutId)
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}
