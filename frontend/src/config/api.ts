const DEFAULT_API_BASE_URL = 'http://localhost:8000'

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

// Empty or "SAME_ORIGIN" = use current origin (for Docker / single-server deploy)
function resolveApiBaseUrl(): string {
  if (configuredBaseUrl === '' || configuredBaseUrl === 'SAME_ORIGIN') {
    if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin
    return DEFAULT_API_BASE_URL
  }
  return (configuredBaseUrl || DEFAULT_API_BASE_URL).replace(/\/+$/, '')
}

export const API_BASE_URL = resolveApiBaseUrl()

export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${API_BASE_URL}${normalizedPath}`
}
