import { CellData } from '../components/circuit/CircuitBoard'
import type { ModuleType, ModuleStatus } from '../types/module'

const API_BASE = 'http://localhost:8000'

// Backend Module interface (matches API response)
interface BackendModule {
  id: string
  type: string
  content: string
  position: { x: number; y: number }
  status: string
  metadata: Record<string, unknown>
}


// Convert CellData to backend Module format
function cellToBackendModule(cell: CellData, position: { x: number; y: number }): {
  type: string
  content: string
  position: { x: number; y: number }
  metadata: Record<string, unknown>
} {
  // Store all CellData-specific fields in metadata
  const metadata: Record<string, unknown> = {
    label: cell.label,
    model: cell.model,
    modelSlot: cell.modelSlot,
    readMode: cell.readMode,
    inputMode: cell.inputMode,
    conditionType: cell.conditionType,
    conditionValue: cell.conditionValue,
    onPass: cell.onPass,
    onFail: cell.onFail,
    loopBackTo: cell.loopBackTo,
    loopBackMax: cell.loopBackMax,
    fetchMethod: cell.fetchMethod,
    fetchHeaders: cell.fetchHeaders,
    fetchBody: cell.fetchBody,
    fetchTimeout: cell.fetchTimeout,
    fetchMaxSize: cell.fetchMaxSize,
  }
  
  // Remove undefined values
  Object.keys(metadata).forEach(key => {
    if (metadata[key] === undefined) {
      delete metadata[key]
    }
  })

  return {
    type: cell.type,
    content: cell.content,
    position,
    metadata,
  }
}

// Convert backend Module to CellData (with position stored temporarily)
function backendModuleToCell(module: BackendModule): CellData & { _position?: { x: number; y: number } } {
  const metadata = module.metadata || {}
  
  const cell: CellData & { _position?: { x: number; y: number } } = {
    id: module.id,
    type: module.type as ModuleType,
    label: (metadata.label as string) || getDefaultLabel(module.type),
    content: module.content || '',
    status: (module.status as ModuleStatus) || 'idle',
    model: metadata.model as string | undefined,
    modelSlot: metadata.modelSlot as 'A' | 'B' | 'C' | undefined,
    readMode: metadata.readMode as string | undefined,
    inputMode: metadata.inputMode as 'previous' | 'all' | 'none' | undefined,
    conditionType: metadata.conditionType as 'regex' | 'keyword' | 'length' | 'contains' | 'ai_check' | undefined,
    conditionValue: metadata.conditionValue as string | undefined,
    onPass: metadata.onPass as string | undefined,
    onFail: metadata.onFail as string | undefined,
    loopBackTo: metadata.loopBackTo as number | undefined,
    loopBackMax: metadata.loopBackMax as number | undefined,
    fetchMethod: metadata.fetchMethod as 'GET' | 'POST' | 'PUT' | 'DELETE' | undefined,
    fetchHeaders: metadata.fetchHeaders as string | undefined,
    fetchBody: metadata.fetchBody as string | undefined,
    fetchTimeout: metadata.fetchTimeout as number | undefined,
    fetchMaxSize: metadata.fetchMaxSize as number | undefined,
    _position: module.position,  // Store position temporarily
  }
  return cell
}

function getDefaultLabel(type: string): string {
  const labels: Record<string, string> = {
    data_input: 'INPUT',
    ai_processor: 'AI',
    script_execution: 'SCRIPT',
    log_entry: 'OUTPUT',
    image_gen: 'IMAGE',
    markdown: 'NOTE',
    data_loader: 'DATA',
    conditional: 'GATE',
    web_fetch: 'FETCH',
  }
  return labels[type] || 'MODULE'
}

// Load all modules from backend
export async function loadModulesFromBackend(): Promise<(CellData & { _position?: { x: number; y: number } })[]> {
  console.log('[LOOM] 📥 Loading modules from backend...')
  try {
    // First check if backend is reachable
    const healthResponse = await fetch(`${API_BASE}/health`)
    if (!healthResponse.ok) {
      console.warn('[LOOM] Backend health check failed, skipping module load')
      return []
    }

    const response = await fetch(`${API_BASE}/api/modules/`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    if (!response.ok) {
      console.error('[LOOM] ✗ Failed to load modules:', {
        status: response.status,
        statusText: response.statusText,
      })
      return []
    }
    
    const modules: BackendModule[] = await response.json()
    console.log(`[LOOM] ✓ Loaded ${modules.length} modules from backend`)
    return modules.map(backendModuleToCell)
  } catch (error) {
    console.error('[LOOM] ✗ Network error loading modules:', error)
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      console.error('[LOOM] Network error - is the backend running on http://localhost:8000?')
      console.error('[LOOM] Run: make notebook-open (or ./start) to start the backend')
    }
    return []
  }
}

