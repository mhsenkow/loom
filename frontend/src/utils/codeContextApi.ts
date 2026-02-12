import { requestJson } from './apiClient'

export interface CodeContextStatusResponse {
  active?: boolean
  folder_path?: string | null
  files_indexed?: number
}

export interface CodeContextIndexOptions {
  file_patterns?: string[]
  exclude_patterns?: string[]
  chunk_size?: number
  chunk_overlap?: number
  chunking_strategy?: 'function' | 'sentence' | 'fixed'
  max_file_size?: number
}

export interface CodeContextIndexResponse {
  folder_path?: string
  files_indexed?: number
  chunks_created?: number
}

export async function fetchCodeContextStatus(apiBase: string): Promise<CodeContextStatusResponse> {
  return requestJson<CodeContextStatusResponse>(`${apiBase}/api/code-context/status`, {
    method: 'GET',
    timeoutMs: 10000,
  })
}

export async function indexCodeContextFolder(
  apiBase: string,
  folderPath: string,
  options?: CodeContextIndexOptions,
): Promise<CodeContextIndexResponse> {
  return requestJson<CodeContextIndexResponse>(`${apiBase}/api/code-context/index-folder`, {
    method: 'POST',
    timeoutMs: 300000,
    body: {
      folder_path: folderPath,
      ...(options || {}),
    },
  })
}

export async function clearCodeContext(apiBase: string): Promise<void> {
  await requestJson(`${apiBase}/api/code-context/clear`, {
    method: 'DELETE',
    timeoutMs: 10000,
  })
}
