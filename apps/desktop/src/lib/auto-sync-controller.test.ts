import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDesktopAutoSyncController } from './auto-sync-controller';

describe('createDesktopAutoSyncController', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('queues a follow-up sync while the current cycle is still running', async () => {
        const performSync = vi.fn(async () => {
            await new Promise((resolve) => setTimeout(resolve, 25));
            return { success: true };
        });
        const controller = createDesktopAutoSyncController({
            canSync: async () => true,
            performSync,
            flushPendingSave: async () => undefined,
            reportError: vi.fn(),
            isRuntimeActive: () => true,
            minIntervalMs: 0,
        });

        const first = controller.requestSync();
        const second = controller.requestSync();

        await Promise.all([first, second]);
        await new Promise((resolve) => setTimeout(resolve, 40));

        expect(performSync).toHaveBeenCalledTimes(2);
    });

    it('throttles repeated sync requests until the minimum interval elapses', async () => {
        vi.useFakeTimers();
        let nowMs = 10_000;
        vi.setSystemTime(nowMs);

        const performSync = vi.fn(async () => ({ success: true }));
        const controller = createDesktopAutoSyncController({
            canSync: async () => true,
            performSync,
            flushPendingSave: async () => undefined,
            reportError: vi.fn(),
            isRuntimeActive: () => true,
            now: () => nowMs,
        });

        await controller.requestSync();
        expect(performSync).toHaveBeenCalledTimes(1);

        nowMs += 1_000;
        vi.setSystemTime(nowMs);
        await controller.requestSync();
        expect(performSync).toHaveBeenCalledTimes(1);

        nowMs += 4_000;
        vi.setSystemTime(nowMs);
        await vi.advanceTimersByTimeAsync(4_000);

        expect(performSync).toHaveBeenCalledTimes(2);
    });

    it('debounces repeated data changes before syncing', async () => {
        vi.useFakeTimers();

        const performSync = vi.fn(async () => ({ success: true }));
        const controller = createDesktopAutoSyncController({
            canSync: async () => true,
            performSync,
            flushPendingSave: async () => undefined,
            reportError: vi.fn(),
            isRuntimeActive: () => true,
        });

        controller.handleDataChange();
        await vi.advanceTimersByTimeAsync(1_999);
        expect(performSync).not.toHaveBeenCalled();

        controller.handleDataChange();
        await vi.advanceTimersByTimeAsync(4_999);
        expect(performSync).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(performSync).toHaveBeenCalledTimes(1);
    });
});
