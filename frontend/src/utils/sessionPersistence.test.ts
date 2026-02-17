import { describe, it, expect, beforeEach } from 'vitest'
import {
    SESSIONS_KEY,
    BEFORE_CLEAR_KEY,
    loadSessionsIndexFromLocalStorage,
    saveSessionToLocalStorage,
    loadSessionFromLocalStorage,
    deleteSessionFromLocalStorage,
    stashBeforeClear,
    loadBeforeClear,
} from './sessionPersistence'
import type { LogEntry } from '../types/module'

function makeEntry(overrides: Partial<LogEntry> = {}): LogEntry {
    return {
        id: 'e1',
        type: 'user',
        content: 'hello',
        timestamp: 1700000000000,
        ...overrides,
    }
}

describe('sessionPersistence', () => {
    beforeEach(() => {
        localStorage.clear()
    })

    describe('save and load roundtrip', () => {
        it('saves entries and loads them back', () => {
            const entries = [makeEntry(), makeEntry({ id: 'e2', type: 'ai', content: 'world' })]
            const saved = saveSessionToLocalStorage('test-session', entries)

            expect(saved).toBe(true)

            const loaded = loadSessionFromLocalStorage('test-session')
            expect(loaded).toEqual(entries)
        })

        it('updates the session index on save', () => {
            saveSessionToLocalStorage('s1', [makeEntry()])
            saveSessionToLocalStorage('s2', [makeEntry(), makeEntry({ id: 'e2' })])

            const index = loadSessionsIndexFromLocalStorage()
            expect(Object.keys(index)).toEqual(['s1', 's2'])
            expect(index['s1'].entryCount).toBe(1)
            expect(index['s2'].entryCount).toBe(2)
        })

        it('stores mediaFiles in index when provided', () => {
            saveSessionToLocalStorage('media-session', [makeEntry()], ['img1.png', 'img2.png'])

            const index = loadSessionsIndexFromLocalStorage()
            expect(index['media-session'].mediaFiles).toEqual(['img1.png', 'img2.png'])
        })
    })

    describe('delete', () => {
        it('removes session data and updates index', () => {
            saveSessionToLocalStorage('to-delete', [makeEntry()])
            expect(loadSessionFromLocalStorage('to-delete')).not.toBeNull()

            const deleted = deleteSessionFromLocalStorage('to-delete')
            expect(deleted).toBe(true)
            expect(loadSessionFromLocalStorage('to-delete')).toBeNull()

            const index = loadSessionsIndexFromLocalStorage()
            expect(index['to-delete']).toBeUndefined()
        })

        it('returns true even for non-existent session', () => {
            expect(deleteSessionFromLocalStorage('ghost')).toBe(true)
        })
    })

    describe('loadSessionsIndexFromLocalStorage', () => {
        it('returns empty object when nothing stored', () => {
            expect(loadSessionsIndexFromLocalStorage()).toEqual({})
        })

        it('returns empty object on corrupt JSON', () => {
            localStorage.setItem(SESSIONS_KEY, '{{not json}}')
            expect(loadSessionsIndexFromLocalStorage()).toEqual({})
        })
    })

    describe('stashBeforeClear / loadBeforeClear', () => {
        it('stashes and loads entries', () => {
            const entries = [makeEntry(), makeEntry({ id: 'e2' })]
            stashBeforeClear(entries)

            const loaded = loadBeforeClear()
            expect(loaded).toEqual(entries)
        })

        it('skips stash when entries are empty', () => {
            stashBeforeClear([])
            expect(loadBeforeClear()).toBeNull()
        })

        it('skips stash when only entry is a "Display cleared" system message', () => {
            stashBeforeClear([
                makeEntry({
                    type: 'system',
                    content: 'Display cleared at 12:00',
                }),
            ])
            expect(loadBeforeClear()).toBeNull()
        })

        it('returns null when no stash exists', () => {
            expect(loadBeforeClear()).toBeNull()
        })

        it('returns null for corrupt stash data', () => {
            localStorage.setItem(BEFORE_CLEAR_KEY, 'corrupt')
            // safeParseJson in loadBeforeClear will parse "corrupt" as a string, not an array
            const result = loadBeforeClear()
            expect(result).toBeNull()
        })
    })
})
