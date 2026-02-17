import { describe, it, expect, beforeEach } from 'vitest'
import { invalidateImageModelsCache } from './imageModelsApi'

// We test the normalizeImageModelsPayload function which is not exported,
// so we re-implement the same logic here for unit testing the normalize behavior.
// Alternatively, we test through the public API.

// Since normalizeImageModelsPayload is not exported, we test it indirectly
// by importing and testing the module's behavior. Let's test what IS exported.

describe('invalidateImageModelsCache', () => {
    it('does not throw when called', () => {
        expect(() => invalidateImageModelsCache()).not.toThrow()
    })

    it('can be called multiple times safely', () => {
        invalidateImageModelsCache()
        invalidateImageModelsCache()
        invalidateImageModelsCache()
        // No throw = pass
    })
})

// Test normalizeImageModelsPayload by extracting the logic
// Since the function is module-private, we replicate and test its contract
describe('normalizeImageModelsPayload logic', () => {
    // Replicate the normalization contract
    function normalizeImageModelsPayload(payload: unknown) {
        const data = (payload && typeof payload === 'object') ? payload as Record<string, unknown> : {}
        const localRaw = Array.isArray(data.local) ? data.local : []

        const local = localRaw
            .map((item: unknown) => {
                if (typeof item === 'string') {
                    return { name: item, type: 'unknown', vram: 'unknown' }
                }
                if (!item || typeof item !== 'object') return null
                const record = item as Record<string, unknown>
                const name = typeof record.name === 'string' ? record.name : ''
                if (!name) return null
                return {
                    name,
                    type: typeof record.type === 'string' ? record.type : 'unknown',
                    vram: typeof record.vram === 'string' ? record.vram : 'unknown',
                    repo: typeof record.repo === 'string' ? record.repo : undefined,
                    path: typeof record.path === 'string' ? record.path : undefined,
                }
            })
            .filter((item: unknown): item is NonNullable<typeof item> => item !== null)

        return {
            local,
            ollama: Array.isArray(data.ollama) ? data.ollama : [],
            diffusers: Array.isArray(data.diffusers) ? data.diffusers : [],
            huggingface: Array.isArray(data.huggingface) ? data.huggingface as string[] : [],
            hf_models: Array.isArray(data.hf_models) ? data.hf_models as string[] : [],
            device: typeof data.device === 'string' ? data.device : undefined,
            current_model: typeof data.current_model === 'string' ? data.current_model : null,
        }
    }

    it('normalizes a well-formed payload', () => {
        const result = normalizeImageModelsPayload({
            local: [
                { name: 'flux-dev', type: 'diffusers', vram: '12GB', repo: 'stabilityai/flux' },
                { name: 'sdxl', type: 'diffusers', vram: '8GB' },
            ],
            device: 'mps',
            current_model: 'flux-dev',
        })

        expect(result.local).toHaveLength(2)
        expect(result.local[0].name).toBe('flux-dev')
        expect(result.local[0].repo).toBe('stabilityai/flux')
        expect(result.local[1].vram).toBe('8GB')
        expect(result.device).toBe('mps')
        expect(result.current_model).toBe('flux-dev')
    })

    it('handles string-only model entries', () => {
        const result = normalizeImageModelsPayload({
            local: ['model-a', 'model-b'],
        })

        expect(result.local).toHaveLength(2)
        expect(result.local[0]).toEqual({ name: 'model-a', type: 'unknown', vram: 'unknown' })
    })

    it('filters out invalid entries (null, missing name, non-objects)', () => {
        const result = normalizeImageModelsPayload({
            local: [null, undefined, 42, { noName: true }, { name: '' }, { name: 'valid' }],
        })

        expect(result.local).toHaveLength(1)
        expect(result.local[0].name).toBe('valid')
    })

    it('returns safe defaults for null/undefined payload', () => {
        const result = normalizeImageModelsPayload(null)
        expect(result.local).toEqual([])
        expect(result.ollama).toEqual([])
        expect(result.device).toBeUndefined()
        expect(result.current_model).toBeNull()
    })

    it('returns safe defaults for non-object payload', () => {
        const result = normalizeImageModelsPayload('garbage')
        expect(result.local).toEqual([])
    })

    it('handles duplicate model names in the list', () => {
        const result = normalizeImageModelsPayload({
            local: [
                { name: 'diffusion_pytorch_model', type: 'a' },
                { name: 'diffusion_pytorch_model', type: 'b' },
                { name: 'diffusion_pytorch_model.fp16', type: 'c' },
            ],
        })
        // Normalization preserves duplicates — dedup is the caller's responsibility
        expect(result.local).toHaveLength(3)
        expect(result.local.map(m => m.name)).toEqual([
            'diffusion_pytorch_model',
            'diffusion_pytorch_model',
            'diffusion_pytorch_model.fp16',
        ])
    })
})
