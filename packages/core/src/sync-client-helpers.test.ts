import { describe, expect, it, vi } from 'vitest';

import { useTaskStore } from './store';
import {
    CLOUD_PROVIDER_DROPBOX,
    CLOUD_PROVIDER_SELF_HOSTED,
    DEFAULT_ATTACHMENT_CLEANUP_INTERVAL_MS,
    LocalSyncAbort,
    createAbortableFetch,
    getInMemoryAppDataSnapshot,
    normalizeCloudProvider,
    shouldRunAttachmentCleanup,
} from './sync-client-helpers';

describe('sync-client-helpers', () => {
    it('creates an isolated in-memory app data snapshot', () => {
        const now = '2026-01-01T00:00:00.000Z';
        useTaskStore.setState((state) => ({
            ...state,
            _allTasks: [{ id: 't1', title: 'Task', status: 'inbox', createdAt: now, updatedAt: now }],
            _allProjects: [{ id: 'p1', title: 'Project', status: 'active', color: '#000000', createdAt: now, updatedAt: now }],
            _allSections: [],
            _allAreas: [],
            settings: { gtd: { autoArchiveDays: 7 } },
        }));

        const snapshot = getInMemoryAppDataSnapshot();
        snapshot.tasks[0]!.title = 'Changed';

        expect(useTaskStore.getState()._allTasks[0]!.title).toBe('Task');
    });

    it('evaluates attachment cleanup windows', () => {
        expect(shouldRunAttachmentCleanup(undefined)).toBe(true);
        expect(shouldRunAttachmentCleanup('invalid-date')).toBe(true);

        const now = Date.now();
        const recent = new Date(now - Math.floor(DEFAULT_ATTACHMENT_CLEANUP_INTERVAL_MS / 2)).toISOString();
        const stale = new Date(now - (DEFAULT_ATTACHMENT_CLEANUP_INTERVAL_MS + 1_000)).toISOString();

        expect(shouldRunAttachmentCleanup(recent)).toBe(false);
        expect(shouldRunAttachmentCleanup(stale)).toBe(true);
    });

    it('creates a named LocalSyncAbort error', () => {
        const error = new LocalSyncAbort();
        expect(error.name).toBe('LocalSyncAbort');
        expect(error.message).toContain('Local changes detected');
    });

    it('normalizes cloud provider values', () => {
        expect(normalizeCloudProvider('dropbox')).toBe(CLOUD_PROVIDER_DROPBOX);
        expect(normalizeCloudProvider('dropbox', { allowDropbox: false })).toBe(CLOUD_PROVIDER_SELF_HOSTED);
        expect(normalizeCloudProvider('anything-else')).toBe(CLOUD_PROVIDER_SELF_HOSTED);
        expect(normalizeCloudProvider(null)).toBe(CLOUD_PROVIDER_SELF_HOSTED);
    });

    it('applies the base abort signal when wrapping fetch', async () => {
        const baseController = new AbortController();
        const baseFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(init?.signal).toBe(baseController.signal);
            return new Response(null, { status: 200 });
        }) as typeof fetch;
        const wrappedFetch = createAbortableFetch(baseFetch, { baseSignal: baseController.signal });

        await wrappedFetch('https://example.com');
        expect(baseFetch).toHaveBeenCalledTimes(1);
    });

    it('uses an already-aborted base signal for wrapped fetch calls', async () => {
        const baseController = new AbortController();
        baseController.abort();

        const baseFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            expect(init?.signal?.aborted).toBe(true);
            return new Response(null, { status: 200 });
        }) as typeof fetch;
        const wrappedFetch = createAbortableFetch(baseFetch, { baseSignal: baseController.signal });

        await wrappedFetch('https://example.com');
        expect(baseFetch).toHaveBeenCalledTimes(1);
    });
});
