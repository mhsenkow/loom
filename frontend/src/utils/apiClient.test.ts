import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { requestJson, ApiClientError } from './apiClient'

// Mock the config/api module to avoid import.meta.env issues
vi.mock('../config/api', () => ({
    API_BASE_URL: 'http://test-api:8000',
    apiUrl: (path: string) => `http://test-api:8000${path.startsWith('/') ? path : `/${path}`}`,
}))

describe('requestJson', () => {
    const mockFetch = vi.fn()

    beforeEach(() => {
        vi.stubGlobal('fetch', mockFetch)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('sends GET with JSON accept header and parses response', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ data: 'hello' })),
        })

        const result = await requestJson<{ data: string }>('/api/test')
        expect(result).toEqual({ data: 'hello' })

        const [url, opts] = mockFetch.mock.calls[0]
        expect(url).toBe('http://test-api:8000/api/test')
        expect(opts.headers.Accept).toBe('application/json')
    })

    it('sends POST with JSON body and content-type', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve(JSON.stringify({ ok: true })),
        })

        await requestJson('/api/items', {
            method: 'POST',
            body: { name: 'test' },
        })

        const [, opts] = mockFetch.mock.calls[0]
        expect(opts.body).toBe(JSON.stringify({ name: 'test' }))
        expect(opts.headers['Content-Type']).toBe('application/json')
    })

    it('throws ApiClientError on non-OK response with status info', async () => {
        mockFetch.mockResolvedValue({
            ok: false,
            status: 404,
            statusText: 'Not Found',
            text: () => Promise.resolve(JSON.stringify({ error: 'missing' })),
        })

        try {
            await requestJson('/api/missing')
            expect.fail('should have thrown')
        } catch (err) {
            expect(err).toBeInstanceOf(ApiClientError)
            const apiErr = err as ApiClientError
            expect(apiErr.status).toBe(404)
            expect(apiErr.statusText).toBe('Not Found')
            expect(apiErr.body).toEqual({ error: 'missing' })
        }
    })

    it('throws ApiClientError on network failure', async () => {
        mockFetch.mockRejectedValue(new TypeError('Failed to fetch'))

        try {
            await requestJson('/api/down')
            expect.fail('should have thrown')
        } catch (err) {
            expect(err).toBeInstanceOf(ApiClientError)
            expect((err as ApiClientError).message).toBe('Failed to fetch')
        }
    })

    it('passes through absolute URLs without prefixing', async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            status: 200,
            text: () => Promise.resolve('"ok"'),
        })

        await requestJson('https://external.api/v1/data')
        expect(mockFetch.mock.calls[0][0]).toBe('https://external.api/v1/data')
    })
})