// Save a module to backend (create or update)
export async function saveModuleToBackend(
  cell: CellData,
  position: { x: number; y: number }
): Promise<boolean> {
  const moduleId = cell.id
  const moduleType = cell.type
  
  try {
    const moduleData = cellToBackendModule(cell, position)
    
    // Step 1: Check if module exists (404 is expected for new modules)
    let exists = false
    try {
      const existingResponse = await fetch(`${API_BASE}/api/modules/${moduleId}`)
      exists = existingResponse.ok
      if (existingResponse.ok) {
        console.log(`[LOOM] ✓ Module ${moduleId} exists, will update`)
      }
      // Don't log 404 - it's expected for new modules
    } catch (error) {
      // Network error - log it
      console.warn(`[LOOM] ⚠ Network error checking module ${moduleId}:`, error)
      exists = false
    }

    if (exists) {
      // Step 2: Update existing module
      console.log(`[LOOM] 🔄 Updating module ${moduleId} (${moduleType})...`)
      try {
        const updateResponse = await fetch(`${API_BASE}/api/modules/${moduleId}?${Date.now()}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: moduleData.content,
            position: moduleData.position,
            status: cell.status,
            metadata: moduleData.metadata,
          }),
        })
        
        if (updateResponse.ok) {
          console.log(`[LOOM] ✓ Successfully updated module ${moduleId}`)
          return true
        } else {
          const errorText = await updateResponse.text()
          console.error(`[LOOM] ✗ Failed to update module ${moduleId}:`, {
            status: updateResponse.status,
            statusText: updateResponse.statusText,
            error: errorText,
            moduleId,
            moduleType,
          })
          return false
        }
      } catch (error) {
        console.error(`[LOOM] ✗ Network error updating module ${moduleId}:`, error)
        return false
      }
    } else {
      // Step 3: Create new module
      console.log(`[LOOM] ➕ Creating new module ${moduleId} (${moduleType})...`)
      try {
        const createResponse = await fetch(`${API_BASE}/api/modules/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: moduleId,
            type: moduleData.type,
            content: moduleData.content,
            position: moduleData.position,
          }),
        })
        
        if (!createResponse.ok) {
          const errorText = await createResponse.text()
          console.error(`[LOOM] ✗ Failed to create module ${moduleId}:`, {
            status: createResponse.status,
            statusText: createResponse.statusText,
            error: errorText,
            requestPayload: {
              id: moduleId,
              type: moduleData.type,
              content: moduleData.content,
              position: moduleData.position,
            },
          })
          return false
        }
        
        console.log(`[LOOM] ✓ Successfully created module ${moduleId}`)
        
        // Step 4: Update with metadata after creation
        if (Object.keys(moduleData.metadata).length > 0) {
          console.log(`[LOOM] 🔄 Updating metadata for module ${moduleId}...`)
          try {
            const updateResponse = await fetch(`${API_BASE}/api/modules/${moduleId}?${Date.now()}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                metadata: moduleData.metadata,
              }),
            })
            if (updateResponse.ok) {
              console.log(`[LOOM] ✓ Successfully updated metadata for module ${moduleId}`)
            } else {
              const errorText = await updateResponse.text()
              console.warn(`[LOOM] ⚠ Failed to update metadata for module ${moduleId}:`, {
                status: updateResponse.status,
                error: errorText,
              })
              // Don't fail the whole operation if metadata update fails
            }
          } catch (error) {
            console.warn(`[LOOM] ⚠ Network error updating metadata for module ${moduleId}:`, error)
            // Don't fail the whole operation if metadata update fails
          }
        }
        
        return true
      } catch (error) {
        console.error(`[LOOM] ✗ Network error creating module ${moduleId}:`, error)
        return false
      }
    }
  } catch (error) {
    console.error(`[LOOM] ✗ Unexpected error saving module ${moduleId}:`, {
      error,
      moduleId,
      moduleType,
      position,
    })
    return false
  }
}

// Delete a module from backend
export async function deleteModuleFromBackend(moduleId: string): Promise<boolean> {
  console.log(`[LOOM] 🗑️  Deleting module ${moduleId} from backend...`)
  try {
    const response = await fetch(`${API_BASE}/api/modules/${moduleId}`, {
      method: 'DELETE',
    })
    if (response.ok) {
      console.log(`[LOOM] ✓ Successfully deleted module ${moduleId}`)
    } else {
      console.error(`[LOOM] ✗ Failed to delete module ${moduleId}:`, {
        status: response.status,
        statusText: response.statusText,
      })
    }
    return response.ok
  } catch (error) {
    console.error(`[LOOM] ✗ Network error deleting module ${moduleId}:`, error)
    return false
  }
}

// Diagnostic function to check backend connection and module status
export async function diagnoseBackendConnection(): Promise<void> {
  console.log('=== [LOOM] Backend Connection Diagnostic ===')
  
  // Test 1: Basic connectivity
  console.log('\n1. Testing basic connectivity...')
  try {
    const healthResponse = await fetch(`${API_BASE}/health`)
    if (healthResponse.ok) {
      const health = await healthResponse.json()
      console.log('✓ Backend is reachable')
      console.log('  Health status:', health)
    } else {
      console.error('✗ Backend returned error:', healthResponse.status, healthResponse.statusText)
    }
  } catch (error) {
    console.error('✗ Cannot reach backend:', error)
    console.error('  Make sure the backend server is running on', API_BASE)
    return
  }
  
  // Test 2: CORS preflight
  console.log('\n2. Testing CORS preflight (PATCH)...')
  try {
    const corsResponse = await fetch(`${API_BASE}/api/modules/test`, {
      method: 'OPTIONS',
      headers: {
        'Origin': 'http://localhost:5173',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    const allowMethods = corsResponse.headers.get('access-control-allow-methods')
    const allowOrigin = corsResponse.headers.get('access-control-allow-origin')
    const maxAge = corsResponse.headers.get('access-control-max-age')
    
    if (allowMethods?.includes('PATCH')) {
      console.log('✓ CORS allows PATCH method')
      console.log('  Allowed methods:', allowMethods)
      console.log('  Allowed origin:', allowOrigin)
      console.log('  Max age:', maxAge)
    } else {
      console.error('✗ CORS does NOT allow PATCH method')
      console.error('  Allowed methods:', allowMethods)
    }
  } catch (error) {
    console.error('✗ CORS preflight test failed:', error)
  }
  
  // Test 3: List modules
  console.log('\n3. Testing module listing...')
  try {
    const listResponse = await fetch(`${API_BASE}/api/modules/`)
    if (listResponse.ok) {
      const modules = await listResponse.json()
      console.log(`✓ Successfully listed ${modules.length} modules`)
      if (modules.length > 0) {
        console.log('  Sample module IDs:', modules.slice(0, 3).map((m: BackendModule) => m.id))
      }
    } else {
      console.error('✗ Failed to list modules:', listResponse.status, listResponse.statusText)
    }
  } catch (error) {
    console.error('✗ Error listing modules:', error)
  }
  
  // Test 4: Create test module
  console.log('\n4. Testing module creation...')
  const testId = `test-${Date.now()}`
  try {
    const createResponse = await fetch(`${API_BASE}/api/modules/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: testId,
        type: 'data_input',
        content: 'test',
        position: { x: 0, y: 0 },
      }),
    })
    if (createResponse.ok) {
      console.log('✓ Successfully created test module')
      // Clean up
      await fetch(`${API_BASE}/api/modules/${testId}`, { method: 'DELETE' })
      console.log('  Test module cleaned up')
    } else {
      const errorText = await createResponse.text()
      console.error('✗ Failed to create test module:', createResponse.status, errorText)
    }
  } catch (error) {
    console.error('✗ Error creating test module:', error)
  }
  
  console.log('\n=== Diagnostic Complete ===')
  console.log('Tip: Check the Network tab in DevTools to see all requests')
}

// Make it available globally for easy debugging
if (typeof window !== 'undefined') {
  (window as any).loomDiagnose = diagnoseBackendConnection
}

// Batch save modules (for efficiency)
export async function saveModulesToBackend(
  cells: CellData[],
  getPosition: (cellId: string) => { x: number; y: number }
): Promise<void> {
  console.log(`[LOOM] 💾 Batch saving ${cells.length} modules...`)
  // Save all modules in parallel (but limit concurrency)
  const promises = cells.map(cell => 
    saveModuleToBackend(cell, getPosition(cell.id))
  )
  const results = await Promise.allSettled(promises)
  const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length
  const failCount = results.length - successCount
  console.log(`[LOOM] ✓ Batch save complete: ${successCount} succeeded, ${failCount} failed`)
}
